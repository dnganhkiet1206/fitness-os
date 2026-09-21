import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { PARALLAX, TIMING } from '@/constants/onboarding-motion';

/**
 * Hai tấm, một tiến trình — cú chuyển màn của onboarding.
 *
 * ── vì sao KHÔNG dùng `entering`/`exiting` ──
 *
 * Bản đầu của Giai đoạn 4 viết hai hàm layout animation của riêng nó để có
 * được quãng parallax 30%. Chạy trên bản dựng thật thì runtime nói thẳng:
 *
 *     [Reanimated] Couldn't load entering/exiting animation. Current version
 *     supports only predefined animations with modifiers: duration, delay,
 *     easing…
 *
 * Trên web chúng bị VỨT kèm cảnh báo ấy, mỗi lần chuyển màn một lần. Phép đo ra
 * `dịch 0` ở mọi mốc — tức không có gì để duyệt, và không có gì để đo. Trên iOS
 * chúng sẽ chạy, nhưng "chạy ở chỗ tôi không đo được" không phải một kết luận.
 *
 * Nên chuyển cảnh thôi đi qua layout animation. Hai tấm cùng có mặt, một shared
 * value chạy 0→1, hai `useAnimatedStyle` đọc nó. Cùng một hành vi ở cả hai nền,
 * đo được ở cả hai, và quãng parallax là một phép nhân chứ không phải một thứ
 * phải xin thư viện.
 *
 * ── vì sao `dir` và `cross` là SHARED VALUE, không phải tham số ──
 *
 * Chúng được đặt trong `hop()` NGAY TRƯỚC khi màn đổi, và style đọc chúng lúc
 * worklet chạy. Một tham số thường sẽ mang giá trị của lần render trước — tức
 * chiều cũ và chế độ cũ — nên bấm Quay lại sẽ lùi sai hướng, và cặp màn dùng
 * chung cây thước sẽ đẩy thay vì crossfade.
 */
export function useStageMotion<K extends string>({
  screenW,
  dirSV,
  crossSV,
}: {
  screenW: number;
  /** +1 đi tới, −1 lùi lại. */
  dirSV: SharedValue<number>;
  /** 1 nếu hai màn dùng chung một dụng cụ — khi ấy KHÔNG một điểm dịch nào. */
  crossSV: SharedValue<number>;
}) {
  /** 0 = vừa bắt đầu, 1 = đã xong. Mở màn ở 1 nên lần vẽ đầu đứng yên. */
  const t = useSharedValue(1);
  /** 1 nếu màn ĐANG TỚI tự mang cú đến của nó (màn 11). */
  const ownSV = useSharedValue(0);
  const [outKey, setOutKey] = useState<K | null>(null);
  const clear = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(
    (from: K, toOwn: boolean) => {
      ownSV.value = toOwn ? 1 : 0;
      setOutKey(from);
      t.value = 0;
      t.value = withTiming(1, TIMING);
      if (clear.current) clearTimeout(clear.current);
      /*
        Tấm ĐI được tháo sau khi cú chuyển xong. Cộng thêm một quãng nhỏ vì
        `withTiming` kết thúc ở khung hình đầu tiên SAU mốc, và tháo sớm một
        khung là thấy nó biến mất giữa đường.
      */
      clear.current = setTimeout(() => setOutKey(null), TIMING.duration + 60);
    },
    [ownSV, t],
  );

  /* Hẹn giờ phải chết cùng màn hình — cùng lý do đã ghi ở `use-scale-wake`. */
  useEffect(
    () => () => {
      if (clear.current) clearTimeout(clear.current);
    },
    [],
  );

  const inFace = useAnimatedStyle(() => {
    if (ownSV.value) return { opacity: 1, transform: [{ translateX: 0 }] };
    const cross = crossSV.value === 1;
    return {
      opacity: cross ? t.value : 1,
      transform: [{ translateX: cross ? 0 : (1 - t.value) * dirSV.value * screenW }],
    };
  });

  const outFace = useAnimatedStyle(() => {
    const cross = crossSV.value === 1;
    return {
      opacity: cross ? 1 - t.value : 1,
      transform: [{ translateX: cross ? 0 : -t.value * dirSV.value * screenW * PARALLAX }],
    };
  });

  return { inFace, outFace, outKey, run };
}
