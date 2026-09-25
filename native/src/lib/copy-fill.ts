/**
 * Điền một chuỗi của app (#67).
 *
 *   `{x}`            thay bằng giá trị của `x`
 *   `{x:một|nhiều}`  chọn dạng số theo giá trị của `x`
 *
 *   fillCopy('{n} {n:day|days} left', { n: 1 })  → "1 day left"
 *   fillCopy('{n} {n:day|days} left', { n: 3 })  → "3 days left"
 *
 * ── vì sao một cú pháp trong chuỗi, không phải cặp khoá `…One` ──
 *
 * Nhiều câu đếm HAI, BA thứ một lúc ("{d} days · {m} meals a day · {t} meals in
 * all"): cặp khoá một/nhiều cho mỗi số là 2ⁿ khoá cho một câu. Bộ chọn nằm
 * ngay cạnh số nó đếm, nên mỗi số chọn dạng của riêng nó, và câu tiếng Việt
 * (không có số nhiều) vẫn là đúng một chuỗi như cũ.
 *
 * ── vì sao không `Intl.PluralRules` ──
 *
 * Tiếng Anh chỉ có hai dạng cho số đếm: MỘT khi giá trị là đúng 1, NHIỀU cho mọi
 * số khác (0, 2, 1.5). Không cần phụ thuộc vào dữ liệu Intl của Hermes cho một
 * luật một dòng.
 *
 * Giá trị có thể là số đã định dạng ("1,240", "1.240", "+1"): dạng số được tính
 * trên con số sau khi bỏ dấu nhóm và dấu cộng. `{x}` không có giá trị thì GIỮ
 * NGUYÊN — `live.mjs` đỏ khi thấy một `{…}` lọt ra màn, nên thiếu biến không
 * thành một câu sai lặng lẽ.
 *
 * Đọc một chuỗi có bộ chọn bằng `.replace('{n}', …)` thì bộ chọn lọt ra màn
 * nguyên văn: `tools/plural-copy.mjs` cấm đúng điều ấy.
 */
export type CopyVars = Record<string, string | number>;

const SELECT = /\{(\w+):([^|{}]*)\|([^{}]*)\}/g;
const SLOT = /\{(\w+)\}/g;

export function isOne(v: string | number | undefined): boolean {
  if (v === undefined) return false;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
  return Math.abs(n) === 1;
}

export function fillCopy(template: string, vars: CopyVars): string {
  return template
    .replace(SELECT, (_m, k: string, one: string, other: string) => (isOne(vars[k]) ? one : other))
    .replace(SLOT, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
