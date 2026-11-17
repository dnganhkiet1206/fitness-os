#!/bin/sh
# Cảnh báo khi bản Release thiếu khoá đo lường (17/11, #527 mục 4).
#
# Chạy từ build phase "Check telemetry keys (Release)" của target ASCND
# (project.yml). Đo lường tắt hẳn một cách lặng lẽ khi khoá trống — đó là lý
# do audit round 2 thấy "zero error reporting" mà không ai hay. Bản Release
# thiếu khoá thì cảnh báo trong log build để người Archive thấy; không bao giờ
# làm hỏng build. Bản Debug thoát ngay: thiếu khoá ở Debug là bình thường.
#
# Khoá đọc từ build setting của xcconfig (Xcode xuất thành biến môi trường cho
# script phase). Không in giá trị, chỉ in tên biến thiếu.

[ "$CONFIGURATION" = "Release" ] || exit 0

if [ -z "$ASCND_SENTRY_DSN" ]; then
  echo "warning: ASCND_SENTRY_DSN trống — bản Release sẽ không gửi crash/lỗi lên Sentry (điền ở Config/Backend.local.xcconfig)"
fi
if [ -z "$ASCND_POSTHOG_KEY" ]; then
  echo "warning: ASCND_POSTHOG_KEY trống — bản Release sẽ không gửi sự kiện lên PostHog (điền ở Config/Backend.local.xcconfig)"
fi
if [ -z "$ASCND_POSTHOG_HOST" ]; then
  echo "warning: ASCND_POSTHOG_HOST trống — bản Release sẽ không gửi sự kiện lên PostHog (điền ở Config/Backend.local.xcconfig)"
fi
exit 0
