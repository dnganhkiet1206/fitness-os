#!/bin/sh
# Tách các lib RN @ fac9ac2 cần cho Exercise Insights và biên dịch sang CommonJS.
set -e
cd "$(dirname "$0")"
rm -rf lib out && mkdir lib
for f in exercise-trend exercise-performance personal-record local-date exercise-kind exercise-key muscle-group equipment guide-content exercise-media guide-related fitness-calc plausible; do
  git show "fac9ac2:native/src/lib/$f.ts" > "lib/$f.ts"
done
# Hai phụ thuộc chỉ để lấy một hằng / một kiểu.
echo 'export const MIN_SESSIONS = 3;' > lib/load-progression.ts   # load-progression.ts:87
echo "export type Confidence = 'none' | 'low' | 'medium' | 'high';" > lib/user-state.ts
sed -i.bak "s#'@/lib/\([a-z-]*\)'#'./\1'#g" lib/*.ts && rm -f lib/*.bak
../../../../native/node_modules/.bin/tsc --ignoreConfig --module commonjs --target es2020 --skipLibCheck --outDir out lib/*.ts
echo '{"type":"commonjs"}' > out/package.json
