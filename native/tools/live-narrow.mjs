/**
 * Lượt quét hẹp của `live.mjs`: các màn Cộng đồng ở 320×720, cả hai ngôn ngữ (#48).
 *
 * ── vì sao ──
 *
 * Lượt quét chính mở mọi màn ở 402×874. Mọi lỗi cắt chữ ở Cộng đồng mà A tìm
 * thấy đều chỉ hiện ở 320 — hàng lọc theo loại cắt "Tiến trình" và ô cuối
 * (#44), "Tài khoản không còn hồ sơ" bị cắt — và đều được bắt bằng một đầu dò
 * viết tay trong scratchpad, không phải bằng một bước chạy lại được. Nên lần
 * sau một nhãn dài thêm hai chữ thì không gì nói ra.
 *
 * ── đo cái gì ──
 *
 * Hình học, không ảnh chụp: không so pixel thì không giòn.
 *
 *   1. Cả trang không được rộng hơn khung (`scrollWidth > innerWidth`): cuộn
 *      ngang cả màn là một lỗi bố cục, không phải một lựa chọn.
 *   2. Một phần tử chữ có `numberOfLines` (react-native-web vẽ nó thành
 *      `text-overflow: ellipsis` hoặc `-webkit-line-clamp`) mà chữ của nó
 *      KHÔNG vừa hộp — tức đang hiện "…". Lần chạy đầu tìm ra thẻ Tiến trình
 *      cắt cả CON SỐ ("+3.3…"), nên một số đo bị cắt cũng tính.
 *   3. Một ô chọn (`role="tab"`) nằm VẮT qua mép một vùng cuộn ngang khi
 *      chưa cuộn — kiểu cắt của `PickRow scroll`, không có "…" nào.
 *   4. Hai đích chạm (nút, link, ô chọn, ô nhập) chồng lên nhau (#77) — một
 *      ngón tay rơi vào chỗ ấy thì không biết bấm trúng cái nào.
 *
 * ── nhưng chỉ chữ CỦA APP ──
 *
 * Tên người, chú thích bài, tiêu đề buổi tập là nội dung người dùng; chúng dài
 * bao nhiêu cũng được, và "…" ở đó là đúng việc `numberOfLines` được đặt để
 * làm. Một nhãn nút, một chip lọc, một câu giải thích thì khác: app viết ra
 * nó, app biết nó dài bao nhiêu, và cắt nó là mất nghĩa ("Tiến tr…").
 *
 * Phân biệt bằng chính từ điển: chữ đầy đủ của phần tử bị cắt được so với mọi
 * chuỗi trong `src/lib/native-strings.ts` (cả hai ngôn ngữ, `{n}` khớp bất kỳ
 * đoạn nào). Khớp thì là chữ của app bị cắt → vấn đề. Không khớp thì là nội
 * dung, và được liệt kê chứ không làm đỏ, để "không phải lỗi" không lặng lẽ
 * thành "không nhìn thấy".
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const LINH = 'c0000000-0000-4000-8000-0000000011a1';
const ASCND = 'c0000000-0000-4000-8000-00000000a5cd';

/** Mọi màn Cộng đồng, cùng tham số làm nó có dữ liệu trong thế giới giả. */
export const NARROW_ROUTES = [
  '/community',
  '/community-inbox',
  '/community-privacy',
  '/community-search',
  '/community-saved',
  '/community-profile',
  '/community-challenge',
  '/community-challenges',
  /* Linh có đủ ba loại bài → hàng lọc #44 hiện đủ bốn ô. */
  `/community-user?id=${LINH}`,
  `/community-user?id=${ASCND}`,
  '/community-post?id=cp000000-0000-4000-8000-000000000001',
  '/community-share',
  '/community-share-progress',
  '/community-share-recipe',
];
/**
 * Các màn Dinh dưỡng của B (#55): nhiều chữ nhất app và chưa màn nào từng được
 * quét ở 320. Tách khỏi danh sách Cộng đồng để mỗi người biết màn nào là của
 * mình khi lượt quét đỏ.
 */
export const NARROW_ROUTES_NUTRITION = [
  '/nutrition',
  '/log-meal',
  '/diary',
  '/food-list',
  '/meal-plans',
  '/grocery',
];
/**
 * Các tab chính (#64): những màn người ta mở nhiều nhất, chưa từng được quét ở
 * 320 hay ở chữ lớn. Khác hai danh sách trên, danh sách này chạy CẢ lượt chữ
 * lớn — Hôm nay và Tập luyện là nơi Dynamic Type được bật nhiều nhất, và cũng
 * là nơi có số trong hình (vòng sẵn sàng) mang trần `RING_TEXT_MAX_SCALE`.
 */
export const NARROW_ROUTES_MAIN = ['/', '/workouts', '/workouts/plan', '/workouts/library', '/assistant', '/log-workout'];
/*
  Ngoại lệ của luật 3 (ô chọn vắt qua mép vùng cuộn), MỖI cái một lý do (#55).

  Hàng loại bữa của `/log-meal` là `PickRow scroll` sáu ô, và ở 320 nó KHÔNG
  BAO GIỜ vừa khung (đo: 533px trong 272px). Ô ló ra ở mép là chỗ duy nhất nói
  "còn nữa, cuộn đi" — che nó đi cho thẳng mép thì hàng trông như chỉ có bốn
  loại bữa. Điều luật 3 bảo vệ là ô ĐANG CHỌN không bị cắt; từ #47 hàng tự cuộn
  cho ô ấy hiện trọn, và vế "PickRow cuộn ở 320 + chữ lớn" của `live.mjs` (#54)
  canh đúng chuyện đó. Hàng lọc theo loại ở hồ sơ (#44) thì KHÔNG được miễn: ở
  chữ thường nó vừa khung, nên ô vắt qua mép ở đó là lỗi.

  Nhãn đọc từ `native-strings.ts` (cả hai ngôn ngữ), không gõ tay: đổi tên một
  loại bữa không được lặng lẽ biến ngoại lệ thành luật bị nới.
*/
const MEAL_KEYS = ['nBreakfast', 'nLunch', 'nDinner', 'nSnack', 'nPreWorkout', 'nPostWorkout'];
export function mealLabels(src = readFileSync(path.join(NATIVE, 'src/lib/native-strings.ts'), 'utf8')) {
  const out = new Set();
  for (const k of MEAL_KEYS) for (const m of src.matchAll(new RegExp(`^\\s+${k}:\\s*'([^']+)'`, 'gm'))) out.add(m[1]);
  return out;
}
export const NARROW_CLIP_OK = [
  {
    route: '/log-meal',
    labels: mealLabels(),
    why: 'hàng loại bữa sáu ô không bao giờ vừa 320 — ô ló ra ở mép là dấu "cuộn để xem thêm"; ô đang chọn thì #47 lo và #54 canh',
  },
];
/** Một ô bị cắt (chuỗi `nhãn (l..r trong l..r)` của `narrowFindings`) có được miễn ở màn này không. */
export function clipExempt(route, clippedDesc) {
  const label = clippedDesc.replace(/ \(\d+\.\.\d+ trong \d+\.\.\d+\)$/, '');
  return NARROW_CLIP_OK.some((x) => route.split('?')[0] === x.route && x.labels.has(label));
}

export const NARROW = { width: 320, height: 720 };
export const NARROW_LANGS = ['vi', 'en'];

/*
  ── chữ lớn (#56) ──

  Mọi `<Text>` của app đi theo Dynamic Type (`allowFontScaling` mặc định bật,
  `tools/dynamic-type.mjs` cấm tắt nó). react-native-web không có cỡ chữ hệ
  thống, nên chữ lớn được GIẢ LẬP: nhân cỡ chữ và chiều cao dòng của mọi phần
  tử chữ lên `LARGE_TEXT` rồi đo lại. 1.3 ≈ bậc "xxxLarge" của iOS (body 17 →
  23 điểm), bậc lớn nhất trước các cỡ trợ năng; và nó không vượt trần nào
  trong app (thấp nhất là 1.3 ở chữ trong avatar), nên giả lập không bỏ qua
  một `maxFontSizeMultiplier` nào mà máy thật sẽ tôn trọng.

  Chỉ tiếng Việt: chữ dài hơn, và mọi nhãn bị cắt đã tìm thấy đều là tiếng
  Việt. Chỉ luật 1 và 2: ở chữ lớn một hàng cuộn NHẤT ĐỊNH có ô ló ra ngoài
  mép — đó là việc hàng cuộn làm, và #47 đã lo ô đang chọn luôn hiện trọn.
*/
export const LARGE_TEXT = 1.3;
export const LARGE_LANGS = ['vi'];

/**
 * Chạy TRONG trang: phóng mọi phần tử chữ. Trả số phần tử mà cỡ chữ ĐÃ THẬT SỰ
 * đổi đúng hệ số — không phải số phần tử tìm thấy: một giả lập "chạm" tới
 * phần tử mà không đổi được cỡ (một quy tắc CSS mạnh hơn, một thuộc tính bị
 * ghi đè) thì đo ra một màn chưa hề phóng.
 */
export async function enlargeText(page, factor = LARGE_TEXT) {
  return page.evaluate((k) => {
    /* `<Text>` của react-native-web là `div[dir="auto"]`; `<Text>` LỒNG bên
       trong là `span` không mang `dir` — nên chọn theo "có chữ trực tiếp",
       cộng `dir="auto"` cho phần tử chữ rỗng lúc đo. */
    const els = [...document.querySelectorAll('#root *')].filter(
      (e) => e.getAttribute('dir') === 'auto' || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()),
    );
    /* ĐỌC hết rồi mới GHI: ghi ngay thì con thừa hưởng cỡ đã phóng của cha
       rồi bị phóng thêm lần nữa (1.3 × 1.3). */
    const plan = els.map((el) => {
      const st = getComputedStyle(el);
      return [el, parseFloat(st.fontSize), st.lineHeight.endsWith('px') ? parseFloat(st.lineHeight) : null];
    });
    for (const [el, fs, lh] of plan) {
      el.style.setProperty('font-size', `${fs * k}px`, 'important');
      if (lh != null) el.style.setProperty('line-height', `${lh * k}px`, 'important');
    }
    return plan.filter(([el, fs]) => Math.abs(parseFloat(getComputedStyle(el).fontSize) - fs * k) < 0.5).length;
  }, factor);
}

/* Một chuỗi trong native-strings.ts, dạng `  key: '…',` hoặc `"…"`. Chuỗi
   template hay xuống dòng thì hiếm (6 chỗ) và không nằm trong các màn này. */
export function appCopy(src = readFileSync(path.join(NATIVE, 'src/lib/native-strings.ts'), 'utf8')) {
  const out = new Set();
  for (const m of src.matchAll(/^\s+\w+:\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1,?\s*$/gm)) {
    const s = m[2].replace(/\\(.)/g, '$1').trim();
    if (s.length >= 2) out.add(s);
  }
  return [...out];
}

/* `{x}` là một chỗ trống; `{x:một|nhiều}` là bộ chọn số ít/số nhiều của
   `fillCopy` (#67) — trên màn nó là ĐÚNG MỘT trong hai dạng, không phải một
   đoạn bất kỳ. Tách chuỗi theo `{x}` thôi thì bộ chọn thành chữ cố định
   `{n:coin|coins}` trong mẫu, và "Claim 100 coins" bị cắt không còn là chữ
   của app (đo lúc viết: 42 chuỗi tiếng Anh). */
const TOKEN = /\{\w+\}|\{\w+:([^|{}]*)\|([^{}]*)\}/g;
const esc = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Thân regex (chưa neo) của một chuỗi: `{x}` → `.+`, `{x:một|nhiều}` → `(?:một|nhiều)`. */
export function patternBody(s) {
  let out = '';
  let last = 0;
  for (const m of s.matchAll(TOKEN)) {
    out += esc(s.slice(last, m.index)) + (m[1] === undefined ? '.+' : `(?:${esc(m[1])}|${esc(m[2])})`);
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

/** Số chữ cái CỐ ĐỊNH của một chuỗi: chỗ trống không tính, bộ chọn tính theo dạng nhiều. */
export function fixedLetters(s) {
  return (s.replace(TOKEN, (_m, one, other) => (one === undefined ? '' : other)).match(/\p{L}/gu) ?? []).length;
}

/** Nguồn regex (neo hai đầu) cho mỗi chuỗi: `{n}`, `{name}` khớp một đoạn bất kỳ. */
export function copyPatterns(copy = appCopy()) {
  /* Một chuỗi mà phần CỐ ĐỊNH gần như không có chữ (`{n}`, `{a} · {b}`,
     `{n} kg`) khớp cả nội dung người dùng, nên bị bỏ: nó sẽ biến một chú
     thích bài bị cắt đúng luật thành "chữ của app bị cắt". */
  return copy.filter((s) => fixedLetters(s) >= 4).map((s) => `^${patternBody(s)}$`);
}

/** Chạy TRONG trang. Trả `{ wide, cut: [{ text, app }], clipped: [mô tả] }`. */
export async function narrowFindings(page, patterns) {
  return page.evaluate((sources) => {
    const res = sources.map((s) => new RegExp(s));
    /* Thanh tab trên web (`components/app-tabs.web.tsx`) là khung mẫu của
       Expo cho trình duyệt, không phải thanh tab app ship trên iOS — ở 320 nó
       tự rộng 406px và làm mọi màn trong tab "cuộn ngang". Ẩn nó trước khi
       đo, tìm theo chính các link tab chứ không theo tên lớp. */
    let bar = document.querySelector('a[href="/nutrition"]');
    while (bar && getComputedStyle(bar).position !== 'absolute') bar = bar.parentElement;
    if (bar && bar.querySelector('a[href="/community"]')) bar.style.display = 'none';
    const W = window.innerWidth;
    const doc = document.scrollingElement || document.documentElement;
    const wide = doc.scrollWidth > W + 1 ? doc.scrollWidth : null;
    const cut = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('#root *')) {
      const st = getComputedStyle(el);
      const oneLine = st.textOverflow === 'ellipsis';
      const clamp = st.webkitLineClamp && st.webkitLineClamp !== 'none';
      if (!oneLine && !clamp) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || st.visibility === 'hidden') continue;
      const over = oneLine ? el.scrollWidth > el.clientWidth + 1 : el.scrollHeight > el.clientHeight + 1;
      if (!over) continue;
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      /* Một số đo bị cắt ("+3.3…") cũng là vấn đề, dù nó không có trong từ
         điển: con số là dữ liệu, và "…" ở đó là mất đúng thứ người ta đọc. */
      const measure = /^[+\-−]?\d[\d.,]*\s*[^\s\d]{0,4}$/.test(text);
      cut.push({ text, app: measure || res.some((re) => re.test(text)) });
    }
    /*
      Ô chọn bị MÉP VÙNG CUỘN cắt. Một `PickRow scroll` không bao giờ hiện "…":
      chữ tràn thì hàng cuộn, và ô cuối nằm vắt qua mép — "Công th" rồi hết.
      Luật 2 không thấy kiểu này; phép thử ngược đầu tiên (đệm 14 ở hàng lọc
      #44) vì thế vẫn XANH, và luật này có mặt từ đó. Chỉ ô VẮT qua mép mới
      tính: một ô nằm hẳn ngoài mép là "cuộn để xem thêm", đúng việc của
      hàng cuộn.
    */
    const clipped = [];
    for (const tab of document.querySelectorAll('#root [role="tab"]')) {
      let box = tab.parentElement;
      while (box && box.id !== 'root') {
        const ox = getComputedStyle(box).overflowX;
        if ((ox === 'auto' || ox === 'scroll' || ox === 'hidden') && box.scrollWidth > box.clientWidth + 1) break;
        box = box.parentElement;
      }
      if (!box || box.id === 'root') continue;
      const b = box.getBoundingClientRect();
      const t = tab.getBoundingClientRect();
      if (t.width === 0) continue;
      const across = (t.left < b.right - 1 && t.right > b.right + 1) || (t.left < b.left - 1 && t.right > b.left + 1);
      if (across) {
        const text = (tab.innerText || tab.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
        clipped.push(`${text} (${Math.round(t.left)}..${Math.round(t.right)} trong ${Math.round(b.left)}..${Math.round(b.right)})`);
      }
    }
    /*
      4. Hai ĐÍCH CHẠM chồng lên nhau (#77). Cả hai lỗi của #72 — nút "Hoàn
      thành buổi tập" kẹt `position: absolute` đè lên hàng set, viên "⏱ 2:00"
      đè lên ô số lần ở 320 — đều qua ba luật trên, vì không chữ nào bị cắt
      và không gì tràn: chúng chỉ nằm SAI CHỖ. Một ngón tay rơi vào chỗ chồng
      nhau thì không biết bấm trúng cái nào.

      Đo hình chữ nhật NHÌN THẤY được của mỗi đích: cắt theo mọi tổ tiên có
      `overflow` khác `visible` (nội dung cuộn dưới một thanh cố định thì bị
      vùng cuộn cắt, không "chồng" lên thanh ấy). Không tính:
        · cặp mà cái này CHỨA cái kia trong cây (nút trong một thẻ bấm được);
        · lớp phủ CÓ CHỦ Ý — cái nhỏ nằm trọn trong cái lớn và ở TRÊN nó
          (`elementFromPoint` ở tâm cái nhỏ trúng cái nhỏ): nút ✕ ở góc thẻ.
          Nằm trọn mà ở DƯỚI thì là một đích không bấm tới được — vẫn tính.
    */
    const TAP = ['button', 'link', 'tab', 'switch', 'checkbox', 'radio', 'menuitem']
      .map((r) => `#root [role="${r}"]`)
      .concat(['#root a[href]', '#root input', '#root textarea'])
      .join(',');
    const seen4 = new Set();
    const taps = [];
    for (const el of document.querySelectorAll(TAP)) {
      if (seen4.has(el)) continue;
      seen4.add(el);
      const st = getComputedStyle(el);
      if (st.pointerEvents === 'none' || st.visibility === 'hidden') continue;
      let { left, top, right, bottom } = el.getBoundingClientRect();
      let gone = false;
      for (let a = el.parentElement; a && a.id !== 'root'; a = a.parentElement) {
        const sa = getComputedStyle(a);
        if (sa.display === 'none' || sa.opacity === '0' || a.getAttribute('aria-hidden') === 'true') { gone = true; break; }
        if (sa.overflowX !== 'visible' || sa.overflowY !== 'visible') {
          const b = a.getBoundingClientRect();
          left = Math.max(left, b.left); top = Math.max(top, b.top);
          right = Math.min(right, b.right); bottom = Math.min(bottom, b.bottom);
        }
      }
      if (gone || st.opacity === '0' || right - left < 2 || bottom - top < 2) continue;
      taps.push({ el, left, top, right, bottom });
    }
    const name = (el) =>
      (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.tagName.toLowerCase())
        .replace(/\s+/g, ' ').trim().slice(0, 40);
    const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
    const onTop = (s) => {
      const hit = document.elementFromPoint((s.left + s.right) / 2, (s.top + s.bottom) / 2);
      return !!hit && s.el.contains(hit);
    };
    const overlap = [];
    for (let i = 0; i < taps.length; i++) {
      for (let j = i + 1; j < taps.length; j++) {
        const a = taps[i], b = taps[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w <= 4 || h <= 4) continue;
        if (inside(a, b) && onTop(a)) continue;
        if (inside(b, a) && onTop(b)) continue;
        overlap.push(`"${name(a.el)}" × "${name(b.el)}" (${Math.round(w)}×${Math.round(h)}px)`);
      }
    }
    return { wide, cut, clipped, overlap };
  }, patterns);
}
