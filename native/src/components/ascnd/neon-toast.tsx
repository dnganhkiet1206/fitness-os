import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { useI18n } from '@/hooks/use-app-settings';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles, type PaletteKey } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';
import { dismissToast, toastHideMs, useCurrentToast, type ToastKind } from '@/lib/toast';

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
    const ms = toastHideMs(!!t.action, screenReader);
    if (ms === null) return;
    const timer = setTimeout(() => dismissToast(t.id), ms);
    return () => clearTimeout(timer);
  }, [t, text, screenReader]);

  if (!t) return null;
  const accent = c[ACCENT[t.kind]];

  return (
    <View
      style={[styles.wrap, { top: insets.top + 8 }]}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite">
      <Animated.View
        key={t.id}
        // Calm entrance: a short fade + gentle drop, no spring overshoot
        entering={FadeInDown.duration(240).easing(Easing.out(Easing.quad))}
        exiting={FadeOutUp.duration(180)}
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
              <Text style={[styles.actionText, { color: accent }]}>{t.action.label}</Text>
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
     nhật ký vừa biến mất. */
  actionBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  /* Màu của loại toast, đậm hơn chữ thường: đây là thứ DUY NHẤT trên thanh
     bấm vào thì có chuyện xảy ra ngoài việc nó đóng lại. */
  actionText: { ...type.footnote, fontWeight: '700' },
}));
