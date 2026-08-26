import { supabase } from '@/integrations/supabase/client';

import { localDateStr, localDayRangeISO } from './local-date';

/**
 * Ghi lại một số đo trong CÙNG MỘT NGÀY là SỬA, không phải ghi thêm.
 *
 * ── quyết định sản phẩm này đến từ đâu ──
 *
 * Người dùng nói ra bằng chính lời của họ: *"nếu chưa qua ngày mới thì dữ liệu
 * nhập lại sẽ thay thế cho dữ liệu nhập trước đó trong cùng một ngày"*. Đây là
 * chỗ luật ấy sống, và nó ở `lib/` vì có ba đường ghi cần nó — màn giấc ngủ
 * ghi thẳng khi online, hàng đợi offline phát lại cùng bản ghi ấy, và toàn bộ
 * sinh trắc đi qua hàng đợi kể cả khi online.
 *
 * ── lỗi nó sửa ──
 *
 * `sleep_logs` không có ràng buộc duy nhất cho hàng nhập tay, và màn ghi làm
 * một `INSERT` thuần. Ghi nhầm một đêm rồi ghi lại là HAI hàng cho một đêm, và
 * hậu quả không dừng ở chỗ thừa một dòng:
 *
 *     sleepDebt7d = mục tiêu − (tổng phút / SỐ HÀNG)
 *
 * Một đêm sai ghi hai lần kéo trung bình bảy ngày xuống gấp đôi mức đáng lẽ, và
 * sai lệch ấy đi theo suốt một tuần mà không có gì trên màn hình nói ra. Với
 * sinh trắc thì hàng thừa làm lệch median và MAD của nền 28 ngày — nền mà chính
 * điểm HRV/nhịp nghỉ được chấm so với nó.
 *
 * ── vì sao giấc ngủ KHÔNG thay theo "cùng ngày" ──
 *
 * Vì giấc trưa. `sleep_logs` cố ý cho phép hai hàng trong một ngày, và một luật
 * "mỗi ngày một hàng" sẽ khiến ghi giấc trưa XOÁ mất đêm hôm đó — mất dữ liệu,
 * tệ hơn hẳn cái nó sửa.
 *
 * Nên phép so là CHỒNG LẤN THỜI GIAN, không phải cùng ngày lịch: ghi lại đúng
 * đêm ấy (23:00–07:00 sửa thành 23:30–07:15) thì hai khoảng chồng nhau và hàng
 * cũ được thay; một giấc trưa 14:00–16:00 không chồng vào đêm nào nên nó ở lại
 * là một hàng riêng. Đó đúng là ranh giới giữa "tôi gõ nhầm" và "tôi ngủ thêm".
 */

/** Hai khoảng thời gian có chạm nhau không. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Id của hàng giấc ngủ mà lần ghi này SỬA, hoặc `null` nếu đây là giấc mới.
 *
 * Chỉ xét các hàng kết thúc trong cùng ngày lịch với lần ghi mới — đó chính là
 * cách `daily-log-service` gom giấc ngủ về một ngày — rồi trong số đó lấy hàng
 * có khoảng thời gian chồng lấn.
 */
export async function sleepRowToReplace(
  userId: string,
  bedtime: string,
  waketime: string,
): Promise<string | null> {
  const wake = new Date(waketime);
  if (Number.isNaN(wake.getTime())) return null;
  const day = localDayRangeISO(localDateStr(wake));
  const { data, error } = await supabase
    .from('sleep_logs')
    .select('id, bedtime, waketime')
    .eq('user_id', userId)
    .gte('waketime', day.start)
    .lt('waketime', day.end);
  /* Không đọc được thì ghi như một hàng mới. Thà thừa một hàng người dùng xoá
     được còn hơn nuốt một lần ghi vì một truy vấn phụ hỏng. */
  if (error || !data) return null;

  const bed = new Date(bedtime).getTime();
  const woke = wake.getTime();
  for (const row of data) {
    const b = new Date(String(row.bedtime)).getTime();
    const w = new Date(String(row.waketime)).getTime();
    if (Number.isNaN(b) || Number.isNaN(w)) continue;
    if (overlaps(bed, woke, b, w)) return String(row.id);
  }
  return null;
}

/**
 * Id của hàng sinh trắc mà lần ghi này SỬA, hoặc `null`.
 *
 * Ở đây "cùng ngày" là đủ và không có ca giấc-trưa nào: một bộ số sinh trắc là
 * ẢNH CHỤP của buổi sáng hôm đó, nên nhập lại trong ngày là sửa ảnh chụp ấy.
 *
 * Chỉ thay hàng do người dùng TỰ NHẬP (`source = 'manual'`). Hàng đồng bộ từ
 * Apple Health thuộc về thiết bị, và ghi đè một phép đo của đồng hồ bằng một
 * con số gõ tay là làm mất dữ liệu người ta không hề xin xoá.
 */
export async function biometricRowToReplace(
  userId: string,
  dateTime: string,
): Promise<string | null> {
  const at = new Date(dateTime);
  if (Number.isNaN(at.getTime())) return null;
  const day = localDayRangeISO(localDateStr(at));
  const { data, error } = await supabase
    .from('biometric_samples')
    .select('id')
    .eq('user_id', userId)
    .eq('source', 'manual')
    .gte('date_time', day.start)
    .lt('date_time', day.end)
    .order('date_time', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return String(data[0].id);
}
