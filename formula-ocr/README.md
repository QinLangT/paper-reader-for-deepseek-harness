# Formula OCR

Two compact buttons at the left of the message composer turn a formula screenshot into Markdown math and insert it where the caret is, so the text can be edited before it is sent.

- **Screenshot a region** — the Host minimizes the app window, grabs the desktop, restores the window, and shows the still so you can drag a box around the formula. Esc cancels.
- **Clipboard image** — reads the first image on the clipboard (`navigator.clipboard.read`). On Windows, `Win+Shift+S` puts the screenshot there.
- **Image file** — opens a file picker for PNG, JPEG, WebP, or GIF.

## Two recognizers

| `recognizer` | How it works | Cost |
|---|---|---|
| `local` (default here) | One warm Python worker runs an ONNX formula model on CPU | none; works offline once the model cache exists |
| `llm` | The Host sends the image to the profile's vision model route | one model request per screenshot |

The buttons, the route, and the insertion path are identical either way.

## Local backends

The worker prefers **TexTeller** (through the Rust `bobine` bindings) and falls back to **RapidLaTeXOCR**:

| backend | weights | notes |
|---|---|---|
| `bobine-texteller` | ~303 MB int8 pair in `dsh-formula-ocr/bobine` under the per-user cache (`%LOCALAPPDATA%` on Windows, `~/Library/Caches` on macOS, `$XDG_CACHE_HOME` else) | markedly better on dense formulas |
| `rapid-latex-ocr` | ~170 MB in `dsh-formula-ocr/models` under the same cache root | packaged fallback, weaker on single symbols |

On a 10-formula typeset benchmark (quadratic, Basel sum, Gaussian density, Bayes, OLS, …) TexTeller int8 scored **9/10 exact, mean 0.97** where RapidLaTeXOCR scored 2/10, mean 0.74 — the fallback misread `a` as `Ω`, `dx` as `\cal Q X`, and once ran away into a hundred `\mathrm{M}` tokens. Warm recognition is also faster: ~1.7 s versus ~2.6 s.

The full-precision TexTeller pair was measured on the same set: **8/10, mean 0.945**, four times the size and ~15 % slower on CPU, so int8 stays the default. Fetch it with `python tools/prefetch_texeller.py --precision fp32` if you want to re-test on your own screenshots.

Known residue on the TexTeller path: `\langle … \rangle` where the source had parentheses, and spaces inside commands (`\int_{0}^{ \infty}`) that math mode ignores.

`backend: auto` uses TexTeller when its weights are already cached and otherwise answers from RapidLaTeXOCR, so no request ever starts a model download. Set `backend: bobine` (or `rapid`) to pin one, or export `FORMULA_OCR_BACKEND`.

Every result passes a quality gate before it reaches the composer: a runaway decode (a command repeated dozens of times, or an absurdly long output) is discarded as unreliable instead of being pasted, and single-letter style wrappers such as `\mathbf{a}` lose their wrapper.

## Local mode prerequisites

```powershell
# Windows
pip install bobine[cpu] rapid_latex_ocr requests
```

```bash
# macOS: /usr/bin/python3 is 3.9, below both backends' floor. Build a 3.10+
# venv at the path the plugin probes before PATH, then install there.
VENV="$HOME/Library/Application Support/dsh-formula-ocr/venv"
python3 -m venv "$VENV"
"$VENV/bin/python" -m pip install "bobine[cpu]" requests
```

`bobine` needs `onnxruntime` (its `cpu` extra); `rapid_latex_ocr` imports `requests` without declaring it, so install both. Either backend alone is enough. On macOS the plugin resolves the interpreter as: row `python:` config, then `~/Library/Application Support/dsh-formula-ocr/venv/bin/python`, then `python3`/`python` on `PATH`. `bobine` publishes macOS **arm64-only** wheels (cp310–cp314), so on an Intel Mac use `rapid_latex_ocr` or the `llm` route.

The first request provisions weights into a per-user cache. The HuggingFace hosts throttle a single connection heavily on some networks, so the bundle ships a range-parallel prefetcher:

```powershell
# Windows
python tools\prefetch_texeller.py --connections 12
```

```bash
# macOS
"$HOME/Library/Application Support/dsh-formula-ocr/venv/bin/python" \
  tools/prefetch_texeller.py --connections 12
```

It writes the standard hub layout under the cache root's `dsh-formula-ocr/bobine` (`%LOCALAPPDATA%` on Windows, `~/Library/Caches` on macOS), after which the worker finds TexTeller locally and never downloads inside a request.

RapidLaTeXOCR's own downloader is GitHub-only, so the worker fetches those four files itself, trying `ghfast.top`, `ghproxy.net`, then the direct URL, resuming interrupted `.part` transfers.

A warm process answers in roughly 1.7 s on CPU with TexTeller (~2.6 s with the RapidLaTeXOCR fallback); the first request after the plugin starts pays the model load.

## Configuration

```yaml
- id: formula-ocr
  name: '@local/formula-ocr'
  config:
    recognizer: local
    # python: 'C:\Python312\python.exe'     # omit: macOS venv, then python3/python on PATH
    # python: '/Users/you/Library/Application Support/dsh-formula-ocr/venv/bin/python'
    # backend: bobine | rapid | auto         # default auto
    # hfEndpoint: https://hf-mirror.com     # only used for llm-mode downloads
    # provider: deepseek-account            # llm mode only
    # model: deepseek-flash
    # maxTokens: 4096
```

Omit `python` to resolve `python3` then `python` from `PATH` through the Host subprocess service. The route paths stay fixed (`/_formula-ocr/recognize` and `/_formula-ocr/capture`) because the Client bundle posts to them.

## Limitations

- Local mode ships a CPU model, not a cloud service: long multi-line derivations and handwriting are noticeably weaker than the vision model route. Switch `recognizer` to `llm` for those.
- The route accepts only `POST` with the `x-dsh-formula-ocr: 1` header and a matching `Origin` port, and the web server binds loopback; another local program that guesses the path can still call it.
- The browser reaches the route over HTTP from the same origin, so the page must be served over HTTP (the Web GUI is).
- Clipboard images require the browser clipboard permission; when the API is unavailable, use the file button.
- Region capture runs on the Host, not through `getDisplayMedia`, so there is no browser share picker and no capture permission to grant. On Windows the Host minimizes the window in front (the app you clicked in), waits for the desktop to repaint, captures the whole virtual desktop through DPI-aware GDI+, and restores the window — QQ/WeChat order, so the app never lands in its own shot. Expect a roughly 2 s flicker while the window hides and returns.
- On macOS the capture is gated by **Screen Recording**: enable DeepSeek Harness in System Settings → Privacy & Security → Screen Recording and restart the app. Until then the route answers `CAPTURE_PERMISSION` with that instruction instead of returning a blank image. In a non-Electron Host (`dsh web`) the fallback is `/usr/sbin/screencapture`, which inherits the permission of the process that started it.
- Multi-monitor desktops are captured as one wide image, so the selection can span screens. When the Host runs as an Electron main process it uses `desktopCapturer` instead of PowerShell.
- A Host that is neither Electron, Windows, nor macOS reports "Screen capture unavailable here"; the clipboard and file buttons still work.
- Insertion is refused while the composer is busy (sending, adjudicating, or claimed).
- Local selection of inline versus display math is a delimiter heuristic (`\frac`, `\sum`, `\int`, `\begin`, … or length); the `llm` route decides for itself.
