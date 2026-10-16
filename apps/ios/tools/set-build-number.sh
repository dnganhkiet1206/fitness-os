#!/bin/sh
# Số build = số commit trên nhánh (16/10): mỗi Archive một số lớn hơn lần trước,
# không phải sửa tay — TestFlight từ chối số build trùng. App và widget cùng
# chạy script này nên luôn khớp nhau (App Store bắt buộc).
#
# Chỉ bản Release. Ghi vào Info.plist ĐÃ BUILD, không đụng file trong repo.
[ "$CONFIGURATION" = "Release" ] || exit 0
N=$(git -C "$SRCROOT" rev-list --count HEAD 2>/dev/null) || exit 0
[ -n "$N" ] || exit 0
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $N" "$TARGET_BUILD_DIR/$INFOPLIST_PATH"
echo "CFBundleVersion = $N"
