#!/bin/zsh
# Chụp lại ảnh màn hình app cho site (src/img/app/{vi,en,es}-{today,nutrition,progress}.jpg).
#
# Cần: simulator đang chạy, đã cài bản Debug (com.ascnd.fitnessos.dev), đã đăng nhập tài khoản
# test có dữ liệu. Mỗi ngôn ngữ chạy lại app với -AppleLanguages; thanh trạng thái đặt 9:41.
# Ảnh Hôm nay có chữ viết tắt tên tài khoản ở góc trên phải: làm mờ trước khi đưa lên web.
# Toạ độ làm mờ tính cho iPhone Air (1260 × 2736); máy khác thì xem lại ảnh và sửa BLUR.
# Nhiều simulator đang chạy: đặt DEVICE=<UDID> (mặc định "booted").
# Ảnh rộng 900 px (23/10: 590 px mờ khi điện thoại trên trang to lên).
set -e
BUNDLE=com.ascnd.fitnessos.dev
OUT=${0:a:h}/../src/img/app
TMP=$(mktemp -d)
DEVICE=${DEVICE:-booted}
WIDTH=900
BLUR="150x150+1090+195"

xcrun simctl status_bar $DEVICE override --time "9:41" --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularMode notSupported
for L in vi en es; do
  xcrun simctl terminate $DEVICE $BUNDLE 2>/dev/null || true
  sleep 1
  xcrun simctl launch $DEVICE $BUNDLE -AppleLanguages "($L)" -AppleLocale "$L" >/dev/null
  sleep 10   # chờ đồng bộ xong, tránh banner Ngoại tuyến
  for P in today:/ nutrition:/nutrition progress:/community; do
    xcrun simctl openurl $DEVICE "ascnd://${P#*:}"
    sleep 4
    xcrun simctl io $DEVICE screenshot "$TMP/$L-${P%%:*}.png" >/dev/null
  done
  magick "$TMP/$L-today.png" \( +clone -crop $BLUR -blur 0x18 \) -geometry +${BLUR#*+} -composite -resize ${WIDTH}x -quality 84 "$OUT/$L-today.jpg"
  for n in nutrition progress; do magick "$TMP/$L-$n.png" -resize ${WIDTH}x -quality 84 "$OUT/$L-$n.jpg"; done
done
xcrun simctl status_bar $DEVICE clear
# Trả app về ngôn ngữ của máy.
xcrun simctl terminate $DEVICE $BUNDLE 2>/dev/null || true
xcrun simctl launch $DEVICE $BUNDLE >/dev/null
echo "Xong: $OUT — mở từng ảnh kiểm tra (nhất là chỗ làm mờ) trước khi commit."
