/**
 * Thước cân nặng: vạch dài rơi đúng số nguyên, và không có gì dựng theo vạch.
 *
 * ── hai lỗi tệp này canh ──
 *
 * 1. **Vạch dài sai chỗ ở pound.** Luật cũ là `index % 10 === 0`, một phát biểu
 *    về DANH SÁCH chứ không về thang đo. Ở kilogram nó đúng do tình cờ: index 0
 *    là 30,0 kg nên `min10` là 300. Ở pound index 0 là 66,1 lb (`min10` 661),
 *    nên vạch dài rơi vào 66,1 / 67,1 / 68,1 — suốt 5.954 vạch, không một vạch
 *    nào đánh vào một pound tròn, ở cả hai chiều.
 *
 *    Không ai báo, và không thể báo được: một hàng vạch dài cách đều nhau trông
 *    ĐÚNG bất kể nó bắt đầu ở đâu. Chỉ khi hỏi "vạch này là số mấy" mới thấy.
 *
 * 2. **Ô trắng khi kéo nhanh.** Người dùng báo thước "phải load mỗi lần kéo
 *    nhanh". Đó là ô trắng của `VirtualizedList` — tài liệu React Native gọi nó
 *    là đánh đổi cố hữu, không phải lỗi cấu hình. Ảo hoá 2.701 vạch là dựng đi
 *    dựng lại MỘT hoạ tiết dài 40 điểm rồi vứt đi.
 *
 * ── vì sao luật 1 phải CHẠY chứ không dò chữ ──
 *
 * Vì lỗi ấy sống trong một phép chia lấy dư có hai lần `mod`, và `%` của
 * JavaScript giữ dấu của số bị chia. Một regex thấy công thức có mặt; nó không
 * thấy công thức nhảy lệch một chu kỳ ở nửa số đầu vào. Nên phép tính được
 * TRÍCH ra khỏi mã thật rồi chạy ở cả hai đơn vị.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const RULER = 'src/components/ascnd/weight-goal-ruler.tsx';
const DIALOG = 'src/components/ascnd/weight-goal-dialog.tsx';

/**
 * Bỏ chú thích trước khi soi cấu trúc.
 *
 * Bản đầu của tệp này đỏ hai chỗ trên một bản ĐÚNG, và cả hai vì cùng một lý
 * do: nó đọc văn xuôi như thể là mã. `weight-goal-ruler` giải thích vì sao bản
 * `FlatList` phải đi, nên chữ "FlatList" có mặt trong tệp; và câu "`<Svg>` đứng
 * yên" làm cái neo `<Svg …</Svg>` bắt đầu từ trong chú thích rồi nuốt luôn phần
 * mã bên dưới, nơi có `scrollX.value`.
 *
 * Một luật đọc chú thích thì càng giải thích kỹ càng dễ đỏ — đúng chiều ngược
 * với thứ repo này muốn khuyến khích.
 */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const problems = [];
const rulerRaw = read(RULER);
const ruler = stripComments(rulerRaw);
const dialog = stripComments(read(DIALOG));

/* ── hằng số, đọc từ nguồn ──────────────────────────────────────────────── */
const num = (src, name) => {
  const m = new RegExp(`\\b${name} = (\\d+)`).exec(src);
  return m ? Number(m[1]) : null;
};
const TICK_W = num(ruler, 'TICK_W');
const PER_UNIT = num(ruler, 'PER_UNIT');
const PERIOD = TICK_W != null && PER_UNIT != null ? TICK_W * PER_UNIT : null;
if (!TICK_W || !PER_UNIT) {
  problems.push(`${RULER}: không đọc được TICK_W / PER_UNIT — mọi luật dưới đây không kiểm được gì`);
}

/* ── 1. không còn gì dựng theo TỪNG vạch ────────────────────────────────── */
if (/FlatList|renderItem|getItemLayout|keyExtractor/.test(ruler)) {
  problems.push(
    `${RULER}: vẫn còn dấu vết của một danh sách (FlatList/renderItem/getItemLayout) — ` +
      'ảo hoá một hoạ tiết tuần hoàn là dựng đi dựng lại cùng một hình rồi vứt đi, và ô trắng khi ' +
      'kéo nhanh là hệ quả cố hữu của nó',
  );
}
if (!/<Pattern\b/.test(ruler)) {
  problems.push(`${RULER}: không dùng <Pattern> — thước lại đang được vẽ theo từng vạch`);
}

/* ── 2. `<Svg>` phải ĐỨNG YÊN ───────────────────────────────────────────── */
/*
  `react-native-svg` vẽ lại cả `<Svg>` khi một prop con đổi. `assistant-aura` và
  `readiness-aura` đều đã trả giá cho bài học này. Ở đây nó nặng hơn: cú kéo
  chạy sáu mươi lần mỗi giây.

  Nên `useAnimatedStyle` phải nằm trên lớp BỌC, và trong thân `<Svg>` không được
  có tên của một shared value nào.
*/
{
  const svg = /<Svg[\s\S]*?<\/Svg>/.exec(ruler);
  if (!svg) problems.push(`${RULER}: không tìm thấy khối <Svg> — luật "đứng yên" đang không kiểm gì`);
  else if (/\.value\b/.test(svg[0])) {
    problems.push(
      `${RULER}: bên trong <Svg> có đọc \`.value\` của shared value — react-native-svg sẽ RASTER lại ` +
        'cả hình ở mỗi khung hình của cú kéo. Hoạt hoạ phải nằm trên lớp bọc',
    );
  }
  if (!/useAnimatedStyle\(\(\) => \(\{\s*transform: \[\{ translateX:/.test(ruler)) {
    problems.push(`${RULER}: lớp bọc không chạy \`translateX\` qua useAnimatedStyle`);
  }
}

/* ── 3. JS chỉ được gọi khi vạch ĐỔI ────────────────────────────────────── */
{
  const h = /useAnimatedScrollHandler\(([\s\S]*?)\n  \);/.exec(ruler);
  if (!h) problems.push(`${RULER}: không tìm thấy bộ xử lý cuộn dạng worklet`);
  else {
    if (!/if \(next === last\.value\) return;/.test(h[1])) {
      problems.push(
        `${RULER}: worklet không chặn khi vạch KHÔNG đổi — mỗi khung hình cuộn sẽ là một lời gọi ` +
          'sang luồng JS, đúng thứ bản trước làm',
      );
    }
    if (!/runOnJS\(onIndex\)\(next\)/.test(h[1])) {
      problems.push(`${RULER}: worklet không báo chỉ số nào sang JS — con số lớn sẽ đứng im`);
    }
  }
}

/* ── 4. PHA: vạch dài rơi đúng số nguyên, ở CẢ HAI đơn vị ───────────────── */
/*
  Trích đúng hai biểu thức đang chạy — `phase` và `translateX` — rồi chạy chúng.
  Không chép lại: một bản chép ở đây xanh trong khi mã thật lệch là đúng cái bẫy
  mà repo này đã bắt năm lần.
*/
{
  const pm = /const phase = ([^;]+);/.exec(ruler);
  const tm = /translateX: ([^}]+?) \}\]/.exec(ruler);
  if (!pm || !tm) {
    problems.push(`${RULER}: không trích được biểu thức pha / translateX — luật này đang không kiểm gì`);
  } else if (PERIOD) {
    let phaseOf, txOf;
    try {
      phaseOf = new Function('TICK_W', 'PER_UNIT', 'min10', `return ${pm[1]};`);
      txOf = new Function(
        'pad', 'phase', 'scrollX', 'PERIOD',
        `return ${tm[1].replace(/scrollX\.value/g, 'scrollX')};`,
      );
    } catch (e) {
      problems.push(`${RULER}: không biên dịch được đoạn trích: ${e.message}`);
    }

    if (phaseOf && txOf) {
      /* Đúng phép quy đổi của `lib/units.ts`, và dải của `weight-goal-dialog`. */
      const LB = 2.2046226218;
      const dw = (kg, u) => Math.round((u === 'lbs' ? kg * LB : kg) * 10) / 10;
      const MIN_KG = Number(/const MIN_KG = (\d+)/.exec(dialog)?.[1]);
      const MAX_KG = Number(/const MAX_KG = (\d+)/.exec(dialog)?.[1]);
      if (!MIN_KG || !MAX_KG) {
        problems.push(`${DIALOG}: không đọc được MIN_KG / MAX_KG`);
      } else {
        const width = 402;
        const pad = (width - TICK_W) / 2;

        for (const unit of ['kg', 'lbs']) {
          const min10 = Math.ceil(dw(MIN_KG, unit) * 10);
          const max10 = Math.floor(dw(MAX_KG, unit) * 10);
          const count = max10 - min10 + 1;
          const phase = phaseOf(TICK_W, PER_UNIT, min10);

          let bad = 0;
          let first = null;
          /* Quét cả dải, không lấy mẫu: 2 701 và 5 954 chỉ số đều rẻ, và chỗ
             lỗi cũ nằm rải đều chứ không ở biên. */
          for (let i = 0; i < count; i++) {
            const s = i * TICK_W;
            const tx = txOf(pad, phase, s, PERIOD);
            /*
              Vạch dưới kim nằm ở mép trái `pad` trên màn. Hình vẽ bắt đầu ở
              `-PERIOD + tx`, và trong hình một vạch DÀI nằm ở bội của PERIOD.
              Nên vạch dưới kim là vạch dài khi và chỉ khi:
            */
            /* `tx` phải nằm trong [0, PERIOD): phần đệm của hình rộng đúng một
               chu kỳ mỗi bên, và con số ấy chỉ vừa đủ trong khoảng này. Ra
               ngoài thì hôm nay vẫn phủ kín và ngày mai thì không. */
            if (tx < 0 || tx >= PERIOD) {
              bad++;
              if (first === null) first = i;
              continue;
            }
            const local = pad - (-PERIOD + tx);
            const isMajorDrawn = Math.abs(local / PERIOD - Math.round(local / PERIOD)) < 1e-9;
            const shouldBeMajor = (min10 + i) % PER_UNIT === 0;
            if (isMajorDrawn !== shouldBeMajor) {
              bad++;
              if (first === null) first = i;
            }
          }
          if (bad) {
            const v = ((min10 + first) / 10).toFixed(1);
            problems.push(
              `${RULER}: ở đơn vị ${unit}, ${bad}/${count} vạch vẽ sai loại hoặc lệch khỏi khoảng ` +
                `[0, ${PERIOD}) — chỗ đầu tiên là chỉ số ` +
                `${first} (giá trị ${v} ${unit}). Vạch dài phải rơi đúng vào số nguyên của thang đo, ` +
                'không phải cứ mười phần tử một',
            );
          }
        }
      }
    }
  }
}

if (problems.length) {
  console.error('thước cân nặng CÓ LỖI:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  'thước cân nặng OK — hoạ tiết được TRÍCH ra khỏi mã thật rồi CHẠY trên cả 2.701 chỉ số của kg và ' +
    '5.954 của pound: vạch dài rơi đúng vào số nguyên của thang đo ở từng chỉ số một. Bản cũ đánh dấu ' +
    'theo `index % 10`, một phát biểu về DANH SÁCH — đúng ở kg do tình cờ (index 0 là 30,0) và sai ở ' +
    'MỌI vạch của pound (index 0 là 66,1 lb, nên vạch dài rơi vào 66,1 / 67,1 / 68,1 và không bao giờ ' +
    'vào một pound tròn); không ai báo được, vì một hàng vạch cách đều trông đúng bất kể nó bắt đầu ở ' +
    'đâu. Và thước không còn gì dựng theo TỪNG vạch: một <Pattern> thay cho một FlatList 2.701 phần tử, ' +
    'nên ô trắng khi kéo nhanh — thứ tài liệu React Native gọi là đánh đổi cố hữu của VirtualizedList — ' +
    'không còn chỗ để xảy ra. <Svg> đứng yên và không đọc `.value` nào (react-native-svg raster lại cả ' +
    'hình khi một prop con đổi, bài học của hai lớp aura), hoạt hoạ nằm trên lớp bọc, và worklet chỉ ' +
    'gọi sang JS khi vạch dưới kim ĐỔI chứ không phải mỗi khung hình',
);
