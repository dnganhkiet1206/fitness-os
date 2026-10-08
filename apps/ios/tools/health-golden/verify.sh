#!/bin/sh
# Bước cổng: sinh lại golden Apple Health từ mã RN hiện tại (`native/src/lib`)
# và so TỪNG BYTE với fixture Swift. Khác = RN đổi cách gom giấc ngủ / sinh
# trắc / buổi tập / bước — port lại, không sửa expected cho xanh.
set -e
cd "$(dirname "$0")"
sh build.sh >/dev/null
FIX=../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/health-golden.json
TMP=$(mktemp)
node gen.mjs > "$TMP"
if cmp -s "$TMP" "$FIX"; then
  echo "health golden: khớp mã RN ($(wc -c < "$FIX") byte)"
  rm -f "$TMP"
else
  echo "health golden: LỆCH mã RN — chạy apps/ios/tools/health-golden/gen.mjs và xem Swift có còn khớp" >&2
  rm -f "$TMP"
  exit 1
fi
