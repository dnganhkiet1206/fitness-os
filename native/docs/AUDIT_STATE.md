# Trạng thái rà soát

Một trang, một câu trả lời: **hôm nay app đang đứng ở đâu.**

`SO-GHI-LOI.md` là sổ ghi từng lỗi và luật không được đụng vào chúng. Trang này
là thứ khác: nó nói vòng rà soát gần nhất chạy khi nào, trên commit nào, đo bằng
gì, và cái gì còn lại. Ai mở repo lần đầu đọc trang này trước.

**Vòng gần nhất:** 2026-09-08 · sau A11Y-2 · nhánh
`claude/ios-fitness-rebuild-omgulr`

---

## Cổng chất lượng

| Cổng | Kết quả | Ghi chú |
|---|---|---|
| TypeScript | **XANH** | `npx tsc --noEmit -p tsconfig.json`, chạy từ `native/` |
| `node tools/check.mjs` | **XANH** | exit 0, **210** bước, tất cả xanh. Chạy từ `native/`; chạy từ gốc repo là exit 2 và nó cố ý từ chối |
| Quét runtime 45 route | **XANH** | không route nào trắng, không route nào ném; còn đúng 1 cảnh báo web-only trên `settings` (P3-1) |
| Đổi theme, 9 màn | **XANH** | lỗi JS khi đổi theme: **5 → 1** sau A11Y-2; không màn nào trắng, cả hai chiều |
| Nút lồng trong nút, 6 tab chính | **XANH** | 0/6 màn còn nút lồng (trước: Hôm nay 2, Dinh dưỡng 1, Tập luyện 1) |
| ESLint | **KHÔNG CHẠY ĐƯỢC** | `eslint` không có trong `node_modules`; `npx expo lint` báo `Cannot find module 'eslint'` **và vẫn thoát 0** — nên đừng đọc mã thoát của nó là "sạch". Cổng thật là 210 bước ở trên |
| Bản dựng native | **CHƯA CHẠY Ở ĐÂY** | môi trường này là Linux; iOS phải dựng ở máy bạn |

---

## A9 — ĐÓNG (2026-09-08)

App thoát khi chạm vùng vòng tròn sẵn sàng sau khi đổi tab rồi quay lại.

**Nguyên nhân gốc:** đường dựng khác nhau giữa hai theme — bản tối dựng lớp
kính/lớp phủ, bản sáng bỏ lớp ấy đi.

**Đã sửa:** hai theme dùng chung một đường dựng.

**Kiểm chứng:** chủ dự án xác nhận trên máy thật, 2026-09-08.

**`MaskedView` không phải nguyên nhân gốc** và không được gỡ hay thay chỉ vì sự
cố này. Chi tiết đầy đủ ở `SO-GHI-LOI.md` mục A9.

---

## Kiến trúc dựng theo theme — điều kiện đã sinh ra A9

A9 khép lại rồi, nhưng ĐIỀU KIỆN của nó thì đo được, và ở commit `f7a3341` nó
vẫn còn. Ghi ra đây vì đó là thứ phải giữ cho "nhất quán và có chủ ý".

Đo trên bộ chạy web, đổi `prefers-color-scheme` ngay trên màn đang mở:

| Màn | node tối | node sáng | cây con bị GỠ khi đổi |
|---|---|---|---|
| Hôm nay | 1.073 | 1.031 | −6 |
| Dinh dưỡng | 611 | 545 | −7 |
| Trợ lý | 1.066 | 1.024 | −6 |
| Nước | 206 | 178 | −4 |
| Tiến trình | 633 | 619 | −2 |
| Huy chương | 822 | 798 | −1 |
| Tập luyện · Cài đặt · Cửa hàng | bằng nhau | bằng nhau | 0 |

Chiều đi một phía: bản sáng **gỡ** cây con và không thêm cái nào. Nguồn là các
nhánh `m.lit` dựng-hoặc-không:

- `ambient-light.tsx:140` — `if (!m.lit) return null` (cả component)
- `glass-card.tsx:154` — mặt gradient
- `readiness-gauge.tsx:580, 625`
- `assistant-aura.tsx:608`
- `liquid-glass.tsx:174` — lớp wash

Cả năm đều là quyết định hiệu năng **có chủ ý và có ghi lý do** — trên giấy
chúng là những lớp `<Svg>` phủ kín màn hình không nhìn thấy được. Nên luật
không phải "cấm lệch", mà là: **tập hợp các chỗ được phép lệch là một danh sách
đóng.** Một nhánh `m.lit` mới xuất hiện mà không ai quyết định là chỗ điều kiện
của A9 mọc lại.

`tools/theme-shape.mjs` giữ danh sách ấy: 6 tệp, 8 nhánh, mỗi tệp một lý do.
Nó phân biệt HÌNH DẠNG với MÀU — `color={m.lit ? a : b}` không dựng thêm hay
bớt một node nào và không tính. Bản đầu của luật gộp cả hai và báo nhầm
`awards.tsx` ba lần; đó là lý do phép phân biệt được viết ra chứ không ngầm
hiểu.

---

## A11Y-2 — XONG (2026-09-08)

Nút trong nút. Trên iOS, `Pressable.js:252` đặt `accessible: accessible !== false`
cho MỌI `Pressable`, và [tài liệu trợ năng của React
Native](https://reactnative.dev/docs/accessibility) nói phần tử ấy *"groups its
children into a single selectable component"* — UIKit không đi vào bên trong.
Nút bên trong không tồn tại với VoiceOver, trong khi ngón tay vẫn bấm được. Đó
là lý do lớp lỗi này sống lâu: nó không hỏng ở nơi ai cũng nhìn.

Bảy chỗ, mỗi chỗ đo riêng trước và sau:

| Chỗ | Đã làm gì | Đo được |
|---|---|---|
| `food-cards.tsx` | ngôi sao thành anh em; phần đệm xuống hai con để vùng chạm không tụt | **0 điểm ảnh lệch**; 3 → 0 nút lồng; vùng chạm sao 17×17 → **38×54** |
| `template-list.tsx` | nút xoá thành anh em; mũi tên giữ cú chạm với `accessible={false}` | **0 điểm ảnh lệch**; 1 → 0 |
| `grocery.tsx` | ô tick thành `checkbox` có nhãn, nút xoá thành anh em | **0 điểm ảnh lệch** |
| `assistant.tsx` | vùng bấm bọc phần đầu thẻ, các chip hỏi nhanh ra ngoài | lệch **111** điểm, dưới sàn nhiễu **186** của chính màn ấy |
| `ai-coach.tsx` | chọn/xoá hội thoại thành anh em, hàng chọn có nhãn | lệch **3** điểm; 3 hàng từ `div` → **3 nút có tên** |
| `week-plan.tsx` | **thêm nút đóng có nhãn** vào hàng tiêu đề, rồi mới `accessible={false}` cho tấm nền và tấm nuốt chạm | vùng danh sách: **0 điểm ảnh lệch**; thay đổi gói trong dải tiêu đề |
| `dashboard-cards.tsx` | nút `?` của thẻ dinh dưỡng thành anh em | nút `?` dịch **1 điểm ảnh** (nét viền của thẻ); 1 → 0 |

`week-plan` là chỗ duy nhất được thêm giao diện, và chỉ đúng phần tối thiểu:
một chữ X 14 điểm trong hàng tiêu đề **đã có sẵn**, cùng mẫu với sheet bộ sưu
tập ở `shop.tsx`. Sáu phép kiểm chức năng chạy ở **cả hai theme**, đều xanh: mở
sheet · 5 điều khiển chọn buổi tập còn đủ · nút đóng có nhãn tồn tại · bấm nó
thì sheet đóng · chạm nền vẫn đóng · chọn một buổi tập vẫn đóng.

### Hai bài học của vòng này

**Bước kiểm tĩnh có một điểm mù, và phép đo lúc chạy tìm ra nó.** Chỗ thứ bảy
(`dashboard-cards.tsx`) lồng nhau qua HAI lớp gián tiếp: một biến (`{card}`) rồi
một component (`HelpButton` trả về `PressScale`). `tools/a11y-swallow.mjs` báo
xanh trên đúng tệp hỏng; bộ chạy web bắt được. Bản sửa đầu chỉ đi theo biến và
VẪN xanh — phép thử ngược bắt được điều đó trước khi tôi tin nó. Bước kiểm nay
quét ra danh sách component-nào-là-nút từ chính mã nguồn.

**Bước kiểm bắt được một hồi quy tôi vừa gây ra.** Mũi tên mới ở
`template-list.tsx` là nút chỉ có icon và không có nhãn → `tools/tap-targets.mjs`
đỏ. Ngoại lệ được thêm là một câu trả lời chứ không phải một lối thoát: một node
đã khai `accessible={false}` không nằm trong cây trợ năng, nên một cái nhãn ở đó
là cái tên không ai nghe được. Ngoại lệ đã được thử ngược: bỏ `accessible={false}`
ra thì nó đỏ lại ngay.

---

## Còn mở

| ID | Mức | Vấn đề | Việc tiếp theo |
|---|---|---|---|
| DEP-1 | P2 | 21 gói trễ, gồm `react-native-screens` 4.25.2→4.26.0 và `react-native` 0.86.0→0.86.3 | Cần dựng lại native để xác nhận — quyết định của chủ dự án |
| A3 | P1 | Ghi khi mất mạng không sống sót (xem `SO-GHI-LOI.md`) | Cần một bước kiểm chứng minh cả ~30 mutation đặt đúng key **trước khi** bắt đầu |
| A7 | P2 | Xoá buổi tập không dựng lại các ngày ở giữa | xem `SO-GHI-LOI.md` |
| A8 | P2 | Android không có blur thật sau status bar | Giới hạn có chủ ý |
| P3-1 | P3 | `settings` / `mascot-room`: `transform-origin` là thuộc tính DOM sai trên web | Chuỗi CSS của Koa; bản native đọc đúng qua `koa-figure.tsx:461`. Chỉ là tiếng ồn trên web |

---

## Cách cập nhật trang này

Sau mỗi vòng rà soát: đổi commit và ngày ở đầu, chạy lại bảng cổng chất lượng,
và **chỉ ghi con số mình vừa đo**. Một ô "XANH" chép lại từ vòng trước là ô nói
dối ngay lần đầu có người tin nó.
