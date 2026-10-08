#!/bin/sh
# Chép phần HealthKit của RN từ CÂY LÀM VIỆC (`native/src/lib`), thay
# `react-native` và `@kingstinct/react-native-healthkit` bằng bản giả trả về
# đúng các mẫu HealthKit của fixture, rồi biên dịch sang CommonJS. Golden là
# output của CHÍNH mã RN (`health.ts`, `step-days.ts`, `health-days.ts`).
set -e
cd "$(dirname "$0")"
RN=../../../../native/src/lib
rm -rf lib out && mkdir lib
for f in health step-days health-days local-date; do
  cp "$RN/$f.ts" "lib/$f.ts"
done
cp hk-stub.ts lib/hk-stub.ts
echo "export const Platform = { OS: 'ios' };" > lib/rn-stub.ts
echo "export type AppLang = 'vi' | 'en' | 'es';" > lib/i18n.ts
sed -i.bak \
  -e "s#from 'react-native'#from './rn-stub'#g" \
  -e "s#require('@kingstinct/react-native-healthkit')#require('./hk-stub')#g" \
  -e "s#typeof import('@kingstinct/react-native-healthkit')#typeof import('./hk-stub')#g" \
  -e "s#'@/lib/\([a-z0-9-]*\)'#'./\1'#g" \
  lib/*.ts && rm -f lib/*.bak
../../../../native/node_modules/.bin/tsc --ignoreConfig --module commonjs --target es2020 --skipLibCheck --noCheck --outDir out lib/*.ts
echo '{"type":"commonjs"}' > out/package.json
