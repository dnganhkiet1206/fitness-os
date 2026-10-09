#!/bin/sh
# Chép mã nước của RN từ CÂY LÀM VIỆC (`native/src/lib` — hợp đồng sản phẩm)
# và biên dịch sang CommonJS. Không chép luật nào: golden là output của CHÍNH
# mã RN. RN đổi một dòng thì `verify.sh` (bước cổng) đỏ, và Swift phải port lại.
set -e
cd "$(dirname "$0")"
rm -rf lib out && mkdir lib
for f in units water-scale water-presets; do cp "../../../../native/src/lib/$f.ts" "lib/$f.ts"; done
sed -i.bak -e "s#'@/lib/units'#'./units'#g" lib/*.ts && rm -f lib/*.bak
../../../../native/node_modules/.bin/tsc --ignoreConfig --module commonjs --target es2020 --skipLibCheck --noCheck --esModuleInterop --outDir out --rootDir lib lib/*.ts
echo '{"type":"commonjs"}' > out/package.json
