import type { VolumeUnit } from '@/lib/units';

/**
 * Ba lượng nước bấm một phát là xong: một cốc, một chai, một chai lớn.
 *
 * ── vì sao là một tệp riêng ──
 *
 * Ba con số này giờ hiện ở HAI chỗ: màn `/water`, và thẻ Nước uống trên
 * Dashboard/Dinh dưỡng. Chép sang là mở đúng cái cửa mà phiên này đã bước vào
 * năm lần — đổi một vế của một cặp rồi quên vế kia. Ở đây hậu quả không phải
 * lệch màu mà là LỆCH DỮ LIỆU: thẻ ghi 300ml, màn chi tiết ghi 250ml, và người
 * dùng không có cách nào biết cái nào đúng.
 *
 * Đổi preset là đổi ở một dòng, và cả hai chỗ đi theo.
 *
 * ── vì sao ml và oz không quy đổi lẫn nhau ──
 *
 * 250ml là 8.45oz. Không ai bấm "8.45". Mỗi hệ đơn vị có bộ số TRÒN của riêng
 * nó, nên đây là hai danh sách được chọn, không phải một danh sách nhân với
 * 0.0338.
 */
const WATER_QUICK: Record<VolumeUnit, readonly number[]> = {
  ml: [250, 500, 750],
  oz: [8, 12, 16],
};

/** Lượng thêm nhanh, tính theo đơn vị đang hiển thị (chưa đổi sang ml). */
export function waterQuickAmounts(unit: VolumeUnit): readonly number[] {
  return WATER_QUICK[unit];
}
