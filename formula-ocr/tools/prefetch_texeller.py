"""Pre-seed the TexTeller int8 ONNX pair into the worker's cache directory.

The HuggingFace hosts throttle one connection to tens of kilobytes per second
on some networks, which makes the ~300 MB pair take an hour inside a request.
This script splits each file into parallel range requests, reassembles it, and
writes the standard hub layout (`models--<repo>/blobs/<sha256>` plus
`snapshots/<rev>/<file>`), so the worker's bobine backend finds the weights and
never downloads inside a recognition request.

    python tools/prefetch_texeller.py
    python tools/prefetch_texeller.py --connections 24
"""

import argparse
import concurrent.futures
import hashlib
import os
import sys
import time

import requests

REPO = "opticsWolf/texteller3-onnx"
REVISION = "5f817336d600ae880205362e16092994aecd01e1"
PRECISIONS = {
    "int8": ("encoder_model_dynamic-int8.onnx", "decoder_model_merged_dynamic-int8.onnx"),
    "fp32": ("encoder_model.onnx", "decoder_model_merged.onnx"),
}
HOSTS = ("https://hf-mirror.com/", "https://huggingface.co/")
RETRIES = 4
MIN_BYTES = 1024 * 1024


def cache_root():
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~/.cache")
    return os.path.join(base, "dsh-formula-ocr", "bobine")


def url_for(name, host):
    return "%s%s/resolve/%s/%s" % (host, REPO, REVISION, name)


def content_length(name, host):
    response = requests.head(url_for(name, host), allow_redirects=True, timeout=(8, 20))
    response.raise_for_status()
    return int(response.headers["content-length"])


def fetch_chunk(name, host, start, end, part_path):
    last = None
    for attempt in range(RETRIES):
        try:
            with requests.get(
                url_for(name, host),
                stream=True,
                headers={"Range": "bytes=%d-%d" % (start, end)},
                timeout=(10, 120),
            ) as response:
                if response.status_code not in (200, 206):
                    raise IOError("HTTP %s" % response.status_code)
                written = 0
                with open(part_path, "wb") as handle:
                    for piece in response.iter_content(chunk_size=1 << 16):
                        handle.write(piece)
                        written += len(piece)
            if written != end - start + 1:
                raise IOError("short chunk %d/%d" % (written, end - start + 1))
            return written
        except Exception as error:
            last = error
            if attempt == RETRIES - 1:
                raise
            time.sleep(2)
    raise last


def prefetch(name, workdir, connections):
    size = 0
    host = HOSTS[0]
    for candidate in HOSTS:
        try:
            size = content_length(name, candidate)
            host = candidate
            break
        except Exception as error:
            print("  %s unreachable: %s" % (candidate, error), flush=True)
    if size == 0:
        raise RuntimeError("cannot size %s from any host" % name)

    step = size // connections + 1
    ranges = []
    for index in range(connections):
        start = index * step
        if start >= size:
            break
        ranges.append((index, start, min(start + step - 1, size - 1)))

    started = time.time()
    parts = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(ranges)) as pool:
        futures = {}
        for index, start, end in ranges:
            part = os.path.join(workdir, "%s.%03d" % (name, index))
            parts.append(part)
            futures[pool.submit(fetch_chunk, name, host, start, end, part)] = end - start + 1
        done = 0
        for future in concurrent.futures.as_completed(futures):
            done += futures[future]
            future.result()
            elapsed = max(time.time() - started, 0.01)
            print(
                "  %-42s %6.1f/%6.1f MB  %5d KB/s"
                % (name, done / 1048576, size / 1048576, done / 1024 / elapsed),
                flush=True,
            )

    digest = hashlib.sha256()
    assembled = os.path.join(workdir, name + ".assembled")
    with open(assembled, "wb") as out:
        for part in parts:
            with open(part, "rb") as handle:
                while True:
                    block = handle.read(1 << 20)
                    if not block:
                        break
                    digest.update(block)
                    out.write(block)
            os.remove(part)
    return assembled, digest.hexdigest(), size


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--connections", type=int, default=12, help="parallel range requests per file")
    parser.add_argument("--precision", choices=sorted(PRECISIONS), default="int8", help="which weight pair to fetch")
    parser.add_argument("--cache", default=cache_root(), help="hub cache directory the worker uses")
    args = parser.parse_args()
    files = PRECISIONS[args.precision]

    repo_dir = os.path.join(args.cache, "models--" + REPO.replace("/", "--"))
    blobs = os.path.join(repo_dir, "blobs")
    snapshot = os.path.join(repo_dir, "snapshots", REVISION)
    workdir = os.path.join(args.cache, ".prefetch")
    for path in (blobs, snapshot, workdir):
        os.makedirs(path, exist_ok=True)

    for name in files:
        target = os.path.join(snapshot, name)
        if os.path.isfile(target) and os.path.getsize(target) > MIN_BYTES:
            print("already present:", name, flush=True)
            continue
        print("fetching", name, flush=True)
        assembled, sha, size = prefetch(name, workdir, max(1, args.connections))
        blob = os.path.join(blobs, sha)
        os.replace(assembled, blob)
        if os.path.exists(target):
            os.remove(target)
        try:
            os.link(blob, target)
        except OSError:
            import shutil

            shutil.copyfile(blob, target)
        print("wrote %s (%d MB, sha %s)" % (name, size // 1048576, sha[:12]), flush=True)

    refs = os.path.join(repo_dir, "refs")
    os.makedirs(refs, exist_ok=True)
    with open(os.path.join(refs, "main"), "w", encoding="utf-8") as handle:
        handle.write(REVISION + "\n")
    print("cache ready:", args.cache, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
