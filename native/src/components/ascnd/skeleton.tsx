import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { glass, radius, spacing } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import {
  HERO_DECK,
  heightFor,
  hydrateWidgetHeights,
  recordHeight,
  useWidgetHeightsVersion,
} from '@/lib/widget-heights';

/**
 * The shape of the page, while the page is still arriving.
 *
 * ── what this replaced ──
 *
 * Nothing. Today rendered its greeting and then, until `useDailyLog` resolved,
 * empty screen. On a warm cache that is a frame nobody sees; on a cold launch,
 * a slow network or a phone that just woke up, it is several seconds of an app
 * that looks like it failed to load.
 *
 * The widgets were hidden on purpose — see `widget-heights.ts` — and the fix is
 * not to unhide them. It is to occupy the space they are about to take, at the
 * size they are about to take it, so that when they arrive nothing moves.
 *
 * ── the pulse, and when there isn't one ──
 *
 * One opacity value, shared by every block on the page, breathing between 0.55
 * and 1 over three seconds. Opacity only, so it composites on the UI thread and
 * costs nothing per block; one driver, so twelve blocks do not run twelve
 * animations out of phase with each other, which reads as static rather than as
 * one surface.
 *
 * Under Reduce Motion there is no animation at all — the blocks sit at a fixed
 * opacity. A skeleton exists to say "this is loading", and it still says that
 * standing still. `cancelAnimation` on unmount for the same reason the aura
 * cancels: an animation nobody is looking at is a warm phone.
 */
function useBreath(): SharedValue<number> {
  const v = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      v.value = 0.8;
      return;
    }
    v.value = withRepeat(withTiming(0.55, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(v);
  }, [reduceMotion, v]);

  return v;
}

/** One block, at a height somebody has already measured. */
export function SkeletonBlock({ height, style }: { height: number; style?: object }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const opacity = useBreath();
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.block, { height }, anim, style]} />;
}

/**
 * Cùng một khối, nhưng ở chiều cao mà chính khối thật ĐÃ ĐO được lần trước.
 *
 * Cặp đôi với `<Measured id>` ngay dưới. Hai thứ phải dùng chung một `id`, và
 * đó là toàn bộ hợp đồng: cái thật báo nó cao bao nhiêu, cái bóng vẽ đúng bấy
 * nhiêu.
 */
export function SkeletonFor({ id, style }: { id: string; style?: object }) {
  return <SkeletonBlock height={heightFor(id)} style={style} />;
}

/**
 * Bọc quanh một khối THẬT để nó tự khai chiều cao.
 *
 * ── vì sao không gõ thẳng con số ──
 *
 * `widget-heights.ts` đã viết sẵn lập luận và tôi không định viết lại nó tệ
 * hơn: "Writing them down as constants means fifteen numbers that are right the
 * day they are typed and wrong the first time a card gains a row — and wrong
 * here means the exact page-jump the hiding was introduced to prevent."
 *
 * Một hằng số gõ tay đúng đúng một lần, vào ngày gõ. Thẻ thêm một dòng, đổi cỡ
 * chữ, đổi ngôn ngữ sang tiếng Anh dài hơn — con số ấy sai, và sai theo kiểu
 * không ai thấy cho tới khi trang giật dưới ngón tay. Cơ chế đo tự nó không
 * bao giờ lệch quá một lần dựng.
 *
 * Kho đo là kho có sẵn của Today, không phải kho thứ hai: `recordHeight` nhận
 * khoá bất kỳ, `HERO_DECK` chỉ là một khoá trong đó. Hai hệ thống đo chiều cao
 * trong một app là cách để chúng bắt đầu bất đồng.
 */
export function Measured({
  id,
  children,
  style,
}: {
  id: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style} onLayout={(e) => recordHeight(id, e.nativeEvent.layout.height)}>
      {children}
    </View>
  );
}

/**
 * Khung ngoài cho mọi bóng của một trang.
 *
 * Gom hai thứ mà mỗi chỗ dùng đều phải nhớ và sẽ có chỗ quên: kéo chiều cao đã
 * đo từ bộ nhớ lên, và giấu cả khối khỏi trình đọc màn hình. Lý do giấu nằm
 * nguyên trong `TodaySkeleton` bên dưới — một bóng là phát biểu về việc DỰNG
 * HÌNH, không phải về nội dung, và VoiceOver đọc mười hai cái hộp rỗng thì tệ
 * hơn là nó không đọc gì rồi đọc trang thật.
 */
export function SkeletonPage({ children }: { children: ReactNode }) {
  useWidgetHeightsVersion();
  useEffect(() => {
    hydrateWidgetHeights();
  }, []);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {children}
    </View>
  );
}

/**
 * Today's page, in outline.
 *
 * Built from the same config the real page renders, so a reordered dashboard is
 * still the right shape while it loads, and a widget somebody removed does not
 * leave a block waiting for it.
 */
/**
 * ── why this takes a `part` ──
 *
 * The two halves of Today are no longer next to each other. The readiness deck
 * moved to the top of the page and Koa and the four log buttons sit between it
 * and the grouped cards — and those two always render, loading or not.
 *
 * A skeleton drawn as one block therefore drew the deck's shape BELOW the
 * buttons, where the deck is not, and the page jumped when the day landed.
 * That is precisely the movement `widget-heights.ts` exists to prevent, so the
 * skeleton is placed the way the page is: the hero part where the hero is, the
 * groups part where the groups are.
 */
export function TodaySkeleton({
  part,
  heroWidgets,
  groups,
}: {
  part: 'hero' | 'groups';
  heroWidgets: string[];
  groups: { id: string; widgets: string[] }[];
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  /* Pulls the remembered heights in from storage and re-renders once they
     land — see the note in `widget-heights.ts` about the read arriving after
     the first frame. */
  useWidgetHeightsVersion();
  useEffect(() => {
    hydrateWidgetHeights();
  }, []);

  return (
    /* Not announced to a screen reader. A skeleton is a statement about
       rendering, not about content, and VoiceOver reading twelve empty boxes is
       worse than it reading nothing and then reading the page. */
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* One block, not one per hero: those cards are a deck now, and drawing
          the shape of two stacked cards where one deck will appear is exactly
          the page-jump this whole mechanism exists to avoid. */}
      {part === 'hero' && heroWidgets.length > 0 ? (
        <SkeletonBlock height={heightFor(HERO_DECK)} style={styles.stacked} />
      ) : null}
      {part === 'groups' && groups.map((group) => (
        <View key={group.id} style={styles.group}>
          {/* the group header's own row: an icon and a short title */}
          <SkeletonBlock height={18} style={styles.header} />
          {group.widgets.map((key) => (
            <SkeletonBlock key={key} height={heightFor(key)} />
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Khoá đo của ba tab còn lại.
 *
 * Ở một chỗ, và cả bóng lẫn khối thật đều đọc từ đây. Gõ chuỗi thẳng vào hai
 * nơi là cách để một bên đổi tên còn bên kia lặng lẽ rơi về `FALLBACK_HEIGHT` —
 * bóng vẫn vẽ, không có gì đỏ, chỉ là nó vẽ sai cỡ. Một hằng số chung thì hỏng
 * ở chỗ biên dịch chứ không hỏng trên màn hình người dùng.
 */
export const SK = {
  nutritionRing: 'nutrition:ring',
  workoutTemplates: 'workouts:templates',
  progressWeight: 'progress:weight',
  progressMeasurements: 'progress:measurements',
} as const;

/**
 * Tab Dinh dưỡng, phần đang chờ `daily_logs`.
 *
 * ── cái nó thay ──
 *
 * Vòng calo được vẽ từ `Math.round(Number(dailyLog?.kcal) || 0)`. Lúc đang tải
 * `dailyLog` là `undefined`, nên nó ra **0**, và thẻ lớn nhất màn hình hiện
 * "0 kcal / 2.200" — giống hệt một ngày chưa ăn gì.
 *
 * Lập luận vì sao thế là không được đã nằm sẵn trong `nutrition.tsx`, ngay trên
 * thẻ ấy, viết cho nhánh LỖI: "A wrong number with a warning beside it is still
 * a wrong number, and this one is the largest thing on the screen." Câu ấy đúng
 * y như vậy cho nhánh ĐANG TẢI, và nhánh đang tải thì chạy ở mọi lần mở app
 * nguội chứ không phải chỉ khi có sự cố.
 */
export function NutritionSkeleton() {
  /* MỘT khối, vì đúng một thẻ bị giữ lại.
     Mọi thứ dưới nó — bốn nút ghi, thẻ nước, danh sách bữa — không chờ
     `useDailyLog` và vẫn dựng bình thường. Vẽ bóng cho chúng là vẽ chỗ trống
     cho những thứ đang có mặt, và trang sẽ dài ra rồi co lại khi dữ liệu về. */
  return (
    <SkeletonPage>
      <SkeletonFor id={SK.nutritionRing} />
    </SkeletonPage>
  );
}

/**
 * Tab Tập luyện, phần đang chờ danh sách mẫu tập.
 *
 * Thay cho `EmptyState` "chưa có mẫu tập nào" kèm nút "Tạo mới" — lời mời dựng
 * lại những buổi tập đang có sẵn trên máy chủ, chỉ là chưa về tới.
 */
export function WorkoutsSkeleton() {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <SkeletonPage>
      <View style={styles.group}>
        <SkeletonBlock height={18} style={styles.header} />
        <SkeletonFor id={SK.workoutTemplates} />
      </View>
    </SkeletonPage>
  );
}

/**
 * Tab Tiến trình — một bóng cho mỗi tab con, vì mỗi tab con chờ một truy vấn
 * riêng và chỉ một trong hai hiện ra mỗi lúc.
 *
 * Đây là chỗ lời nói dối nặng nhất: `measurement` null → "Chưa có số đo" kèm
 * nút "Thêm số đo". Có cổng `isError` nhưng không có cổng `isPending`, nên
 * trạng thái đang tải rơi thẳng vào nhánh nói rằng người dùng KHÔNG CÓ dữ liệu
 * — về đúng những thứ họ đã bỏ công nhập.
 *
 * Đoạn này TỪNG kể thêm về tab "Ảnh" với cùng lỗi ấy. Tab đó đã thành một hàng
 * dẫn sang `/progress-photos`, nên câu đó thôi đúng và đã được gỡ cùng khoá
 * `progressPhotos` — một khoá không ai đo là một cái bẫy mang hình dạng một
 * tính năng đang chạy.
 */
export function ProgressSkeleton({ tab }: { tab: 'weight' | 'measurements' }) {
  const id =
    /* Hai nhánh, không phải ba: tab "Ảnh tiến trình" đã thành một hàng dẫn sang
       `/progress-photos`, nên không còn chỗ nào dựng bóng chờ cho nó. Giữ lại
       nhánh thứ ba là giữ một câu trả lời cho một câu hỏi không ai hỏi nữa. */
    tab === 'weight' ? SK.progressWeight : SK.progressMeasurements;
  return (
    <SkeletonPage>
      <SkeletonFor id={id} />
    </SkeletonPage>
  );
}

const stylesFor = makeStyles((c) => ({
  /* The card's own geometry, so a block sits exactly where its card will:
     same radius, same hairline, and a fill a shade above the page rather than
     a grey rectangle painted on top of it. */
  block: {
    borderRadius: glass.radius ?? radius.lg,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  stacked: { marginBottom: spacing.stack },
  group: { gap: spacing.sm + 4, marginTop: spacing.xs, marginBottom: spacing.stack },
  header: { width: 132, borderWidth: 0, backgroundColor: 'rgba(255,255,255,0.06)' },
}));
