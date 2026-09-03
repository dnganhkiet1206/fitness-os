/**
 * Vệt sáng không bao giờ được vẽ ra ngoài cái ray của nó.
 *
 * ── lỗi người dùng gửi ảnh ──
 *
 * Thi thoảng, ở đầu màn Dinh dưỡng và màn Tiến trình, hai mảnh sẫm hình bán
 * nguyệt nằm bên ngoài ray, thò ra khỏi mép trái màn hình, còn trong ray thì
 * không có thumb nào.
 *
 * Quét pixel ảnh chụp: mảnh sẫm rộng 19,6 điểm — đúng bằng `r`, không phải bề
 * rộng một mục (~204). Tức `w` bằng 0, và ở `w = 0` thì:
 *
 *     nắp trái  [x, x+r]
 *     thân      scaleX = max(0, 0 - 2r) = 0   → vô hình
 *     nắp phải  [x - r, x]                    → BÊN TRÁI nắp trái, ngoài ray
 *
 * ── vì sao nó xảy ra, và vì sao "thi thoảng" ──
 *
 * `x/y/w` là shared value khởi tạo 0. Khi `boxes` cập nhật, React gắn pill và
 * worklet chạy NGAY ở giá trị khởi tạo; `useEffect` gán ô thật thì chạy SAU khi
 * vẽ. Bình thường cửa sổ ấy dài một khung hình. Nhưng lúc mở app,
 * `UITabBarController` mount cả năm tab một lượt, nên luồng JS bận và cửa sổ
 * kéo dài — đủ để chụp màn hình. Cùng họ với lỗi màn trắng ở `lib/entrance.ts`:
 * khung hình bị bỏ lỡ thì thứ còn lại là GIÁ TRỊ ĐẦU.
 *
 * ── vì sao luật này CHẠY chứ không dò chữ ──
 *
 * Bản sửa đầu của tôi chặn ở phía render ("ô rộng 0 thì coi như chưa đo") và
 * NGHE có vẻ đủ. Playwright dựng lại lỗi ngay sau đó, vì nó không chạm tới
 * nguyên nhân: worklet vẽ trước khi effect chạy. Một regex kiểm "có chốt ở phía
 * render không" sẽ xanh cho đúng bản vẫn hỏng ấy.
 *
 * Nên tệp này TRÍCH ba biểu thức transform và cái vị từ opacity ra khỏi mã
 * thật, chạy chúng, rồi hỏi một câu về hình học: ở mỗi trạng thái, mảnh nào
 * nhìn thấy được, và nó có nằm trong [x, x+w] không?
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'src/components/ascnd/pick-row.tsx';
const src = readFileSync(path.join(NATIVE, SRC), 'utf8');
const problems = [];

const pick = (re, what) => {
  const m = re.exec(src);
  if (!m) problems.push(`${SRC}: không trích được ${what} — luật này đang không kiểm gì`);
  return m?.[1]?.trim();
};

/* Bốn biểu thức đang chạy thật. */
const opacityExpr = pick(/'worklet';\s*\n\s*return ([^;]+);/, 'vị từ opacity của pill');
const leftX = pick(/const left = useAnimatedStyle\(\(\) => \(\{[\s\S]*?translateX: ([^}]+?) \}/, 'translateX nắp trái');
const rightX = pick(/const right = useAnimatedStyle\(\(\) => \(\{[\s\S]*?translateX: ([^}]+?) \}/, 'translateX nắp phải');
const midX = pick(/const mid = useAnimatedStyle\(\(\) => \(\{[\s\S]*?translateX: ([^}]+?) \}/, 'translateX thân');
const midScale = pick(/const mid = useAnimatedStyle\(\(\) => \(\{[\s\S]*?scaleX: ([^}]+?) \}/, 'scaleX thân');
/* Và quyết định "ô này đã đo được chưa" ở phía render. */
const hereExpr = pick(/const here = ([^;]+);/, 'điều kiện coi một ô là ĐÃ ĐO');

let scanned = 0;
if (!problems.length) {
  const fn = (body) => new Function('x', 'w', 'r', `const y={value:0};const X={value:x},W={value:w};
    const g=(o)=>o.value;return ${body.replace(/x\.value/g,'X.value').replace(/w\.value/g,'W.value')};`);
  let opacity, L, R, M, S, here;
  try {
    opacity = fn(opacityExpr);
    L = fn(leftX); R = fn(rightX); M = fn(midX); S = fn(midScale);
    here = new Function('reported', `return ${hereExpr};`);
  } catch (e) {
    problems.push(`${SRC}: không biên dịch được đoạn trích: ${e.message}`);
  }

  if (opacity) {
    /*
      ── luật 1: nhìn thấy được thì phải nằm TRONG ray ──

      `w = 0` là trạng thái lúc gắn, trước khi effect gán ô thật. Đó là trạng
      thái người dùng chụp được, nên nó nằm đầu danh sách.
    */
    /*
      Dải `w` được quét: 0, rồi từ 2r trở lên.

      Khoảng HỞ 0 < w < 2r bị bỏ có chủ ý, và nó đáng ghi ra chứ không đáng lặng
      lẽ bỏ: ở đó cách dựng ba mảnh vốn không đúng được — hai nắp mỗi cái rộng
      `r` thì đã chiếm 2r, nên chúng chồng lên nhau và thò ra hai đầu. Đó là
      giới hạn hình học của chính cách dựng, không phải lỗi người dùng báo.

      Nó không xảy ra trên màn hình hôm nay: `r = min(radius, h/2)`, và mọi chip
      trong app đều rộng hơn cao — viên nang segmented là 182 điểm với r=19.
      Nếu một ngày có hàng chip hẹp hơn cao thì `r` phải kẹp thêm theo `w/2`, và
      lúc ấy dòng này là chỗ ghi lại vì sao chưa làm.

      `w = 0` thì PHẢI quét, vì đó chính là trạng thái lúc gắn — thứ người dùng
      chụp được.
    */
    const cases = [];
    for (const r of [12, 16, 19]) {
      for (const x of [0, 2, 4, 100]) {
        for (const w of [0, 2 * r, 2 * r + 1, 3 * r, 182]) cases.push({ x, w, r });
      }
    }
    scanned = cases.length;
    let bad = 0;
    let first = null;
    for (const c of cases) {
      const { x, w, r } = c;
      if (opacity(x, w, r) <= 0) continue; // không vẽ thì không có gì để sai
      const spans = [
        ['nắp trái', L(x, w, r), L(x, w, r) + r],
        ['thân', M(x, w, r), M(x, w, r) + Math.max(0, S(x, w, r))],
        ['nắp phải', R(x, w, r), R(x, w, r) + r],
      ];
      for (const [name, a, b2] of spans) {
        if (a < x - 0.01 || b2 > x + w + 0.01) {
          bad++;
          if (!first) first = `${name} nằm ở [${a}, ${b2}] trong khi ray là [${x}, ${x + w}] (x=${x} w=${w} r=${r})`;
        }
      }
    }
    if (bad) {
      problems.push(
        `${SRC}: ${bad}/${cases.length * 3} trạng thái vẽ một mảnh NHÌN THẤY ĐƯỢC ra ngoài ray — ` +
          `chỗ đầu tiên: ${first}. Ở w=0 (trạng thái lúc gắn, trước khi useEffect gán ô thật) nắp ` +
          'phải rơi xuống x-r, tức bên trái nắp trái và thò ra khỏi mép màn hình — đúng thứ người ' +
          'dùng chụp được ở hai màn',
      );
    }
  }

  /*
    ── luật 2: một ô rộng 0 KHÔNG phải một ô đã đo ──

    Nếu nó được nhận, `placed` bị đốt vào một ô rỗng, và lần đặt THẬT đầu tiên
    thành một cú TRƯỢT từ mép trái thay vì một cú nhảy — lúc ấy `w` đi từ gần 0
    lên thật, và trên đường đi nắp phải vẫn nằm ngoài ray, chỉ là có hoạt hoạ.
  */
  if (here) {
    if (here({ x: 0, y: 0, w: 0, h: 38 }) !== undefined) {
      problems.push(
        `${SRC}: một ô đo được bề rộng 0 vẫn được coi là ĐÃ ĐO — "rỗng" và "chưa đọc được" là hai ` +
          'chuyện, và nhận nhầm thì lần đặt thật đầu tiên thành một cú trượt từ mép trái',
      );
    }
    if (here({ x: 2, y: 0, w: 182, h: 38 }) === undefined) {
      problems.push(`${SRC}: một ô đo được đàng hoàng lại bị coi là chưa đo — vệt sáng sẽ không bao giờ hiện`);
    }
  }
}

if (problems.length) {
  console.error('vệt sáng vẽ ra ngoài ray:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `vệt sáng OK — ba biểu thức transform và vị từ opacity được TRÍCH ra khỏi mã thật rồi CHẠY trên ${scanned} ` +
    'trạng thái (x, w, r), kể cả w=0 tức khoảnh khắc pill vừa gắn mà useEffect chưa kịp gán ô: không ' +
    'trạng thái nào vẽ một mảnh nhìn thấy được ra ngoài [x, x+w]. Và một ô đo được bề rộng 0 không ' +
    'được tính là đã đo, nên lần đặt thật đầu tiên là một cú nhảy chứ không phải một cú trượt từ mép trái',
);
