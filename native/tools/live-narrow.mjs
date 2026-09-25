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
  /* Linh có đủ ba loại bài → hàng lọc #44 hiện đủ bốn ô. */
  `/community-user?id=${LINH}`,
  `/community-user?id=${ASCND}`,
  '/community-post?id=cp000000-0000-4000-8000-000000000001',
  '/community-share',
  '/community-share-progress',
  '/community-share-recipe',
];
export const NARROW = { width: 320, height: 720 };
export const NARROW_LANGS = ['vi', 'en'];

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

/** Nguồn regex (neo hai đầu) cho mỗi chuỗi: `{n}`, `{name}` khớp một đoạn bất kỳ. */
export function copyPatterns(copy = appCopy()) {
  /* Một chuỗi mà phần CỐ ĐỊNH gần như không có chữ (`{n}`, `{a} · {b}`,
     `{n} kg`) khớp cả nội dung người dùng, nên bị bỏ: nó sẽ biến một chú
     thích bài bị cắt đúng luật thành "chữ của app bị cắt". */
  return copy.filter((s) => (s.replace(/\{\w+\}/g, '').match(/\p{L}/gu) ?? []).length >= 4).map((s) => {
    const parts = s.split(/\{\w+\}/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return `^${parts.join('.+')}$`;
  });
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
    return { wide, cut, clipped };
  }, patterns);
}
