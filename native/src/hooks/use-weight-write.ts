import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useLogWeight } from '@/hooks/use-fitness-data';
import { useUnits } from '@/hooks/use-units';
import { localDateStr } from '@/lib/local-date';
import { offlineNow } from '@/lib/offline';
import { OFFLINE_WRITE_KEY, type OfflineWrite } from '@/lib/offline-write';
import { BOUNDS, plausible } from '@/lib/plausible';
import { toast } from '@/lib/toast';
import { displayWeight, weightLabel } from '@/lib/units';

/**
 * Đường GHI cân nặng — một bản duy nhất cho cả app.
 *
 * ── vì sao nó là một hook chứ không nằm trong màn hình ──
 *
 * Chỗ NHẬP đã đổi hai lần: từ ô trong thẻ Cân nặng, sang ô trong dòng To-do,
 * rồi sang màn `/log-weight`. Đường GHI thì không đổi lần nào, và nó là phần
 * khó: quy đổi kg/lb, ngưỡng hợp lý áp lên giá trị SẼ ĐƯỢC LƯU, và đường ghi
 * offline có `mutationKey` bền.
 *
 * Chú thích cũ của `weight-entry.tsx` nói thẳng cái giá của việc chép nó:
 * *"Bản thứ hai của đoạn ấy sẽ trôi, và nó trôi ở chỗ mất dữ liệu."* Nên khi
 * giao diện nhập bị thay, phần này KHÔNG được viết lại — nó chuyển nguyên vẹn
 * sang đây, kèm nguyên biên bản bên dưới.
 */
export function useWeightWrite() {
  const i18n = useI18n();
  const { weight: wUnit } = useUnits();
  const logWeight = useLogWeight();
  const { user } = useAuth();
  /* The durable twin — no local `mutationFn`, because what comes back from
     storage after a restart is the default registered in `offline-write`. */
  const queue = useMutation<void, Error, OfflineWrite>({ mutationKey: [...OFFLINE_WRITE_KEY] });

  /*
    ── checked in kg, chosen in whatever they use ──

    Người dùng chọn số theo ĐƠN VỊ HIỂN THỊ, nên 300 là một cân nặng hợp lý
    tính bằng pound (136 kg) và một con số bất khả tính bằng kilogram. Đo cái
    số hiển thị bằng thang kg sẽ từ chối một lần cân THẬT của bất kỳ ai dùng
    lb — tệ hơn chính lỗi đang chữa. Nên phép quy đổi xảy ra TRƯỚC, và ngưỡng
    áp lên giá trị sẽ thật sự được lưu.

    Cái nó KHÔNG làm được, và phải biết: 175 với một người 75 kg vẫn lọt, vì
    175 kg là cân nặng một người có thể có. Lỗi gõ ấy là việc của nút xoá
    trong lịch sử cân nặng. Thứ nó chặn là dấu thập phân trượt và sai đơn vị —
    và cân nặng là đầu vào có cái đuôi dài nhất: nó chạy qua dải BMI, qua thang
    của biểu đồ, và qua phép khớp bình phương tối thiểu của `adaptiveTDEE`, thứ
    không có phòng vệ ngoại lai nào mà nay đặt ra mục tiêu calo gợi ý.
  */
  const boundError = (kg: number | null): string | null => {
    if (kg == null || kg <= 0) return null;
    if (plausible('weight_kg', kg)) return null;
    return i18n.outOfRange
      .replace('{min}', String(displayWeight(BOUNDS.weight_kg.min, wUnit)))
      .replace('{max}', String(displayWeight(BOUNDS.weight_kg.max, wUnit)))
      .replace('{unit}', weightLabel(wUnit));
  };

  /*
    ── offline, down the durable pipe; and either way it says what happened ──

    Two faults met in this one line. Fired offline the mutation paused, the
    tile sat in its editing state for ever, and the paused write was restored
    on the next launch with no `mutationFn` registered for its key and
    dropped — a weigh-in silently gone. And online, a rejected write had no
    `onError` at all, so the field simply closed as though it had worked.

    Weight is not a cosmetic number here: `adaptiveTDEE` runs a least-squares
    regression over fourteen days of it to suggest a calorie target.

    `kind: 'weight'` and its handler have been in `lib/offline-write.ts` since
    that file was written, with nothing ever producing one.
  */
  const submit = (kg: number, onDone?: () => void) => {
    if (kg <= 0 || boundError(kg)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (offlineNow() && user) {
      /* Đóng ở đây chứ không trong callback: một mutation bị tạm dừng không bao
         giờ gọi callback nào — đúng cái lỗi đang được chữa. */
      onDone?.();
      queue.mutate({ kind: 'weight', userId: user.id, kg, date: localDateStr() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.success(i18n.logMealQueued);
      return;
    }
    logWeight.mutate(kg, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onDone?.();
      },
      onError: (e: Error) => toast.fail(e),
    });
  };

  /*
    `queue.isSuccess` nằm trong này chứ không chỉ `isPending`: ghi offline xong
    là xong, và nút phải chết luôn — không thì cú chạm thứ hai xếp thêm một lần
    cân nữa vào hàng đợi bền, và lần ấy sẽ chạy thật lúc có mạng.
  */
  const pending = logWeight.isPending || queue.isPending || queue.isSuccess;

  return { submit, boundError, pending };
}
