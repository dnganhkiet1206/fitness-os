import { colors } from '@/constants/ascnd';
import type { AcwrZoneKey } from '@/lib/training-card';

/**
 * Màu của từng băng ACWR — MỘT bảng, cho mọi màn hình vẽ tỉ số này.
 *
 * ── lỗi nó sửa ──
 *
 * Chú thích đầu `lib/training-card.ts` liệt kê ba luật từng vẽ cùng một tỉ số,
 * và luật đầu tiên trong danh sách ấy là *"marker colour: >= 0.8 && <= 1.3
 * xanh, > 1.3 vàng, còn lại đỏ"*. Nó đã được gỡ khỏi thẻ tập luyện — và vẫn
 * sống nguyên, chép tay, trong `readiness-gauge.tsx`, nơi ô ACWR của thẻ điểm
 * sẵn sàng đọc nó. Hai băng sai, và một trong hai sai về phía nguy hiểm:
 *
 *     ACWR 2.0  (> 1.6, "nguy cơ quá tải")  thẻ tập luyện ĐỎ  · thẻ sẵn sàng VÀNG
 *     ACWR 0.7  (0.65–0.8, "tập hơi thưa")  thẻ tập luyện VÀNG · thẻ sẵn sàng ĐỎ
 *
 * Cùng một con số, hai màn hình, hai màu, đọc trong cùng một lần mở app.
 *
 * ── vì sao nó KHÔNG nằm cạnh `acwrZone` trong lib/ ──
 *
 * Đó là chỗ đúng về mặt ý nghĩa, và tôi đã thử đặt nó ở đó. Mười sáu bước của
 * `tools/check.mjs` hỏng ngay: chúng biên dịch từng tệp `lib/*.ts` một mình
 * bằng `npx tsc --ignoreConfig`, nơi alias `@/` không phân giải được. Không
 * một tệp nào trong `lib/` import `@/constants` — tôi đã grep ra con số 0 đó
 * trước khi sửa, đọc nó là "chưa ai cần", và nó thật ra là "không được".
 *
 * Nên bảng màu sống ở tầng component, còn `lib/` giữ nguyên phần không màu:
 * `acwrZone` quyết định số nào thuộc băng nào, `ACWR_BANDS` viết ra các mốc.
 * Ba mặt của một luật, hai tầng, và `tools/readiness-copy.mjs` là thứ giữ cho
 * không màn nào tự dựng mặt thứ tư.
 */
export const ACWR_TINT: Record<AcwrZoneKey, string> = {
  detraining: colors.readinessRed,
  low: colors.readinessYellow,
  optimal: colors.readinessGreen,
  elevated: colors.readinessYellow,
  spike: colors.readinessRed,
};
