import { CheckCircle2, CircleDashed, Moon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text, View } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { type } from '@/constants/ascnd';
import { alpha, makeStyles, type Material, type Palette, type PaletteKey } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { usePalette } from '@/hooks/use-palette';
import type { NativeStrings } from '@/lib/native-strings';
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
/**
 * Chữ ngày trong dải tuần — dạng HẸP NHẤT mà mỗi ngôn ngữ có.
 *
 * ── vì sao tiếng Anh một chữ, tiếng Việt hai ──
 *
 * Unicode CLDR định nghĩa ba bậc cho tên thứ: `wide` (Monday), `abbreviated`
 * (Mon) và `narrow` — bậc hẹp nhất, sinh ra đúng cho một hàng bảy cột nơi VỊ
 * TRÍ đã nói ngày nào, nên `M T W T F S S` trùng chữ vẫn đọc được.
 *
 * Bảng tiếng Anh ở đây trước là `abbreviated`, không phải `narrow` — tức app
 * đang dùng bậc rộng hơn mức cần ở đúng chỗ CLDR làm ra bậc hẹp. Ảnh mẫu chủ
 * dự án gửi dùng một chữ, và đó không phải gu riêng của app kia: đó là
 * `narrow`.
 *
 * Tiếng Việt thì `narrow` ĐÃ là `T2…T7, CN` — hai ký tự, vì thứ trong tiếng
 * Việt là một con SỐ chứ không phải một cái tên, nên không có chữ cái nào để
 * rút về. Tra CLDR cho `vi-VN` để chắc chứ không suy: bảng narrow của nó đúng
 * bằng bảng dưới đây. Nghĩa là bản tiếng Việt KHÔNG thể giống ảnh mẫu ở điểm
 * này, và đó là giới hạn của ngôn ngữ chứ không phải một chỗ chưa làm.
 *
 * Không mất gì cho trình đọc màn hình: `accessibilityLabel` của mỗi ô lấy từ
 * `longNames`, nên VoiceOver vẫn đọc "Monday" / "Thứ 2".
 */
export const DAY_SHORT_EN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
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
/** Tên của mỗi trạng thái cho trình đọc màn hình (#99) — cùng bốn trạng thái mà chấm màu vẽ. */
const DAY_STATE_LABEL: Record<DayState, (i18n: NativeStrings) => string> = {
  rest: (i) => i.nDayRest,
  done: (i) => i.nDayDone,
  todo: (i) => i.nDayTodo,
  missed: (i) => i.nDayMissed,
};

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
  const i18n = useI18n();
  const styles = stylesFor(c);
  return (
    /*
      Each cell is a button: the weekday, the date, and a dot underneath in the
      colour of where that day stands. The dot is the whole week's status in
      seven pixels — green behind you, silver ahead, purple where you chose to
      rest.

      ── hai dấu, và dấu MẠNH thuộc về hôm nay ──

      Hôm nay là viên ĐẶC; ngày đang mở, nếu khác hôm nay, là viên NHẠT. Dấu
      của hôm nay không nhìn vào `isOpen` chút nào, và đó là cả điểm của nó:
      thẻ Hôm nay truyền `selected={null}`, nên bất cứ điều kiện nào buộc hai
      thứ ấy vào nhau đều làm cùng một ngày mang hai hình ở hai màn.

      Đó đúng là lỗi chủ dự án đã bắt: cùng ngày 14, thẻ Hôm nay vẽ một vòng
      rỗng còn màn Plan vẽ một đĩa đặc.

      Bản trước chữa bằng hai kênh riêng — viền là hôm nay, lớp tô là ngày đang
      mở, trùng ô thì lớp tô thụt vào 2,5 điểm cho viền còn chỗ. Nó đóng được
      sự mơ hồ nhưng không đóng được lỗi gốc, và ảnh chụp 3× cho thấy cái giá:
      một khe sáng chạy quanh viên đen, ở đúng ca thường gặp nhất (mở màn Plan
      là chọn sẵn hôm nay). Lý lẽ đầy đủ của lượt đảo vai nằm cạnh
      `weekChipToday` bên dưới, kèm cả thứ nó chấp nhận mất.

      `tools/plan-week.mjs` canh cả ba vế, và vế thứ ba là một phép ĐO: nó dựng
      lại hai viên trên mặt trang của từng diện mạo và đòi viên đặc mạnh gấp ba
      viên nhạt — vế duy nhất không lách được bằng cách đổi tên style.
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
            /* `accessibilityState` KHÔNG ra `aria-selected` trên react-native-web
               (đo ở `pick-row.tsx`) — thiếu dòng này thì trên web bảy ô đọc lên
               y hệt nhau, và lượt quét của `live.mjs` không bấm qua chúng (#99). */
            aria-selected={isOpen}
            /* Trạng thái của ngày nằm trong NHÃN, không chỉ trong chấm màu bên
               dưới: VoiceOver không đọc được một chấm (#99). */
            accessibilityLabel={`${longNames[idx]} ${d.getDate()}, ${DAY_STATE_LABEL[state](i18n)}`}
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
                isOpen && !isToday && styles.weekChipOpen,
              ]}>
              <Text
                style={[
                  styles.weekName,
                  isToday && styles.weekNameToday,
                  isOpen && !isToday && styles.weekNameOpen,
                ]}>
                {shortNames[idx]}
              </Text>
              <Text
                style={[
                  styles.weekNum,
                  isToday && styles.weekNumToday,
                  isOpen && !isToday && styles.weekNumOpen,
                ]}>
                {d.getDate()}
              </Text>
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
  /*
    ── HAI dấu, và dấu MẠNH thuộc về HÔM NAY ──

    Bản trước cho lớp tô đặc cho "ngày đang mở" và cái viền cho "hôm nay", rồi
    khi trùng ô thì thụt lớp tô vào 2,5 để viền còn chỗ. Ảnh chụp ở 3× cho thấy
    kết quả: một khe sáng chạy vòng quanh viên đen, đọc ra như một cái nhãn dán
    có quầng — và đó là trường hợp THƯỜNG GẶP NHẤT, vì mở màn Plan là chọn sẵn
    hôm nay.

    Đảo vai thì cả ba ca đều đúng và ca thường gặp còn đúng MỘT viên, như ảnh
    mẫu chủ dự án gửi:

        hôm nay                 viên ĐẶC          (dấu mạnh nhất)
        ngày đang mở, khác hôm nay   viên NHẠT + viền
        tuần khác, hôm nay không có  chỉ còn viên nhạt của ngày đang mở

    Và nó sửa luôn cái mà chủ dự án từng bắt — "cùng một kiểu nhưng 2 cái lại
    khác nhau": thẻ Hôm nay truyền `selected={null}` nên trước đây hôm nay ở đó
    là một cái VÒNG, còn ở màn Plan là một cái ĐĨA. Nay hôm nay mang cùng một
    viên đặc ở cả hai màn, vì dấu của nó không còn phụ thuộc vào việc có ngày
    nào đang mở hay không.

    Thứ mất đi: khi hôm nay CŨNG là ngày đang mở thì chỉ còn một dấu. Không mất
    gì cả — hai điều ấy cùng đúng về cùng một ô, nên một dấu nói đủ. Sự mơ hồ
    mà bản trước lo chỉ tồn tại khi hai ngày KHÁC nhau, và ở đúng ca ấy hai dấu
    vẫn còn đủ hai.
  */
  weekChipToday: { backgroundColor: c.primary, borderColor: c.primary },
  /*
    Viên NHẠT: một lớp mực 12% chứ không phải chỉ một cái viền.

    Chỉ viền thì ở tuần khác — nơi hôm nay không có mặt — cả dải không còn một
    mảng đặc nào và ngày đang mở đọc ra như một ô rỗng. 12% đủ để nó là một cái
    viên, và vẫn nhẹ hơn hẳn viên đặc của hôm nay.
  */
  weekChipOpen: { backgroundColor: alpha(c.primary, 0.12), borderColor: alpha(c.primary, 0.35) },
  /*
    ── SỐ NGÀY phải trội hơn TÊN THỨ, và trước đây chúng gần bằng nhau ──

    Bản trước: tên thứ `caption` (11), số ngày `footnote` (13). Chênh HAI điểm.
    Ở hai dòng xếp chồng trong cùng một viên, 11 và 13 đọc ra là một cỡ — nên ô
    ngày không có chủ ngữ, và mắt phải đọc cả hai dòng mới biết mình đang ở đâu.

    Lịch của Apple (Calendar, Fitness, Health) cho số ngày gấp khoảng đôi tên
    thứ, vì tên thứ là thứ bạn SUY RA được còn con số thì không.

    Nay: tên thứ giữ 11, số ngày lên `headline` (17). Chênh 6 điểm, một bậc rõ
    ràng, và cả hai vẫn là token có sẵn.

    Hai thứ KHÔNG đổi ở lượt này, theo đúng phạm vi đã chốt: viên hôm nay vẫn tô
    `c.primary` đặc, và cấu trúc/tương tác của dải giữ nguyên từng dòng.

    Viên cao thêm ~4 điểm (11 + 17 + gap 2 + đệm 12 ≈ 47 thay vì ~43). Bề rộng
    40 vẫn đủ cho hai chữ số 17pt (~19 điểm).
  */
  weekName: { ...type.caption, color: c.mutedForeground },
  /* `primaryForeground`, không phải `foreground`: chữ ngày nay nằm TRONG viên,
     nên khi viên được tô đặc thì nó đứng trên `primary` chứ không trên trang. */
  weekNameToday: { color: c.primaryForeground, fontWeight: '700' },
  weekNameOpen: { color: c.foreground, fontWeight: '600' },
  weekNum: { ...type.headline, color: c.foreground, fontVariant: ['tabular-nums'] },
  weekNumToday: { color: c.primaryForeground, fontWeight: '700' },
  weekNumOpen: { color: c.foreground, fontWeight: '700' },
  /* Always drawn, transparent when the day is empty — a dot that appears and
     disappears would shift the row's height by three points as the week is
     edited. */
  weekDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'transparent' },
}));
