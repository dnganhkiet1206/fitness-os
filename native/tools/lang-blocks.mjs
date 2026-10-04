/**
 * Cắt một tệp từ điển (`src/lib/i18n.ts`, `src/lib/native-strings.ts`) thành
 * khối của TỪNG ngôn ngữ, theo TÊN chứ không theo thứ tự.
 *
 * ── vì sao ──
 *
 * Từ khi có tiếng Tây Ban Nha (`9a49d05`), mỗi khoá có ba bản dịch, và khối
 * `es` đứng ĐẦU tệp. Các bộ kiểm cũ đếm "đúng 2 bản dịch" rồi đọc theo thứ tự
 * xuất hiện (`const [vi, en] = matches`) — nên chúng vừa đỏ vì đếm, vừa đem
 * nhãn tiếng Tây Ban Nha đi so với luật tiếng Việt ("LISTO PARA ENTRENAR"
 * không nói "sẵn sàng"). Đọc theo tên khối thì một ngôn ngữ thêm sau không làm
 * lệch ngôn ngữ nào.
 *
 * Khối bắt đầu ở `const vi…= {`, `const en…= {`, `const es…= {` đầu dòng, và
 * kết thúc ở khối kế tiếp (hay cuối tệp).
 */
export const LANGS = ['vi', 'en', 'es'];

export function langBlocks(src) {
  const marks = [...src.matchAll(/^const (vi|en|es)\b[^=\n]*= \{$/gm)].map((m) => ({ lang: m[1], at: m.index }));
  const out = {};
  marks.forEach((m, i) => {
    out[m.lang] = src.slice(m.at, i + 1 < marks.length ? marks[i + 1].at : src.length);
  });
  return out;
}

/** Giá trị chuỗi của một khoá trong một khối (một dòng hoặc xuống dòng sau `:`), hoặc null. */
export function keyValue(block, key) {
  const m = new RegExp(`\\b${key}:\\s*\\n?\\s*(['"\`])((?:(?!\\1)[^\\\\]|\\\\.)*)\\1`).exec(block ?? '');
  return m ? m[2] : null;
}

/** Giá trị của `key` ở mỗi ngôn ngữ: `{ vi, en, es }` (null khi thiếu). */
export function perLang(src, key) {
  const b = langBlocks(src);
  return Object.fromEntries(LANGS.map((l) => [l, keyValue(b[l], key)]));
}
