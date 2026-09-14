import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withSpring,
  withTiming,
  type EntryAnimationsValues,
  type ExitAnimationsValues,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { useI18n } from '@/hooks/use-app-settings';
import { BottomTabInset } from '@/constants/expo-template-theme';
import { radius, spacing, type } from '@/constants/ascnd';
import { BOUNCE, duration, spring } from '@/constants/motion';
import { alpha, makeStyles, type PaletteKey } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';
import { dismissToast, toastHideMs, useCurrentToast, type ToastKind } from '@/lib/toast';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Trình đọc màn hình có đang bật không — cùng khuôn với `use-reduced-motion`.
 *
 * Để ở đây chứ không thành một hook chung, vì hiện chỉ một chỗ cần biết, và
 * thứ nó quyết định cũng chỉ nằm trong tệp này: một thanh có nút thì không
 * được tự tắt. Khi có chỗ thứ hai cần, hãy nâng nó lên `hooks/`.
 */
function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled().then((v) => {
      if (alive) setOn(v);
    });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

/** One nested entry keeps the dictionary off `Record<string, string>`, so the
 *  lookup is checked rather than cast. */
function errorCopy(dict: Record<string, unknown>, key: string, fallback: string): string {
  const copy = dict[key];
  return typeof copy === 'string' ? copy : fallback;
}

/*
  Khoá của bảng màu, không phải mã màu: một mã màu ở phạm vi module bị ĐÓNG BĂNG
  lúc import và sẽ giữ màu của theme tối kể cả khi người dùng bật theme sáng.
  Bảng vẫn là hằng thật; chỗ vẽ — nơi luôn có `c` — mới đổi khoá thành màu.
*/
const ACCENT: Record<ToastKind, PaletteKey> = {
  success: 'readinessGreen',
  warning: 'readinessYellow',
  error: 'readinessRed',
  info: 'metricBlue',
};

/* ── đồng hồ của nút Hoàn tác ─────────────────────────────────────────────── */

const RING = 26;
const RING_STROKE = 2.5;
const RING_R = (RING - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Bao nhiêu giây nữa thì mất cơ hội — vẽ thành một vòng vơi dần, số ở giữa.
 *
 * ── vì sao nó đáng có ──
 *
 * Thanh Hoàn tác vốn nói "bấm đi" mà không nói "bấm trước bao giờ". Người dùng
 * đọc câu chữ, cân nhắc, rồi đưa tay lên thì thanh đã đi. Cái hạn ấy CÓ THẬT —
 * `ACTION_HIDE_MS`, tám giây — nhưng nó là một bí mật của mã. Vẽ nó ra là biến
 * một cái bẫy thành một lựa chọn.
 *
 * ── MỘT nguồn thời gian, không phải hai ──
 *
 * Cách dễ là một `setInterval` đếm giây cho con số và một `withTiming` cho
 * vòng. Hai đồng hồ, và chúng sẽ lệch: khung hình đầu của `withTiming` không
 * rơi cùng lúc với nhịp đầu của `setInterval`, nên có những giây mà vòng đã qua
 * vạch còn con số chưa đổi. Repo này gọi đúng tên cái bẫy ấy ở nhiều chỗ khác —
 * một đại lượng, hai phép tính.
 *
 * Nên chỉ có một `left` chạy 1 → 0. Vòng đọc nó qua `strokeDashoffset`, con số
 * đọc nó qua `text` — cả hai trên luồng UI, cùng một khung hình, không thể lệch.
 *
 * `TextInput` chứ không phải `<Text>` vì `<Text>` không có thuộc tính nào động
 * được cho nội dung; đây đúng là cách `animated-number.tsx` đã dùng và đã ghi
 * lý do: sáu mươi lần vẽ lại React mỗi giây cho một con số là cái giá không
 * đáng.
 *
 * ── tuyến tính, và đó là một quyết định ──
 *
 * Mọi chuyển động khác trong app đều ease-out. Cái này KHÔNG. Một đồng hồ có
 * gia tốc là một đồng hồ nói dối: nửa đầu trôi nhanh hơn nửa sau thì vòng
 * không còn đo được thời gian còn lại. `Easing.linear` là thứ duy nhất đúng ở
 * đây, và nó nằm ngoài thang nhịp phản hồi vì nó không phải một phản hồi — nó
 * là một HẠN CHÓT.
 *
 * ── và nó không tồn tại khi không có hạn ──
 *
 * `toastHideMs` trả `null` khi trình đọc màn hình đang bật: thanh có nút thì
 * không tự tắt (xem `lib/toast.ts`). Lúc ấy không có giây nào để đếm, nên chỗ
 * gọi không dựng component này. Vẽ một vòng vơi dần cho một hạn không tồn tại
 * là vẽ ra một áp lực bịa.
 */
function UndoCountdown({ ms, color, track }: { ms: number; color: string; track: string }) {
  const left = useSharedValue(1);
  const secs = Math.max(1, Math.round(ms / 1000));

  useEffect(() => {
    left.value = 1;
    left.value = withTiming(0, { duration: ms, easing: Easing.linear });
  }, [ms, left]);

  const sweep = useAnimatedProps(() => ({ strokeDashoffset: RING_C * (1 - left.value) }));
  /* Kẹp sàn ở 1: `Math.ceil` cho 0 đúng ở khoảnh khắc cuối, và một con số 0
     nhấp nháy một khung hình rồi thanh biến mất đọc ra như một trục trặc. Giây
     cuối hiện "1" suốt cả giây ấy là cách một đồng hồ đếm ngược vẫn đọc. */
  const digits = useAnimatedProps(
    () => ({ text: String(Math.max(1, Math.ceil(left.value * secs))) }) as never,
  );

  return (
    /* Ẩn khỏi trợ năng: cái nút bọc ngoài đã mang nhãn "Hoàn tác", và một con
       số đổi mỗi giây bên trong nó sẽ làm trình đọc màn hình nói chen liên tục.
       (Nhánh này vốn chỉ chạy khi trình đọc màn hình TẮT, nên đây là lớp thứ
       hai — nhưng một điều khiển không được dựa vào việc nhánh kia luôn đúng.) */
    <View style={ringStyles.wrap} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={RING} height={RING}>
        <Circle
          cx={RING / 2} cy={RING / 2} r={RING_R} fill="none"
          stroke={track} strokeWidth={RING_STROKE}
        />
        <AnimatedCircle
          cx={RING / 2} cy={RING / 2} r={RING_R} fill="none"
          stroke={color} strokeWidth={RING_STROKE} strokeLinecap="round"
          strokeDasharray={[RING_C, RING_C]}
          animatedProps={sweep}
          /* Bắt đầu từ đỉnh và vơi theo chiều kim đồng hồ — chiều mà mọi mặt
             đồng hồ đã dạy. Mặc định của SVG bắt đầu ở 3 giờ. */
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <AnimatedTextInput
        editable={false}
        defaultValue={String(secs)}
        animatedProps={digits}
        style={[ringStyles.text, { color }]}
      />
    </View>
  );
}

/* Chỉ HÌNH HỌC, không màu. Một `StyleSheet.create` ở phạm vi module đóng băng
   màu lúc import — cái bẫy mà `ACCENT` ngay dưới đã ghi lý do — nên màu của
   vòng và của con số đi vào qua prop, còn kích thước thì là hằng thật. */
const ringStyles = StyleSheet.create({
  wrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  /* Phủ đúng lên mặt vòng. `TextInput` mang padding và chiều cao dòng riêng
     của nền tảng, nên nó được đặt tuyệt đối rồi căn giữa thay vì xếp cạnh —
     xếp cạnh sẽ đẩy con số lệch khỏi tâm vòng vài điểm, và một con số lệch
     tâm trong một vòng tròn là thứ mắt bắt được ngay. */
  text: {
    position: 'absolute',
    width: RING,
    height: RING,
    lineHeight: RING,
    textAlign: 'center',
    textAlignVertical: 'center',
    padding: 0,
    fontSize: 11,
    fontWeight: '700',
    /* Số đều nét: không có nó thì "8" và "1" rộng khác nhau và con số nhảy
       ngang mỗi giây bên trong một cái vòng đứng yên. */
    fontVariant: ['tabular-nums'],
  },
});

/**
 * Thanh DÂNG lên từ mép dưới, và chìm xuống lại.
 *
 * ── vì sao không dùng `FadeInDown`/`FadeOutUp` nữa ──
 *
 * Hai preset ấy đúng khi thanh còn ở trên đỉnh: rơi xuống vào, bay lên ra.
 * Thanh nay đứng ở đáy, nên cùng hai preset ấy sẽ bảo nó rơi xuống từ chỗ
 * không có gì rồi bay ngược lên xuyên qua nội dung để biến mất. Hướng của một
 * cú vào phải chỉ về chỗ nó đến, nếu không nó chỉ là một lớp mờ dần.
 *
 * ── và vì sao là LÒ XO, không phải một đường cong ──
 *
 * Đây là vật duy nhất trên màn hình xuất hiện mà không ai gọi nó, và nó mang
 * một cái hạn tám giây. Một lò xo `snappy` tới nơi rồi nhún lại một chút — đủ
 * để mắt bắt được rằng có thứ vừa đến, mà không thành một cú nảy khiến người
 * ta đợi nó đứng yên mới đọc. `BOUNCE.bouncy` đã thử và sai hướng: một câu
 * "đã gỡ hiệp khỏi buổi tập" không phải một lời chúc mừng.
 *
 * Đường RA thì không nảy: một cú thoát có nảy là một vật lưỡng lự đi. Nó chìm
 * xuống với `Easing.in` — nửa sau nhanh nhất — nên đọc ra là bị kéo đi chứ
 * không phải được thả ra. Cùng bất đối xứng mà `retract.tsx` đã ghi lý do.
 */
const RISE = 26;

const riseIn = (_values: EntryAnimationsValues) => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: RISE }, { scale: 0.97 }] },
    animations: {
      opacity: withTiming(1, { duration: duration.appear, easing: Easing.out(Easing.cubic) }),
      transform: [
        { translateY: withSpring(0, spring(0.42, BOUNCE.snappy)) },
        { scale: withSpring(1, spring(0.42, BOUNCE.snappy)) },
      ],
    },
  };
};

const sinkOut = (_values: ExitAnimationsValues) => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: duration.toggle, easing: Easing.in(Easing.cubic) }),
      transform: [
        { translateY: withTiming(RISE, { duration: duration.toggle, easing: Easing.in(Easing.cubic) }) },
        { scale: withTiming(0.97, { duration: duration.toggle, easing: Easing.in(Easing.cubic) }) },
      ],
    },
  };
};

const ICONS: Record<ToastKind, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

/**
 * Neon toast bar — drops in under the status bar with a colored glow
 * per kind (green success / yellow warning / red error / blue info),
 * auto-hides after 3s, tap to dismiss. Fire via toast.success(...) etc.
 * from '@/lib/toast'.
 */
export function NeonToastHost() {
  const c = usePalette();
  const m = useMaterial();
  const styles = stylesFor(c);
  const t = useCurrentToast();
  const i18n = useI18n();
  const insets = useSafeAreaInsets();
  const screenReader = useScreenReader();

  /*
    ── the sentence, resolved here and nowhere else ──

    `toast.fail` stores an i18n KEY when the thrown thing came from PostgreSQL
    or GoTrue, because the store is module-level and the language is in React
    context. Resolving it at render is what makes a language switch re-word a
    toast that is already on screen, and it keeps every screen from having to
    know the difference between an error written for a person and one written
    for a developer.

    The fallback is the raw text, which is correct: a key is only ever set for
    a system error, so anything without one is a sentence the app wrote.
  */
  const text = t == null ? '' : t.failureKey ? errorCopy(i18n, t.failureKey, t.message) : t.message;

  /*
    Hạn của thanh này, tính MỘT lần.

    Trước đây nó được tính bên trong `useEffect`, chỗ duy nhất cần nó. Nay phần
    vẽ cũng cần: cái vòng đếm ngược chỉ được tồn tại khi có một hạn để đếm, và
    `toastHideMs` trả `null` khi trình đọc màn hình đang bật (thanh có nút thì
    không tự tắt — xem `lib/toast.ts`).

    Tính hai lần là hai phép tính cho một đại lượng, và chúng sẽ lệch đúng vào
    lúc khó thấy nhất: một cái vòng vơi dần trên một thanh không bao giờ tắt.
  */
  const hideMs = t ? toastHideMs(!!t.action, screenReader) : null;

  useEffect(() => {
    if (!t) return;
    /*
      ── said out loud, because this bar is the only thing that says it ──

      Nothing here spoke to VoiceOver: no live region, no announcement. And this
      is the app's **sole** channel for "meal saved", "workout saved", "queued
      offline" and every `toast.error` — the log sheets pop themselves on
      success, so there is no other surface left to read. A blind user tapped
      Save and received a haptic and nothing else; on failure, the same haptic
      and nothing else.

      It also cannot be reached by navigating: it removes itself after
      `AUTO_HIDE_MS`, which is shorter than it takes to swipe to it. So the
      announcement has to be pushed, not offered.

      `announceForAccessibility` is the push, and it is what carries this on
      iOS; `accessibilityLiveRegion` on the view below is the Android half of
      the same idea. Both are cheap and neither is a substitute for the other.
    */
    AccessibilityInfo.announceForAccessibility(text);
    /*
      Thanh CÓ NÚT mà trình đọc màn hình đang bật thì KHÔNG hẹn giờ — xem
      `ACTION_HIDE_MS`. Câu chữ đẩy được, cái nút thì không; để nó tự tắt là
      đặt một điều khiển ngoài tầm với rồi gọi đó là tính năng.
    */
    if (hideMs === null) return;
    const timer = setTimeout(() => dismissToast(t.id), hideMs);
    return () => clearTimeout(timer);
  }, [t, text, hideMs]);

  if (!t) return null;
  const accent = c[ACCENT[t.kind]];

  return (
    /*
      ĐÁY, không phải đỉnh — và trên thanh tab, không phải sau nó.

      ── lỗi ──

      Thanh đứng ở `insets.top + 8`, tức chồng thẳng lên tiêu đề màn hình. Ảnh
      chủ dự án gửi có nó che mất chữ "Plan" và cả hàng "Thứ 2 · Hoàn thành"
      bên dưới: thông báo về một việc vừa làm đã xoá mất chỗ nói bạn đang ở đâu.
      Một cái hộp nổi lên thì phải nổi lên chỗ TRỐNG.

      ── vì sao `BottomTabInset` ──

      Thanh tab của app là `UITabBar` THẬT (`NativeTabs`), nằm ngoài cây React,
      nên `insets.bottom` không biết gì về nó — nó chỉ kể chuyện vạch Home.
      Đặt thanh ở `insets.bottom + 8` là đặt nó sau lưng thanh tab.

      `BottomTabInset` là con số app đã có sẵn cho đúng câu hỏi ấy, và
      `koa-companion.tsx` đã dùng nó cho đúng việc ấy: một vật nổi phải đứng
      trên thanh tab. Chú thích của chính hằng ấy nói vì sao nó rộng rãi: "being
      a little generous costs a few points of scroll where being short hides the
      last card behind the bar" — ở đây cái giá của việc thiếu còn nặng hơn, vì
      thứ bị che là một cái NÚT có hạn tám giây.

      Trên các sheet toàn màn (ghi buổi tập, ghi bữa) không có thanh tab, nên
      thanh toast nổi cao hơn cần thiết 72 điểm. Đó là phía an toàn của cùng
      phép đánh đổi: nổi cao thì thừa chỗ, nổi thấp thì mất nút.
    */
    <View
      style={[styles.wrap, { bottom: insets.bottom + BottomTabInset + spacing.sm }]}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite">
      <Animated.View
        key={t.id}
        entering={riseIn}
        exiting={sinkOut}
        /*
          Viền lấy màu theo loại toast ở cả hai theme. BÓNG thì không.

          Bản tối: bóng MÀU chính là quầng neon — tên component nói thế, và trên
          một trang gần đen thì một quầng xanh lá 55% đọc ra là ánh sáng.

          Bản sáng: cùng con số ấy đọc ra là một vệt màu loang trên giấy. Thang
          bóng của bản sáng là mực #1a1917 ở độ mờ 0,05–0,10 — toast đang dùng
          0,55, tức ĐẬM GẤP NĂM LẦN rưỡi cái bóng nặng nhất của cả app, và lại
          còn có màu. Nên trên giấy nó mượn đúng vai `hero`: cùng một hộp thoại
          nổi cao nhất màn hình, cùng một loại bóng mà mọi thẻ khác đã dùng.

          `m.lit` là bản TỐI.
        */
        style={[
          styles.toast,
          { borderColor: `${accent}59` },
          m.lit ? NEON_GLOW(accent) : m.elevation.hero,
        ]}>
        {/*
          ── hai nút ANH EM, không phải nút trong nút ──

          Không có hành động thì giữ nguyên hình cũ: cả thanh là một `Pressable`
          để tắt, và nhãn trợ năng của nó là chính câu chữ.

          Có hành động thì hàng ngoài phải thành một `View` thường. Đặt nút
          Hoàn tác BÊN TRONG `Pressable` kia sẽ rơi đúng lỗi mà
          `tools/a11y-swallow.mjs` được viết ra để chặn: React Native đặt
          `accessible` cho mọi `Pressable`, và một phần tử trợ năng *"groups its
          children into a single selectable component"* — UIKit không đi vào
          bên trong. Cú chạm bằng ngón tay vẫn đúng, nên lỗi ấy không hỏng ở
          chỗ ai cũng nhìn; nó hỏng ở chỗ không ai nhìn, đúng như lần trước.
        */}
        {t.action ? (
          <View style={styles.row}>
            <View style={[styles.neonBar, { backgroundColor: accent }]} />
            <View style={[styles.iconWrap, { backgroundColor: `${accent}24` }]}>
              <Icon icon={ICONS[t.kind]} size={16} color={accent} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text}
              style={styles.messageHit}
              onPress={() => dismissToast(t.id)}>
              <Text style={styles.message} numberOfLines={2}>{text}</Text>
            </Pressable>
            {/*
              Nút Hoàn tác: một VIÊN NANG, và cái đồng hồ nằm trong nó.

              Trước đây nó là chữ trần cùng màu với vạch bên trái. Trên một
              thanh hai dòng chữ, một từ có màu là thứ mắt đọc thành nhấn mạnh
              chứ không thành nút — và đây là điều khiển DUY NHẤT trên thanh mà
              bấm vào thì có chuyện xảy ra ngoài việc nó đóng lại. Một nền
              nhạt cùng sắc cho nó một mép, và cái mép ấy là thứ nói "bấm được".

              Vòng đếm ngược đứng TRONG nút chứ không đứng cạnh: thứ đang hết
              giờ là chính cơ hội bấm, nên cái đồng hồ thuộc về cái nút. Để nó
              ở đầu kia của thanh thì nó thành một món trang trí đang chạy.
            */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.action.label}
              style={styles.actionBtn}
              onPress={() => {
                /* Đóng TRƯỚC khi chạy: việc hoàn tác tự bắn toast của nó
                   (thành công hoặc lỗi), và kho chỉ giữ một thanh — để thanh
                   cũ sống tiếp là để nó đè lên câu trả lời. */
                dismissToast(t.id);
                t.action?.run();
              }}>
              <View style={[styles.actionPill, { borderColor: accent }]}>
                {hideMs !== null ? (
                  <UndoCountdown ms={hideMs} color={accent} track={c.ringTrack} />
                ) : null}
                <Text style={[styles.actionText, { color: accent }]}>{t.action.label}</Text>
              </View>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            /* The message is the label: a bar that announces "button" and nothing
               else is what an unlabelled control sounds like. */
            accessibilityLabel={text}
            style={styles.row}
            onPress={() => dismissToast(t.id)}>
            <View style={[styles.neonBar, { backgroundColor: accent }]} />
            <View style={[styles.iconWrap, { backgroundColor: `${accent}24` }]}>
              <Icon icon={ICONS[t.kind]} size={16} color={accent} />
            </View>
            <Text style={styles.message} numberOfLines={2}>{text}</Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

/* Quầng neon của bản tối, tách ra thành hàm vì nó nhận màu theo loại toast —
   `makeStyles` chỉ biết theme, không biết đây là success hay error. */
const NEON_GLOW = (accent: string) => ({
  shadowColor: accent,
  shadowOpacity: 0.55,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
  elevation: 10,
});

const stylesFor = makeStyles((c, m) => ({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 60,
    alignItems: 'center',
  },
  toast: {
    alignSelf: 'stretch',
    borderRadius: radius.md,
    borderWidth: 1,
    /*
      MẶT GIẤY của theme, không phải một tấm đen gõ cứng.

      Nó từng là `rgba(12,12,16,0.94)` — không nhánh theme — trong khi chữ ngay
      trong nó là `c.foreground` theo theme. Trên bản SÁNG thành chữ gần-đen
      #1a1917 trên tấm gần-đen #1a1a1d: **1,01:1**. Không phải khó đọc, mà là
      KHÔNG CÓ CHỮ NÀO. Mọi toast của bản sáng — cả 35 chỗ `toast.success` lẫn
      43 chỗ `toast.fail` — đều hiện ra thành một thanh tối có sọc màu và một
      icon, không lời nào.

      Vì sao không cổng nào bắt: `same-color.mjs` so CHUỖI biểu thức, và
      `c.foreground` với `'rgba(12,12,16,0.94)'` là hai chuỗi khác nhau — nó chỉ
      bắt được khi hai vế viết giống hệt. Một mã màu hợp lệ, khác chuỗi, mà
      trùng sáng thì đi thẳng qua.

      `alpha(m.paper, 0.94)` là đúng công thức mà ba tấm nền khác trong app đã
      chuyển sang. Giấy: #fffefe, chữ ra **17,45:1**. Tối: #0a0a10, chữ ra
      **16,86:1**.

      Bản tối lệch 2/255 ở kênh đỏ và lục (12,12,16 → 10,10,16) vì `m.paper` của
      bản tối là #0a0a10. Ở độ mờ 94% trên một trang gần đen thì đó là dưới
      ngưỡng nhìn thấy, và cái đổi lại là toast thôi là tấm nền DUY NHẤT trong
      app còn tự gõ màu riêng.
    */
    backgroundColor: alpha(m.paper, 0.94),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 4,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.md,
  },
  neonBar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { ...type.footnote, color: c.foreground, flex: 1, lineHeight: 18 },

  /* ── chỉ dùng khi thanh CÓ nút ── */
  /* Vùng chữ thành một nút riêng để tắt, nên nó phải tự đạt sàn chạm 44 —
     ở nhánh không có hành động thì cả thanh là nút và chuyện này không đặt ra. */
  messageHit: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' },
  /* 44 cao, và chữ chứ không phải icon: một nút Hoàn tác chỉ có mũi tên vòng
     lại là thứ người ta phải đoán, trong khi thứ đang bị đe doạ là một dòng
     nhật ký vừa biến mất.

     Vùng CHẠM ở đây, mặt NHÌN ở `actionPill`: viên nang cao 34 để không chen
     với câu chữ, còn vùng chạm vẫn đủ 44 của Apple. Hai thứ ấy tách nhau là
     cách duy nhất có cả hai — phình viên nang lên 44 sẽ làm nó nặng ngang cả
     thanh, còn thu vùng chạm xuống 34 thì hụt sàn. */
  actionBtn: { minHeight: 44, justifyContent: 'center' },
  /*
    VIỀN, không phải NỀN — và đó là một phép đo, không phải một sở thích.

    Bản đầu tô nền `accent` ở 12% để viên nang có một cái mép. Đo ra thì nó
    đánh đổi sai chiều: trên giấy, chữ accent đứng trên mặt toast trần được
    4,92–4,96:1, tức chỉ hơn sàn 4,5 của chữ nhỏ chưa tới nửa bậc. Một lớp tô
    12% nâng nền lên và kéo chữ xuống **3,99–4,22:1** — cả bốn loại toast đều
    trượt sàn, `error` tệ nhất. Tôi đã làm cái nút khó đọc hơn để nó trông
    "được thiết kế hơn".

    Chỗ dư hẹp ấy nghĩa là mọi lớp tô đều hỏng: muốn giữ chữ ≥4,5 thì độ mờ
    phải xuống dưới 5%, và một lớp tô 5% thì không còn là một cái mép.

    Viền giải cả hai: chữ vẫn đứng trên mặt trần (4,92–4,96), còn đường viền
    accent so với mặt toast là **4,9:1** — gấp hơn rưỡi sàn 3,0 của một vật thể
    đồ hoạ (WCAG 1.4.11). Cái mép rõ hơn bản tô, mà không lấy gì của chữ.

    `radius.full` vì nó là một viên nang nằm trong một hộp bo góc — góc trong
    bao giờ cũng tròn hơn góc ngoài, nếu không hai đường cong đọc ra là lệch.
  */
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingLeft: 5,
    paddingRight: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  /* Màu của loại toast, đậm hơn chữ thường: đây là thứ DUY NHẤT trên thanh
     bấm vào thì có chuyện xảy ra ngoài việc nó đóng lại. */
  actionText: { ...type.footnote, fontWeight: '700' },
}));
