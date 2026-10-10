#!/bin/sh
# Tách các lib RN @ fac9ac2 cần cho các golden (insights, thư viện, hướng dẫn, kế hoạch, nhắc nhở, thước) và biên dịch sang CommonJS.
set -e
cd "$(dirname "$0")"
rm -rf lib out && mkdir lib
for f in exercise-trend exercise-performance personal-record local-date exercise-kind exercise-key muscle-group equipment guide-content exercise-media guide-related fitness-calc plausible reminder-plan reminder-timing units plan-exercises copy-fill macro-targets mascot-room streak readiness-i18n training-card award-grant challenge-progress nutrition-mean readiness-week assistant-suggestions assistant-brief metric-analysis adaptive-tdee photo-urls; do
  git show "fac9ac2:native/src/lib/$f.ts" > "lib/$f.ts"
done
# Hai phụ thuộc chỉ để lấy một hằng / một kiểu.
echo 'export const MIN_SESSIONS = 3;' > lib/load-progression.ts   # load-progression.ts:87
echo "export type Confidence = 'none' | 'low' | 'medium' | 'high';" > lib/user-state.ts
# Phòng linh vật (#527 Phase 7): `mascot-room.ts` chỉ lấy kiểu `AppLang`.
echo "export type AppLang = 'vi' | 'en' | 'es';" > lib/i18n.ts
# Builder (#527 Phase 2): `estimatedMinutes` / `effortRange` / `DEFAULT_*`.
git show "fac9ac2:native/src/lib/prescription.ts" > lib/prescription.ts
sed -i.bak "s#'@/lib/\([a-z0-9-]*\)'#'./\1'#g" lib/*.ts && rm -f lib/*.bak
../../../../native/node_modules/.bin/tsc --ignoreConfig --module commonjs --target es2020 --skipLibCheck --outDir out lib/*.ts
echo '{"type":"commonjs"}' > out/package.json
