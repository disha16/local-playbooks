#!/usr/bin/env bash
set -euo pipefail
# Separate LGPL executable; no GPL/nonfree codecs or host autodetected libraries.
root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$root/work/ffmpeg" "$root/engine-bin/${LP_PLATFORM:?Set LP_PLATFORM first}" "$root/dist/sources"
cd "$root/work/ffmpeg"
archive=ffmpeg-7.1.2.tar.xz
curl --fail --location --retry 3 https://ffmpeg.org/releases/ffmpeg-7.1.2.tar.xz --output "$archive"
python3 - "$archive" <<'PY'
import hashlib,sys
expected='089bc60fb59d6aecc5d994ff530fd0dcb3ee39aa55867849a2bbc4e555f9c304'
assert hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest()==expected, 'FFmpeg checksum mismatch'
PY
tar -xf "$archive"
cd ffmpeg-7.1.2
extra=()
case "$(uname -s)" in MINGW*|MSYS*) extra+=(--target-os=mingw32 --arch=x86_64 --cc=gcc --extra-ldflags=-static);; esac
./configure --disable-autodetect --disable-gpl --disable-nonfree --disable-doc --disable-debug --disable-shared --enable-static --disable-ffplay "${extra[@]}"
make -j2 ffmpeg
if [[ -f ffmpeg.exe ]]; then cp ffmpeg.exe "$root/engine-bin/${LP_PLATFORM:?Set LP_PLATFORM first}/ffmpeg.exe"; else cp ffmpeg "$root/engine-bin/${LP_PLATFORM:?Set LP_PLATFORM first}/ffmpeg"; fi
cp COPYING.LGPLv2.1 "$root/engine-bin/${LP_PLATFORM:?Set LP_PLATFORM first}/FFMPEG-LICENSE.txt"
cp ffbuild/config.log "$root/engine-bin/${LP_PLATFORM:?Set LP_PLATFORM first}/FFMPEG-BUILD-CONFIG.txt"
cp "../$archive" "$root/dist/sources/"
cp "$root/scripts/build-ffmpeg.sh" "$root/dist/sources/"
