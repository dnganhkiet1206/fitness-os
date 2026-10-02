/**
 * Live Activity mồ côi (#198 follow-up).
 *
 * ── ba lỗi đã sửa ──
 *
 * 1. Promise `start` trả về muộn sau khi generation đã đổi (end() hoặc một
 *    start() khác chen vào giữa) thì bản cũ chỉ BỎ id đi — activity native
 *    vẫn chạy, treo một đảo đếm ngược mồ côi trên màn hình. Bản mới: id stale
 *    thì END chứ không bỏ.
 *
 * 2. Người dùng bấm ±15s trong lúc promise `start` còn bay thì bản cũ nuốt
 *    luôn (activeId còn null) — đảo hiện endDate cũ, sai đúng 15 giây tới hết
 *    quãng nghỉ. Bản mới: cất điều chỉnh lại, replay khi id về.
 *
 * 3. `resting` là state của DayPlan: back navigation hoặc chuyển ngày giữa
 *    quãng nghỉ thì đồng hồ trong app mất mà đảo vẫn đếm — hai mặt phản ánh
 *    hai trạng thái khác nhau. Bản mới: unmount thì end.
 *
 * Cổng này biên dịch `createRestLiveActivity` với một facade giả mà promise
 * điều khiển được, rồi chạy tám kịch bản đua — không cần máy thật, không cần
 * bridge thật.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = mkdtempSync(path.join(os.tmpdir(), 'rest-live-'));
const problems = [];
try {
  // Facade giả: start() treo cho tới khi test thả promise ra.
  writeFileSync(
    path.join(tmp, 'stub.ts'),
    `export const calls: string[] = [];
let resolvers: Array<(id: string | null) => void> = [];
export function __resolveNext(id: string | null): void {
  const r = resolvers.shift();
  if (r) r(id);
}
export async function startRestActivity(s: any): Promise<string | null> {
  calls.push('start:' + s.totalSeconds + ':' + s.remainingSeconds);
  return new Promise((resolve) => resolvers.push(resolve));
}
export async function updateRestActivity(id: string, s: any): Promise<boolean> {
  calls.push('update:' + id + ':' + s.totalSeconds + ':' + s.remainingSeconds);
  return true;
}
export async function endRestActivity(id: string): Promise<void> {
  calls.push('end:' + id);
}
`,
  );

  const HARNESS = `
import { createRestLiveActivity } from './rest-live-activity';
import * as stub from './stub';

const D = { exerciseName: 'Bench Press', setNumber: 2, totalSets: 3 };
let failures = 0;
const tick = () => new Promise((r) => setTimeout(r, 0));
function check(name: string, cond: boolean, seen: string): void {
  if (cond) console.log('ok: ' + name);
  else { failures++; console.log('FAIL: ' + name + ' — got [' + seen + ']'); }
}

async function scenario1(): Promise<void> {
  stub.calls.length = 0;
  const la = createRestLiveActivity(stub as any);
  la.restLiveActivityStarted(D, 90, 90);
  la.restLiveActivityEnded();
  stub.__resolveNext('id1');
  await tick();
  const seen = stub.calls.join(',');
  check('stale-after-end: orphan ended, never adopted', seen === 'start:90:90,end:id1', seen);
}

async function scenario2(): Promise<void> {
  stub.calls.length = 0;
  const la = createRestLiveActivity(stub as any);
  la.restLiveActivityStarted(D, 90, 90);
  la.restLiveActivityStarted({ ...D, setNumber: 3 }, 90, 90);
  stub.__resolveNext('idA');
  await tick();
  stub.__resolveNext('idB');
  await tick();
  const seen = stub.calls.join(',');
  check(
    'stale-after-restart: first orphan ended, second adopted',
    seen === 'start:90:90,start:90:90,end:idA' && !seen.includes('end:idB'),
    seen,
  );
}

async function scenario3(): Promise<void> {
  stub.calls.length = 0;
  const la = createRestLiveActivity(stub as any);
  la.restLiveActivityStarted(D, 90, 90);
  la.restLiveActivityAdjusted(105, 105);
  stub.__resolveNext('id1');
  await tick();
  const seen = stub.calls.join(',');
  check('adjust-before-resolve: replayed on arrival', seen === 'start:90:90,update:id1:105:105', seen);
}

async function scenario4(): Promise<void> {
  stub.calls.length = 0;
  const la = createRestLiveActivity(stub as any);
  la.restLiveActivityStarted(D, 90, 90);
  la.restLiveActivityAdjusted(105, 105);
  la.restLiveActivityEnded();
  stub.__resolveNext('id1');
  await tick();
  const seen = stub.calls.join(',');
  check('adjust-then-end: no replay, orphan ended', seen === 'start:90:90,end:id1', seen);
}

async function scenario5(): Promise<void> {
  stub.calls.length = 0;
  const la = createRestLiveActivity(stub as any);
  la.restLiveActivityStarted(D, 90, 90);
  stub.__resolveNext('id1');
  await tick();
  la.restLiveActivityAdjusted(75, 60);
  la.restLiveActivityEnded();
  await tick();
  const seen = stub.calls.join(',');
  check('normal: start/update/end', seen === 'start:90:90,update:id1:75:60,end:id1', seen);
}

async function scenario6(): Promise<void> {
  stub.calls.length = 0;
  const la = createRestLiveActivity(stub as any);
  la.restLiveActivityStarted(D, 90, 90);
  la.restLiveActivityStarted({ ...D, setNumber: 3 }, 90, 90);
  la.restLiveActivityAdjusted(90, 80);
  stub.__resolveNext('idA');
  await tick();
  stub.__resolveNext('idB');
  await tick();
  const seen = stub.calls.join(',');
  check(
    'double-start-adjust: orphan ended, adjust replayed on survivor',
    seen === 'start:90:90,start:90:90,end:idA,update:idB:90:80',
    seen,
  );
}

async function scenario7(): Promise<void> {
  stub.calls.length = 0;
  const la = createRestLiveActivity(stub as any);
  la.restLiveActivityStarted(D, 90, 90);
  stub.__resolveNext(null);
  await tick();
  la.restLiveActivityAdjusted(105, 105);
  la.restLiveActivityEnded();
  await tick();
  const seen = stub.calls.join(',');
  check('null-resolve: no crash, no-ops', seen === 'start:90:90', seen);
}

async function scenario8(): Promise<void> {
  stub.calls.length = 0;
  const la = createRestLiveActivity(stub as any);
  la.restLiveActivityEnded();
  la.restLiveActivityAdjusted(105, 105);
  await tick();
  check('idle end/adjust: silent', stub.calls.length === 0, stub.calls.join(','));
}

(async () => {
  await scenario1();
  await scenario2();
  await scenario3();
  await scenario4();
  await scenario5();
  await scenario6();
  await scenario7();
  await scenario8();
  if (failures > 0) { throw new Error(failures + ' scenario(s) failed'); }
  console.log('8/8 race scenarios green');
})();
`;
  writeFileSync(path.join(tmp, 'harness.ts'), HARNESS);

  // Đổi import sang stub rồi biên dịch cả ba tệp ra CommonJS.
  const src = readFileSync(path.join(NATIVE, 'src/native/ios/rest-live-activity.ts'), 'utf8').replace(
    "from './ASCNDLiveActivity'",
    "from './stub'",
  );
  writeFileSync(path.join(tmp, 'rest-live-activity.ts'), src);
  execFileSync(
    'npx',
    [
      'tsc',
      '--module', 'commonjs',
      '--target', 'es2020',
      '--moduleResolution', 'bundler',
      '--esModuleInterop',
      '--skipLibCheck',
      '--ignoreConfig',
      '--outDir', path.join(tmp, 'out'),
      path.join(tmp, 'stub.ts'),
      path.join(tmp, 'harness.ts'),
      path.join(tmp, 'rest-live-activity.ts'),
    ],
    { cwd: NATIVE, stdio: 'pipe' },
  );
  execFileSync('node', [path.join(tmp, 'out', 'harness.js')], { stdio: 'inherit' });

  // Tĩnh: DayPlan unmount giữa quãng nghỉ thì phải end Live Activity.
  const panel = readFileSync(path.join(NATIVE, 'src/components/ascnd/day-plan.tsx'), 'utf8');
  const anchor = panel.indexOf('The island must not outlive this screen');
  const cleanupOk =
    anchor !== -1 && /restLiveActivityEnded\(\);/.test(panel.slice(anchor, anchor + 600));
  if (!cleanupOk) problems.push('day-plan.tsx thiếu cleanup unmount → restLiveActivityEnded()');
} catch (err) {
  problems.push('không chạy được kịch bản: ' + String(err && err.message ? err.message : err).split('\n')[0]);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (problems.length > 0) {
  for (const p of problems) console.log('VẤN ĐỀ: ' + p);
  process.exit(1);
}
console.log('CỔNG XANH: live-activity không mồ côi');
