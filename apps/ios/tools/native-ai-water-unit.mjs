/**
 * Đơn vị nước trong câu AI (Kiệt 27/10, #527).
 *
 * Tài khoản oz đọc "bạn mới uống 473ml thôi" ngay dưới "16 oz nước hôm nay": sổ lưu
 * ml, hai hàm AI chỉ biết ml. Nay app gửi `waterUnit` và hai hàm `ai-smart-nudges`,
 * `ai-coach` đổi số nước sang đơn vị ấy TRƯỚC khi tới model, kèm một luật viết.
 *
 * Cổng này kiểm:
 *  A. `_shared/water.ts` thật (Node bỏ kiểu TS): đổi đúng như app, app cũ (không gửi
 *     gì / giá trị lạ) → "ml".
 *  B. Cả hai hàm đọc `waterUnit` qua `readWaterUnit` và nối `waterRule`; nudges không
 *     gửi `water_today_ml` cho tài khoản oz.
 *  C. App gửi `waterUnit` ở cả hai thân request.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

// A. Hàm dùng chung, chạy thật.
const water = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/_shared/water.ts')).href);
check(water.readWaterUnit(undefined) === 'ml', 'A: app cũ không gửi đơn vị → phải là ml');
check(water.readWaterUnit('L') === 'ml', 'A: giá trị lạ → ml');
check(water.readWaterUnit('oz') === 'oz', 'A: "oz" → oz');
check(water.showWater(473, 'oz') === '16 oz', `A: 473 ml → "16 oz" (được ${water.showWater(473, 'oz')})`);
check(water.showWater(473, 'ml') === '473 ml', 'A: 473 ml giữ ml');
check(water.showWater(1500, 'ml') === '1.5 L', 'A: 1500 ml → 1.5 L');
check(water.waterAmount(2500, 'oz') === 85, `A: mục tiêu 2500 ml → 85 oz (được ${water.waterAmount(2500, 'oz')})`);
const appFactor = read('apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Nutrition/Water.swift').match(/mlPerFloz = ([\d.]+)/)?.[1];
check(Number(appFactor) === water.ML_PER_FLOZ, `A: hệ số ml/oz khác app (${appFactor} vs ${water.ML_PER_FLOZ})`);
check(/never ml or L/.test(water.waterRule('oz', 'en')) && /không bao giờ viết ml/.test(water.waterRule('oz', 'vi')),
  'A: luật oz phải cấm ml / L');

// B. Hai hàm.
for (const fn of ['ai-smart-nudges', 'ai-coach']) {
  const src = read(`supabase/functions/${fn}/index.ts`);
  check(/from "\.\.\/_shared\/water\.ts"/.test(src), `B: ${fn} không import _shared/water.ts`);
  check(/readWaterUnit\((body\?\.)?waterUnit\)/.test(src), `B: ${fn} không đọc waterUnit qua readWaterUnit`);
  check(/waterRule\(water_unit/.test(src), `B: ${fn} không nối waterRule vào prompt`);
}
const nudges = read('supabase/functions/ai-smart-nudges/index.ts');
check(/water_unit === "oz" \? \{ water_today_oz/.test(nudges), 'B: nudges phải gửi water_today_oz cho tài khoản oz');
const coach = read('supabase/functions/ai-coach/index.ts');
check(/if \(kind === "water"\) return showWater\(v, unit\)/.test(coach), 'B: câu hỏi lại số nước của coach phải theo đơn vị');

// C. App gửi đơn vị.
const nudgesApp = read('apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/AI/SmartNudges.swift');
check(/"waterUnit": \.string\(waterUnit\.rawValue\)/.test(nudgesApp), 'C: SmartNudges.requestBody thiếu waterUnit');
const coachApp = read('apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/AI/Coach.swift');
check(/"waterUnit": \.string\(waterUnit\.rawValue\)/.test(coachApp), 'C: Coach.requestBody thiếu waterUnit');
const backend = read('apps/ios/Packages/ASCNDBackend/Sources/ASCNDBackend/SupabaseCoach.swift');
check(/Coach\.requestBody\(/.test(backend), 'C: SupabaseCoachStream phải gửi Coach.requestBody');
const today = read('apps/ios/ASCND/Features/Today/TodayCoachSection.swift');
check(/waterUnit: services\.preferences\.volumeUnit/.test(today), 'C: thẻ Insight phải gửi đơn vị của người dùng');

if (fails.length) {
  console.error(`native-ai-water-unit: ${fails.length} lỗi\n- ${fails.join('\n- ')}`);
  process.exit(1);
}
console.log('native-ai-water-unit: ok');
