import { nav } from '@/lib/nav';
import * as Haptics from 'expo-haptics';
import { ChevronRight, Minus, TrendingDown, TrendingUp } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { type } from '@/constants/ascnd';
import { makeStyles, type PaletteKey } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { NativeStrings } from '@/lib/native-strings';
import type { ExercisePerformance } from '@/lib/exercise-performance';
import type { ExerciseInsight, Trend } from '@/lib/exercise-trend';
import { displayWeight, weightLabel, type WeightUnit } from '@/lib/units';

/**
 * How one movement is going, beside the movement.
 *
 * ── the problem it is the answer to ──
 *
 * Exercise Intelligence had exactly one door: a button on the Workouts tab.
 * Four screens in this app print an exercise name to the reader and not one of
 * them said anything about it. So somebody looking at today's plan — with the
 * exercise right there in front of them — had to leave the screen, open another
 * one, and scroll a list of everything they had trained in ninety days to find
 * the row they were already looking at.
 *
 * The information belongs where the exercise is. This is that: a chip small
 * enough to sit on a plan row, and a way through to the detail so the list is
 * somewhere you arrive at rather than somewhere you search.
 *
 * ── one component, two callers, on purpose ──
 *
 * The routine panel and the log sheet both want this, and the log sheet had
 * already written its own before this file existed. There is one now.
 *
 * The first draft was a small outlined chip beside the exercise name. Seen in
 * place it read as a badge: nothing about it said it could be pressed, and a
 * bare "+5%" does not say five per cent of what. It decorated the row instead
 * of earning its place on it — so it became the strip below.
 */

const ICON: Record<Trend, typeof TrendingUp> = {
  IMPROVING: TrendingUp,
  DECLINING: TrendingDown,
  PLATEAU: Minus,
  STABLE: Minus,
  INSUFFICIENT_DATA: Minus,
};

/*
  Khoá của bảng màu, không phải mã màu: một mã màu ở phạm vi module bị ĐÓNG BĂNG
  lúc import và sẽ giữ màu của theme tối kể cả khi người dùng bật theme sáng.
  Bảng vẫn là hằng thật; chỗ vẽ — nơi luôn có `c` — mới đổi khoá thành màu.
*/
const TINT: Record<Trend, PaletteKey> = {
  IMPROVING: 'readinessGreen',
  DECLINING: 'readinessRed',
  PLATEAU: 'readinessYellow',
  STABLE: 'mutedForeground',
  INSUFFICIENT_DATA: 'mutedForeground',
};

/** Where the chip sends you, so the deep link is written in one place. */
export const insightHref = (exerciseKey: string) =>
  ({ pathname: '/exercise-insight', params: { ex: exerciseKey } }) as const;

/**
 * The best set of the last session, in the shortest true form.
 *
 * Lives here rather than in either caller because both wanted it and one had
 * already written it — the log sheet had its own copy before this component
 * existed, which is the shape of bug this repository keeps finding.
 */
function lastSetText(
  p: ExercisePerformance,
  u: WeightUnit,
  i18n: NativeStrings,
): string | null {
  if (p.bestDurationSec !== null && p.bestReps === null) return `${Math.round(p.bestDurationSec)}s`;
  if (p.bestReps === null) return null;
  const kg = (n: number) => Math.round(displayWeight(n, u) * 10) / 10;
  const load = (p.bodyweightKg ?? 0) * (p.kind === 'bodyweight' ? 1 : 0) + (p.bestWeightKg ?? 0);
  /* Số lần mang nhãn, y như tạ mang `kg` — chủ dự án khoanh đúng cột này ở
     `day-plan.tsx` và câu hỏi giống hệt ở đây: "25 kg × 10" thì 10 là gì.
     `i18n.nReps` là đúng cái tên mà ô nhập bên kia dùng, nên hai màn không
     đẻ ra hai chữ cho một thứ. */
  if (load <= 0) return `${p.bestReps} ${i18n.nReps} × ${i18n.nRdBodyweight.toLowerCase()}`;
  return `${kg(load)} ${weightLabel(u)} × ${p.bestReps} ${i18n.nReps}`;
}

/**
 * Progress for one movement, as a row you can obviously press.
 *
 * ── why the badge was not enough ──
 *
 * The first version put a small outlined chip beside the exercise name on the
 * weekly plan: an arrow and a percentage. Seen in place, it reads as a badge.
 * Nothing about it says it can be pressed, and "+5%" on its own does not say
 * five per cent of what — so it decorated the row instead of earning its place
 * on it.
 *
 * Three changes, and each is doing a job:
 *
 *   · **It leads with the number you are about to try to beat.** "Lần trước
 *     55 kg × 9" is useful standing still, before anybody taps anything. The
 *     trend is the accent, not the message.
 *   · **It is a full-width row with a chevron.** That is what every pressable
 *     list row on this phone looks like, which is the whole reason it reads as
 *     one.
 *   · **It sits under the name, above the sets** — in the path the eye already
 *     takes down the card, rather than tucked beside a heading.
 *
 * Still one line. Minimal is not the same as quiet.
 */
export function ExerciseProgress({
  insight,
  last,
  name,
  u,
  i18n,
}: {
  insight: ExerciseInsight | null | undefined;
  /** the most recent session of this movement, or null when there is none */
  last: ExercisePerformance | null | undefined;
  name: string;
  u: WeightUnit;
  i18n: NativeStrings;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  /* Nothing at all when there is nothing to say. A row reading "no data" on
     every line of a new user's first plan is twelve pieces of furniture saying
     the same nothing. */
  const text = last ? lastSetText(last, u, i18n) : null;
  if (!text) return null;

  const trend = insight?.trend ?? 'INSUFFICIENT_DATA';
  const tint = c[TINT[trend]];
  const pct =
    insight && insight.changePct !== null ? Math.round(insight.changePct * 100) : null;
  const key = insight?.exerciseKey;

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={`${name} — ${i18n.nXiOpen}`}
      disabled={!key}
      onPress={() => {
        if (!key) return;
        Haptics.selectionAsync();
        nav.push(insightHref(key));
      }}>
      <View style={styles.strip}>
        <Icon icon={ICON[trend]} size={13} color={tint} />
        <Text style={styles.stripMain} numberOfLines={1}>
          {i18n.nLgLastTime.replace('{v}', text)}
        </Text>
        {pct !== null && pct !== 0 ? (
          <Text style={[styles.stripPct, { color: tint }]}>
            {pct > 0 ? '+' : ''}
            {pct}%
          </Text>
        ) : null}
        <View style={styles.spacer} />
        {key ? <Icon icon={ChevronRight} size={14} color={c.mutedForeground} /> : null}
      </View>
    </PressScale>
  );
}

const stylesFor = makeStyles((c) => ({
  /*
    ── cái MẶT NỀN đã bị bỏ, và cái VÙNG CHẠM mới là thứ nó tưởng nó đang làm ──

    Bản trước: `backgroundColor: alpha(m.ink, 0.045)` + `borderRadius` 12, với
    lý lẽ *"A surface and a chevron. Without them it is a caption, and a caption
    is not something anybody tries to press."*

    Vế "phải trông như bấm được" đúng. Cái mặt nền thì không phải thứ trả lời
    được nó, và đo ra thì nó còn tạo ra hai vấn đề khác:

      · **nó là một cái THẺ TRONG THẺ.** Hàng này nằm trong thẻ bài tập, ngay
        trên các hàng set — và một hộp bo góc có nền đặt giữa một cái thẻ và
        một danh sách đọc ra là một hạng mục thứ ba, chứ không phải một dòng
        tham chiếu. Chủ dự án gọi đúng tên: *"reads visually like a separate
        button/card"*.
      · **nó cao 25 điểm.** 6 + 13 + 6. Đó là một hàng BẤM ĐƯỢC dưới sàn 44 của
        Apple, và không luật nào bắt được vì `tap-target.mjs` đọc khoá `height`
        tường minh, mà hàng này dựng chiều cao bằng đệm.

    Nên đổi đúng thứ cần đổi: bỏ mặt nền và bo góc, và cho nó `minHeight` 44 —
    tức chính cái nó đang thiếu. Thứ nói "bấm được" nay là hình dạng một HÀNG
    DANH SÁCH cao 44 với một chevron ở cuối, đúng như mọi hàng bấm được khác
    trên máy này.

    Đệm NGANG cũng bỏ: không còn mặt nền thì 8 điểm ấy chỉ đẩy chữ lệch khỏi
    tên bài tập và các hàng set ở trên dưới, cả hai đều lấy đệm 16 của thẻ.
    Bỏ đi thì cả ba thẳng một mép.

    Chữ lên `footnote` (13) từ `caption` (11): mất mặt nền thì hàng cần đọc được
    bằng một cái liếc, và 13 là bậc dữ liệu phụ của thang chữ.
  */
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
  },
  stripMain: { ...type.footnote, color: c.foreground, fontVariant: ['tabular-nums'] },
  stripPct: { ...type.footnote, fontWeight: '700', fontVariant: ['tabular-nums'] },
  spacer: { flex: 1, minWidth: 0 },
}));
