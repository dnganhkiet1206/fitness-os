/**
 * Một đêm dài bao nhiêu — chỉ được có MỘT câu trả lời.
 *
 * ── lỗi đã sửa, và nó là lần thứ BA ──
 *
 * Người dùng báo: ghi 8 tiếng nhưng nhập light/rem/deep cộng lại ra 6, thì thẻ
 * giấc ngủ ở Hôm nay hiện 6 còn thẻ bảy đêm hiện 8. Hai thẻ cạnh nhau, hai con
 * số, cùng một đêm.
 *
 * Đi đo thì ra hai định nghĩa sống song song:
 *
 *   `daily-log-service.asleepMinutes`  `asleep_min` nếu có, không thì
 *                                      `waketime − bedtime`. KHÔNG đụng tới
 *                                      ba giai đoạn.
 *   `(tabs)/index.tsx`                 `stageSum > 0 ? stageSum : …`
 *   `weekly-review.tsx`                `deep + rem + light`, HAI chỗ
 *
 * Và `sleep-insights.tsx` đã ghi sẵn rằng đây không phải lần đầu: *"Same
 * mistake had already been found and fixed twice, in the readiness engine and
 * in the two AI functions. `asleepMinutes` is the app's one definition of a
 * night's length and it now lives in one place."* Một lỗi tái phát ba lần thì
 * bản sửa thứ ba không được là một lần sửa nữa — phải là một bước gác.
 *
 * Riêng bản `weekly-review` còn tệ hơn một bậc: một đêm ghi tay KHÔNG nhập
 * giai đoạn nào cho tổng bằng 0, nên bản tổng kết tuần báo người ta ngủ 0
 * tiếng rồi tính nợ ngủ từ con số ấy.
 *
 * ── vì sao ba giai đoạn KHÔNG phải là độ dài ──
 *
 * Chúng là một PHÂN RÃ, và một phân rã không buộc phải cộng lại bằng tổng.
 * HealthKit không tính phần thức giấc vào ba giai đoạn; người nhập tay thì
 * đang ước lượng. Phần chênh là phần không ai đo được, và gọi nó là "tổng thời
 * gian ngủ" là bịa ra một phép đo.
 *
 * ── bước này phân biệt hai cách dùng tổng ấy ──
 *
 * Cộng ba giai đoạn KHÔNG phải lúc nào cũng sai. So với `0` là hỏi "có ai đo
 * giai đoạn không" — đúng, và `sleep-insights` cần đúng câu ấy để tách "bạn
 * không có giấc sâu" khỏi "không ai đo giấc sâu của bạn". So với độ dài đêm là
 * hỏi "ba phần có tràn quá tổng không" — cũng đúng, `log-sleep` cần nó.
 *
 * Sai là khi tổng ấy được dùng như một ĐẠI LƯỢNG. Nên luật ở đây rất hẹp và
 * máy kiểm được: một tổng ba giai đoạn chỉ được đứng ngay trước một phép SO
 * SÁNH. Đứng ở đâu khác là đỏ.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

/* ── phần A: hành vi, chạy MÃ THẬT ────────────────────────────────────── */
const out = mkdtempSync(path.join(tmpdir(), 'ascnd-sleep-'));
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
        noEmitOnError: false,
        outDir: out,
        rootDir: LIB,
        /* CỐ Ý không có `paths`.

           Bản đầu có, và hậu quả là `tsc` đi theo `@/integrations/supabase/client`
           ra ngoài `src/lib`, rồi vì `rootDir` là `src/lib` nên nó không ánh xạ
           được mấy tệp ấy vào `outDir` và PHÁT THẲNG `.js` cạnh tệp nguồn. Bốn
           tệp sinh tự động lọt vào cây nguồn và vào một commit, và bước gác lại
           là thứ đã tạo ra chúng.

           Không có `paths` thì `tsc` báo không phân giải được mấy import ấy —
           lỗi đã bị nuốt ở dưới — nhưng vẫn phát đủ `src/lib` vào `outDir`, và
           không đụng một tệp nào ngoài đó. Còn lúc CHẠY thì `Module._resolveFilename`
           lo phần phân giải: `@/lib/*` trỏ vào bản vừa biên dịch, phần còn lại
           trỏ vào khối rỗng. */
      },
      files: readdirSync(LIB)
        .filter((f) => f.endsWith('.ts'))
        .map((f) => path.join(LIB, f)),
    }),
  );
  try {
    execFileSync('npx', ['tsc', '-p', cfg], { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    /* `daily-log-service` kéo theo cả cây import của app; chỉ cần nó SINH RA
       được tệp js là chạy được, lỗi kiểu của các tệp khác đã có `tsc` của bộ
       gác lo. */
  }
  /* `daily-log-service` kéo theo client Supabase và vài hook — những thứ
     `asleepMinutes` không đụng tới nhưng `require` vẫn phải phân giải được.
     Nên: `@/lib/*` trỏ vào bản vừa biên dịch, còn mọi `@/` khác trỏ vào một
     khối rỗng. Bước này gác MỘT hàm thuần; dựng cả tầng mạng lên chỉ để gọi
     nó là đổi một phép kiểm chắc chắn lấy một phép kiểm hay hỏng vặt. */
  const stub = path.join(out, '__stub.js');
  writeFileSync(stub, 'module.exports = new Proxy({}, { get: () => () => undefined });\n');
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (req, ...rest) {
    if (req.startsWith('@/')) {
      const guess = path.join(out, `${path.basename(req)}.js`);
      try {
        statSync(guess);
        return guess;
      } catch {
        return stub;
      }
    }
    return orig.call(this, req, ...rest);
  };

  const { asleepMinutes } = createRequire(import.meta.url)(path.join(out, 'daily-log-service.js'));
  const eq = (what, got, want) => {
    if (got !== want) problems.push(`${what}: ${got}, đáng lẽ ${want}`);
  };

  const night = (bedH, wakeH, extra = {}) => ({
    bedtime: `2026-09-13T${String(bedH).padStart(2, '0')}:00:00.000Z`,
    waketime: `2026-09-14T${String(wakeH).padStart(2, '0')}:00:00.000Z`,
    ...extra,
  });

  eq('quãng 8 tiếng ra 480 phút', asleepMinutes(night(22, 6)), 480);
  /* Chính ca người dùng báo: ghi 8 tiếng, giai đoạn cộng lại 6 tiếng. */
  eq(
    'ba giai đoạn lệch KHÔNG đổi được độ dài',
    asleepMinutes(night(22, 6, { deep_min: 90, rem_min: 90, light_min: 180 })),
    480,
  );
  eq(
    'không nhập giai đoạn nào cũng vẫn là 480, không phải 0',
    asleepMinutes(night(22, 6, { deep_min: 0, rem_min: 0, light_min: 0 })),
    480,
  );
  eq(
    '`asleep_min` của HealthKit thắng quãng',
    asleepMinutes(night(22, 6, { asleep_min: 421 })),
    421,
  );
  /* Giờ thức TRƯỚC giờ ngủ. `night()` luôn đặt giờ thức sang hôm sau nên không
     dựng được ca này — phải viết thẳng hai mốc. */
  eq(
    'quãng ngược không ra số âm',
    asleepMinutes({ bedtime: '2026-09-14T06:00:00.000Z', waketime: '2026-09-13T22:00:00.000Z' }),
    0,
  );
} catch (e) {
  problems.push(`không chạy được mã thật: ${String(e.message ?? e).slice(0, 300)}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

/* ── phần B: không ai được dựng định nghĩa thứ hai ─────────────────────── */
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const f = path.join(dir, e);
    if (statSync(f).isDirectory()) walk(f);
    else if (/\.tsx?$/.test(e)) files.push(f);
  }
})(path.join(NATIVE, 'src'));

/* Tổng ba giai đoạn: ba toán hạng nối bằng `+`, tên chứa deep/rem/light theo
   bất kỳ thứ tự nào, dù đã đổi tên hay còn nguyên tên cột. */
const NAME = '[A-Za-z_$][\\w$.?\\[\\]\'"]*';
const SUM = new RegExp(
  `(${NAME})\\s*(?:\\?\\?\\s*0\\s*)?\\)?\\s*\\+\\s*\\(?\\s*(${NAME})\\s*(?:\\?\\?\\s*0\\s*)?\\)?\\s*\\+\\s*\\(?\\s*(${NAME})`,
  'g',
);
const isStage = (a, b, c) => {
  const t = [a, b, c].map((x) => x.toLowerCase());
  return (
    t.some((x) => x.includes('deep')) && t.some((x) => x.includes('rem')) && t.some((x) => x.includes('light'))
  );
};

/* Bỏ chú thích TRƯỚC khi quét. Bản đầu của tệp này không bỏ, và nó đỏ ở hai
   chỗ mà cả hai đều là câu văn TẢ LẠI chính lỗi này — kể cả câu trong chú
   thích tôi vừa viết cho bản sửa. Một bước gác đọc chú thích là một bước gác
   phạt người viết tài liệu. */
const blank = (m) => m.replace(/[^\n]/g, ' ');
/* Bỏ chú thích mà GIỮ NGUYÊN số dòng: thay ký tự bằng khoảng trắng thay vì xoá
   hẳn. Bản đầu xoá hẳn, nên nó báo `dashboard-cards.tsx:572` cho một dòng nằm
   ở chỗ khác — một bước gác chỉ sai dòng thì người đọc mở đúng dòng ấy, thấy
   code không liên quan, rồi học được rằng bước này hay kêu bậy. */
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:])(\/\/.*)$/gm, (_, a, c) => a + blank(c));
const CMP = /^(>|<|>=|<=|===|!==|==|!=)/;

let checkedSums = 0;
for (const f of files) {
  const rel = path.relative(NATIVE, f);
  const src = strip(readFileSync(f, 'utf8'));
  for (const m of src.matchAll(SUM)) {
    if (!isStage(m[1], m[2], m[3])) continue;
    checkedSums += 1;
    const after = src.slice(m.index + m[0].length).replace(/^[\s)]*/, '');
    if (CMP.test(after)) continue;

    /* Hình dạng thứ hai được phép: GÁN cho một tên, rồi cái tên ấy chỉ xuất
       hiện trong so sánh. `dashboard-cards` viết đúng thế — `stageTotal` rồi
       `stageTotal > 0` để quyết định có vẽ dải phân rã hay không. Đó vẫn là
       một câu hỏi có/không, chỉ đặt tên cho nó. */
    const before = src.slice(Math.max(0, m.index - 120), m.index);
    const named = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:[^;=]*\?\s*)?$/.exec(before);
    if (named) {
      const name = named[1];
      /* Bỏ chính chỗ khai báo bằng HÌNH DẠNG (`tên =`), không bằng chỉ số:
         `named.index` là chỉ số trong đoạn cắt 120 ký tự, không phải trong
         tệp, và bản đầu đem hai thứ ấy so với nhau nên chẳng bỏ được gì. */
      const after = (i) => src.slice(i + name.length).replace(/^[\s)]*/, '');
      const uses = [...src.matchAll(new RegExp(`\\b${name}\\b`, 'g'))].filter(
        (u) => !/^=[^=]/.test(after(u.index)),
      );
      if (uses.length > 0 && uses.every((u) => CMP.test(after(u.index)))) continue;
    }

    const line = src.slice(0, m.index).split('\n').length;
    problems.push(
      `${rel}:${line} — tổng ba giai đoạn đang được dùng như một ĐẠI LƯỢNG. Độ dài một đêm chỉ ` +
        'có một định nghĩa và nó là `asleepMinutes` ở `daily-log-service.ts`. Ba giai đoạn là một ' +
        'PHÂN RÃ; cộng chúng lại rồi gọi là "ngủ bao lâu" là bịa ra một phép đo',
    );
  }
}

if (checkedSums === 0) {
  problems.push(
    'không soi được MỘT tổng ba giai đoạn nào trong toàn bộ src — bộ dò hỏng, không phải code sạch. ' +
      '`sleep-insights.tsx` và `log-sleep.tsx` đều có một cái, và cả hai đều HỢP LỆ',
  );
}

/* Và ba màn hiện độ dài một đêm phải GỌI bản chuẩn, chứ không tự tính. */
for (const rel of ['src/app/(tabs)/index.tsx', 'src/app/weekly-review.tsx', 'src/app/sleep-insights.tsx']) {
  const src = readFileSync(path.join(NATIVE, rel), 'utf8');
  if (!src.includes('asleepMinutes')) {
    problems.push(`${rel} hiện độ dài một đêm mà không gọi \`asleepMinutes\` — nó đang tự tính`);
  }
}

if (problems.length) {
  console.error('độ dài một đêm CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(
  `độ dài một đêm OK — CHẠY THẬT \`asleepMinutes\` trên năm ca, trong đó có đúng ca người dùng báo: ghi 8 ` +
    'tiếng mà nhập giai đoạn cộng lại 6 tiếng vẫn ra 480 phút, vì ba giai đoạn là một PHÂN RÃ chứ không ' +
    'phải độ dài; không nhập giai đoạn nào cũng vẫn 480 chứ không phải 0 — bản cũ của `weekly-review` cho ' +
    `0 và tính nợ ngủ từ đó; \`asleep_min\` của HealthKit thắng quãng; quãng ngược ra 0 chứ không ra số âm. ` +
    `Và ${checkedSums} chỗ cộng ba giai đoạn trong ${files.length} tệp src đều đứng ngay trước một phép SO ` +
    'SÁNH — so với 0 là hỏi "có ai đo giai đoạn không", so với độ dài đêm là hỏi "ba phần có tràn không", ' +
    'còn dùng nó như một đại lượng thì đỏ. Ba màn hiện độ dài một đêm đều gọi bản chuẩn. Lỗi này đã tái ' +
    'phát BA lần — engine sẵn sàng, hai hàm AI, rồi thẻ Hôm nay với tổng kết tuần — nên lần này nó có gác',
);
