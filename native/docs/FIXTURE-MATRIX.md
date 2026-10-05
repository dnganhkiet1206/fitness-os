# Fixture Matrix — en/vi/es + Dynamic Type

Ma trận fixture cho localization và accessibility testing.

## Today

| Scenario | en | vi | es |
|----------|----|----|----|
| todo | "Chest – Shoulders – Arms" | "Ngực – Vai – Tay" | "Pecho – Hombros – Brazos" |
| Long name | "Very Long Workout Template Name That Wraps" | "Tên buổi tập rất dài sẽ xuống dòng" | "Nombre muy largo que se ajusta" |

## Workout

| Scenario | Value |
|----------|-------|
| Large weight | 999.5 kg |
| Decimal | 62.5 kg |
| Plural (1) | "1 set" / "1 hiệp" / "1 serie" |
| Plural (5) | "5 sets" / "5 hiệp" / "5 series" |

## Error messages

| Scenario | en | vi | es |
|----------|----|----|----|
| Long error | "Something went wrong. Please check your connection and try again." | "Có lỗi xảy ra. Vui lòng kiểm tra kết nối và thử lại." | "Algo salió mal. Revisa tu conexión e inténtalo de nuevo." |
| Offline | "You're offline — check your connection." | "Bạn đang offline — kiểm tra kết nối nhé." | "Sin conexión — revisa tu red." |

## Dynamic Type

- `.accessibility3` (XXXL) tested for all components
- VoiceOver labels include dynamic content (exercise names, counts)

## VoiceOver

| Control | Label pattern |
|---------|---------------|
| Day cell | "{day}, {status}" |
| Set row | "{exercise}, {weight} kg × {reps}" |
| Progress | "{exercise}, {done} of {total} sets, {pct}%" |
