#!/bin/sh
# Đẩy dSYM của bản Release (Archive cho TestFlight / App Store) lên Sentry, để
# stack của crash / treo đọc được tên hàm thay vì `<redacted>` (16/10).
#
# Chạy từ build phase "Upload dSYMs to Sentry" của target ASCND (project.yml).
# Không bao giờ làm hỏng build: thiếu sentry-cli hay thiếu khoá thì chỉ cảnh báo.
#
# Khoá: sentry-cli tự đọc `SENTRY_AUTH_TOKEN` hoặc `~/.sentryclirc` (tạo bằng
# `sentry-cli login`). Không có khoá nào trong repo. Org / project không bí mật.

[ "$CONFIGURATION" = "Release" ] || exit 0

# Homebrew trên Apple Silicon không nằm trong PATH của Xcode.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v sentry-cli >/dev/null 2>&1; then
  echo "warning: sentry-cli chưa cài — bỏ qua upload dSYM (brew install getsentry/tools/sentry-cli)"
  exit 0
fi

export SENTRY_ORG="${SENTRY_ORG:-ascnd-fitness}"
export SENTRY_PROJECT="${SENTRY_PROJECT:-apple-ios}"

if ! sentry-cli info >/dev/null 2>&1; then
  echo "warning: sentry-cli chưa đăng nhập — bỏ qua upload dSYM (chạy: sentry-cli login)"
  exit 0
fi

# Cả thư mục: app, widget extension và các framework của package.
if ! OUT=$(sentry-cli debug-files upload --include-sources "$DWARF_DSYM_FOLDER_PATH" 2>&1); then
  echo "warning: upload dSYM lên Sentry lỗi: $OUT"
  exit 0
fi
echo "$OUT" | tail -3
