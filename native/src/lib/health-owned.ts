/**
 * Chỉ số nào Apple Health đã cung cấp — và vì thế không được nhập tay mới.
 *
 * ── luật ──
 *
 * Khi Apple Health đã đưa một chỉ số cho hôm nay, người dùng không dựng thêm
 * một con số thứ hai cho cùng đại lượng ấy. Họ SỬA con số Health đã đưa, và
 * trước khi lưu app hỏi lại một lần.
 *
 * Lý do là thứ đã hỏng ở chỗ khác trong repo này: hai nguồn ghi cùng một đại
 * lượng thì sinh ra hai chuỗi số, và một đường trung bình dựng từ hai chuỗi
 * khác nhau thì không còn nói về cơ thể ai cả. Migration
 * `20260809120000_health_provenance` viết hẳn một trang về đúng chuyện ấy khi
 * SDNN của Apple và RMSSD người dùng gõ vào cùng nằm trong một cột, dưới số
 * hạng NẶNG NHẤT của điểm sẵn sàng.
 *
 * ── vì sao SỬA được chứ không khoá cứng ──
 *
 * Health sai thì phải có đường chữa. Và bản sửa ấy tự động thắng ở lần đồng bộ
 * sau: `use-health-sync` đã có luật "một đêm ai đó đã ghi tay thì để yên", nên
 * một hàng chuyển sang `manual` sẽ không bị đồng bộ ghi đè. Hộp thoại xác nhận
 * là chỗ nói ra điều đó, chứ không phải một câu hỏi lịch sự.
 *
 * ── vì sao HRV và VO2max KHÔNG nằm trong danh sách ──
 *
 * `hrv_rmssd_ms` và `hrv_sdnn_ms` là HAI đại lượng khác nhau, không quy đổi
 * được, và migration trên đã cố ý TÁCH chúng thành hai cột: Apple chỉ công bố
 * SDNN, còn ô nhập tay ghi RMSSD. Chúng không tranh nhau một chỗ, nên khoá ô
 * HRV lại là dựng một xung đột không tồn tại — và tệ hơn, là chặn đúng con số
 * mà người dùng đo bằng dây đeo khác.
 *
 * `vo2max_mlkgmin` thì `lib/health.ts` không đọc, nên Health chưa từng cung
 * cấp nó.
 *
 * Danh sách này phải khớp với thứ `use-health-sync` THẬT SỰ ghi —
 * `tools/health-owned.mjs` đọc ngược ra khỏi tệp ấy và so, nên thêm một cột
 * vào đường đồng bộ mà quên khai ở đây sẽ làm bước gác đỏ.
 */
import { MANUAL_SOURCE } from '@/lib/biometric-source';

/** Cột sinh trắc mà CẢ Apple Health lẫn ô nhập tay cùng ghi. */
export const HEALTH_OWNED_BIOMETRICS = ['hr_bpm', 'spo2_pct', 'resp_rate_rpm'] as const;
export type HealthOwnedBiometric = (typeof HEALTH_OWNED_BIOMETRICS)[number];

/**
 * Hàng này có phải do một nguồn NGOÀI người dùng ghi không.
 *
 * Dùng lại đúng ranh giới `biometric-source.ts` đã vạch: `manual` là một nguồn
 * thật và vẫn không phải một kết nối; chuỗi rỗng không phải nguồn; còn một
 * nguồn lạ thì vẫn là một nguồn. Không dựng bản thứ hai của luật ấy ở đây.
 */
export function fromHealth(row: { source?: string | null } | null | undefined): boolean {
  const s = (row?.source ?? '').trim();
  return s !== '' && s !== MANUAL_SOURCE;
}

/**
 * Những cột Health THẬT SỰ trả lời, kèm số của nó.
 *
 * Một cột Health không có gì thì không xuất hiện ở đây, và đó là khác biệt có
 * thật: "Health không đo được nhịp thở của bạn" không phải "nhịp thở của bạn
 * bằng 0". Cùng luật mà `use-health-sync` đã theo khi nó bỏ hẳn trường ra
 * khỏi object thay vì ghi 0.
 */
export function healthValues<K extends string>(
  row: (Partial<Record<K, number | string | null>> & { source?: string | null }) | null | undefined,
  fields: readonly K[],
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  if (!fromHealth(row) || !row) return out;
  for (const f of fields) {
    const v = Number(row[f]);
    if (Number.isFinite(v) && v > 0) out[f] = v;
  }
  return out;
}

/**
 * Người dùng có đang ĐỔI một con số của Health không.
 *
 * Chỉ đếm những ô Health có số VÀ người dùng gõ khác đi. Gõ lại đúng số cũ
 * không phải một lần ghi đè, nên không đáng một hộp thoại — hỏi lại khi không
 * có gì đổi là cách nhanh nhất dạy người ta bấm "Đồng ý" mà không đọc.
 */
export function overriddenFields<K extends string>(
  owned: Partial<Record<K, number>>,
  typed: Partial<Record<K, number | null>>,
): K[] {
  const out: K[] = [];
  for (const k of Object.keys(owned) as K[]) {
    const t = typed[k];
    if (t == null || !Number.isFinite(Number(t))) continue;
    if (Number(t) !== owned[k]) out.push(k);
  }
  return out;
}
