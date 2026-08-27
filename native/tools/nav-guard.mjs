/**
 * Bấm bốn lần lúc app đang khựng thì mở MỘT màn, không phải bốn.
 *
 * ── lỗi ──
 *
 * App khựng: một truy vấn lớn về, một màn hình ảnh giải nén, luồng JS bận nửa
 * giây. Nút không phản hồi, nên người ta bấm lại. Rồi bấm nữa. Bốn lần bấm
 * không phải thiếu kiên nhẫn — đó là thông tin DUY NHẤT họ có, vì một màn chưa
 * kịp đi và một màn sắp đi trông giống hệt nhau.
 *
 * Rồi luồng rảnh. Cả bốn lần bấm đã xếp hàng cùng chạy, cách nhau vài mili
 * giây, mỗi lần push một route. Bạn nằm sâu bốn màn trên cùng một trang và
 * phải bấm back bốn lần để ra. Trên một stack có giữ state — trình dựng buổi
 * tập, một phiếu ghi viết dở — các bản bên dưới đều SỐNG, nên đường ra dắt bạn
 * qua bốn cái.
 *
 * Đây không phải ca hiếm. Đó là hệ quả CHẮC CHẮN của việc app có lúc chậm, và
 * máy càng yếu thì càng chắc chắn: đúng những người ít chịu nổi nó nhất.
 *
 * ── vì sao chốt nằm ở ĐIỀU HƯỚNG chứ không ở NÚT ──
 *
 * Chỗ hiển nhiên là cú nhấn: cho `PressScale` bỏ qua lần nhấn thứ hai trong
 * 300ms. Sai, và sai theo kiểu phải rất lâu sau mới lộ. Rất nhiều nút trong app
 * này CỐ Ý lặp — ±15 giây của đồng hồ nghỉ, thêm nhanh nước, các nút tăng giảm
 * số set, mọi dấu cộng trừ trong trình dựng. Chốt ở cú nhấn trừng phạt tất cả
 * chúng để sửa một vấn đề không cái nào có.
 *
 * Thứ không được xảy ra hai lần là ĐIỀU HƯỚNG. Nên chốt nằm ở đó, đúng một
 * chỗ, và mọi nút trong app giữ nguyên hành vi cũ.
 *
 * ── cách kiểm ──
 *
 * CHẠY THẬT `allow` đọc thẳng ra khỏi `src/lib/nav-guard.ts`, bằng những cụm
 * bấm có hình dạng thật: bốn lần cách nhau vài mili giây, hai đích khác nhau,
 * và một lần quay lại sau khi cửa sổ đã đóng. Cộng với phần cấu trúc: không tệp
 * nào ngoài `lib/nav.ts` được gọi thẳng `router.push` — một lời gọi lọt lưới là
 * một nút không có chốt, và nó trông y hệt mọi nút khác trong diff.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];
const fatal = (m) => {
  console.error(`phép tự kiểm hỏng — ${m}, đừng tin kết quả`);
  process.exit(1);
};

const out = mkdtempSync(path.join(tmpdir(), 'nav-guard-'));
try {
  /* Không import gì cả, nên biên dịch đứng một mình được — đó là lý do luật
     nằm ở `nav-guard.ts` chứ không ở `nav.ts`, thứ phải kéo theo expo-router. */
  execFileSync('npx', ['tsc', 'src/lib/nav-guard.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  const { allow, GUARD_MS } = createRequire(import.meta.url)(path.join(out, 'nav-guard.js'));

  /** Chạy một cụm bấm, trả về số lần điều hướng THẬT SỰ xảy ra. */
  const burst = (key, times, base = 0) => times.filter((t) => allow(key, base + t)).length;

  // ── 1. một cụm bấm dồn là MỘT lần mở ──────────────────────────────────────
  /*
    Các mốc thời gian là hình dạng thật của lỗi: cú nhấn xếp hàng trong lúc
    khựng đều chạy trong vài mili giây sau khi luồng rảnh, dù cú khựng dài bao
    lâu. 0/8/15/23/40 là một cụm năm lần bấm như vậy.
  */
  {
    const n = burst('/settings', [0, 8, 15, 23, 40], 10_000);
    if (n !== 1) {
      problems.push(
        `năm lần bấm dồn vào cùng một đích mở ${n} màn, phải là 1 — đây chính là lỗi: ` +
          'người dùng bấm lại vì app không phản hồi, rồi cả cụm cùng chạy khi luồng rảnh',
      );
    }
  }

  // ── 2. hai đích khác nhau vẫn đi được cả hai ──────────────────────────────
  /*
    Ranh giới quan trọng nhất của luật này. Chốt quá tay sẽ nuốt lần bấm thứ
    hai của một người ĐỔI Ý, và đó là một lỗi tệ hơn lỗi nó sửa: nó im lặng và
    nó xảy ra với thao tác đúng.
  */
  {
    const t = 20_000;
    const a = allow('/nutrition', t);
    const b = allow('/workouts', t + 30);
    if (!a || !b) {
      problems.push(
        'hai đích KHÁC NHAU bấm liền nhau mà một cái bị nuốt — đó là người dùng đổi ý, ' +
          'không phải bấm nhầm, và cả hai đều phải đi được',
      );
    }
    /* …và đích đầu vẫn còn bị chốt sau khi đích thứ hai đi qua: bộ nhớ theo
       TỪNG đích chứ không phải "cái cuối cùng", nếu không thì A, B, A trong
       cùng một cụm lại mở A hai lần. */
    if (allow('/nutrition', t + 60)) {
      problems.push(
        'A, B, A trong cùng một cụm mở A hai lần — chốt chỉ nhớ đích CUỐI CÙNG, ' +
          'nên bấm xen kẽ hai nút là đi vòng qua được nó',
      );
    }
  }

  // ── 3. lần thứ hai THẬT thì không bị chặn ─────────────────────────────────
  /*
    Mở một màn, đọc, quay ra, mở lại. Không cách nào làm xong việc đó trong
    700ms, nên cửa sổ phải đã đóng.
  */
  {
    const t = 30_000;
    allow('/steps', t);
    if (!allow('/steps', t + GUARD_MS)) {
      problems.push(`mở lại cùng một màn sau ${GUARD_MS}ms vẫn bị chặn — cửa sổ không bao giờ đóng`);
    }
    /* Và lần mở lại ấy tự nó CHIẾM cửa sổ mới — nếu không, một cụm bấm dồn
       bắt đầu đúng lúc cửa sổ cũ vừa đóng sẽ lọt cả cụm. */
    if (allow('/steps', t + GUARD_MS + 1)) {
      problems.push('lần mở lại không chiếm cửa sổ mới — cụm bấm ngay sau đó sẽ lọt hết');
    }
  }

  // ── 4. cửa sổ đủ dài để nuốt một cụm, đủ ngắn để không cản người thật ─────
  if (!(GUARD_MS >= 300 && GUARD_MS <= 1200)) {
    problems.push(
      `GUARD_MS = ${GUARD_MS}. Dưới 300ms không nuốt hết một cụm bấm; trên 1200ms bắt đầu ` +
        'chặn lần mở thứ hai có thật',
    );
  }

  /* Tự kiểm: bản KHÔNG chốt phải để cả năm lần đi qua. Nếu không thì mọi ca ở
     trên đang xanh vì một lý do khác chứ không phải vì chốt hoạt động. */
  {
    const naive = () => true;
    const n = [0, 8, 15, 23, 40].filter((t) => naive()).length;
    if (n !== 5) fatal('bản không chốt đáng lẽ phải mở cả năm lần');
  }
  /* Và bản chốt theo "đích cuối cùng" — thứ dễ viết ra nhất — phải bị ca 2 bắt. */
  {
    let lastKey = '';
    let lastAt = -Infinity;
    const single = (key, now) => {
      if (key === lastKey && now - lastAt < GUARD_MS) return false;
      lastKey = key;
      lastAt = now;
      return true;
    };
    single('/a', 0);
    single('/b', 30);
    if (!single('/a', 60)) fatal('bản chốt-một-ô đáng lẽ phải để lọt A, B, A');
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

// ── 5. không ai đi vòng qua chốt ────────────────────────────────────────────
/*
  Một `router.push` sót lại là một nút không có chốt, và trong diff nó trông y
  hệt mọi nút khác. Đây là nửa thứ hai của luật: phần trên chứng minh chốt
  ĐÚNG, phần này chứng minh nó ĐƯỢC DÙNG.
*/
{
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'src'],
    { cwd: NATIVE, encoding: 'utf8' },
  )
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => existsSync(path.join(NATIVE, f)));

  const ALLOWED = new Set([
    /* Chính nó — đây là chỗ duy nhất được chạm vào router. */
    'src/lib/nav.ts',
  ]);
  let scanned = 0;
  for (const f of files) {
    if (ALLOWED.has(f)) continue;
    const code = strip(read(f));
    scanned++;
    const m = /\brouter\.(push|replace|back|navigate|dismissAll)\s*\(/.exec(code);
    if (m) {
      const line = code.slice(0, m.index).split('\n').length;
      problems.push(
        `${f}:${line}: gọi thẳng \`router.${m[1]}(\` — đi vòng qua chốt bấm dồn. Dùng ` +
          '`nav.' + m[1] + '(` từ `@/lib/nav`',
      );
    }
  }
  if (scanned < 50) fatal(`chỉ quét được ${scanned} tệp — bộ quét hỏng`);

  /* Và `nav.ts` thật sự phải HỎI chốt, chứ không chỉ bọc router lại. */
  const navSrc = strip(read('src/lib/nav.ts'));
  for (const fn of ['push', 'replace', 'navigate', 'back', 'dismissAll']) {
    const re = new RegExp(`${fn}\\([^)]*\\)\\s*:\\s*void\\s*\\{[^}]*allow\\(`);
    if (!re.test(navSrc)) {
      problems.push(`src/lib/nav.ts: \`nav.${fn}\` không đi qua \`allow\` — vỏ bọc mà không có chốt`);
    }
  }
}

if (problems.length) {
  console.error('chốt bấm dồn CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(
  'chốt bấm dồn OK — CHẠY THẬT `allow` đọc từ src/lib/nav-guard.ts: năm lần bấm dồn vào cùng ' +
    'một đích (0/8/15/23/40ms — hình dạng thật của một cụm xếp hàng trong lúc app khựng) mở ĐÚNG ' +
    'một màn; hai đích khác nhau bấm liền nhau vẫn đi được cả hai, vì chặn người đổi ý là lỗi tệ ' +
    'hơn lỗi này; A, B, A không mở A hai lần (bộ nhớ theo TỪNG đích — bản chốt-một-ô dễ viết nhất ' +
    'để lọt ca đó và bị phép tự kiểm bắt); và mở lại sau khi cửa sổ đóng thì không bị cản. Cộng ' +
    'phần cấu trúc: không tệp nào trong src ngoài lib/nav.ts còn gọi thẳng router.push/replace/' +
    'back/navigate/dismissAll, và cả năm hàm trong nav.ts đều thật sự hỏi `allow`',
);
