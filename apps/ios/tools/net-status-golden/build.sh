#!/bin/sh
# Chép `net-status.ts` RN từ CÂY LÀM VIỆC (`native/src/lib` — hợp đồng sản
# phẩm), thay NetInfo bằng bản giả, biên dịch sang CommonJS. Không chép luật
# nào: golden là output của CHÍNH mã RN. RN đổi một dòng thì `verify.sh` (bước
# cổng) đỏ, và Swift phải port lại.
set -e
cd "$(dirname "$0")"
rm -rf lib out && mkdir lib
cp ../../../../native/src/lib/net-status.ts lib/net-status.ts
cp netinfo-stub.ts lib/netinfo-stub.ts
sed -i.bak -e "s#'@react-native-community/netinfo'#'./netinfo-stub'#g" lib/net-status.ts && rm -f lib/*.bak
../../../../native/node_modules/.bin/tsc --ignoreConfig --module commonjs --target es2020 --skipLibCheck --noCheck --esModuleInterop --outDir out lib/*.ts
echo '{"type":"commonjs"}' > out/package.json
