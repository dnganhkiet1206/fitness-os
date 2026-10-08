# Fixture Matrix — en/vi/es + Dynamic Type

Ma trận fixture cho localization và accessibility testing — **chạy được**, không
còn là tài liệu liệt kê suông. Issue #370 · PR #379.

## Chạy ở đâu

- Dữ liệu: `native/tools/fixture-matrix-data.mjs` — 14 fixture, 5 màn
  (Today / Workout / Rest / Finish / Summary) × 3 locale (en/vi/es).
- Cổng: `native/tools/fixture-matrix.mjs`, đã đăng ký trong `tools/check.mjs`
  (`ma trận fixture`).
- Chạy lẻ: `cd native && node tools/fixture-matrix.mjs`

## Cổng assert gì

1. Mọi khoá `copy` tồn tại ở **cả 3 locale** — thiếu localization đỏ trước merge.
2. Render bằng đúng luật `fillCopy` của app (`src/lib/copy-fill.ts`); render xong
   không còn `{…}` sót — biến thiếu đỏ (cùng luật BAD_TEXT của `live.mjs`).
3. Fixture plural: template **en** phải có bộ chọn `{n:một|nhiều}`; render n=1 và
   n=5 phải khác nhau đúng dạng — pluralization sai đỏ (luật 5 của
   `plural-copy.mjs`: cấm "× 1 reps").
4. Fixture a11y: template phải chứa **placeholder động** `{…}` — label VoiceOver
   tĩnh cho control có nội dung động đỏ.
5. Fixture "dài": chuỗi render ở **cả 3 locale** phải ≥ ngưỡng `minLen` — fixture
   dài mà ngắn thì vô nghĩa, không đo được clipping/truncation, đỏ.
6. Fixture `data` (tên dài, số lớn, tạ thập phân): literal cố định, quét mã nguồn
   tệp data cấm `Date()` / `Math.random` / UUID — không deterministic đỏ.

## Demo fixture cố tình sai (rồi restore)

#370 đòi "ít nhất một fixture/assertion cố tình sai được demo rồi restore".
Cổng chạy **4 phép thử ngược** trên bản sao trong bộ nhớ, mỗi phép phải đỏ đúng
chỗ dự đoán, rồi vứt bản hỏng (dữ liệu thật không bị đụng):

| # | Bản hỏng | Phải đỏ |
|---|----------|---------|
| a | Xoá locale `es` của khoá `nRepsN` | `thiếu localization` ở `workout-reps-plural` |
| b | Lột bộ chọn `{n:rep\|reps}` khỏi template en | `pluralization sai` ở `workout-reps-plural` |
| c | Tĩnh hoá pattern a11y thành `"Set row"` | `thiếu nội dung động` ở `workout-set-a11y` |
| d | Rút fixture tên dài còn `"Ngắn"` | `fixture "dài" mà ngắn` ở `today-long-template-name` |

Đã verify bằng tay: đổi khoá `nRepsN` thành khoá không tồn tại → cổng đỏ
`thiếu localization` ở cả 3 locale; restore lại → xanh.

## Bảng scenario (con người đọc)

### Today

| Scenario | en | vi | es |
|----------|----|----|----|
| Long template name | "Very Long Workout Template Name That Wraps Past The Card Edge" | "Tên buổi tập rất dài sẽ xuống dòng và không được cắt mất ở mép thẻ" | "Nombre de plantilla muy largo que se ajusta sin cortarse en el borde" |
| Day status (`nDayDone`) | "trained" | "đã tập" | "entrenado" |
| Plural sessions (`nSessionCount`) | "1 session logged" / "5 sessions logged" | "Đã ghi 1 buổi tập" / "Đã ghi 5 buổi tập" | "1 sesión registrada" / "5 sesiones registradas" |

### Workout

| Scenario | Value |
|----------|-------|
| Large weight | 999.5 kg |
| Decimal | 62.5 kg |
| Plural reps (`nRepsN`) | "1 rep" / "8 reps" (en/es có bộ chọn, vi giữ nguyên) |
| Set row a11y pattern | "{exercise}, {weight} kg × {reps} reps" — placeholder động bắt buộc |

### Rest

| Scenario | en | vi | es |
|----------|----|----|----|
| Set of (`nRestSetOf`) | "Set 2/4" | "Set 2/4" | "Serie 2/4" |
| Up next (`nRestNext`) | "Up next" | "Tiếp theo" | "Siguiente" |

### Finish / Summary

| Scenario | en | vi | es |
|----------|----|----|----|
| New PR (`nPrTitle`) | "New personal record" | "Kỷ lục mới" | "Nueva marca personal" |
| PR plural (`nPrTitleMany`, n=2/3) | "2 new records" | "2 kỷ lục mới" | "2 nuevas marcas" |
| Volume label (`nVolume`) | "Volume" | "Khối lượng" | "Volumen" |
| Volume values | 1,240 kg (số lớn) · 62.5 kg (thập phân) | | |

### Error / offline

| Scenario | en | vi | es |
|----------|----|----|----|
| Long error (`nCxNothingWrittenSession`) | "Could not delete this workout — it may have been deleted on another device" | "Không xoá được buổi tập — có thể nó đã được xoá ở thiết bị khác" | "No se pudo eliminar este entrenamiento — quizá se eliminó en otro dispositivo" |
| Offline (`nOffline`) | "Offline — showing saved data" | "Ngoại tuyến — đang hiển thị dữ liệu đã lưu" | "Sin conexión — mostrando datos guardados" |

## Dynamic Type

- Cổng `dynamic-type.mjs` (đã có): cấm tắt `allowFontScaling`, số trong hình có
  trần 1.6×.
- Ma trận này bổ sung: fixture "dài" ở cả 3 locale để màn hình/preview soi
  clipping ở cỡ chữ trợ năng lớn nhất.

## VoiceOver

- Pattern label cho control có nội dung động (set row, day cell, progress) bắt
  buộc có placeholder động — cổng kiểm tra ở mục 4.
- **NOT TESTED:** VoiceOver trên máy thật chưa đo — cần Kiệt hoặc thiết bị thật.

## TESTED

- `node tools/fixture-matrix.mjs` — xanh (14 fixture + 4 phép thử ngược).
- Các cổng localization tĩnh liên quan: `i18n.mjs`, `plural-copy.mjs`,
  `i18n-inline.mjs`, `i18n-orphans.mjs` — chạy cùng `tools/check.mjs`.
