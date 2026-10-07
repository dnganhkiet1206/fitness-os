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
# NetInfo THẬT (bản trong native/node_modules, khoá theo package-lock): lớp
# trạng thái + phép dò internet (`internetReachability.ts`). Chỉ native module
# RNCNetInfo là giả (netinfo-native-stub.ts) — iOS không gửi
# isInternetReachable, nên mọi phép dò chạy trong mã JS này.
NI=../../../../native/node_modules/@react-native-community/netinfo/src/internal
mkdir lib/netinfo
for f in state internetReachability types privateTypes defaultConfiguration; do cp "$NI/$f.ts" "lib/netinfo/$f.ts"; done
cp netinfo-native-stub.ts lib/netinfo/nativeInterface.ts
../../../../native/node_modules/.bin/tsc --ignoreConfig --module commonjs --target es2020 --skipLibCheck --noCheck --esModuleInterop --outDir out --rootDir lib lib/*.ts lib/netinfo/*.ts
echo '{"type":"commonjs"}' > out/package.json
