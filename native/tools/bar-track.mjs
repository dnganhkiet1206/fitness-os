/**
 * Rãnh của thanh Bước đi phải nhìn thấy được trên mặt nó thật sự nằm.
 *
 *     node tools/bar-track.mjs
 *
 * ── lỗi nó sinh ra để chặn ──
 *
 * Thẻ Bước đi được thêm một thanh tiến độ. Cách hiển nhiên là chép hàng xóm —
 * thanh macro ngay trong cùng tệp:
 *
 *     macroBarTrack: { ..., backgroundColor: m.inset.track }
 *
 * Đo trên mặt thẻ, đúng chỗ thanh Bước đi nằm, thì bản chép ấy CHẾT:
 *
 *     m.inset.track   sáng #ffffff trên #ffffff  1,000   ← không còn là cái rãnh
 *                     tối  #171719 trên #161617  1,010
 *
 * Và mặc định của chính `<ProgressBar>` cũng vậy:
 *
 *     alpha(secondary,.4)  sáng 1,070 · tối 1,010
 *
 * `Inset.track` không sai — nó có nghĩa chính xác là "mặt thẻ lộ trở lại qua
 * chỗ LÕM", nên nó đúng khi thanh nằm trong một ô lõm và vô hình khi thanh nằm
 * thẳng trên mặt thẻ. Đây là cùng cái bẫy mà `Material.onPage` đã phải sinh ra
 * để gỡ, lần này ở một vai khác: một token của bề mặt CON bị dùng cho một thứ
 * đứng trên bề mặt CHA.
 *
 * ── và vì sao luật này KHÔNG phải một định luật cho mọi thanh ──
 *
 * Bản đầu định bắt mọi `<ProgressBar>` phải khai rãnh tường minh. Chạy thử thì
 * nó đỏ ở `today-widgets.tsx:393` — bảy thanh xu hướng sẵn sàng dùng đúng cái
 * rãnh mặc định 1,070 ấy. Đi đo thì chỗ đó ĐÚNG:
 *
 *     màu tô vs rãnh mặc định (bản sáng)
 *       readinessGreen          4,64
 *       readinessYellowGraphic  3,10
 *       readinessRed            4,63     ← cả ba qua sàn 3:1 của 1.4.11
 *
 *     màu tô vs `ringTrack` nếu "sửa"
 *       readinessYellowGraphic  1,76     ← hỏng HẲN
 *
 * Ba màu vùng đều ĐẬM hơn mặt thẻ, nên rãnh của chúng phải NHẠT — đúng lập luận
 * `Inset.track` đã ghi cho thanh macro. Đổi chúng sang `ringTrack` là làm hỏng
 * ba thanh đang đúng để chiều một luật. Và thứ người ta mất khi rãnh mờ ở đó
 * không phải giá trị: con số "62" in ngay bên phải mỗi thanh.
 *
 * Nên đây là một CÁI CHỐT cho MỘT thanh, không phải một định luật cho mọi
 * thanh. Cùng kết luận `rep-unit.mjs` đã phải rút ra, và vì cùng một lý do: một
 * luật kêu oan là một luật bị tắt.
 *
 * ── luật, hai vế ──
 *
 * 1. Rãnh và màu tô của thanh Bước đi được ĐỌC RA khỏi chỗ vẽ, composite lên
 *    mặt thẻ dựng lại từ bảng màu đang ship, rồi đo: rãnh phải tách khỏi mặt
 *    thẻ, và màu tô phải tách khỏi rãnh.
 *
 * 2. Hai ứng viên bị loại phải VẪN hỏng. Nếu một ngày `m.inset.track` hay mặc
 *    định của `ProgressBar` tự qua được sàn trên mặt thẻ thì `ringTrack` thôi
 *    không còn là một biệt lệ có lý do, và đoạn chú thích ở chỗ vẽ đang nói một
 *    điều đã hết hiệu lực. Cùng phép gác `muted-ground.mjs` đặt cho
 *    `mutedOnInset`: một ngoại lệ phải chết khi lý do của nó chết.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NATIVE, hex, loadPalette, overC, ratio, toHex } from './lib/stack.mjs';

/** Rãnh phải tách khỏi mặt thẻ ít nhất bằng một bậc bề mặt CỐ Ý của iOS. */
const GROOVE = 1.134;
/** WCAG 1.4.11 — một hình mang thông tin cần 3:1 so với thứ nó tựa lên. */
const GRAPHIC = 3;

const CARD = 'src/components/ascnd/dashboard-cards.tsx';
const problems = [];
const { palettes, materials } = loadPalette();

const over = (v, ground) => {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(v);
  if (!m) return hex(v);
  return overC([+m[1], +m[2], +m[3]], ground, m[4] === undefined ? 1 : +m[4]);
};

/** Mặt thẻ THẬT của một theme, dựng lại chứ không gõ lại. */
const cardFace = (t) => over(materials[t].bg, hex(palettes[t].background));

const src = readFileSync(path.join(NATIVE, CARD), 'utf8');
/* Chú thích bị bỏ đi trước khi tìm: đoạn giải thích ngay trên chỗ vẽ có nhắc
   tên cả hai token bị loại, và một cái neo bắt được chính lời giải thích về nó
   thì không phải một cái neo. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

/* Thẻ Bước đi phải THẬT SỰ bật thanh lên. Không có vế này thì luật đo một chỗ
   vẽ mà màn hình không dùng tới. */
const steps = code.slice(code.indexOf('export function StepsWidget'));
const stepsBody = steps.slice(0, steps.indexOf('\n}') + 2);
if (!/^\s*bar\s*$/m.test(stepsBody)) {
  problems.push(
    `${CARD}: \`StepsWidget\` không còn truyền \`bar\` — thẻ Bước đi đã thôi vẽ thanh tiến độ, nên luật `
      + 'này đang đo một chỗ vẽ không ai bật. Nếu thanh bị gỡ thật thì gỡ luôn luật; nếu không thì đây là lỗi',
  );
}

/*
  Chỗ vẽ: `<ProgressBar>` TRONG `CompactWidget`, không phải cái đầu tiên của tệp.

  Phép thử ngược bắt được đúng chỗ này: bản đầu quét cả tệp và khớp phải thanh
  macro ở trên (`color={m.barGraphic}`), rồi báo thẻ Bước đi "không khai màu tô"
  trong khi nó khai đủ. Một cái neo bắt nhầm mục tiêu thì mọi câu sau nó đều nói
  về một chỗ khác — và ở đây nó còn nói ra một câu NGHE rất đúng.
*/
const widget = code.indexOf('function CompactWidget');
const body = widget < 0 ? '' : code.slice(widget, code.indexOf('\nfunction ', widget + 1));
if (widget < 0) {
  problems.push(
    `${CARD}: không còn \`function CompactWidget\` — thẻ compact đã được viết lại. Luật này đang canh một `
      + 'component không tồn tại; đọc lại bằng mắt',
  );
}
const barM = /<ProgressBar\b([\s\S]*?)\/>/.exec(body);
if (widget >= 0 && !barM) {
  problems.push(
    `${CARD}: \`CompactWidget\` không còn vẽ \`<ProgressBar>\` — thanh của thẻ Bước đi đã được viết lại bằng `
      + 'thứ khác. Đọc lại chỗ ấy bằng mắt rồi sửa luật, đừng để nó xanh suông',
  );
}

const readProp = (attrs, name) => {
  const m = new RegExp(`${name}=\\{c\\.(\\w+)\\}`).exec(attrs);
  return m ? m[1] : null;
};

const lines = [];
if (barM) {
  const attrs = barM[1];
  const fillKey = readProp(attrs, 'color');
  const trackKey = readProp(attrs, 'trackColor');

  for (const [what, name, key] of [['màu tô', 'color', fillKey], ['rãnh', 'trackColor', trackKey]]) {
    if (key) continue;
    /* Câu trả lời SAI dễ gặp nhất được gọi thẳng tên, vì nó là câu trả lời mà
       một người cẩn thận sẽ tìm ra: chép thanh macro ở ngay trên trong cùng tệp.
       Một luật chỉ nói "thiếu token" ở đây là bắt người ta đoán lại từ đầu. */
    const wrote = new RegExp(`${name}=\\{([^}]+)\\}`).exec(attrs)?.[1]?.trim();
    const insetTrap = wrote === 'm.inset.track';
    problems.push(
      `${CARD}: thanh của thẻ Bước đi khai ${what} là ${wrote ? `\`${wrote}\`` : 'KHÔNG GÌ CẢ'}, không phải `
        + 'một token `c.*` đo được. '
        + (insetTrap
          ? '`m.inset.track` là rãnh của một thanh nằm TRONG ô lõm — nghĩa của nó là "mặt thẻ lộ trở lại qua '
            + 'chỗ lõm", nên trên chính mặt thẻ nó composite ra 1,000 ở bản sáng: không còn là một cái rãnh. '
            + 'Thanh macro ở trên trong cùng tệp dùng đúng nó và đúng ở đó, vì thanh ấy nằm trong `macroTile`.'
          : 'Bỏ trống là rơi về mặc định của `ProgressBar`, và mặc định ấy đo được 1,070 ở bản sáng / 1,010 ở '
            + 'bản tối trên mặt thẻ — tức cũng không còn là một cái rãnh.'),
    );
  }

  if (fillKey && trackKey) {
    for (const t of ['light', 'dark']) {
      const p = palettes[t];
      if (!p[fillKey] || !p[trackKey]) {
        problems.push(`bảng ${t} không còn token \`${p[fillKey] ? trackKey : fillKey}\` mà chỗ vẽ đang gọi`);
        continue;
      }
      const card = cardFace(t);
      const track = hex(p[trackKey]);
      const fill = hex(p[fillKey]);
      const groove = ratio(track, card);
      const onTrack = ratio(fill, track);
      lines.push(`${t} rãnh/thẻ ${groove.toFixed(3)} · tô/rãnh ${onTrack.toFixed(2)}`);

      if (groove < GROOVE) {
        problems.push(
          `${t}: rãnh \`c.${trackKey}\` (${toHex(track)}) chỉ tách khỏi mặt thẻ (${toHex(card)}) `
            + `${groove.toFixed(3)}:1, dưới ${GROOVE} — bậc bề mặt CỐ Ý nhỏ nhất của iOS. Rãnh mờ hơn thế thì `
            + 'người ta thấy một mẩu màu trôi lơ lửng và không biết toàn phần dài bao nhiêu',
        );
      }
      if (onTrack < GRAPHIC) {
        problems.push(
          `${t}: màu tô \`c.${fillKey}\` (${toHex(fill)}) trên rãnh \`c.${trackKey}\` (${toHex(track)}) chỉ `
            + `${onTrack.toFixed(2)}:1, dưới sàn ${GRAPHIC} của WCAG 1.4.11 cho một hình mang thông tin. Ranh `
            + 'giới giữa phần đã đi và phần còn lại CHÍNH LÀ con số mà thanh này nói ra',
        );
      }
    }
  }
}

/*
  Vế hai: hai ứng viên bị loại phải VẪN hỏng trên mặt thẻ.

  Đây là thứ giữ cho `ringTrack` còn là một biệt lệ có lý do. Nếu chồng mặt đổi
  tới mức cái rãnh hiển nhiên tự đủ tương phản, thì đoạn chú thích ở chỗ vẽ —
  giải thích vì sao KHÔNG chép hàng xóm — thành một lời cảnh báo đã hết hiệu
  lực, và một lời như thế nằm lại thì còn tệ hơn không có.
*/
const rejects = [];
for (const t of ['light', 'dark']) {
  const card = cardFace(t);
  const cands = {
    'm.inset.track': over(materials[t].inset.track, card),
    'mặc định alpha(secondary,.4)': overC(hex(palettes[t].secondary), card, 0.4),
  };
  for (const [name, col] of Object.entries(cands)) {
    const r = ratio(col, card);
    rejects.push(`${t}/${name} ${r.toFixed(3)}`);
    if (r < GROOVE) continue;
    problems.push(
      `${t}: \`${name}\` nay đạt ${r.toFixed(3)}:1 trên mặt thẻ — qua ngưỡng ${GROOVE}. Chồng mặt đã đổi, nên `
        + 'lý do KHÔNG chép hàng xóm cho thanh Bước đi đã hết hiệu lực. Đọc lại đoạn chú thích ở chỗ vẽ và '
        + 'sửa nó, đừng để nó cảnh báo về một cái bẫy không còn tồn tại',
    );
  }
}

if (problems.length) {
  console.error('rãnh của thanh tiến độ không nhìn thấy được trên mặt nó nằm:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `rãnh thanh Bước đi OK — đọc màu tô và rãnh RA KHỎI chỗ vẽ rồi composite lên mặt thẻ dựng lại từ bảng màu `
    + `đang ship: ${lines.join(' · ')} (sàn rãnh ${GROOVE}, sàn hình ${GRAPHIC}:1 của WCAG 1.4.11). Vế hai giữ `
    + `cho lựa chọn ấy còn lý do: hai ứng viên hiển nhiên vẫn hỏng trên chính mặt ấy — ${rejects.join(' · ')} `
    + '— nên `ringTrack` chưa thành một biệt lệ thừa. Đây là một CÁI CHỐT cho MỘT thanh, không phải định luật '
    + 'cho mọi thanh, và đó là kết luận có đo: bản đầu bắt mọi `<ProgressBar>` khai rãnh tường minh thì đỏ ở '
    + 'bảy thanh xu hướng sẵn sàng, mà đo ra chỗ đó ĐÚNG — ba màu vùng đều đậm hơn mặt thẻ nên rãnh của chúng '
    + 'phải NHẠT, và ép chúng sang `ringTrack` kéo vàng xuống 1,76',
);
