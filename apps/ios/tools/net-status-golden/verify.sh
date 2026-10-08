#!/bin/sh
# Bước cổng: sinh lại golden trạng thái mạng từ mã RN hiện tại và so TỪNG BYTE
# với fixture Swift. Khác nhau = RN đã đổi luật (hoặc fixture bị sửa tay) —
# port lại / sinh lại, không sửa expected cho xanh.
set -e
cd "$(dirname "$0")"
sh build.sh >/dev/null
FIX=../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/net-status-golden.json
TMP=$(mktemp)
node gen.mjs > "$TMP"
if cmp -s "$TMP" "$FIX"; then
  echo "net-status golden: khớp mã RN ($(wc -c < "$FIX") byte)"
  rm -f "$TMP"
else
  echo "net-status golden: LỆCH mã RN — chạy apps/ios/tools/net-status-golden/gen.mjs và xem Swift có còn khớp" >&2
  rm -f "$TMP"
  exit 1
fi
