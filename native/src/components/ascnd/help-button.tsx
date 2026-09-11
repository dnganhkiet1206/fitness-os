import * as Haptics from 'expo-haptics';
import { HelpCircle, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { radius, spacing } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useI18n } from '@/hooks/use-app-settings';
import { noteHelpOpened, noteNudged, shouldNudge } from '@/lib/help-nudge';

/**
 * A card's `?`, the sheet behind it, and the hint that it is there.
 *
 * ── why it is shared ──
 *
 * The readiness card got one, then the training card. Both need the same three
 * things wired the same way — a button, a counted hint, and the storage key
 * that ties them together — and the failure mode of doing it twice is not a
 * visual inconsistency. It is a hint that counts under one topic name and is
 * silenced under another, whose only symptom is a tip that never stops
 * appearing on a card somebody opens every morning.
 *
 * See `lib/help-nudge.ts` for the counting rules. The short version: three
 * showings ever, one per app run, none at all once the help has been opened.
 */
export function useHelpTopic(topic: string) {
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    let alive = true;
    void shouldNudge(topic).then((show) => {
      if (!alive || !show) return;
      setNudge(true);
      void noteNudged(topic);
    });
    return () => {
      alive = false;
    };
  }, [topic]);

  return {
    open,
    nudge,
    close: () => setOpen(false),
    openHelp: () => {
      Haptics.selectionAsync();
      setNudge(false);
      setOpen(true);
      void noteHelpOpened(topic);
    },
    /* Dismissing is not reading: the showing was already counted, so it may
       come back tomorrow, up to the budget. */
    dismissNudge: () => {
      Haptics.selectionAsync();
      setNudge(false);
    },
  };
}

/**
 * The button.
 *
 * A nested `Pressable` becomes the touch responder itself, so this does not
 * fall through to a card's own press — several of these cards are wrapped in
 * one that navigates, and tapping `?` must not.
 *
 * 28pt of ink with `hitSlop` 14 is a 56pt target.
 */
export function HelpButton({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={14}
      onPress={onPress}
      style={[styles.btn, style]}>
      <Icon icon={HelpCircle} size={17} color={c.mutedForeground} />
    </PressScale>
  );
}

/**
 * The hint that points at it.
 *
 * Tapping anywhere on the chip opens the help — the chip *is* a shortcut to
 * the button it is advertising, and a hint you have to read and then go find
 * the target of is a hint that costs more than it saves.
 */
export function HelpNudge({
  text,
  onPress,
  onDismiss,
}: {
  text: string;
  onPress: () => void;
  onDismiss: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  /*
    Hai nút CẠNH nhau, không phải một nút nằm trong một nút.

    ── lỗi nó sửa, và vì sao không có gì trên màn hình cho thấy nó ──

    Nút X từng nằm BÊN TRONG `PressScale` của cả dải. Trên iOS, `Pressable` đặt
    `accessible` bằng true, và tài liệu React Native nói thẳng điều đó nghĩa là
    gì: *"When a view is an accessibility element, it groups its children into a
    single selectable component."* VoiceOver không đi vào trong một phần tử đã
    là phần tử trợ năng — nên cái X **không tồn tại** với trình đọc màn hình.

    Hậu quả cụ thể: người dùng VoiceOver mở được sheet giải thích, và **không có
    cách nào tắt lời nhắc**. Nó ở lại vĩnh viễn trên bốn thẻ của màn Hôm nay.

    Cú chạm bằng ngón tay thì vẫn đúng — hệ responder của RN trao quyền cho view
    SÂU NHẤT nhận, nên cái X vẫn bấm được. Đó là lý do lỗi này sống lâu: nó
    không hỏng ở nơi ai cũng nhìn.

    Bộ chạy web bắt được nó ở một mặt khác, và cùng một nguyên nhân: `<button>`
    lồng trong `<button>` là lỗi hydrate của React — hai lần trên mỗi lần dựng
    màn Hôm nay.

    ── bố cục không đổi một điểm ảnh nào ──

    Hàng cũ: Icon — gap — Text(flex:1) — gap — X, tất cả là con của `nudge`.
    Hàng mới: PressScale(flex:1, chứa Icon — gap — Text(flex:1)) — gap — X.
    Cùng một thứ tự, cùng một `gap`, cùng viền và nền. Đo lại bằng ảnh chụp ở
    trạng thái nghỉ: 0 điểm ảnh khác ở cả hai bản.

    Thứ ĐỔI là vùng co lại khi bấm: trước là cả dải kể cả cái X, giờ là phần
    bấm-để-mở. Đó là điều đúng — cái X không phải một phần của "mở giải thích",
    và một nút co lại khi bạn nhắm vào nút khác là một lời nói sai.
  */
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(140)}
      style={styles.nudge}>
      <PressScale accessibilityRole="button" onPress={onPress} style={styles.nudgeBody}>
        <Icon icon={HelpCircle} size={14} color={c.metricBlue} />
        <Text style={styles.nudgeText}>{text}</Text>
      </PressScale>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={i18n.a11yClose}
        hitSlop={15}
        onPress={onDismiss}>
        <Icon icon={X} size={14} color={c.mutedForeground} />
      </Pressable>
    </Animated.View>
  );
}

const stylesFor = makeStyles((c) => ({
  btn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  nudge: {
    /* Cards that centre their children would otherwise shrink-wrap this into a
       narrow column of text instead of letting it span. */
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(c.metricBlue, 0.25),
    backgroundColor: alpha(c.metricBlue, 0.10),
  },
  /* Phần bấm-để-mở. `flex: 1` để nó chiếm hết chỗ còn lại sau cái X, và cùng
     `gap` với hàng ngoài nên khoảng cách Icon—Text bằng đúng khoảng cách
     Text—X, y như khi cả ba còn là con của một hàng. */
  nudgeBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nudgeText: { flex: 1, fontSize: 12, lineHeight: 17, color: c.foreground },
}));
