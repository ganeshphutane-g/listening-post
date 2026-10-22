#!/usr/bin/env python3
"""Fetch the source assets listed in content/asset_manifest.json (MASTER_PLAN §6.1, M0.5).

Runs on the OWNER's computer: Poly Haven and ambientCG are blocked in build sessions. Python 3 standard
library only. Files land in assets_src/<source>/<id>/ (git-ignored), each checked against the MD5 that
Poly Haven publishes; already-complete files are skipped, so it is safe to re-run. Afterwards it adds a
row per asset to the "Fetched sources" table in docs/ASSETS.md.

  python3 tools/fetch_assets.py --dry-run     # list every file, size, author and licence; download nothing
  python3 tools/fetch_assets.py               # download (about 0.5 GB), verify, write ledger rows
  python3 tools/fetch_assets.py --only concrete_wall_008
"""
import argparse, hashlib, json, os, ssl, subprocess, sys, tempfile, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.polyhaven.com"
# Poly Haven asks API users for an identifying User-Agent
UA = "listening-post-fetch/1 (https://github.com/ganeshphutane-g/listening-post)"
LEDGER = os.path.join(ROOT, "docs", "ASSETS.md")
FETCHED_HEADER = "## Fetched sources (not shipped yet)"


def tls_context():
    """Verified TLS everywhere. Python from python.org on macOS ships without root certificates until its
    'Install Certificates' step runs; then the system's own roots (exported by `security`) are used."""
    ctx = ssl.create_default_context()
    if ctx.cert_store_stats()["x509_ca"] == 0 and sys.platform == "darwin":
        pem = subprocess.run(["security", "find-certificate", "-a", "-p",
                              "/System/Library/Keychains/SystemRootCertificates.keychain"],
                             capture_output=True, text=True, check=True).stdout
        with tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False) as f:
            f.write(pem)
        ctx = ssl.create_default_context(cafile=f.name)
    return ctx


TLS = tls_context()


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60, context=TLS) as r:
        return json.load(r)


def md5_of(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url, path, md5, size):
    if os.path.exists(path) and os.path.getsize(path) == size and md5_of(path) == md5:
        return "kept"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".part"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120, context=TLS) as r, open(tmp, "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            break
        except OSError as e:
            if attempt == 3:
                raise
            print(f"    retry after {e}", file=sys.stderr)
            time.sleep(2 ** attempt)
    if md5_of(tmp) != md5:
        os.remove(tmp)
        raise RuntimeError(f"MD5 mismatch for {url}")
    os.replace(tmp, path)
    return "downloaded"


def plan(manifest, only):
    """One entry per asset: its files (url, size, md5, local path) and its credits."""
    out = []
    mm, hf = manifest["materialMaps"], manifest["hdriFiles"]
    entries = [(m, "material") for m in manifest["materials"]] + [(h, "hdri") for h in manifest["hdris"]]
    for entry, kind in entries:
        if only and entry["id"] not in only:
            continue
        if entry["source"] != "polyhaven":
            raise SystemExit(f"{entry['id']}: source {entry['source']} is not supported yet")
        aid = entry["id"]
        files = get_json(f"{API}/files/{aid}")
        info = get_json(f"{API}/info/{aid}")
        wanted = []
        if kind == "material":
            for m, fmt in mm["maps"].items():
                f = files[m][mm["res"]][fmt]
                wanted.append(f)
        else:
            wanted.append(files["hdri"][hf["res"]][hf["format"]])
        out.append({
            "entry": entry, "kind": kind, "name": info.get("name", aid),
            "authors": ", ".join(info.get("authors", {}).keys()) or "Poly Haven",
            "page": f"https://polyhaven.com/a/{aid}",
            "files": [{"url": f["url"], "size": f["size"], "md5": f["md5"],
                       "path": os.path.join("assets_src", "polyhaven", aid, f["url"].rsplit("/", 1)[1])} for f in wanted],
        })
    return out


def add_ledger_rows(items, res):
    text = open(LEDGER, encoding="utf-8").read()
    if FETCHED_HEADER not in text:
        text = text.rstrip("\n") + f"\n\n{FETCHED_HEADER}\n\nRaw sources in `assets_src/` on the owner's computer, fetched by `tools/fetch_assets.py`. They become shipped rows above once processed into `public/assets/` (M4.3).\n\n| id | files | source URL | author | licence | changes made | used in |\n| --- | --- | --- | --- | --- | --- | --- |\n"
    added = 0
    for it in items:
        e = it["entry"]
        if f"| {e['ledger']} |" in text:
            continue
        files = f"`assets_src/polyhaven/{e['id']}/*` ({res[it['kind']]})"
        text = text.rstrip("\n") + f"\n| {e['ledger']} | {files} | {it['page']} | {it['authors']} (Poly Haven) | CC0 | none yet | {e['use']} |\n"
        added += 1
    open(LEDGER, "w", encoding="utf-8").write(text)
    return added


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="list files, sizes and licences; download nothing")
    ap.add_argument("--only", nargs="*", default=[], help="asset ids to fetch (default: all)")
    args = ap.parse_args()
    manifest = json.load(open(os.path.join(ROOT, "content", "asset_manifest.json"), encoding="utf-8"))
    items = plan(manifest, set(args.only))
    total = 0
    print(f"{'ledger':7} {'asset':30} {'kind':8} {'files':>5} {'MB':>7}  licence  author(s)")
    for it in items:
        size = sum(f["size"] for f in it["files"])
        total += size
        print(f"{it['entry']['ledger']:7} {it['entry']['id']:30} {it['kind']:8} {len(it['files']):>5} {size / 1e6:>7.1f}  CC0      {it['authors']}")
        if args.dry_run:
            for f in it["files"]:
                print(f"          {f['path']}  ({f['size'] / 1e6:.1f} MB)")
    print(f"total {total / 1e6:.0f} MB in {sum(len(i['files']) for i in items)} files; licence CC0 (Poly Haven, https://polyhaven.com/license); credit: {manifest['credit']}")
    if args.dry_run:
        return
    for it in items:
        for f in it["files"]:
            state = download(f["url"], os.path.join(ROOT, f["path"]), f["md5"], f["size"])
            print(f"  {state:10} {f['path']}")
    res = {"material": manifest["materialMaps"]["res"], "hdri": manifest["hdriFiles"]["res"]}
    print(f"ledger: {add_ledger_rows(items, res)} rows added to docs/ASSETS.md")


if __name__ == "__main__":
    main()
