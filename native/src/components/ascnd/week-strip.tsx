import { CheckCircle2, CircleDashed, Moon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text, View } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { type } from '@/constants/ascnd';
import { alpha, makeStyles, type Material, type Palette, type PaletteKey } from '@/constants/theme';
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
/**
 * `wash` là một HÀM của bảng màu, không phải một chuỗi.
 *
 * Bảng này sống ở phạm vi module, nên một mã màu viết vào đây bị đóng băng lúc
 * import: bốn nền chip trạng thái giữ màu của bản TỐI kể cả khi người dùng bật
 * bản sáng. Trước đây điều ấy được ghi lại như một món nợ vì `tint` không dẫn
 * ra được `wash` — ba trong bốn thì dẫn được, còn `done` dùng một xanh cũ
 * (#3fb950) khác hẳn `readinessGreen`, nên một phép dẫn CHUNG sẽ đổi bản tối.
 *
 * Một hàm giải được cả hai: nó không chạy lúc import, nên nó đọc được bảng màu
 * ở chỗ vẽ; và mỗi trạng thái giữ công thức riêng của nó, nên `done` ở lại
 * nguyên văn trong khi ba cái kia dẫn từ token. Không phải "sửa nửa vời" nữa —
 * ba cái đúng được sửa, cái thứ tư là một quyết định thiết kế còn mở, và bây
 * giờ nó là chỗ DUY NHẤT còn một mã màu.
 */
export const STATE_STYLE: Record<
  DayState,
  { icon: typeof CheckCircle2; tint: PaletteKey; wash: (c: Palette, m: Material) => string }
> = {
  /* QUYẾT ĐỊNH THIẾT KẾ CÒN MỞ: #3fb950 không phải token nào. Nó là xanh của
     bản web cũ, và nó KHÔNG bằng `readinessGreen` ở theme nào cả. Giữ nguyên
     văn cho tới khi có người quyết ngày đã tập nên mang màu gì. */
  done: { icon: CheckCircle2, tint: 'readinessGreen', wash: () => 'rgba(63,185,80,0.14)' },
  /* Silver, not yellow. A training day that has not happened yet is not a
     warning about anything — it is Thursday. Yellow is what this app uses for
     "approaching a limit", and spending it here would leave nothing to say
     that with. */
  todo: { icon: CircleDashed, tint: 'primary', wash: (c) => alpha(c.primary, 0.14) },
  missed: { icon: CircleDashed, tint: 'mutedForeground', wash: (_c, m) => alpha(m.ink, 0.06) },
  /*
    Rest is purple, and it is the only state here that is a *choice*.

    Done, to do and not-trained are all reports on a training day — they are
    the app telling you where you got to. A rest day is something you decided,
    and it earns a colour of its own for that: neon purple, the app's own, so a
    week reads as a shape at a glance. Grey said "nothing here", which is the
    one thing a planned rest day is not.
  */
  rest: { icon: Moon, tint: 'metricPurple', wash: (c) => alpha(c.metricPurple, 0.14) },
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

      ── và câu trên đã SAI ở đúng ca nó nêu ra ──

      "Hai dấu khác nhau" chỉ đúng khi chúng ở hai ô. Khi trùng ô — tức phần
      lớn thời gian, vì màn Plan mở ra là chọn sẵn hôm nay — lớp tô phủ kín ô
      và XOÁ cái vòng. Hai dấu thành một, và cái còn lại không nói được nó là
      dấu nào: một đĩa đen trên thứ Hai có thể là "hôm nay" hoặc chỉ là "ngày
      bạn đang mở".

      Chủ dự án nhìn hai màn cạnh nhau và gọi ra: cùng ngày 14, thẻ Hôm nay vẽ
      một vòng rỗng còn màn Plan vẽ một đĩa đặc. Khác biệt ấy CÓ chủ đích —
      `today-training` cố ý truyền `selected={null}` — nhưng nó phơi ra chuyện
      hôm nay không giữ được một dấu hiệu nào chung giữa hai màn.

      Nên lớp tô nay THỤT VÀO khi ô ấy cũng là hôm nay: vòng ở ngoài, đĩa ở
      trong, cách nhau 2,5 điểm. Hôm nay giữ nguyên cái vòng ở mọi màn và mọi
      trạng thái, còn lớp tô vẫn nói "đây là ngày đang mở". Hai kênh, hai dấu,
      đúng như câu đầu đã hứa.
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
            {/*
              Một VIÊN ôm cả chữ lẫn số, không phải một chữ rời nằm trên một
              vòng tròn quanh số.

              Chủ dự án khoanh đỏ cả khối lịch và gửi kèm ảnh một app khác: ở đó
              ngày đang chọn là một viên bo tròn bọc cả hai dòng, các ngày khác
              mờ đi. Hình cũ tách làm hai — chữ ngày trôi tự do bên trên, số nằm
              trong một đĩa tròn — nên cái dấu chỉ nói được về CON SỐ, còn chữ
              ngày thì không thuộc về ô nào.

              Hai kênh của lượt trước GIỮ NGUYÊN, chỉ đổi hình học: viền là hôm
              nay, lớp tô là ngày đang mở, và khi trùng ô thì lớp tô thụt vào
              trong để cái viền còn chỗ. Cùng một mẹo đã đo cho hình tròn, áp
              lên hình chữ nhật bo góc — bán kính trong 9,5 = 12 − 2,5, nên hai
              đường cong vẫn đồng tâm.
            */}
            <View
              style={[
                styles.weekChip,
                isToday && styles.weekChipToday,
                /* Tô TRÀN chỉ khi ô ấy không phải hôm nay. Trùng hôm nay thì
                   lớp tô đi vào `weekChipFill` bên trong, để cái viền còn chỗ. */
                isOpen && !isToday && styles.weekChipOn,
              ]}>
              {isOpen && isToday ? <View style={styles.weekChipFill} /> : null}
              <Text style={[styles.weekName, isOpen && styles.weekNameOn]}>{shortNames[idx]}</Text>
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
  weekCell: { alignItems: 'center', gap: 5, flex: 1, paddingVertical: 2 },
  /*
    Viên ôm cả hai dòng.

    40 rộng: bảy ô trên khung 402 có 370 bề ngang trong lề, tức 52,8 mỗi ô —
    viên 40 để lại 12,8 khe, đủ để hai viên cạnh nhau không chạm nhau khi hai
    ngày liền kề cùng được đánh dấu.

    Bán kính 12, không phải một nửa chiều cao: đây là một viên bo góc như ảnh
    mẫu, không phải một viên con nhộng. Nửa chiều cao (~21) sẽ bo thành hình
    thuốc con nhộng và đó là một hình khác hẳn.
  */
  weekChip: {
    width: 40,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  weekChipToday: { borderColor: c.primary },
  weekChipOn: { backgroundColor: c.primary, borderColor: c.primary },
  /*
    Lớp tô "đang mở" khi ô ấy CŨNG là hôm nay — thụt vào để cái viền còn thấy.

    Thụt 2,5 mỗi phía cho một khe 2,5 điểm (7,5 điểm ảnh trên màn 3x) giữa lớp
    tô và viền. Khe hẹp hơn thì hai đường cong dính vào nhau và lại thành MỘT
    dấu — đúng lỗi lượt trước đã sửa; rộng hơn thì chữ bắt đầu chạm mép.

    Bán kính 9,5 = 12 − 2,5, nên hai đường cong đồng tâm. Gõ 12 ở cả hai chỗ là
    lớp trong bo mạnh hơn lớp ngoài và khe hở rộng dần ra bốn góc.
  */
  weekChipFill: {
    position: 'absolute',
    top: 2.5,
    left: 2.5,
    right: 2.5,
    bottom: 2.5,
    borderRadius: 9.5,
    backgroundColor: c.primary,
  },
  weekName: { ...type.caption, color: c.mutedForeground },
  /* `primaryForeground`, không phải `foreground`: chữ ngày nay nằm TRONG viên,
     nên khi viên được tô thì nó đứng trên `primary` chứ không trên trang. */
  weekNameOn: { color: c.primaryForeground, fontWeight: '700' },
  weekNum: { ...type.footnote, color: c.foreground, fontVariant: ['tabular-nums'] },
  weekNumOn: { color: c.primaryForeground, fontWeight: '700' },
  /* Always drawn, transparent when the day is empty — a dot that appears and
     disappears would shift the row's height by three points as the week is
     edited. */
  weekDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'transparent' },
}));
