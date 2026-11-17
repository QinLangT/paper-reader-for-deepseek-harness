"""Persistent local formula recognizer for the Formula OCR DSH plugin.

The Host half starts this script once and talks to it over stdin/stdout with
one JSON document per line:

    -> {"data": "<base64 image>"}
    <- {"ok": true, "latex": "\\frac{a}{b}", "backend": "bobine-texteller"}
    <- {"ok": false, "error": "DEGENERATE", "detail": ""}

Two interchangeable backends run behind the same protocol:

- ``bobine``       – TexTeller ONNX through the Rust ``bobine`` bindings (preferred)
- ``rapid_latex_ocr``  – RapidLaTeXOCR ONNX (fallback when bobine is absent)

``FORMULA_OCR_BACKEND=auto|bobine|rapid`` picks one explicitly. Both are CPU
only, need no torch, and are provisioned once into a per-user cache.
"""

import base64
import json
import os
import re
import shutil
import sys
import tempfile

BASE_URL = "https://github.com/RapidAI/RapidLaTeXOCR/releases/download/v0.0.0/"
MIRROR_PREFIXES = ("https://ghfast.top/", "https://ghproxy.net/", "")
MODEL_FILES = ("image_resizer.onnx", "encoder.onnx", "decoder.onnx", "tokenizer.json")
MIN_MODEL_BYTES = 1024

# Single-letter style wrappers are almost always the recognizer describing its
# own rendering, not a real bold vector.
STYLE_WRAPPER = re.compile(r"\\(?:mathbf|mathrm|mathit|textbf|textit|textsl|textsc|emph|rm|bf|it)\{([A-Za-z0-9])\}")
COMMAND = re.compile(r"\\[A-Za-z]+")
TRAILING_SPACE_COMMANDS = ("\\,", "\\;", "\\quad", "\\qquad")
# The recognizers answer with their own delimiters; the composer adds ours.
WRAPPER = re.compile(r"^\\\[(.*)\\\]$|^\\\((.*)\\\)$", re.S)
# `\left`/`\right` are noise here, but `\leftarrow` must survive.
LEFT_RIGHT = re.compile(r"\\left(?![a-zA-Z])|\\right(?![a-zA-Z])")
# A lone backslash-space is a stray spacing command; `\\ ` is a row separator.
LONE_BACKSLASH_SPACE = re.compile(r"(?<!\\)\\ ")


def log(message):
    sys.stderr.write("[formula-ocr] %s\n" % message)
    sys.stderr.flush()


def cache_root():
    """Per-user cache for models: one location per platform, no admin rights."""
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~/.cache")
    elif sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Caches")
    else:
        base = os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache")
    return os.path.join(base, "dsh-formula-ocr")


# --------------------------------------------------------------------------
# backends
# --------------------------------------------------------------------------


class BobineBackend:
    """TexTeller through the Rust bobine bindings."""

    name = "bobine-texteller"

    def __init__(self, precision):
        import bobine

        quantization = (
            bobine.ModelQuantization.Fp32 if precision == "fp32" else bobine.ModelQuantization.Int8
        )
        config = bobine.ConverterConfig(
            routing_mode=bobine.RoutingMode.Surgical,
            model_quantization=quantization,
            device="cpu",
        )
        self.name = "bobine-texteller-" + precision
        self._converter = bobine.HybridConverter(config, cache_dir=os.path.join(cache_root(), "bobine"))
        self._workdir = tempfile.mkdtemp(prefix="formula-ocr-")

    def recognize(self, image):
        path = os.path.join(self._workdir, "crop.png")
        with open(path, "wb") as handle:
            handle.write(image)
        return self._converter.recognize_formula(path)


class RapidBackend:
    """RapidLaTeXOCR through onnxruntime."""

    name = "rapid-latex-ocr"

    def __init__(self):
        from rapid_latex_ocr import LaTeXOCR

        files = ensure_rapid_models()
        self._model = LaTeXOCR(
            image_resizer_path=os.path.join(files, "image_resizer.onnx"),
            encoder_path=os.path.join(files, "encoder.onnx"),
            decoder_path=os.path.join(files, "decoder.onnx"),
            tokenizer_json=os.path.join(files, "tokenizer.json"),
        )

    def recognize(self, image):
        return self._model(image)


PRECISION_FILES = {
    "fp32": ("encoder_model.onnx", "decoder_model_merged.onnx"),
    "int8": ("encoder_model_dynamic-int8.onnx", "decoder_model_merged_dynamic-int8.onnx"),
}


def cached_precision():
    """Which weight pair is already in the hub cache.

    int8 wins: on a ten-formula typeset set the quantized pair scored 0.972
    against fp32's 0.945, and it is a quarter of the size and faster on CPU.
    """
    root = os.path.join(cache_root(), "bobine")
    if not os.path.isdir(root):
        return None
    names = set()
    for _, _, files in os.walk(root):
        names.update(files)
    for precision in ("int8", "fp32"):
        if all(name in names for name in PRECISION_FILES[precision]):
            return precision
    return None


def make_backend():
    """Try the preferred backends in order and return the first that loads."""
    preference = (os.environ.get("FORMULA_OCR_BACKEND") or "auto").strip().lower()
    precision = (os.environ.get("FORMULA_OCR_PRECISION") or "").strip().lower()
    if preference == "bobine":
        order = [("bobine", precision or cached_precision() or "int8")]
    elif preference == "rapid":
        order = [("rapid", None)]
    else:
        cached = cached_precision()
        # Auto mode never starts a model download inside a request: without
        # cached TexTeller weights, the packaged fallback answers instead.
        order = [("rapid", None), ("bobine", precision or cached or "int8")] if cached is None else [
            ("bobine", precision or cached),
            ("rapid", None),
        ]

    failures = []
    for kind, chosen in order:
        try:
            backend = RapidBackend() if kind == "rapid" else BobineBackend(chosen)
            log("backend ready: %s" % backend.name)
            return backend, failures
        except Exception as error:
            failures.append("%s: %s: %s" % (kind, type(error).__name__, error))
            log("backend failed: %s" % failures[-1])
    return None, failures


# --------------------------------------------------------------------------
# model provisioning for the RapidLaTeXOCR fallback
# --------------------------------------------------------------------------


def ensure_rapid_models():
    target = os.path.join(cache_root(), "models")
    os.makedirs(target, exist_ok=True)
    library = rapid_library_model_dir()
    for name in MODEL_FILES:
        destination = os.path.join(target, name)
        if os.path.isfile(destination) and os.path.getsize(destination) > MIN_MODEL_BYTES:
            continue
        seeded = os.path.join(library, name) if library else ""
        if seeded and os.path.isfile(seeded) and os.path.getsize(seeded) > MIN_MODEL_BYTES:
            shutil.copyfile(seeded, destination)
            log("seeded %s from the installed package" % name)
            continue
        download(name, destination)
    return target


def rapid_library_model_dir():
    try:
        from pathlib import Path

        import rapid_latex_ocr.utils as utils

        return str(Path(utils.__file__).resolve().parent / "models")
    except Exception:
        return ""


def download(name, destination):
    """Fetch one model file, trying each mirror before the direct host.

    An interrupted transfer keeps its `.part` file, and the next attempt resumes
    from the bytes already on disk, so a slow link still converges instead of
    restarting an 89 MB download from zero.
    """
    partial = destination + ".part"
    last_error = None
    for prefix in MIRROR_PREFIXES:
        url = prefix + BASE_URL + name
        try:
            log("downloading %s" % url)
            written = resume_download(url, partial)
            if written <= MIN_MODEL_BYTES:
                raise IOError("downloaded only %d bytes" % written)
            os.replace(partial, destination)
            log("downloaded %s (%d bytes)" % (name, written))
            return
        except Exception as error:  # try the next mirror
            last_error = error
            log("failed %s via %s: %s" % (name, url, error))
    raise RuntimeError("cannot download %s: %s" % (name, last_error))


def resume_download(url, partial):
    """Stream one URL into `partial`, continuing an earlier partial transfer."""
    import requests

    offset = os.path.getsize(partial) if os.path.isfile(partial) else 0
    headers = {"Range": "bytes=%d-" % offset} if offset else {}
    with requests.get(url, stream=True, headers=headers, timeout=(10, 120)) as response:
        if offset and response.status_code == 416:
            return offset  # the partial file already holds the whole object
        response.raise_for_status()
        resume = offset > 0 and response.status_code == 206
        mode = "ab" if resume else "wb"
        written = offset if resume else 0
        with open(partial, mode) as handle:
            for chunk in response.iter_content(chunk_size=1 << 16):
                if not chunk:
                    continue
                handle.write(chunk)
                written += len(chunk)
        return written


# --------------------------------------------------------------------------
# output shaping
# --------------------------------------------------------------------------


def normalize(result):
    """Reduce every shape a backend may return to one LaTeX string."""
    value = result
    for _ in range(4):
        if isinstance(value, str):
            return clean(value)
        if isinstance(value, (list, tuple)) and value:
            value = value[0]
            continue
        if isinstance(value, dict):
            for key in ("latex", "text", "res", "result"):
                if key in value:
                    value = value[key]
                    break
            else:
                return ""
            continue
        return ""
    return clean(value) if isinstance(value, str) else ""


def clean(text):
    """Drop delimiters and styling noise the recognizers add around a formula."""
    value = LONE_BACKSLASH_SPACE.sub(" ", str(text))
    value = " ".join(value.split())
    for _ in range(2):
        wrapped = WRAPPER.match(value)
        if not wrapped:
            break
        value = (wrapped.group(1) if wrapped.group(1) is not None else wrapped.group(2)).strip()
    while len(value) >= 2 and value[0] == "$" and value[-1] == "$":
        value = value.strip("$").strip()
    value = STYLE_WRAPPER.sub(r"\1", value)
    value = value.replace("\\displaystyle", "").replace("\\!", "")
    # Uniform fraction sizing: the recognizers mix \tfrac and \dfrac into display math.
    value = value.replace("\\tfrac", "\\frac").replace("\\dfrac", "\\frac")
    value = LEFT_RIGHT.sub("", value)
    changed = True
    while changed:
        changed = False
        for trailing in TRAILING_SPACE_COMMANDS:
            if value.endswith(trailing):
                value = value[: -len(trailing)].rstrip()
                changed = True
    return value.strip()


def is_degenerate(value):
    """Detect a runaway decode: repetition loops and absurd length."""
    if len(value) > 400:
        return True
    counts = {}
    for command in COMMAND.findall(value):
        counts[command] = counts.get(command, 0) + 1
        if counts[command] > 25:
            return True
    return bool(re.search(r"(\\[A-Za-z]+\{?[A-Za-z0-9]\}?){40,}", value))


# --------------------------------------------------------------------------
# protocol
# --------------------------------------------------------------------------


def main():
    os.environ.setdefault("PYTHONWARNINGS", "ignore")

    # Keep the OS-level stdout for protocol frames only: the Rust backend writes
    # to fd 1 directly, so replacing sys.stdout alone would not protect it.
    protocol_fd = os.dup(1)
    os.dup2(2, 1)
    protocol = os.fdopen(protocol_fd, "w", encoding="utf-8", buffering=1)
    sys.stdout = sys.stderr
    try:
        sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    def reply(payload):
        protocol.write(json.dumps(payload, ensure_ascii=False) + "\n")
        protocol.flush()

    backend, failures = make_backend()
    if backend is None:
        reply({
            "ready": False,
            "error": "NO_BACKEND",
            "detail": " | ".join(failures) or "no local recognizer is installed",
        })
        return 1

    reply({"ready": True, "backend": backend.name})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except Exception:
            reply({"ok": False, "error": "BAD_REQUEST", "detail": ""})
            continue
        try:
            encoded = request.get("data") if isinstance(request, dict) else None
            image = base64.b64decode(encoded or "", validate=False)
            if not image:
                reply({"ok": False, "error": "EMPTY_IMAGE", "detail": ""})
                continue
            latex = normalize(backend.recognize(image))
            if not latex:
                reply({"ok": False, "error": "EMPTY_RESULT", "detail": ""})
            elif is_degenerate(latex):
                reply({"ok": False, "error": "DEGENERATE", "detail": latex[:120]})
            else:
                reply({"ok": True, "latex": latex, "backend": backend.name})
        except Exception as error:
            reply({
                "ok": False,
                "error": "LOCAL_FAILED",
                "detail": "%s: %s" % (type(error).__name__, error),
            })

    return 0


if __name__ == "__main__":
    sys.exit(main())
