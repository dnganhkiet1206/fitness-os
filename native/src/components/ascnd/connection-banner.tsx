import { CloudOff, RefreshCw } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { colors, type } from '@/constants/ascnd';
import { duration } from '@/constants/motion';
import { useI18n } from '@/hooks/use-app-settings';
import { useNetStatus } from '@/hooks/use-online-status';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { retryNow } from '@/lib/net-status';

/**
 * Dải trạng thái kết nối, ghim dưới thanh trạng thái.
 *
 * ── vì sao nó không còn là "offline banner" ──
 *
 * Bản cũ có đúng hai trạng thái: hiện khi mất mạng, ẩn khi có. Cái nó không nói
 * được là khoảng ở giữa — mạng vừa về, app đang tải lại phần đã lỡ, và những gì
 * trên màn hình vẫn là dữ liệu cũ. Ẩn dải báo ngay lúc ấy là nói rằng mọi thứ
 * đã xong trong khi chưa; giữ nguyên câu "ngoại tuyến" là nói rằng vẫn chưa có
 * mạng trong khi đã có. Cả hai đều sai, nên phải có trạng thái thứ ba.
 *
 * ── và vì sao nó nhận được chạm ──
 *
 * Bản cũ là `pointerEvents="none"`: một câu thông báo, không phải một chỗ để
 * làm gì. Nhưng "mất mạng" là trạng thái duy nhất trong app mà người dùng có
 * thể tự thoát ra — bật lại Wi-Fi, đi ra chỗ có sóng — và họ cần một chỗ để nói
 * "xong rồi, thử lại đi" mà không phải khởi động lại app.
 *
 * Nút chỉ có ở nhánh mất mạng. Lúc đang kết nối lại thì app đã đang làm đúng
 * việc ấy rồi, và một nút "thử lại" cạnh dòng chữ "đang kết nối lại" là mời
 * người ta giục một việc đang chạy.
 */
export function ConnectionBanner() {
  const status = useNetStatus();
  const insets = useSafeAreaInsets();
  const i18n = useI18n();

  if (status === 'online') return null;

  const offline = status === 'offline';
  const tone = offline ? colors.readinessYellow : colors.metricBlue;

  return (
    <Animated.View
      /* Cả hai đều lấy từ `duration`, không gõ số. Bản đầu tôi viết 160 cho
         nhánh ra — một con số ngoài thang, và `tools/motion.mjs` bắt đúng nó:
         "đặt tên cho một con số không làm nó thoát khỏi thang nhịp". Dải này
         là một thứ VỪA XUẤT HIỆN chứ không phải một mặt phẳng đổi nội dung,
         nên `appear` là ô của nó ở cả hai chiều. */
      entering={FadeIn.duration(duration.appear)}
      exiting={FadeOut.duration(duration.appear)}
      style={[
        styles.banner,
        { paddingTop: insets.top + 4, backgroundColor: tint(tone, 0.14), borderBottomColor: tint(tone, 0.35) },
      ]}
      /* Chỉ nhánh mất mạng mới có gì để chạm. Nhánh kia trả lại đường chạm cho
         trang bên dưới thay vì nuốt nó bằng một dải chỉ để đọc. */
      pointerEvents={offline ? 'box-none' : 'none'}>
      <View style={styles.row}>
        {offline ? (
          <Icon icon={CloudOff} size={13} color={tone} />
        ) : (
          <SpinningIcon color={tone} />
        )}
        <Text style={[styles.text, { color: tone }]} numberOfLines={1}>
          {offline ? i18n.nOffline : i18n.nReconnecting}
        </Text>
        {offline ? (
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.nRetry}
            onPress={() => {
              void retryNow();
            }}
            /* `hitSlop` chứ không phải đệm to hơn: dải này nằm ngay dưới thanh
               trạng thái và mỗi điểm chiều cao thêm vào là một điểm đẩy cả
               trang xuống. Vùng chạm lớn ra, ô chữ thì không. */
            hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
            style={[styles.retry, { borderColor: tint(tone, 0.4) }]}>
            <Text style={[styles.retryText, { color: tone }]}>{i18n.nRetry}</Text>
          </PressScale>
        ) : null}
      </View>
    </Animated.View>
  );
}

/**
 * Vòng quay của nhánh "đang kết nối lại".
 *
 * Một vòng quay đều, không phải nhịp thở của skeleton: hai thứ nói hai điều
 * khác nhau. Skeleton thở để nói "chỗ này sắp có nội dung"; cái này quay để nói
 * "đang có việc chạy". Dùng chung một chuyển động cho cả hai thì người dùng
 * không đọc ra được cái nào đang xảy ra.
 *
 * Tắt Reduce Motion thì đứng yên — biểu tượng vẫn còn, và dòng chữ bên cạnh đã
 * nói đủ. Một chuyển động vô hạn là thứ Reduce Motion tồn tại để tắt.
 */
function SpinningIcon({ color }: { color: string }) {
  const spin = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      spin.value = 0;
      return;
    }
    spin.value = withRepeat(withTiming(360, { duration: 1100, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [reduceMotion, spin]);

  const anim = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  return (
    <Animated.View style={anim}>
      <Icon icon={RefreshCw} size={12} color={color} />
    </Animated.View>
  );
}

/**
 * Một màu tín hiệu của app, pha loãng ra làm nền và viền.
 *
 * Nền và viền của dải này phải là CHÍNH màu chữ ở độ mờ thấp, không phải hai
 * giá trị chọn tay cạnh nó. Bản cũ viết thẳng `rgba(255,217,61,0.14)` và
 * `rgba(255,217,61,0.35)` — đúng bằng `readinessYellow` pha loãng, nhưng viết
 * dạng đã pha thì thêm nhánh thứ hai là phải chép tay lại đúng phép ấy cho một
 * màu khác, và đó là lúc bảng màu bắt đầu có bản sao. Xem `rest-timer.tsx`:
 * một tấm thẻ tự chọn màu riêng là cách app có nền tối thứ tư.
 */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  text: { ...type.caption, fontWeight: '600', flexShrink: 1 },
  retry: {
    marginLeft: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  retryText: { ...type.caption, fontWeight: '700' },
});
