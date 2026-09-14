/**
 * Chỉ số Apple Health đã đưa thì không được nhập tay một con số THỨ HAI.
 *
 * ── luật, và vì sao nó đáng một bước gác ──
 *
 * Hai nguồn ghi cùng một đại lượng thì sinh ra hai chuỗi số, và một đường nền
 * dựng từ hai chuỗi khác nhau thì không còn nói về cơ thể ai cả. Migration
 * `20260809120000_health_provenance` viết hẳn một trang về đúng chuyện ấy: SDNN
 * của Apple và RMSSD người dùng gõ vào cùng một cột, dưới số hạng NẶNG NHẤT của
 * điểm sẵn sàng, làm đường nền thành hai đỉnh và làm z-score dẹt lại.
 *
 * Nên khi Health đã trả lời cho hôm nay, màn nhập tay chuyển sang SỬA: điền sẵn
 * số của Health, và hỏi lại trước khi thay.
 *
 * ── phần dễ mục nhất, nên nó được đo ngược ──
 *
 * Danh sách `HEALTH_OWNED_BIOMETRICS` là một bản gõ tay của "Health ghi những
 * cột nào". Đường đồng bộ thêm một cột mà quên khai ở đây thì màn nhập tay lại
 * mở khoá cho đúng cột ấy, và không ai thấy gì cho tới khi một đường nền lệch.
 *
 * Nên bước này ĐỌC NGƯỢC danh sách cột ra khỏi chính lời gọi
 * `.from('biometric_samples').upsert({…})` trong `use-health-sync.ts`, rồi so.
 * Hai cột được loại trừ CÓ TÊN và có lý do; loại trừ một cột mới mà không ghi
 * lý do thì đỏ.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

/* ── A. danh sách khai phải khớp đường đồng bộ THẬT ────────────────────── */

/* Cột sổ sách, không phải phép đo: chúng nói hàng này từ đâu ra, không nói
   cơ thể người dùng thế nào. */
const BOOKKEEPING = new Set(['user_id', 'external_id', 'source', 'date_time', 'confidence']);

/* Cột Health ghi mà màn nhập tay CỐ Ý không khoá. Mỗi cái một lý do, và lý do
   phải đứng được nếu không thì nó chỉ là một ngoại lệ cho tiện. */
const EXCLUDED = {
  hrv_sdnn_ms:
    'SDNN và RMSSD là hai đại lượng khác nhau, không quy đổi được, và migration health_provenance ' +
    'đã cố ý TÁCH chúng thành hai cột — Apple chỉ công bố SDNN, ô nhập tay ghi RMSSD. Chúng không ' +
    'tranh nhau một chỗ, nên khoá ô HRV là dựng một xung đột không tồn tại',
};

const sync = readFileSync(path.join(NATIVE, 'src/hooks/use-health-sync.ts'), 'utf8');
const call = /\.from\('biometric_samples'\)\s*\.upsert\(\{([\s\S]*?)\}\s*,\s*\{/.exec(sync);
if (!call) {
  problems.push(
    "không tìm được lời gọi `.from('biometric_samples').upsert({…})` trong `use-health-sync.ts` — " +
      'bộ dò hỏng, hoặc đường đồng bộ đã đổi hình dạng. Một bước gác không tìm thấy thứ nó gác phải ĐỎ',
  );
}
const body = call ? call[1].replace(/\/\*[\s\S]*?\*\//g, '') : '';
const synced = [...body.matchAll(/^\s*([a-z_][a-z0-9_]*)\s*:/gim)]
  .map((m) => m[1])
  .filter((k) => !BOOKKEEPING.has(k));

let declared = [];
try {
  const lib = readFileSync(path.join(NATIVE, 'src/lib/health-owned.ts'), 'utf8');
  const dec = /HEALTH_OWNED_BIOMETRICS\s*=\s*\[([^\]]*)\]/.exec(lib);
  /* `[a-z0-9_]`, không phải `[a-z_]`: tên cột CÓ chữ số (`spo2_pct`), và bản
     đầu của dòng này đánh rơi đúng nó rồi báo lệch — một bước gác đỏ vì regex
     của chính nó là bước gác sẽ bị người ta tắt đi. */
  declared = dec ? [...dec[1].matchAll(/'([a-z_][a-z0-9_]*)'/g)].map((m) => m[1]) : [];
} catch {
  problems.push('không đọc được `src/lib/health-owned.ts`');
}

if (call) {
  const want = synced.filter((k) => !(k in EXCLUDED)).sort();
  const got = [...declared].sort();
  if (want.join(',') !== got.join(',')) {
    problems.push(
      `\`HEALTH_OWNED_BIOMETRICS\` là [${got.join(', ')}] nhưng đường đồng bộ ghi [${want.join(', ')}]. ` +
        'Health ghi một cột mà màn nhập tay không khoá thì hai nguồn lại cùng ghi một đại lượng — ' +
        'đúng chuyện `health_provenance` đã phải sửa bằng một migration',
    );
  }
  for (const k of Object.keys(EXCLUDED)) {
    if (!synced.includes(k)) {
      problems.push(
        `\`${k}\` nằm trong danh sách loại trừ nhưng đường đồng bộ KHÔNG còn ghi nó — ngoại lệ này ` +
          'đã hết việc và phải bỏ, kẻo nó che mất một cột thật sau này trùng tên',
      );
    }
  }
}

/* ── B. hai màn nhập tay phải HỎI trước khi thay ───────────────────────── */
for (const rel of ['src/app/log-biometrics.tsx', 'src/app/log-sleep.tsx']) {
  const src = readFileSync(path.join(NATIVE, rel), 'utf8');
  if (!src.includes('healthOverrideTitle')) {
    problems.push(
      `${rel} lưu được mà không hỏi lại — khi Apple Health đã đưa số cho hôm nay thì một lần lưu ` +
        'là một lần THAY số đo bằng số gõ tay, và người dùng phải được nói điều đó trước',
    );
  }
  if (!src.includes('healthValues') && !src.includes('fromHealth')) {
    problems.push(`${rel} không hỏi \`lib/health-owned\` xem Health đã đưa gì — nó không thể điền sẵn đúng`);
  }
}

/* ── C. hành vi, chạy MÃ THẬT ──────────────────────────────────────────── */
const out = mkdtempSync(path.join(tmpdir(), 'ascnd-owned-'));
try {
  const cfg = path.join(out, 'tsconfig.json');
  const LIB = path.join(NATIVE, 'src', 'lib');
  writeFileSync(
    cfg,
    JSON.stringify({
      compilerOptions: {
        module: 'commonjs',
        target: 'es2020',
        skipLibCheck: true,
        esModuleInterop: true,
        outDir: out,
        rootDir: LIB,
      },
      files: [path.join(LIB, 'health-owned.ts'), path.join(LIB, 'biometric-source.ts')],
    }),
  );
  try {
    execFileSync('npx', ['tsc', '-p', cfg], { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    /* `@/lib/biometric-source` không phân giải được khi thiếu `paths` — và cố
       ý thiếu: khai `paths` là mời `tsc` đi ra ngoài `src/lib` rồi phát `.js`
       vào cây nguồn, đúng tai nạn `tools/src-clean.mjs` đang gác. Tệp vẫn được
       sinh ra; phần phân giải để lúc chạy lo. */
  }
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (req, ...rest) {
    if (req.startsWith('@/lib/')) return path.join(out, `${req.slice('@/lib/'.length)}.js`);
    return orig.call(this, req, ...rest);
  };
  const H = createRequire(import.meta.url)(path.join(out, 'health-owned.js'));
  const eq = (what, got, want) => {
    if (got !== want) problems.push(`${what}: ${JSON.stringify(got)}, đáng lẽ ${JSON.stringify(want)}`);
  };

  eq('nguồn apple_health là Health', H.fromHealth({ source: 'apple_health' }), true);
  eq('nguồn manual KHÔNG phải Health', H.fromHealth({ source: 'manual' }), false);
  eq('chuỗi rỗng không phải nguồn', H.fromHealth({ source: '  ' }), false);
  eq('không có hàng thì không phải Health', H.fromHealth(null), false);
  /* Một nguồn lạ VẪN là một nguồn — cùng ranh giới `biometric-source` đã vạch,
     và cùng lý do: im lặng coi nó là "không kết nối" là cái lỗi tệp ấy tồn tại
     để chặn. */
  eq('nguồn lạ vẫn là Health', H.fromHealth({ source: 'garmin' }), true);

  const row = { source: 'apple_health', hr_bpm: 58, spo2_pct: 0, resp_rate_rpm: null };
  const vals = H.healthValues(row, H.HEALTH_OWNED_BIOMETRICS);
  eq('cột Health có số thì lấy', vals.hr_bpm, 58);
  eq('cột Health trả 0 KHÔNG phải một phép đo', vals.spo2_pct, undefined);
  eq('cột Health trả null thì bỏ qua', vals.resp_rate_rpm, undefined);
  eq(
    'hàng nhập tay không đưa số nào',
    Object.keys(H.healthValues({ ...row, source: 'manual' }, H.HEALTH_OWNED_BIOMETRICS)).length,
    0,
  );

  eq('gõ lại ĐÚNG số cũ không phải ghi đè', H.overriddenFields({ hr_bpm: 58 }, { hr_bpm: 58 }).length, 0);
  eq('gõ số khác là ghi đè', H.overriddenFields({ hr_bpm: 58 }, { hr_bpm: 61 })[0], 'hr_bpm');
  eq('để trống không phải ghi đè', H.overriddenFields({ hr_bpm: 58 }, { hr_bpm: null }).length, 0);
} catch (e) {
  problems.push(`không chạy được mã thật: ${String(e.message ?? e).slice(0, 300)}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.error('Health làm chủ chỉ số CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(
  `Health làm chủ chỉ số OK — danh sách cột được ĐỌC NGƯỢC ra khỏi chính lời gọi upsert trong ` +
    `\`use-health-sync.ts\` (${synced.length} cột đo, bỏ 5 cột sổ sách) chứ không gõ tay, nên đường đồng bộ ` +
    'thêm một cột mà quên khai là đỏ; một cột được loại trừ phải CÓ TÊN kèm lý do, và `hrv_sdnn_ms` là ' +
    'cái duy nhất — SDNN với RMSSD là hai đại lượng khác nhau mà `health_provenance` đã cố ý tách thành ' +
    'hai cột, nên khoá ô HRV là dựng một xung đột không tồn tại. Hai màn nhập tay đều hỏi lại trước khi ' +
    'thay số đo. Và CHẠY THẬT `fromHealth`/`healthValues`/`overriddenFields` trên mười hai ca: nguồn lạ ' +
    'vẫn là một nguồn, `manual` thì không; Health trả 0 hay null KHÔNG phải một phép đo nên không điền ' +
    'sẵn; gõ lại đúng con số cũ không phải ghi đè nên không hỏi — hỏi khi không có gì đổi là cách nhanh ' +
    'nhất dạy người ta bấm "Đồng ý" mà không đọc',
);
