# ASCND Design System v0

Token là sự thật duy nhất của giao diện. Mọi màu, chữ, khoảng cách, bo góc trong app iOS native đều đọc từ `tokens.json` — không hardcode hex/pt trong SwiftUI.

## Nguồn

- `tokens.json` rút nguyên giá trị từ app React Native: `native/src/constants/palette.ts` (38 token màu × 2 theme) và `native/src/constants/ascnd.ts` (spacing, radius, type scale).
- Thương hiệu lấy theo spec này, không lấy theo cách RN đang vẽ (RN có chỗ vẽ sai đã được ghi lại trong comment của palette — token giữ giá trị đã đo, không giữ cách vẽ).

## Cách dùng (SwiftUI, khi A tạo xong target `ASCNDDesignSystem`)

- **Màu**: `Color(.brand)`-style token — một tên, hai giá trị light/dark trong `tokens.json`. Không dùng `.primary`/`.secondary` của hệ thống thay cho token thương hiệu.
- **Chữ**: dùng `UIFontTextStyle` trong cột `iosTextStyle` của mỗi bậc (`Font.headline`, `.title2`…) để tự hỗ trợ Dynamic Type. Ngoại lệ duy nhất: số nằm trong hình vẽ (vòng tròn) giữ cỡ cứng theo `RING_TEXT_MAX_SCALE = 1.6` — chữ trong layout co giãn thì không giới hạn.
- **Số liệu lớn đổi liên tục** (đồng hồ nghỉ, bộ đếm): `mono` — Menlo + tabular-nums để cột số không nhảy.
- **Spacing/radius**: `spacing.md = 16`, `radius.lg = 20`, v.v. — không bịa số mới khi token đã có.

## Luật tương phản

Đồ hoạ mang nghĩa (icon trạng thái, glyph trên nút) phải đạt WCAG 1.4.11 — tối thiểu 3:1 với nền kề. Các token màu trong `tokens.json` đã được đo trên nền thật của chính theme nó (xem comment trong `palette.ts`); khi thêm token mới phải đo lại, không đo bằng mắt.

## Component v0 (làm sau khi có target)

Button (primary/secondary/destructive), Card, StatTile, SectionHeader — mỗi component có `#Preview` light/dark + Dynamic Type cỡ XXL. Đọc `.claude/skills/impeccable/` trước khi vẽ UI.

## Quy trình đổi token

Đổi giá trị trong `tokens.json` trước, rồi mới sửa code đọc nó. Không sửa một đầu mà để đầu kia lệch.
