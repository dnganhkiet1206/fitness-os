import { View } from 'react-native';

import { MascotFigure } from '@/components/ascnd/mascot-figure';
import { usePalette } from '@/hooks/use-palette';
import { DEFAULT_MASCOT_ID, getMascot } from '@/lib/mascots';

/**
 * Ảnh đại diện cộng đồng = LINH VẬT người ấy chọn.
 *
 * Không có ảnh tải lên ở giai đoạn này (chủ dự án chọn "chỉ thẻ dựng từ dữ
 * liệu"), và đó không phải chỗ thiếu mà là bản sắc: ASCND đã có một dàn nhân
 * vật người dùng mở khoá bằng việc tập, nên cái mặt đại diện cho họ trước
 * cộng đồng là thứ họ KIẾM được. Nó cũng gỡ nguyên một lớp rủi ro kiểm duyệt
 * ảnh (App Store 1.2).
 *
 * Đứng yên (`animated={false}`): một feed ba mươi bài là ba mươi vòng lặp
 * chạy sau lưng một danh sách cuộn — cùng lý do hàng linh vật bên Cài đặt chỉ
 * cho con đang được chọn cử động.
 *
 * ── cắt vào MẶT, không thu cả thân ──
 *
 * Bản đầu đặt cả con vật vào giữa vòng tròn ở 80% đường kính. Đo trên bản
 * dựng 24/09: ở 40 điểm nó là một hình người tí hon, và tai Koa lòi ra khỏi
 * vòng — khung của Koa là 240×300, của các rig vector là 240×350, tức luôn
 * CAO hơn rộng, nên căn giữa theo chiều dọc là tràn cả trên lẫn dưới.
 *
 * Nên hình được phóng lên `ZOOM` × đường kính và đặt tuyệt đối, đỉnh nhô lên
 * `LIFT` × đường kính: phần lọt vào vòng là đầu và vai. Tâm đầu nằm ở ~30%
 * chiều cao khung ở cả hai kiểu rig, tức ~0,42–0,43 đường kính tính từ đỉnh
 * vòng — gần đúng tâm, và vòng `overflow: hidden` cắt phần còn lại.
 */
const ZOOM = 1.25;
const LIFT = 0.08;
export function CommunityAvatar({ mascotId, size = 40 }: { mascotId: string | null | undefined; size?: number }) {
  const c = usePalette();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.secondary,
        overflow: 'hidden',
      }}>
      <View style={{ position: 'absolute', top: -size * LIFT, left: (size - size * ZOOM) / 2 }}>
        <MascotFigure mascot={getMascot(mascotId ?? DEFAULT_MASCOT_ID)} size={Math.round(size * ZOOM)} animated={false} />
      </View>
    </View>
  );
}
