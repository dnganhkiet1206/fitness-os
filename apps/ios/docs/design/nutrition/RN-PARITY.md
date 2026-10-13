# Tab Dinh dưỡng — đối chiếu RN và quyết định thiết kế

Nguồn RN: `app/(tabs)/nutrition.tsx` @ fac9ac2. Ghi lại để lần sau không port
nhầm: thứ tự khối, cái gì giữ, cái gì đổi, cái gì còn thiếu và vì sao.

## Thứ tự khối

| Phân đoạn | RN | Swift (sau đợt này) |
|---|---|---|
| Hôm nay | `NutritionCard` | `NutritionTodayCard` |
| | link `nCxViewTrends7d` | `InsightsRow` → `NutritionInsightsView` |
| | `MealLogActions` (4 cách) | `MealLogWays` (2 cách — xem dưới) |
| | `WaterWidget` | `WaterCard` |
| | `ShortcutRow` Thực phẩm bổ sung | `SupplementsRow` |
| | Bữa hôm nay + `nDiaryOtherDays` | `DayMealsSection` + "Ngày khác" |
| Thực đơn | `MealPlanTab` | `MealPlansPreview` |
| | `AiMealSuggest` | — thiếu |
| | `ShortcutRow` Đi chợ (`nGroceryLeft`) | — thiếu |
| | Thư viện thực phẩm | `FoodsSection` |

Trước đợt này Swift đặt `FoodsSection` ở phân đoạn Hôm nay và có một nút
"Ghi bữa" đơn + một ô giữ chỗ. Đã dời Thực phẩm về Thực đơn đúng RN, bỏ ô giữ
chỗ, đưa link xu hướng lên ngay dưới thẻ calo như RN.

## Ghi bữa: 2 cách thay vì 4

RN có 4 lối: chụp ảnh (`/scan-food`), mã vạch (`/scan-barcode`), tìm
(`/log-meal?focus=search`), nhập tay (`/log-meal`). Native chưa có màn quét ảnh
lẫn mã vạch, nên chỉ hiện hai lối **có thật**:

- **Tìm** — `LogMealView(start: .search)`: ô tìm được focus ngay, bàn phím
  lên. Tương đương `focus=search` của RN.
- **Nhập tay** — `LogMealView(start: .manual)`: mở sẵn phần "Món tự nhập".

Không vẽ ô ảnh/mã vạch bị khoá: nút không làm gì là lừa người dùng. Khi có
màn quét, thêm ô vào `MealLogWays` — bố cục ô viên nang đã chừa chỗ.

## Đồ hoạ

- Nền: `TodayAmbient(accent: .meal)` — một quầng cam nhạt trên giấy ấm, cùng
  ngôn ngữ với Today; không đa sắc.
- Thẻ: `DSCard` giờ là kính (`glassEffect` iOS 26, `regularMaterial` trước đó,
  đặc khi bật Giảm trong suốt), viền sáng phía trên, bóng mềm, góc liên tục.
  Đổi ở DS nên mọi màn dùng `DSCard` (37 tệp) cùng lên kính — có chủ ý.
- Thẻ calo bỏ dòng eyebrow viết hoa "nc.title" — tiêu đề điều hướng đã nói
  "Dinh dưỡng"; ô macro nền mực 4,5% thay vì khối trắng.
- Hàng lối tắt (xu hướng, thực phẩm bổ sung) dùng `todayCard` + `TodayPressStyle`.
- Đổi phân đoạn: `.smooth(0.3)`.

## Còn thiếu so với RN (chưa làm, có lý do)

| Mục RN | Trạng thái | Chặn bởi |
|---|---|---|
| Chụp ảnh món (`/scan-food`) | thiếu | chưa có màn camera + gọi AI ảnh |
| Quét mã vạch (`/scan-barcode`) | thiếu | chưa có màn quét + nguồn tra mã |
| `AiMealSuggest` | thiếu | chưa port lớp gợi ý AI |
| Đi chợ (`ShortcutRow` + màn) | thiếu | trước chặn bởi #161 — nay lớp Trạng thái đã có, làm được |
| Sao yêu thích thực phẩm | thiếu | như trên, dùng `StateWriter` |

## Đã kiểm trên simulator (Limrun)

Phân đoạn Hôm nay cuộn hết; Tìm mở sheet với ô tìm focus; Nhập tay mở sheet
với phần tự nhập mở sẵn; phân đoạn Thực đơn hiện kế hoạch + Thực phẩm. Chưa
kiểm: chế độ tối, máy thật.

## Cập nhật B (13/10): thiết kế lại

Thứ tự và cách trình bày ở trên đã được thay bằng bản thiết kế lại trong `REDESIGN.md` (chủ dự án cho phép rời RN). Số liệu và luật giữ nguyên; xem bảng khác biệt ở `NATIVE_IMPROVEMENTS.md`.
