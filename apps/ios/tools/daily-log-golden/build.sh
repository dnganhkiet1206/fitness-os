#!/bin/sh
# Chép các lib RN mà `recomputeDailyLog` dùng từ CÂY LÀM VIỆC (`native/src/lib` —
# hợp đồng sản phẩm hiện tại; trùng fac9ac2 lúc port), thay client Supabase bằng
# bản giả trong bộ nhớ (supabase-stub.ts), rồi biên dịch sang CommonJS.
# Không chép công thức nào: golden là output của CHÍNH mã RN. RN đổi một dòng
# thì `verify.sh` (bước cổng) đỏ, và Swift phải port lại.
set -e
cd "$(dirname "$0")"
RN=../../../../native/src/lib
rm -rf lib out && mkdir lib
for f in daily-log-service local-date training-card session-load readiness-engine readiness-i18n types streak; do
  cp "$RN/$f.ts" "lib/$f.ts"
done
cp supabase-stub.ts lib/supabase-stub.ts
# readiness-i18n chỉ cần KIỂU AppLang từ i18n.
echo "export type AppLang = 'vi' | 'en' | 'es';" > lib/i18n.ts
sed -i.bak \
  -e "s#'@/integrations/supabase/client'#'./supabase-stub'#g" \
  -e "s#'@/lib/\([a-z0-9-]*\)'#'./\1'#g" \
  lib/*.ts && rm -f lib/*.bak
../../../../native/node_modules/.bin/tsc --ignoreConfig --module commonjs --target es2020 --skipLibCheck --noCheck --outDir out lib/*.ts
echo '{"type":"commonjs"}' > out/package.json
