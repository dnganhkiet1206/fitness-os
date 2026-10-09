#!/usr/bin/env node
/**
 * Golden cho màn Giấc ngủ (#527) — `app/sleep-insights.tsx` @ fac9ac2.
 *
 * Phần tính của màn không export: chép NGUYÊN VĂN `nights` (bỏ `day`, phần
 * chữ theo locale), `stats`, `insights`, chú thích hero, `maxH` và số phút của
 * từng hàng; `asleepMinutes` chép từ `daily-log-service.ts:163`. Đêm lấy mẫu
 * bằng LCG cố định: có / không có tầng (ghi tay), `asleep_min` có / không,
 * chất lượng, mục tiêu ngủ của hồ sơ (số, chuỗi, rỗng, 0).
 *
 * `fixedVi` / `fixedEn`: CHÍNH mã ấy với nợ ngủ tính trên số đêm đã ghi thay
 * cho 7 (lệch có chủ ý của native — xem `NATIVE_IMPROVEMENTS.md`).
 *
 *   node gen-sleep.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/sleep-golden.json
 */
let seed = 714;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
// daily-log-service.ts:163
function asleepMinutes(sleep) {
  if (sleep.asleep_min != null && sleep.asleep_min > 0) return Math.round(sleep.asleep_min);
  const bed = new Date(sleep.bedtime).getTime();
  const wake = new Date(sleep.waketime).getTime();
  return Math.max(0, Math.round((wake - bed) / 60000));
}
function screen(sleepLogs, profile, lang, debtNights = 7) {
  const targetHours = Number(profile?.sleep_target_hours) || 8;
  const nights = (sleepLogs ?? []).map((s) => {
    const deep = Number(s.deep_min ?? 0);
    const rem = Number(s.rem_min ?? 0);
    const light = Number(s.light_min ?? 0);
    const stagesKnown = deep + rem + light > 0;
    const total = asleepMinutes(s);
    return { total_h: total / 60, deep_h: deep / 60, rem_h: rem / 60, light_h: light / 60, stagesKnown, quality: Number(s.quality ?? 0) };
  });
  const stats = (() => {
    if (nights.length === 0) return null;
    const n = nights.length;
    const sum = (f) => nights.reduce((a, x) => a + f(x), 0);
    const avgTotal = sum((d) => d.total_h) / n;
    const avgQuality = sum((d) => d.quality) / n;
    const staged = nights.filter((d) => d.stagesKnown);
    const avgDeep = staged.length ? staged.reduce((a, d) => a + d.deep_h, 0) / staged.length : null;
    const avgRem = staged.length ? staged.reduce((a, d) => a + d.rem_h, 0) / staged.length : null;
    // RN: `targetHours * 7`. Biến thể `fixed` (native): số đêm ĐÃ GHI.
    const debt = Math.max(0, targetHours * (debtNights === 'n' ? n : debtNights) - sum((d) => d.total_h));
    return { avgTotal, avgQuality, avgDeep, avgRem, debt };
  })();
  const insights = (() => {
    if (!stats) return [];
    const out = [];
    if (stats.avgTotal < targetHours - 0.5) {
      out.push(lang === 'vi'
        ? `Bạn ngủ trung bình ${stats.avgTotal.toFixed(1)}h, thiếu ${(targetHours - stats.avgTotal).toFixed(1)}h so với mục tiêu.`
        : `You sleep ${stats.avgTotal.toFixed(1)}h on average, short by ${(targetHours - stats.avgTotal).toFixed(1)}h vs target.`);
    }
    if (stats.avgDeep !== null && stats.avgDeep < 1) {
      out.push(lang === 'vi' ? 'Deep sleep thấp (<1h). Hãy tránh rượu và caffeine trước giờ ngủ.' : 'Deep sleep is low (<1h). Avoid alcohol and caffeine before bed.');
    }
    if (stats.avgRem !== null && stats.avgRem < 1.2) {
      out.push(lang === 'vi' ? 'REM sleep thấp. Cố gắng đi ngủ đều giờ hơn.' : 'REM sleep is low. Try to keep a consistent bedtime.');
    }
    if (stats.debt > 5) {
      out.push(lang === 'vi'
        ? `Nợ giấc ngủ tuần: ${stats.debt.toFixed(1)}h. Cân nhắc ngủ bù cuối tuần.`
        : `Weekly sleep debt: ${stats.debt.toFixed(1)}h. Consider catching up on weekends.`);
    }
    if (stats.avgQuality >= 7) out.push(lang === 'vi' ? 'Chất lượng giấc ngủ tốt! Giữ vững thói quen.' : 'Sleep quality is good! Keep it up.');
    return out;
  })();
  const vi = lang === 'vi';
  const caption = !stats ? null : stats.avgTotal >= targetHours
    ? (vi ? `Đạt mục tiêu ${targetHours}h` : `Meeting your ${targetHours}h target`)
    : (vi ? `Thiếu ${(targetHours - stats.avgTotal).toFixed(1)}h so với mục tiêu ${targetHours}h` : `${(targetHours - stats.avgTotal).toFixed(1)}h short of your ${targetHours}h target`);
  const maxH = Math.max(targetHours * 1.15, ...nights.map((n) => n.total_h));
  const rows = [...(sleepLogs ?? [])].reverse().map((s) => {
    const mins = asleepMinutes(s);
    return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
  });
  const metrics = stats && {
    avgQuality: stats.avgQuality.toFixed(1),
    avgDeep: stats.avgDeep === null ? '—' : `${stats.avgDeep.toFixed(1)}h`,
    debt: `${stats.debt.toFixed(1)}h`,
  };
  return { targetHours, nights, stats, insights, caption, maxH, rows, metrics };
}
const TARGETS = [8, 7, 6.5, '7.5', '', null, 0, 'abc', 9];
const cases = [];
for (let i = 0; i < 160; i++) {
  const n = rnd(8);
  const logs = [];
  for (let k = n; k >= 1; k--) {
    const wake = Date.UTC(2026, 9, 9 - k, 23 - rnd(3), rnd(60));
    const lenMin = [0, 180, 330, 405, 419, 420, 455, 480, 541, 610][rnd(10)];
    const staged = rnd(3) > 0;
    const row = {
      id: `n${i}-${k}`,
      bedtime: new Date(wake - lenMin * 60000).toISOString(),
      waketime: new Date(wake).toISOString(),
      asleep_min: [null, null, 0, Math.max(0, lenMin - 29), lenMin + 0.4][rnd(5)],
      deep_min: staged ? [0, 35, 59, 60, 61, 95][rnd(6)] : [null, 0][rnd(2)],
      rem_min: staged ? [0, 50, 71, 72, 73, 110][rnd(6)] : [null, 0][rnd(2)],
      light_min: staged ? [0, 180, 240][rnd(3)] : [null, 0][rnd(2)],
      quality: [null, 0, 5, 6.9, 7, 8, 10][rnd(7)],
    };
    logs.push(row);
  }
  const profile = rnd(5) === 0 ? null : { sleep_target_hours: TARGETS[rnd(TARGETS.length)] };
  cases.push({
    logs, profile, vi: screen(logs, profile, 'vi'), en: screen(logs, profile, 'en'),
    fixedVi: screen(logs, profile, 'vi', 'n'), fixedEn: screen(logs, profile, 'en', 'n'),
  });
}
process.stdout.write(JSON.stringify(cases, null, 1) + '\n');
