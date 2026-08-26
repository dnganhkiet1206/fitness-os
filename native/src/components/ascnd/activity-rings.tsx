import * as Haptics from 'expo-haptics';
import { ChevronDown, HeartPulse } from 'lucide-react-native';
import { useEffect, useId } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { Expander } from '@/components/ascnd/expander';
import { HeroTiles } from '@/components/ascnd/hero-panel';
import { PressScale } from '@/components/ascnd/press-scale';
import { ActivityExplainer } from '@/components/ascnd/activity-explainer';
import { HelpButton, useHelpTopic } from '@/components/ascnd/help-button';
import { Icon } from '@/components/ascnd/icon';
import { colors, HERO_RING, radius, spacing } from '@/constants/ascnd';
import { duration } from '@/constants/motion';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { activityModel, type ActivityInput, type RingKey, type RingModel } from '@/lib/activity';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The unfilled part of a ring.
 *
 * It was `#17171c`, which measures **1.01:1** against the card behind it —
 * indistinguishable, not "subtle". That is why the card read as a placeholder:
 * two of its three rings were at zero because nothing wrote their columns, and
 * a ring at zero is nothing but its track, so the middle of the card was
 * genuinely, literally empty. Whatever the rings say, you should be able to
 * see that there are three of them.
 *
 * 1.60:1. Enough to find, nowhere near enough to compete with a lit ring at
 * 7:1 or better.
 */
const TRACK = '#3a3a42';

const RING_COLORS: Record<RingKey, [string, string]> = {
  move: ['#ffc53d', '#ff9130'],
  exercise: ['#2bf5a8', '#3dff7a'],
  steps: ['#3ba6ff', '#22e3ff'],
};

function Ring({
  index,
  center,
  radiusPx,
  strokeWidth,
  gradId,
  pct,
}: {
  index: number;
  center: number;
  radiusPx: number;
  strokeWidth: number;
  gradId: string;
  pct: number;
}) {
  const circumference = 2 * Math.PI * radiusPx;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      300 + index * 150,
      withTiming(Math.min(pct, 1), { duration: 1400, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
  }, [pct, index, progress]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference - progress.value * circumference,
  }));
  return (
    <>
      <Circle
        cx={center}
        cy={center}
        r={radiusPx}
        fill="none"
        stroke={TRACK}
        strokeWidth={strokeWidth}
      />
      <AnimatedCircle
        cx={center}
        cy={center}
        r={radiusPx}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circumference}`}
        animatedProps={animatedProps}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </>
  );
}

interface Props extends ActivityInput {
  size?: number;
  /** Xem ghi chú cùng tên ở `readiness-gauge.tsx`: mở chi tiết cũng ẩn phần còn
   *  lại của Today, nên quyết định đó thuộc về trang chứ không về thẻ này. */
  detailOpen?: boolean;
  onToggleDetail?: () => void;
  /**
   * Whether that connect is already running.
   *
   * ── why the button needed one ──
   *
   * It had no pending state of any kind: no `disabled`, no spinner, no change
   * of label. And it is shown *only* in the empty state — to somebody who has
   * no health data yet, whose sync is therefore the slowest one the app ever
   * does: a permission sheet, six HealthKit queries, up to five writes and an
   * eleven-query rebuild. Seconds of nothing visibly happening, on the one
   * button whose whole purpose is to make something happen.
   *
   * Two taps started two full syncs against the same day. Same shape as the
   * offline double-submit Chain A found, minus the offline part.
   */
  onLogWorkout?: () => void;
}

/**
 * Today's three rings.
 *
 * ── the layout is sideways now ──
 *
 * It was a 160pt ring stack centred over three legends, so the card's widest
 * row was 160pt of art in the middle of a 350pt card with dead space either
 * side, and the numbers — the part you actually read — were three columns of
 * 10pt type underneath. Rings left, one labelled row per ring on the right, is
 * both denser and what Apple's own Fitness widget does: the art is a glance,
 * the rows are the reading, and neither is squeezed to make room for the
 * other.
 *
 * ── an estimate says it is one ──
 *
 * The exercise ring falls back to the length of today's logged sets when no
 * watch has reported. That is a genuinely useful number and a genuinely
 * different kind of number, so it is drawn with a `~` and a line under the
 * card saying where it came from. See `lib/activity.ts` for why the
 * measurement always wins when there is one.
 */
/** Khoá lưu lượt nhắc — hằng số vì nút và lời nhắc phải đếm chung một tên. */
const HELP_TOPIC = 'activity';

export function ActivityRingsCard({
  /* Cùng lý do vòng tròn sẵn sàng to lên: hero chiếm phần trên cùng của trang,
     và 110 là kích thước của một thẻ nằm trong danh sách thẻ. */
  size = HERO_RING,
  detailOpen = false,
  onToggleDetail,
  onLogWorkout,
  ...input
}: Props) {
  const i18n = useI18n();
  const { rings, hasAny } = activityModel(input);
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  /* Cùng cơ chế đếm lượt nhắc với thẻ sẵn sàng — xem `help-nudge.ts`. */
  const help = useHelpTopic(HELP_TOPIC);

  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withTiming(detailOpen ? 1 : 0, { duration: duration.toggle });
  }, [detailOpen, spin]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 180}deg` }] }));

  /*
    SVG ids are document-global on native, not scoped to the <Svg> they are
    written in. Two cards with a hardcoded `ring-grad-move` would share one
    gradient and the second would win for both. `useId` is the project's answer
    to this and it is not hypothetical — it has cost this codebase three
    debugging sessions across three different components.
  */
  const uid = useId();
  const gradId = (key: RingKey) => `act-${key}-${uid}`;

  const center = size / 2;
  /*
    Thin enough to leave a hole in the middle.

    At 0.105 with a 1.35 gap the three rings ate the centre down to about 10pt
    across, and three concentric bands around a dot is a *target*, not Apple's
    rings — which is a lot of what made the old card read as generic chart
    furniture. The hole here is `center - strokeWidth - 1 - 2*gap`, near 15pt,
    and the 4.8pt of dark between neighbouring rings is what keeps three of
    them countable at a glance.
  */
  const strokeWidth = size * 0.088;
  const gap = strokeWidth * 1.5;

  const label: Record<RingKey, string> = {
    move: i18n.dcActivityMove,
    exercise: i18n.dcActivityExercise,
    steps: i18n.dcActivitySteps,
  };
  const unit: Record<RingKey, string> = {
    move: i18n.dcActivityKcal,
    exercise: i18n.dcActivityMin,
    steps: i18n.dcActivityStepsUnit,
  };

  /*
    Nothing at all is its own card, not three grey circles and three zeros.

    Zeros next to targets look like a report on a day you failed. The day has
    usually just started, or there is no watch attached — different situations,
    both fixable, neither communicated by drawing an empty chart. So the body
    is replaced by the two things that would put a number in it.
  */
  /*
    Không còn một nhánh rỗng RIÊNG.

    Nó từng trả về một thẻ ngắn có icon và hai nút. Đúng cho một thẻ nằm trong
    danh sách; sai hẳn cho một trang của deck — `card-deck.tsx` cho sân khấu cao
    bằng trang CAO NHẤT, nên một trang ngắn để lại một mảng đen bằng đúng phần
    chênh lệch. Đo trên máy ở trang sẵn sàng: khoảng 250pt.

    Nay đường chính vẽ cho cả hai trạng thái: ba vòng ở 0 là hình dạng thật của
    "hôm nay chưa vận động", và câu giải thích đi vào phần chi tiết cùng chỗ với
    các ô số. Trạng thái rỗng mang đúng hình dạng của trạng thái đầy, nếu không
    thì "chưa có dữ liệu" trông giống hệt "màn hình bị hỏng".
  */

  const estimated = rings.some((r) => r.source === 'estimated');

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{i18n.dcActivity}</Text>
        {/*
          Nút "?" chỉ hiện khi chi tiết đang MỞ — cùng lập luận `readiness-gauge`
          đã ghi cho nút của nó: ở trạng thái đóng, ba chữ MOVE/EXERCISE/STEPS
          không có mặt trên màn hình, nên đó là một nút trả lời câu chưa ai hỏi,
          đứng chiếm chỗ ở góc của thứ đang cần yên tĩnh nhất trên trang.
        */}
        {detailOpen ? (
          <HelpButton
            label={vi ? 'Giải thích ba vòng hoạt động' : 'Explain the three activity rings'}
            onPress={help.openHelp}
            style={styles.helpBtn}
          />
        ) : null}
      </View>

      <View style={styles.ringOnly}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Hoisted out of the ring loop: three <Defs> blocks drawing one
              gradient each is three chances to get an id wrong. */}
          <Defs>
            {rings.map((r) => {
              const [c0, c1] = RING_COLORS[r.key];
              return (
                <LinearGradient key={r.key} id={gradId(r.key)} x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={c0} />
                  <Stop offset="100%" stopColor={c1} />
                </LinearGradient>
              );
            })}
          </Defs>
          {rings.map((r, i) => (
            <Ring
              key={r.key}
              index={i}
              center={center}
              /* The 1pt is an inset, not a fudge: without it the outermost
                 ring's outer edge lands exactly on the viewBox boundary and
                 antialiasing shaves the top pixel off it. */
              radiusPx={center - strokeWidth / 2 - 1 - i * gap}
              strokeWidth={strokeWidth}
              gradId={gradId(r.key)}
              pct={r.pct}
            />
          ))}
        </Svg>

      </View>

      {/* Cùng cách vào như thẻ sẵn sàng — xem ghi chú ở đó về vì sao nó XOAY chứ
          không đổi icon. */}
      <PressScale
          inGesture
        accessibilityRole="button"
        accessibilityState={{ expanded: detailOpen }}
        accessibilityLabel={i18n.dcActivity}
        hitSlop={14}
        onPress={() => {
          Haptics.selectionAsync();
          onToggleDetail?.();
        }}
        style={styles.moreBtn}>
        <Animated.View style={chevron}>
          <Icon icon={ChevronDown} size={20} color={colors.mutedForeground} strokeWidth={2.5} />
        </Animated.View>
      </PressScale>

      <Expander open={detailOpen}>
        <View style={styles.detail}>
          {/* Cùng lưới ô với bốn trang hero còn lại — xem `HeroTiles`. Ba hàng
              chữ trước đây đúng cho một thẻ nằm trong danh sách; ở đây chúng là
              trang thứ hai của một deck, và hai lưới khác hình đọc ra là hai màn
              hình. */}
          <HeroTiles
            tiles={rings.map((r) => ({
              label: label[r.key],
              value: String(Math.round(r.current)),
              unit: `/ ${Math.round(r.target)} ${unit[r.key]}`,
              color: RING_COLORS[r.key][0],
            }))}
          />
          {!hasAny ? <Text style={styles.note}>{i18n.dcActivityEmpty}</Text> : null}
          {estimated ? <Text style={styles.note}>{i18n.dcActivityEstimated}</Text> : null}
        </View>
      </Expander>

      <ActivityExplainer visible={help.open} onClose={help.close} stepsTarget={input.stepsTarget} />
    </View>
  );
}

/** One ring, read out: what it is, how far along, out of what. */
function Row({ ring, label, unit }: { ring: RingModel; label: string; unit: string }) {
  const [tint] = RING_COLORS[ring.key];
  const dim = ring.source === 'none';
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <View style={[styles.dot, { backgroundColor: dim ? colors.mutedForeground : tint }]} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.rowValues}>
        <Text style={[styles.rowValue, dim && styles.rowValueDim]}>
          {/* The tilde is the whole disclosure at a glance; the line under the
              card says what it means. */}
          {ring.source === 'estimated' ? '~' : ''}
          {ring.current.toLocaleString()}
        </Text>
        <Text style={styles.rowTarget}>
          / {ring.target.toLocaleString()} {unit}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Phần đệm mà GlassCard vốn cấp, viết lại vì khung đã bỏ — xem ghi chú cùng
     việc ở readiness-gauge.tsx. */
  /* Cùng lý do như readiness-gauge.tsx: đệm của một hero, và không để một gap
     đứng trước một `Expander` đang đóng. */
  card: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    /*
      `spacing.sm`, và cả năm trang hero dùng CÙNG con số này.

      Hai lần sửa trước đều đúng một nửa. Ban đầu thẻ sẵn sàng và thẻ hoạt động
      có 8 còn `HeroPanel` có 0, nên ba trang cuối thấp hơn hai trang đầu 8 điểm
      — deck lấy chiều cao của trang đang xem, nên hàng chấm và cả tấm bên dưới
      nhảy mỗi lần vuốt qua trang thứ ba. Rồi tôi cào bằng XUỐNG 0, và thứ đó
      sửa được kích thước nhưng đổi mất chính cái thẻ người dùng nhìn đầu tiên:
      "style thẻ không còn giống như cũ".

      Cào bằng LÊN 8 thì được cả hai: năm trang bằng nhau, và hai thẻ vòng tròn
      trở lại đúng như trước. Lập luận "nút 44 điểm đã tự mang khoảng trống" của
      `HeroPanel` vẫn đúng, nó chỉ không đủ để đòi con số phải là 0 — mà giữa
      "bằng nhau ở 0" và "bằng nhau ở 8" thì cái người dùng nhận ra là 8.
    */
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.card,
    alignItems: 'center',
  },
  ringOnly: { alignItems: 'center' },
  moreBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  detail: { gap: spacing.md, alignSelf: 'stretch' },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  helpBtn: { marginLeft: 'auto' },
  title: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: colors.mutedForeground,
  },
  body: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  rows: { flex: 1, gap: spacing.sm + 2 },
  row: { gap: 1 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  rowLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: colors.mutedForeground },
  rowValues: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  rowValue: {
    fontSize: 19,
    fontFamily: 'Menlo',
    fontWeight: '700',
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
  /* A ring nothing has reported on reads as absent, not as a score of nought. */
  rowValueDim: { color: colors.mutedForeground, fontWeight: '400' },
  rowTarget: { fontSize: 11, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  note: { fontSize: 11, color: colors.mutedForeground },

  /* Dimmed, not hidden: the button keeps its footprint so the card does not
     reflow under the finger that just pressed it. */
});
