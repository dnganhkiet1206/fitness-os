/**
 * Một ngôn ngữ, chọn xong thì SỞ HỮU cả gói nội dung hướng dẫn.
 *
 * ── vì sao nó là một tệp riêng, không nằm trong hook ──
 *
 * Cùng lý do `curve.ts` và `water-scale.ts` đứng tách khỏi thứ dùng chúng:
 * `use-exercise-guide.ts` kéo theo react-query và client Supabase, và cả hai
 * thứ đó không nạp được trong Node. Ở ngoài này, `tools/guide-content.mjs`
 * biên dịch đúng tệp này rồi CHẠY hàm thật với dữ liệu thật — một luật gọi
 * được hàm thì đỏ vì hành vi, còn một luật đọc chuỗi thì chỉ đỏ vì chính tả.
 *
 * ── quy tắc, và nó phải tất định ──
 *
 *     ngôn ngữ đang bật  →  nếu không có, tiếng Việt  →  nếu vẫn không, rỗng
 *
 * "Không có" nghĩa là không có dòng nào cho ngôn ngữ ấy, HOẶC dòng ấy rỗng cả
 * hai danh sách. Một dòng tiếng Anh trống rỗng không phân biệt được với việc
 * chưa ai dịch, và hiện một màn trắng trong khi bản tiếng Việt nằm ngay đó là
 * tệ hơn cho người đang đứng giữa phòng tập.
 *
 * ── vì sao chọn NGUYÊN DÒNG, không ghép ──
 *
 * Nếu dòng tiếng Anh có điểm kỹ thuật nhưng chưa có lỗi thường gặp, màn hình
 * hiện điểm kỹ thuật tiếng Anh và KHÔNG có lỗi thường gặp — chứ không mượn
 * phần thiếu từ tiếng Việt. Một màn trộn hai thứ tiếng đọc ra như một lỗi
 * hiển thị, và người đọc không có cách nào biết câu nào là bản dịch của câu
 * nào. Thà thiếu một mục còn hơn nói bằng hai giọng.
 */

/** Đúng những cột mà việc chọn cần. `locale` để rộng: nó đến từ mạng. */
export interface GuideContentRow {
  locale: string;
  form_cues: string[] | null;
  common_mistakes: string[] | null;
}

export interface GuideContent {
  locale: 'vi' | 'en';
  formCues: string[];
  commonMistakes: string[];
}

/** Bỏ khoảng trắng thừa và những phần tử rỗng — mảng đến từ cơ sở dữ liệu. */
const clean = (xs: string[] | null | undefined): string[] =>
  (xs ?? []).map((s) => (s ?? '').trim()).filter(Boolean);

export function pickContent(
  rows: readonly GuideContentRow[],
  lang: 'vi' | 'en',
): GuideContent | null {
  const has = (r: GuideContentRow) =>
    clean(r.form_cues).length > 0 || clean(r.common_mistakes).length > 0;
  const at = (l: 'vi' | 'en') => rows.find((r) => r.locale === l && has(r));
  const row = at(lang) ?? at('vi');
  if (!row) return null;
  return {
    locale: row.locale as 'vi' | 'en',
    formCues: clean(row.form_cues),
    commonMistakes: clean(row.common_mistakes),
  };
}
