#!/bin/sh
# Bước cổng: sinh lại golden `daily-log` từ mã RN hiện tại và so TỪNG BYTE với
# fixture Swift đang dùng. Khác nhau = RN đã đổi hành vi dựng `daily_logs`
# (hoặc fixture bị sửa tay) — port lại / sinh lại, không sửa expected cho xanh.
set -e
cd "$(dirname "$0")"
sh build.sh >/dev/null
FIX=../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/daily-log-golden.json
TMP=$(mktemp)
node gen.mjs > "$TMP"
if cmp -s "$TMP" "$FIX"; then
  echo "daily-log golden: khớp mã RN ($(wc -c < "$FIX") byte)"
  rm -f "$TMP"
else
  echo "daily-log golden: LỆCH mã RN — chạy apps/ios/tools/daily-log-golden/gen.mjs và xem Swift có còn khớp" >&2
  rm -f "$TMP"
  exit 1
fi
SFIX=../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/streak-golden.json
node gen-streak.mjs > "$TMP"
if cmp -s "$TMP" "$SFIX"; then
  echo "streak golden: khớp mã RN ($(wc -c < "$SFIX") byte)"
  rm -f "$TMP"
else
  echo "streak golden: LỆCH mã RN — chạy apps/ios/tools/daily-log-golden/gen-streak.mjs" >&2
  rm -f "$TMP"
  exit 1
fi
