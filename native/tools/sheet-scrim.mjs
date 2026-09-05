/**
 * Lớp phủ của màn Hôm nay phải được làm bằng CHẤT LIỆU của theme, không bằng đen.
 *
 * ── lỗi mà bước này tồn tại để bắt ──
 *
 * Tấm nội dung của dashboard nằm dưới một lớp phủ `rgba(0,0,0,0.62)` và một lớp
 * kính `tint="dark"`. Trên một trang gần như đen đó là đúng: lớp phủ dập vệt
 * sáng của vòng tròn sau lưng tấm, và ở khúc dưới — nơi sau lưng tấm chỉ còn
 * chính nền trang — nó gần như không làm gì, vì đen phủ lên đen thì vẫn là đen.
 *
 * Trên giấy thì vế thứ hai đảo chiều và không ai nhận ra: cùng lớp ấy phủ 62%
 * đen lên TOÀN BỘ trang. Đo trên ảnh chụp thật của bộ chạy web, nền trang ở
 * dưới tấm ra `#8d8c89` thay vì `#f7f4ef`. Mọi thẻ ngồi trên bùn.
 *
 * Và nó còn che một lỗi thứ hai: các nhãn nhóm ("Sức khoẻ", "Thông tin chuyên
 * sâu") viết màu `rgba(237,237,237,0.8)` — `foreground` của bản TỐI chép ra
 * thành chuỗi. Chúng đọc được là nhờ nền bùn, không nhờ màu của chính chúng.
 * Bỏ lớp phủ đi thì chúng biến mất. Một lỗi che một lỗi khác là lý do luật này
 * kiểm cả hai chuyện trong một bước.
 *
 * ── vì sao luật cuối là một PHÉP ĐO, không phải một phép dò chính tả ──
 *
 * Ba luật đầu chỉ nói mã nguồn ĐỌC token nào. Chúng không biết token ấy đáng
 * giá bao nhiêu — đổi `materials.light.aura.scrim` thành `#000000` thì cả ba
 * vẫn xanh và cái bùn quay lại nguyên vẹn. Nên luật 4 biên dịch bảng màu thật
 * ra rồi TRỘN: lớp phủ ở đúng độ mờ của nó, phủ lên nền trang của chính theme
 * ấy, và kết quả phải còn là nền trang.
 *
 * Đó cũng chính là vật lý của lỗi: lớp phủ tồn tại để dập thứ nằm SAU tấm, nên
 * ở chỗ sau tấm chỉ còn nền trang, nó phải là một phép không-làm-gì.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TODAY = process.env.SHEET_SCRIM_FILE ?? 'src/app/(tabs)/index.tsx';
const src = readFileSync(path.join(NATIVE, TODAY), 'utf8');
/* Chú thích bị bỏ TRƯỚC mọi phép dò: tệp này kể lại các mã màu cũ trong chú
   thích để giải thích vì sao chúng bị bỏ, và một luật đọc cả chú thích sẽ đỏ
   vì chính lời giải thích của phép sửa. `text-color.mjs` đã dính đúng chiều
   ngược lại — nó XANH vì khớp một chữ nằm trong chú thích. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

/* ── 1. lớp phủ đặc: `alpha(m.aura.scrim, SCRIM)` ── */
const body = /scrimBody:\s*\{[^}]*\}/.exec(code);
if (!body) {
  problems.push(`${TODAY}: không tìm thấy style \`scrimBody\` — lớp phủ đặc của tấm nội dung`);
} else if (!/backgroundColor:\s*alpha\(m\.aura\.scrim,\s*SCRIM\)/.test(body[0])) {
  const got = /backgroundColor:\s*([^,\n]+)/.exec(body[0]);
  problems.push(
    `${TODAY}: \`scrimBody.backgroundColor\` là ${got ? got[1].trim() : '(không có)'} — phải là ` +
      '`alpha(m.aura.scrim, SCRIM)`. Một mã màu ở đây là màu của MỘT theme, và trên giấy nó phủ ' +
      'bùn lên cả trang',
  );
}

/* ── 2. dải chuyển ở mép trên: cả BỐN chặng cùng một token ──
   Ba chặng đúng và một chặng đen là một dốc đổi MÀU giữa chừng, không phải đổi
   độ mờ — và ở bản sáng chặng lạc ấy là chỗ duy nhất còn bùn. */
const grad = /<SvgGradient id="sheetScrim"[\s\S]*?<\/SvgGradient>/.exec(code);
if (!grad) {
  problems.push(`${TODAY}: không tìm thấy gradient \`sheetScrim\` — dải chuyển ở mép trên lớp phủ`);
} else {
  const stops = [...grad[0].matchAll(/stopColor=\{?([^\s}]+)\}?/g)].map((m) => m[1].replace(/"/g, ''));
  if (stops.length !== 4) {
    problems.push(`${TODAY}: gradient \`sheetScrim\` có ${stops.length} chặng, phải đúng 4`);
  }
  for (const s of stops) {
    if (s !== 'm.aura.scrim') {
      problems.push(
        `${TODAY}: một chặng của \`sheetScrim\` dùng \`${s}\` thay vì \`m.aura.scrim\` — dải chuyển ` +
          'và phần đặc phải cùng một màu, nếu không chỗ chúng gặp nhau là một mép đổi màu',
      );
    }
  }
}

/* ── 3. lớp kính của tấm: sắc kính đọc theo theme ──
   `tint="dark"` trên giấy là một tấm kính khói: nó KÉO nền xuống thay vì nâng
   lên, đúng cái mà lớp phủ vừa thôi làm. */
const blur = /<BlurView intensity=\{SHEET_BLUR\}[^/]*\/>/.exec(code);
if (!blur) {
  problems.push(`${TODAY}: không tìm thấy \`<BlurView intensity={SHEET_BLUR}>\` — lớp kính của tấm`);
} else if (!/tint=\{m\.aura\.blurTint\}/.test(blur[0])) {
  const got = /tint=(\{[^}]*\}|"[^"]*")/.exec(blur[0]);
  problems.push(
    `${TODAY}: lớp kính của tấm dùng tint ${got ? got[1] : '(không có)'} — phải là ` +
      '`{m.aura.blurTint}`',
  );
}

/* ── 4. và không mã màu nào khác trong stylesheet của màn này ──
   Bài học đắt nhất của lỗi này: lớp phủ CHE các mã màu bản tối nằm dưới nó.
   Bỏ nó đi mà không dọn chúng thì màn hình sáng lên rồi mất chữ. */
{
  const open = 'const stylesFor = makeStyles((c, m) => ({';
  const i = code.indexOf(open);
  if (i < 0) {
    problems.push(`${TODAY}: không tìm thấy \`${open}\``);
  } else {
    let depth = 0, end = -1;
    for (let j = i + open.length - 2; j < code.length; j++) {
      if (code[j] === '{' || code[j] === '(') depth++;
      else if (code[j] === '}' || code[j] === ')') { depth--; if (depth === 0) { end = j; break; } }
    }
    const sheet = code.slice(i, end < 0 ? code.length : end);
    for (const m of sheet.matchAll(/^\s*(\w+):[^\n]*?['"`](#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))['"`]/gm)) {
      /* Ngoại lệ DUY NHẤT: mặt nạ của `MaskedView`. Ở đó `#fff` không phải một
         màu — nó là độ đục 100% của một kênh alpha, đúng ở cả hai bản. Khoá
         phải bắt đầu bằng `mask`, nên ngoại lệ không nới ra được bằng cách đặt
         tên khác. */
      if (/^mask/.test(m[1]) && /^#(fff|ffffff)$/i.test(m[2])) continue;
      problems.push(
        `${TODAY}: \`${m[1]}\` viết thẳng \`${m[2]}\` — một mã màu ở phạm vi này là màu của MỘT ` +
          'theme. Lớp phủ tối từng che những chỗ như thế; nó không còn che nữa',
      );
    }
  }
}

/* ── 5. PHÉP ĐO: lớp phủ phủ lên chính nền trang phải là một phép không-làm-gì ── */
{
  const out = mkdtempSync(path.join(tmpdir(), 'sheet-scrim-'));
  execFileSync(
    'npx',
    ['tsc', 'src/constants/palette.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const { palettes, materials } = await import(pathToFileURL(path.join(out, 'palette.js')).href);

  /* Độ mờ đọc từ chính tệp màn hình, không chép lại: hai bản sao sẽ lệch. */
  const mS = /const SCRIM = ([0-9.]+)/.exec(code);
  const mR = /const SCRIM_REST = ([0-9.]+)/.exec(code);
  if (!mS || !mR) {
    problems.push(`${TODAY}: không đọc được \`SCRIM\` / \`SCRIM_REST\``);
  } else {
    /* Mức ĐẬM NHẤT lớp phủ đạt tới: `scrimFade` chạy độ mờ của khối từ
       SCRIM_REST lên 1, nhân với SCRIM của lớp con. */
    const a = Number(mS[1]) * Math.max(1, Number(mR[1]));
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const lum = (rgb) => { const c = rgb.map((v) => lin(v / 255)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const contrast = (p, q) => { const [x, y] = [lum(p), lum(q)].sort((u, v) => v - u); return (x + 0.05) / (y + 0.05); };
    /* Sàn: 1,1:1. Bản tối đo được 1,06 (đen 62% trên `#070708`) và bản sáng
       1,00. Ngưỡng phải ở TRÊN con số của bản tối, nếu không nó cấm luôn thứ
       đang chạy đúng; và ở dưới xa 6,02 mà mã cũ tạo ra trên giấy. */
    const FLOOR = 1.1;
    for (const t of ['dark', 'light']) {
      const bg = hex(palettes[t].background);
      const sc = hex(materials[t].aura.scrim);
      const mixed = sc.map((v, i) => v * a + bg[i] * (1 - a));
      const r = contrast(mixed, bg);
      if (r > FLOOR) {
        problems.push(
          `bản ${t}: lớp phủ (${materials[t].aura.scrim} ở ${a.toFixed(2)}) phủ lên nền trang ` +
            `${palettes[t].background} cho ra ${r.toFixed(2)}:1 — quá ${FLOOR}:1. Ở khúc dưới tấm, ` +
            'sau lưng lớp phủ chỉ còn chính nền trang, nên nó phải là một phép không-làm-gì; ' +
            `${r.toFixed(2)}:1 nghĩa là nó đang nhuộm cả trang`,
        );
      }
    }
  }
}

if (problems.length) {
  console.error('lớp phủ tấm nội dung:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('lớp phủ tấm nội dung: 5 luật xanh');
