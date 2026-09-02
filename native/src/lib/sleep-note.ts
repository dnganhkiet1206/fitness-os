/**
 * Chất lượng giấc ngủ tự chấm, dùng để NÓI chứ không để TÍNH.
 *
 * ── quyết định sản phẩm ──
 *
 * Người dùng nói ra: *"cái này không cần tính bất kì chỉ số gì mà chỉ dựa vào
 * đó để đưa ra nhận xét hoặc lời khuyên có cơ sở giúp người dùng ở trong
 * ringcard ở dashboard"*.
 *
 * Nên `sleep_quality` KHÔNG vào `computeReadiness` và không đổi một điểm nào.
 * `tools/sleep-note.mjs` canh đúng điều đó: nếu ai đó đưa nó vào engine thì
 * luật đỏ, vì mọi câu chữ ở đây đang nói với người dùng rằng điểm tính theo
 * thời lượng.
 *
 * ── lỗi nó sửa ──
 *
 * Trước bản này, ô chọn mặt cười 1–10 được lưu vào `sleep_logs.quality`, chiếu
 * sang `daily_logs.sleep_quality`, rồi KHÔNG NƠI NÀO ĐỌC. Quét cả `src/` chỉ
 * ra ba dòng, cả ba là type sinh tự động của Supabase. Người dùng chọn một
 * trong năm khuôn mặt mỗi sáng và nó không đổi gì, không hiện ở đâu — một ô
 * nhập chết, và một câu hỏi mà app không bao giờ dùng câu trả lời.
 *
 * ── vì sao nhận xét là phép SO, không phải phép đọc ──
 *
 * Nói lại con số người ta vừa tự chấm ("bạn thấy giấc ngủ 3/10") thì không
 * thêm gì cả — họ vừa gõ nó xong. Thứ họ chưa biết là chỗ mà cảm giác của họ
 * và phép đo KHÔNG khớp nhau, và đó mới là thông tin:
 *
 *   · ngủ đủ giờ mà vẫn thấy mệt  → thời lượng không phải thứ duy nhất
 *   · ngủ thiếu giờ mà thấy khoẻ  → điểm thấp là do GIỜ, không phải do bạn
 *
 * Hai câu ấy có cơ sở vì mỗi câu đứng trên hai con số cùng lúc. Các nhánh còn
 * lại là hai con số ĐỒNG Ý với nhau, và ở đó nhận xét chỉ xác nhận rồi thôi —
 * không bịa thêm một lời khuyên nào.
 *
 * ── ranh giới nó không bước qua ──
 *
 * Không chẩn đoán. "Ngủ đủ mà vẫn mệt" là một quan sát về hai con số; "bạn bị
 * ngưng thở khi ngủ" là một câu về y tế mà app không có cơ sở để nói, và
 * `readiness-explainer.tsx` đã ghi luật ấy cho cả thẻ: *"đây là ước lượng từ
 * dữ liệu bạn đã ghi, không phải chẩn đoán y tế"*.
 */

/** Khoá ngôn ngữ-trung tính; `i18n` dịch lúc vẽ, như mọi chuỗi khác của thẻ. */
export type SleepNoteKey =
  | 'aligned_good'
  | 'aligned_poor'
  | 'felt_worse_than_clock'
  | 'felt_better_than_clock';

export interface SleepNote {
  key: SleepNoteKey;
  /** Số phút thiếu so với mục tiêu, làm tròn — 0 khi không thiếu. */
  shortBy: number;
}

/**
 * Ngưỡng của thang 1–10 mà màn ghi thật sự dùng.
 *
 * `log-sleep.tsx` cho năm khuôn mặt, và chúng chia thang thành ba vùng chứ
 * không phải mười. Nên ngưỡng ở đây là ngưỡng của VÙNG, không phải một con số
 * chọn cho vừa: từ 7 trở lên là hai mặt cười, từ 4 trở xuống là hai mặt mệt, ở
 * giữa là mặt bình thường — và mặt bình thường không sinh ra nhận xét nào, vì
 * "tôi thấy bình thường" không mâu thuẫn với bất cứ phép đo nào.
 */
const FELT_GOOD = 7;
const FELT_POOR = 4;

/**
 * Đêm được coi là ĐỦ GIỜ khi đạt 95% mục tiêu.
 *
 * Không phải 100%: mục tiêu là một con số tròn người ta tự đặt (8 tiếng), và
 * bắt đúng 480 phút mới gọi là đủ thì một đêm 470 phút bị xếp cùng nhóm với
 * một đêm 300 phút. 95% của 8 tiếng là 456 phút — vẫn là một đêm đầy đủ theo
 * bất kỳ cách đọc nào.
 */
const ENOUGH = 0.95;

/**
 * Nhận xét cho đêm qua, hoặc `null` khi không có gì đáng nói.
 *
 * `null` ở ba ca, và cả ba đều cố ý: chưa ghi giấc ngủ, chưa chấm chất lượng,
 * hoặc đã chấm ở mức giữa. Một thẻ im lặng khi không có gì để nói thì đáng tin
 * hơn một thẻ luôn có một câu.
 */
export function sleepNote(input: {
  /** 1–10 tự chấm; `0`, `null` hay ngoài thang đều là "chưa chấm". */
  quality: number | null | undefined;
  /** phút ngủ đêm qua; `0` hay thiếu là "chưa ghi" */
  durationMin: number | null | undefined;
  /** mục tiêu của chính người dùng, phút */
  targetMin: number | null | undefined;
}): SleepNote | null {
  const q = Number(input.quality);
  const mins = Number(input.durationMin);
  const target = Number(input.targetMin);
  /* Chưa ghi đêm nào thì không có phép so nào để làm. `sleep_quality` được
     khởi tạo bằng 0 khi không có hàng giấc ngủ, nên 0 là "chưa chấm" chứ không
     phải "chấm 0 điểm" — thang bắt đầu từ 1. */
  if (!Number.isFinite(q) || q < 1 || q > 10) return null;
  if (!Number.isFinite(mins) || mins <= 0) return null;
  if (!Number.isFinite(target) || target <= 0) return null;

  const enough = mins >= target * ENOUGH;
  const shortBy = enough ? 0 : Math.round(target - mins);

  if (q >= FELT_GOOD) return { key: enough ? 'aligned_good' : 'felt_better_than_clock', shortBy };
  if (q <= FELT_POOR) return { key: enough ? 'felt_worse_than_clock' : 'aligned_poor', shortBy };
  /* Mặt ở giữa: không mâu thuẫn với phép đo nào, nên không có gì để nói thêm. */
  return null;
}

/**
 * Thang điểm chất lượng giấc ngủ mà NGƯỜI DÙNG tự chấm.
 *
 * ── vì sao là một hằng số, không phải một con số gõ ba lần ──
 *
 * Thang này từng được viết ở ba chỗ rời nhau: giá trị các mặt cười trong
 * `log-sleep.tsx` (2/4/6/8/10), mẫu số hiển thị ở `hero-pages.tsx`, và chuỗi
 * a11y trong `native-strings.ts`. Ba bản sao, và HAI trong ba đã sai:
 *
 *     hiển thị  `/100`   → điểm tối đa 10 đọc ra là "10 trên 100", gần bét
 *     a11y      `of 5`   → sai mẫu số cho người dùng trình đọc màn hình
 *
 * Người dùng bắt được cái thứ nhất vì nó làm hai thẻ trông như bất đồng dữ
 * liệu: thẻ Sẵn sàng ghi "SLEEP 90/100", thẻ Giấc ngủ ghi "CHẤT LƯỢNG 10/100".
 * Chúng không bất đồng — 90 là điểm app TÍNH từ thời lượng so với mục tiêu,
 * 10 là điểm bạn TỰ CHẤM — nhưng cái mẫu số sai làm chúng trông như thế.
 *
 * Đừng đọc số này thay cho `sleep_score`: hai đại lượng khác nhau, và gộp
 * chúng lại là cách sinh ra đúng sự nhầm lẫn ở trên.
 */
export const SLEEP_QUALITY_MAX = 10;
