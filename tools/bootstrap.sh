#!/usr/bin/env bash
# Install every pinned tool for a fresh session (MASTER_PLAN §0 step 2, §4.1). Idempotent.
# Usage: bash tools/bootstrap.sh [--blender] [--ktx] [--no-apt]
#   --blender  also create .venv with bpy (only for runs that bake or export, §0)
#   --ktx      also install KTX-Software (only for runs that encode textures or lightmaps, D-011)
#   --no-apt   skip the system packages (owner's computer, or no root)
# Ends by printing every tool version; exits non-zero if any step fails.
set -euo pipefail

ELECTRON_VERSION=45.0.0
BPY_VERSION=5.2.2
KTX_VERSION=4.4.2
# SHA-256 of the KTX-Software release files, taken 2026-10-22 (the Linux one also matches Khronos' .sha1).
ktx_sha256() {
  case "$1" in
    linux-x64) echo a8781bad05f9624edbf910b7f258cd0a4ba7d3e63b49ecc0a0ab440bf6a0a245 ;;
    darwin-arm64) echo 500bd8f9d63358c3f3a0d83b724c8574436a72c37dc0e4bad90ec1ca38032c3c ;;
  esac
}
# From https://github.com/electron/electron/releases/download/v45.0.0/SHASUMS256.txt, pinned here
# so a tampered release download fails the check instead of being trusted.
# A case, not an associative array: macOS ships bash 3.2.
electron_sha256() {
  case "$1" in
    linux-x64) echo 22f6a10bd3f7fef987ddbb379d3375ce664ad0c98a9a50f80c89f1718a0c3e3a ;;
    darwin-arm64) echo 896c3a50b148e89a158dca08a6996a022ddf39b23aac871e107f5b4087f8caa9 ;;
    darwin-x64) echo 7877c282e74a52f8d87949536a25735cf9982de1265b544c9cd258dd14eff4de ;;
  esac
}
# Software Vulkan (lavapipe) + virtual display + the shared libraries Electron needs on a bare Ubuntu.
APT_PACKAGES=(mesa-vulkan-drivers vulkan-tools xvfb xauth unzip
  libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libgtk-3-0t64 libgbm1 libasound2t64
  libxss1 libxtst6 libxkbcommon0 libdrm2)

WANT_BLENDER=0
WANT_KTX=0
WANT_APT=1
for arg in "$@"; do
  case "$arg" in
    --blender) WANT_BLENDER=1 ;;
    --ktx) WANT_KTX=1 ;;
    --no-apt) WANT_APT=0 ;;
    *) echo "bootstrap: unknown argument $arg" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
TOOLS="$ROOT/.tools"
mkdir -p "$TOOLS/bin"
log() { printf '\n== bootstrap: %s\n' "$*"; }

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) PLATFORM=linux-x64 ;;
  Darwin-arm64) PLATFORM=darwin-arm64 ;;
  Darwin-x86_64) PLATFORM=darwin-x64 ;;
  *) echo "bootstrap: unsupported platform $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac
[ "$PLATFORM" = linux-x64 ] || WANT_APT=0

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

# 1. System packages (Linux sessions only).
if [ "$WANT_APT" = 1 ]; then
  log "apt packages"
  SUDO=""; [ "$(id -u)" = 0 ] || SUDO="sudo"
  missing=()
  for p in "${APT_PACKAGES[@]}"; do dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p"); done
  if [ "${#missing[@]}" -gt 0 ]; then
    $SUDO apt-get update -qq
    DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq --no-install-recommends "${missing[@]}" >/dev/null
  fi
fi

# 2. npm packages, exactly as locked.
log "npm ci"
npm ci --no-audit --no-fund --loglevel=error

# 3. Electron from the GitHub release, checksum-checked (D-004).
ELECTRON_DIR="$TOOLS/electron-v$ELECTRON_VERSION-$PLATFORM"
if [ "$PLATFORM" = linux-x64 ]; then ELECTRON_BIN="$ELECTRON_DIR/electron"; else ELECTRON_BIN="$ELECTRON_DIR/Electron.app/Contents/MacOS/Electron"; fi
if [ ! -x "$ELECTRON_BIN" ]; then
  log "Electron $ELECTRON_VERSION ($PLATFORM)"
  zip="electron-v$ELECTRON_VERSION-$PLATFORM.zip"
  curl -fsSL --retry 4 -o "$TOOLS/$zip" "https://github.com/electron/electron/releases/download/v$ELECTRON_VERSION/$zip"
  got="$(sha256 "$TOOLS/$zip")"
  if [ "$got" != "$(electron_sha256 "$PLATFORM")" ]; then
    echo "bootstrap: checksum mismatch for $zip: got $got, want $(electron_sha256 "$PLATFORM")" >&2
    rm -f "$TOOLS/$zip"; exit 1
  fi
  rm -rf "$ELECTRON_DIR" && mkdir -p "$ELECTRON_DIR"
  if [ "$PLATFORM" = linux-x64 ]; then unzip -q "$TOOLS/$zip" -d "$ELECTRON_DIR"; else ditto -x -k "$TOOLS/$zip" "$ELECTRON_DIR"; fi
  rm -f "$TOOLS/$zip"
fi
ln -sf "$ELECTRON_BIN" "$TOOLS/bin/electron"

# 4. Blender as a Python module, only when asked.
if [ "$WANT_BLENDER" = 1 ]; then
  log "bpy $BPY_VERSION"
  # bpy 5.2.2 ships wheels for CPython 3.13 only.
  PY=python3.13
  if ! command -v "$PY" >/dev/null; then
    echo "bootstrap: --blender needs python3.13 on PATH (bpy $BPY_VERSION wheels are cp313 only)" >&2; exit 1
  fi
  if [ -x .venv/bin/python ] && ! .venv/bin/python -c 'import sys; sys.exit(sys.version_info[:2] != (3, 13))'; then
    rm -rf .venv
  fi
  [ -x .venv/bin/python ] || "$PY" -m venv .venv
  .venv/bin/python -c "import bpy" >/dev/null 2>&1 || .venv/bin/pip install -q "bpy==$BPY_VERSION"
fi

# 4b. KTX-Software (the `ktx` tool), only when asked. Unpacked into .tools/ktx/{bin,lib}; no system install.
if [ "$WANT_KTX" = 1 ] && [ ! -x "$TOOLS/ktx/bin/ktx" ]; then
  log "KTX-Software $KTX_VERSION ($PLATFORM)"
  case "$PLATFORM" in
    linux-x64) file="KTX-Software-$KTX_VERSION-Linux-x86_64.tar.bz2" ;;
    darwin-arm64) file="KTX-Software-$KTX_VERSION-Darwin-arm64.pkg" ;;
    *) echo "bootstrap: no pinned KTX-Software build for $PLATFORM" >&2; exit 1 ;;
  esac
  curl -fsSL --retry 4 -o "$TOOLS/$file" "https://github.com/KhronosGroup/KTX-Software/releases/download/v$KTX_VERSION/$file"
  got="$(sha256 "$TOOLS/$file")"
  if [ "$got" != "$(ktx_sha256 "$PLATFORM")" ]; then
    echo "bootstrap: checksum mismatch for $file: got $got" >&2; rm -f "$TOOLS/$file"; exit 1
  fi
  rm -rf "$TOOLS/ktx" "$TOOLS/ktx-unpack" && mkdir -p "$TOOLS/ktx/bin" "$TOOLS/ktx/lib"
  if [ "$PLATFORM" = linux-x64 ]; then
    tar xjf "$TOOLS/$file" -C "$TOOLS" && mv "$TOOLS/KTX-Software-$KTX_VERSION-Linux-x86_64" "$TOOLS/ktx-unpack"
    cp "$TOOLS/ktx-unpack/bin/ktx" "$TOOLS/ktx/bin/" && cp -P "$TOOLS/ktx-unpack/lib/"libktx.so* "$TOOLS/ktx/lib/"
  else
    pkgutil --expand-full "$TOOLS/$file" "$TOOLS/ktx-unpack"
    cp "$TOOLS"/ktx-unpack/*tools.pkg/Payload/usr/local/bin/ktx "$TOOLS/ktx/bin/"
    cp -P "$TOOLS"/ktx-unpack/*library.pkg/Payload/usr/local/lib/libktx* "$TOOLS/ktx/lib/"
  fi
  rm -rf "$TOOLS/ktx-unpack" "$TOOLS/$file"
fi

# 5. Versions. Every pinned tool must answer; a failure here fails the bootstrap.
log "versions"
ver() { printf '%-26s %s\n' "$1" "$2"; }
ver node "$(node --version)"
ver npm "$(npm --version)"
for pkg in three @dimforge/rapier3d-compat @pmndrs/assets typescript vite vitest; do
  ver "$pkg" "$(node -p "require('./node_modules/$pkg/package.json').version")"
done
ver electron "$("$TOOLS/bin/electron" --version --no-sandbox 2>/dev/null | tail -n1)"
if [ "$PLATFORM" = linux-x64 ]; then
  ver xvfb "$(dpkg-query -W -f='${Version}' xvfb)"
  ver mesa-vulkan "$(dpkg-query -W -f='${Version}' mesa-vulkan-drivers)"
  ver vulkan-device "$(vulkaninfo --summary 2>/dev/null | sed -n 's/^[[:space:]]*deviceName[[:space:]]*= //p' | head -n1)"
fi
if [ -x "$TOOLS/ktx/bin/ktx" ]; then
  ver ktx "$(DYLD_LIBRARY_PATH="$TOOLS/ktx/lib" LD_LIBRARY_PATH="$TOOLS/ktx/lib" "$TOOLS/ktx/bin/ktx" --version | sed 's/^ktx version: //')"
else
  ver ktx "not installed (pass --ktx)"
fi
if [ -x .venv/bin/python ]; then
  ver bpy "$(.venv/bin/python -c 'import bpy; print(bpy.app.version_string)' 2>/dev/null || echo 'not importable')"
else
  ver bpy "not installed (pass --blender)"
fi
log "done — Electron at .tools/bin/electron"
