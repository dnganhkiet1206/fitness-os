import { CheckCircle2, CircleDashed, Moon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { type } from '@/constants/ascnd';
import { alpha, makeStyles, type PaletteKey } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { localDateStr } from '@/lib/local-date';

/**
 * Seven days, and where each one stands.
 *
 * ── why it is a component ──
 *
 * It is drawn twice: on the Plan page, where tapping a cell opens that day, and
 * on the card at the top of the training tab, where tapping a cell opens Plan
 * *on* that day. Those are two different destinations and one picture, and the
 * picture is not trivial — a ring for today, a fill for the day being read, a
 * dot in the colour of four possible states, and the rule that decides which
 * state a day is in.
 *
 * Written twice it would drift the way this repository has watched things
 * drift before: somebody adds a fifth state, or changes what "missed" means,
 * and one of the two copies keeps saying the old thing. The state rule
 * (`dayStateOf`) is here for the same reason.
 */

export const DAY_LONG_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_LONG_VI = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
export const DAY_SHORT_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_SHORT_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/**
 * Where a day stands.
 *
 * Four states and no fifth. A rest day is not "done" when it passes — there was
 * nothing to do — so it keeps saying rest, today and afterwards.
 */
export type DayState = 'rest' | 'done' | 'todo' | 'missed';

/*
  Khoá của bảng màu, không phải mã màu: một mã màu ở phạm vi module bị ĐÓNG BĂNG
  lúc import và sẽ giữ màu của theme tối kể cả khi người dùng bật theme sáng.
  Bảng vẫn là hằng thật; chỗ vẽ — nơi luôn có `c` — mới đổi khoá thành màu.
*/
export const STATE_STYLE: Record<DayState, { icon: typeof CheckCircle2; tint: PaletteKey; wash: string }> = {
  done: { icon: CheckCircle2, tint: 'readinessGreen', wash: 'rgba(63,185,80,0.14)' },
  /* Silver, not yellow. A training day that has not happened yet is not a
     warning about anything — it is Thursday. Yellow is what this app uses for
     "approaching a limit", and spending it here would leave nothing to say
     that with. */
  todo: { icon: CircleDashed, tint: 'primary', wash: 'rgba(168,175,189,0.14)' },
  /* `wash` vẫn là literal: bảng này ở phạm vi module nên không đọc được chất
     liệu, và ba `wash` kia KHÔNG dẫn được từ `tint` — `done` dùng một xanh cũ
     (#3fb950) khác hẳn `readinessGreen`, nên một phép dẫn chung sẽ đổi bản tối.
     Ghi vào phần "còn nợ" thay vì sửa nửa vời. */
  missed: { icon: CircleDashed, tint: 'mutedForeground', wash: 'rgba(255,255,255,0.06)' },
  /*
    Rest is purple, and it is the only state here that is a *choice*.

    Done, to do and not-trained are all reports on a training day — they are
    the app telling you where you got to. A rest day is something you decided,
    and it earns a colour of its own for that: neon purple, the app's own, so a
    week reads as a shape at a glance. Grey said "nothing here", which is the
    one thing a planned rest day is not.
  */
  rest: { icon: Moon, tint: 'metricPurple', wash: 'rgba(180,92,255,0.14)' },
};

/**
 * The one rule that decides a day's state, in the one place both drawings of
 * the week read it from.
 *
 * `trained` is the set of dates that have a session against them. A day with no
 * work planned is `rest` whether or not it is in the past — there was nothing
 * to miss.
 */
export function dayStateOf(
  hasWork: boolean,
  dStr: string,
  todayStr: string,
  trained: ReadonlySet<string>,
): DayState {
  if (!hasWork) return 'rest';
  if (trained.has(dStr)) return 'done';
  return dStr < todayStr ? 'missed' : 'todo';
}

export function WeekStrip({
  dates,
  hasWork,
  selected,
  todayStr,
  trained,
  longNames,
  shortNames,
  onPick,
}: {
  dates: Date[];
  /** whether each of the seven days has training on it */
  hasWork: boolean[];
  /** which cell is filled — `null` on the summary card, where no day is open */
  selected: number | null;
  todayStr: string;
  trained: ReadonlySet<string>;
  longNames: readonly string[];
  shortNames: readonly string[];
  onPick: (idx: number) => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    /*
      Each cell is a button: the weekday, the date, and a dot underneath in the
      colour of where that day stands. The dot is the whole week's status in
      seven pixels — green behind you, silver ahead, purple where you chose to
      rest.

      Today is ringed and the open day is filled. They are usually the same cell
      and they are different marks, because the one time it matters is the one
      time they are not: reading Saturday's plan on a Tuesday, you need to see
      both which day you are reading and which day it is. On any week but this
      one the ring is simply absent — today is not in it.
    */
    <View style={styles.weekRow}>
      {dates.map((d, idx) => {
        const dStr = localDateStr(d);
        const isToday = dStr === todayStr;
        const isOpen = idx === selected;
        const state = dayStateOf(hasWork[idx] ?? false, dStr, todayStr, trained);
        return (
          <PressScale
            key={idx}
            accessibilityRole="tab"
            accessibilityState={{ selected: isOpen }}
            accessibilityLabel={`${longNames[idx]} ${d.getDate()}`}
            onPress={() => {
              Haptics.selectionAsync();
              onPick(idx);
            }}
            style={styles.weekCell}>
            <Text style={[styles.weekName, isOpen && styles.weekNameOn]}>{shortNames[idx]}</Text>
            <View style={[styles.weekDate, isToday && styles.weekDateToday, isOpen && styles.weekDateOn]}>
              <Text style={[styles.weekNum, isOpen && styles.weekNumOn]}>{d.getDate()}</Text>
            </View>
            <View style={[styles.weekDot, { backgroundColor: c[STATE_STYLE[state].tint] }]} />
          </PressScale>
        );
      })}
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  weekCell: { alignItems: 'center', gap: 6, flex: 1, paddingVertical: 4 },
  weekName: { ...type.caption, color: c.mutedForeground },
  weekNameOn: { color: c.foreground, fontWeight: '700' },
  weekDate: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  weekDateToday: { borderColor: c.primary },
  weekDateOn: { backgroundColor: c.primary, borderColor: c.primary },
  weekNum: { ...type.footnote, color: c.foreground, fontVariant: ['tabular-nums'] },
  weekNumOn: { color: c.primaryForeground, fontWeight: '700' },
  /* Always drawn, transparent when the day is empty — a dot that appears and
     disappears would shift the row's height by three points as the week is
     edited. */
  weekDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'transparent' },
}));
