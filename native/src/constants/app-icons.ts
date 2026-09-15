import { createLucideIcon } from 'lucide-react-native';

/**
 * Icon app phải tự vẽ, vì bộ chuyên nghiệp KHÔNG có hình ấy.
 *
 * ── vì sao tệp này tồn tại, và vì sao nó phải rất ngắn ──
 *
 * `tools/macro-icon-style.mjs` ghi lại cái giá của một bộ icon vẽ tay đứng cạnh
 * một bộ có sẵn: bản thứ hai luôn trôi khỏi bản đầu, và không có gì báo. Nên
 * mặc định của app là lucide, và tệp này chỉ dành cho hình mà lucide THẬT SỰ
 * không có — chứ không phải cho hình mà tôi thấy vẽ lại sẽ đẹp hơn.
 *
 * Mỗi hình ở đây dựng bằng `createLucideIcon`, factory của chính lucide, nên nó
 * là một `LucideIcon` thật: cùng viewBox 24, cùng nét 2, cùng đầu nét bo, cùng
 * cách nhận `size`/`color`/`strokeWidth`, và nó dùng được ở mọi chỗ nhận một
 * icon lucide — kể cả làm khoá trong bảng `icon-tint.ts`. Nó KHÔNG phải một
 * component lai tự dựng `<Svg>`: `Icon.mjs` của lucide đổ `childDefaultAttributes`
 * (fill none, nét 2, đầu bo) xuống từng hình con, nên hai nét dưới đây thừa
 * hưởng đúng lưới của 1.500 icon còn lại thay vì phải chép lại lưới ấy.
 */

/**
 * Cân sức khoẻ điện tử, nhìn từ trên xuống.
 *
 * ── đặt hàng, và hai hình trước đã sai thế nào ──
 *
 * Chủ dự án: "nó phải là một cái cân điện tử hình vuông". Hai lần trước đều
 * trượt, và trượt theo hai kiểu khác nhau:
 *
 *   `Scale`   cán cân CÔNG LÝ — hai đĩa treo trên một đòn cân. Nó mang nghĩa so
 *             sánh và công bằng, không phải cái cân người ta bước lên.
 *   `Weight`  quả cân hình thang có quai — đúng là "vật nặng", nhưng đó là quả
 *             cân của cái cân đòn, thứ không ai cân sức khoẻ bằng.
 *
 * Lucide không có cân sức khoẻ. Đã dựng cả bộ ứng viên vuông của nó ở đúng cỡ
 * 20pt và nhìn: gần nhất là `panel-bottom` (vuông + một dải), nhưng nó là một
 * tấm panel giao diện, còn `tablet` đọc ra là iPad.
 *
 * ── hình này vẽ gì, và vì sao đúng ba nét ──
 *
 * Mặt cân vuông bo góc; màn hình là một dải nằm ở NỬA TRÊN; vạch chỉ ngắn ở
 * giữa bên dưới. Đúng bố cục trong ảnh chủ dự án gửi kèm câu "nè" — ảnh ấy là
 * bản vẽ được duyệt, nên toạ độ bám theo nó chứ không theo bản tôi vẽ trước đó
 * (bản ấy để ô số dưới ĐÁY, và đó là chỗ nó khác ảnh).
 *
 * Màn hình vẽ bằng `path` một nét ngang chứ không bằng `rect`: nét 2 với đầu bo
 * cho ra đúng viên thuốc đặc như trong ảnh, trong khi một `rect` cao 3 đơn vị
 * viền 2 chỉ còn lòng 1 đơn vị và nhoè thành một khối ở 20pt.
 *
 * Toạ độ theo đúng lưới lucide: viewBox 24, nét 2, nên mặt ngoài chạy 3→21
 * (chừa nửa nét mỗi bên). Hai bản vẽ nhiều chi tiết hơn — thêm cung đo, thêm
 * kim quay — đã dựng và nhìn ở 20pt: chúng nhoè thành một cục. Ở cỡ thật của
 * một dòng danh sách, ba nét là ngưỡng trên chứ không phải điểm bắt đầu.
 */
export const BodyScale = createLucideIcon('BodyScale', [
  ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '4', key: 'plate' }],
  ['path', { d: 'M9 7.5h6', key: 'display' }],
  ['path', { d: 'M12 11.75v5', key: 'mark' }],
]);
