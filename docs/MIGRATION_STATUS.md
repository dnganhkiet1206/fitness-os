# Migration status: Native iOS

> **⚠️ Lịch sử — không còn cập nhật (ghi 28/11/2026, Master Audit 28/11 D-04).** Bảng dưới dừng ở trạng thái đầu tháng 10: hầu hết hàng còn ⬜ trong khi app native đã dựng đủ các lát (`apps/ios/`) và `supabase/migrations/` đã có hơn 100 migration. **Đừng đọc bảng này như trạng thái hiện tại.** Trạng thái thật: hạn chế / việc hoãn / người dùng thật ở [`apps/ios/docs/CONSTRAINTS_AND_DEFERRED.md`](../apps/ios/docs/CONSTRAINTS_AND_DEFERRED.md), hướng sản phẩm ở [`apps/ios/docs/PRODUCT_DECISION_V1.md`](../apps/ios/docs/PRODUCT_DECISION_V1.md), báo cáo từng đợt trên issue #527. Giữ trang để tra lịch sử, không xoá.

Baseline: `fac9ac2` (RN). Trạng thái được cập nhật trong PR làm thay đổi trạng thái.

Ký hiệu trạng thái:
- ⬜ chưa bắt đầu
- 🟨 đang làm
- 🟦 xong trên nhánh, chờ Kiệt test máy
- ✅ Kiệt đã test máy
- ⛔ bị chặn

## Nền tảng

| Hạng mục | Owner | Trạng thái | Issue / PR |
|---|---|---|---|
| Quy trình nhánh + PR + nhãn | A | 🟨 | |
| `apps/ios` XcodeGen + SPM + Swift 6 + CI macOS | A | ⬜ | |
| Supabase client + auth + Keychain | A | ⬜ | |
| Cache + outbox offline + idempotency | A | ⬜ | |
| Design system v0 (tokens → Swift) | C | ⬜ | |
| `spec/` + golden vectors đợt 1 | D | ⬜ | |
| TestFlight qua CI | A | ⛔ cần secret ASC | |

## Vertical slice 1: Buổi tập

| Bước | Owner | Trạng thái |
|---|---|---|
| Today | C (màn) + A (dữ liệu) | ⬜ |
| Plan | B | ⬜ |
| Start | B | ⬜ |
| Exercise | B | ⬜ |
| Log set (bàn phím số, focus, haptics) | B | ⬜ |
| Rest timer | B | ⬜ |
| Live Activity / Dynamic Island | B | ⬜ |
| Finish | B | ⬜ |
| Summary | C | ⬜ |
| Progress | C + D (vectors) | ⬜ |

## Các slice sau (chưa xếp lịch)

Readiness / HealthKit · Dinh dưỡng · Kinh tế xu · Cộng đồng · Offline · i18n (en/vi/es)
