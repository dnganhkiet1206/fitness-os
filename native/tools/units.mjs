/**
 * Đổi đơn vị phải đi-về đúng: cân nặng, chiều cao, thể tích.
 *
 * ── vì sao gate này tồn tại ──
 *
 * Mọi chỉ số cơ thể lưu theo metric (weight_kg, height_cm) trong DB, còn màn
 * hình hiện theo đơn vị người dùng chọn. Một converter lệch là một con số
 * người ta nhìn thấy sai mỗi ngày — và sai ở cả hai chiều: hiện sai, rồi
 * parse sai khi họ sửa lại.
 *
 * ── hai lớp assert ──
 *
 * 1. Round-trip: `lbsToKg(kgToLbs(x)) ≈ x` trên nhiều x. Bẫy: round-trip TỰ
 *    NHẤT QUÁN ngay cả khi hằng số sai (đổi 2.20462 thành 2.2 thì đi-về vẫn
 *    khớp) — nên round-trip một mình không đủ.
 * 2. Spot-check hằng số vật lý: `kgToLbs(1) = 2.2046226218` (định nghĩa
 *    pound quốc tế), `cmToIn(2.54) = 1` (định nghĩa inch), `mlToOz(29.5735296)
 *    = 1` (US fluid ounce). Hằng số đổi là đỏ ở đây.
 *
 * Chạy THẬT các hàm từ `src/lib/units.ts` (import trực tiếp qua
 * type-stripping của Node). Các hàm `display*` làm tròn 1 chữ số nên
 * round-trip của chúng có dung sai ±0.06 — đó là thiết kế, không phải lỗi.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const u = await import(pathToFileURL(path.join(NATIVE, 'src/lib/units.ts')).href);
for (const name of ['kgToLbs', 'lbsToKg', 'cmToIn', 'inToCm', 'mlToOz', 'ozToMl']) {
  if (typeof u[name] !== 'function') {
    console.error(`đơn vị HỎNG\n  - src/lib/units.ts: thiếu export ${name} — gate mù?`);
    process.exit(1);
  }
}

const close = (got, want, tol, what) => {
  if (!Number.isFinite(got) || Math.abs(got - want) > tol) {
    problems.push(`${what}: được ${got}, muốn ${want} (±${tol})`);
  }
};

let n = 0;
/* ── round-trip chính xác (không làm tròn) ── */
for (const x of [0, 1, 0.5, 70, 175, 500]) {
  n++;
  close(u.lbsToKg(u.kgToLbs(x)), x, 1e-9, `lbsToKg(kgToLbs(${x}))`);
  close(u.inToCm(u.cmToIn(x)), x, 1e-9, `inToCm(cmToIn(${x}))`);
  close(u.ozToMl(u.mlToOz(x)), x, 1e-9, `ozToMl(mlToOz(${x}))`);
  close(u.weightToKg(u.convertWeight(x, 'lbs'), 'lbs'), x, 1e-9, `weightToKg(convertWeight(${x},lbs))`);
  close(u.heightToCm(u.convertLength(x, 'in'), 'in'), x, 1e-9, `heightToCm(convertLength(${x},in))`);
  close(u.volumeToMl(u.displayVolume(x, 'oz'), 'oz'), x, 1, `volumeToMl(displayVolume(${x},oz))`);
}
/* ── round-trip qua display (làm tròn 1 chữ số) ── */
for (const x of [62.5, 70, 175]) {
  n++;
  close(u.weightToKg(u.displayWeight(x, 'lbs'), 'lbs'), x, 0.06, `displayWeight round-trip ${x}kg`);
  /* display làm tròn 0.1 in → sai số tối đa 0.05 in = 0.127 cm: đó là giá của
     việc hiển thị, không phải converter lệch */
  close(u.heightToCm(u.displayHeight(x, 'in'), 'in'), x, 0.13, `displayHeight round-trip ${x}cm`);
}
/* ── spot-check hằng số vật lý ── */
n += 4;
close(u.kgToLbs(1), 2.2046226218, 1e-9, 'kgToLbs(1) — pound quốc tế');
close(u.cmToIn(2.54), 1, 1e-12, 'cmToIn(2.54) — định nghĩa inch');
close(u.mlToOz(29.5735296), 1, 1e-9, 'mlToOz(29.5735296) — US fluid ounce');
close(u.ozToMl(1), 29.5735296, 1e-9, 'ozToMl(1) — US fluid ounce');
/* ── format ── */
n += 2;
if (u.formatHeight(175, 'in') !== `5'9"`) problems.push(`formatHeight(175,'in') = ${u.formatHeight(175, 'in')}, muốn 5'9"`);
if (u.formatWeight(70, 'lbs') !== '154.3 lb') problems.push(`formatWeight(70,'lbs') = ${u.formatWeight(70, 'lbs')}, muốn 154.3 lb`);

if (problems.length) {
  console.error(`đơn vị HỎNG\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`đơn vị OK — ${n} assert round-trip + hằng số vật lý + format xanh`);
