import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ascnd/icon';
import { BOUNCE, duration, spring } from '@/constants/motion';

/**
 * Chuyển động của hàng hành động trên bài Cộng đồng (#160) — học từ X và Apple.
 *
 * ── thả tim ──
 *
 * X: trái tim nảy lên rồi về, một vòng sáng loé ra quanh nó và tắt, con số lăn.
 * Đó là khoảnh khắc DUY NHẤT trên thẻ bài được "diễn": cú chạm hay gặp nhất,
 * và là lời xác nhận rằng một người khác sẽ thấy nó. Mọi thứ khác trên hàng giữ
 * yên lặng.
 *
 *   · bật (thích / lưu): nảy bằng lò xo có vượt đích (`BOUNCE.bouncy`), vòng
 *     sáng chỉ ở trái tim;
 *   · tắt (bỏ thích / bỏ lưu): co nhẹ rồi về, không nổ — gỡ một việc không
 *     phải một khoảnh khắc;
 *   · số đếm lăn LÊN khi tăng, XUỐNG khi giảm, như bộ đếm của X.
 *
 * Chỉ `transform` và `opacity` (`tools/motion.mjs` luật 1), và chỉ chạy khi
 * `on` thật sự ĐỔI — lần dựng đầu, một thẻ cuộn vào màn với tim đã đỏ, không
 * nảy. Reduce Motion: không nảy, không vòng sáng, không lăn — màu và con số
 * vẫn đổi ngay, nên lời xác nhận không mất.
 *
 * Chuyển động không bao giờ chặn thao tác: bấm lại giữa chừng thì lò xo đổi
 * đích từ chỗ nó đang đứng.
 */
export function PopIcon({
  icon,
  size,
  color,
  on,
  burst = false,
}: {
  icon: React.ComponentProps<typeof Icon>['icon'];
  size: number;
  color: string;
  on: boolean;
  /** Vòng sáng khi bật — chỉ trái tim, khoảnh khắc chính. */
  burst?: boolean;
}) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const ring = useSharedValue(0);
  const was = useRef(on);

  useEffect(() => {
    if (was.current === on) return;
    was.current = on;
    if (reduce) return;
    if (on) {
      /* Co về 0.8 NGAY dưới ngón tay (một khung hình), rồi lò xo bung ra có
         vượt đích — cú "nén rồi bật" của X, không cần một nhịp thời gian riêng. */
      scale.value = 0.8;
      scale.value = withSpring(1, spring(0.35, BOUNCE.bouncy));
      if (burst) {
        ring.value = 0;
        ring.value = withTiming(1, { duration: duration.swap });
      }
    } else {
      scale.value = 0.88;
      scale.value = withSpring(1, spring(0.25, BOUNCE.smooth));
    }
  }, [on, reduce, burst, scale, ring]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value > 0 && ring.value < 1 ? 0.55 * (1 - ring.value) : 0,
    transform: [{ scale: 0.5 + ring.value * 1.1 }],
  }));

  return (
    <View style={{ width: size, height: size }}>
      {burst ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { width: size * 1.6, height: size * 1.6, left: -size * 0.3, top: -size * 0.3, borderRadius: size, borderColor: color }, ringStyle]}
        />
      ) : null}
      <Animated.View style={iconStyle}>
        <Icon icon={icon} size={size} color={color} fill={on ? color : undefined} />
      </Animated.View>
    </View>
  );
}

/**
 * Con số lăn: số cũ trượt ra, số mới trượt vào, theo chiều của thay đổi.
 *
 * Hai lớp chữ chồng nhau trong một khung cắt cao đúng một dòng; khung rộng theo
 * số DÀI hơn trong hai số (cả hai cùng nằm trong dòng chảy, một lớp vô hình),
 * nên 99 → 100 không làm hàng nút nhảy ngang giữa chừng.
 */
export function RollingCount({ value, style }: { value: number; style: StyleProp<TextStyle> }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState({ now: value, prev: value, dir: 0 });
  const t = useSharedValue(1);

  useEffect(() => {
    if (value === shown.now) return;
    const dir = value > shown.now ? 1 : -1;
    setShown({ now: value, prev: shown.now, dir });
    if (reduce) {
      t.value = 1;
      return;
    }
    t.value = 0;
    t.value = withSpring(1, spring(0.3, BOUNCE.smooth));
  }, [value, shown.now, reduce, t]);

  const H = 18;
  const nowStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (1 - t.value) * H * shown.dir }],
  }));
  const prevStyle = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [{ translateY: -t.value * H * shown.dir }],
  }));

  const wide = String(shown.now).length >= String(shown.prev).length ? shown.now : shown.prev;
  return (
    <View style={styles.roll}>
      {/* Giữ bề rộng: số dài hơn trong hai, vô hình, trong dòng chảy. */}
      <Text style={[style, styles.ghost]} accessible={false}>{wide}</Text>
      {shown.dir !== 0 ? (
        <Animated.Text style={[style, styles.layer, prevStyle]} accessible={false}>{shown.prev}</Animated.Text>
      ) : null}
      <Animated.Text style={[style, styles.layer, nowStyle]} accessible={false}>{shown.now}</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 2 },
  roll: { overflow: 'hidden' },
  ghost: { opacity: 0 },
  layer: { position: 'absolute', left: 0, top: 0 },
});
