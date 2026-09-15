import * as Haptics from 'expo-haptics';
import { Bell, BellPlus, Check, Dumbbell, HeartPulse, type LucideIcon, Moon, Scale, Utensils } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { DateField } from '@/components/ascnd/date-field';
import { WeightEntry } from '@/components/ascnd/weight-entry';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, graphicOf, makeStyles, type PaletteKey } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { useDailyQuests } from '@/hooks/use-daily-quests';
import { useTodayWeight } from '@/hooks/use-fitness-data';
import { usePalette } from '@/hooks/use-palette';
import { useTodayBiometrics } from '@/hooks/useTodayData';
import { useReminders } from '@/hooks/use-reminders';
import { nav } from '@/lib/nav';
import type { TimedReminderKey } from '@/lib/reminder-plan';
import { timeToDate } from '@/lib/reminder-timing';
import { TODO_ORDER, todoProgress, type TodoDone, type TodoKey } from '@/lib/todo';

/**
 * Một chỗ duy nhất trả lời "hôm nay còn phải ghi gì".
 *
 * ── nó thay cái gì, và vì sao gộp lại ──
 *
 * Trước đây màn Hôm nay mời người dùng ghi ở năm chỗ rời nhau: hàng bốn chip
 * ngay dưới hero, cộng CTA rỗng nằm trong thẻ Giấc ngủ, thẻ Dinh dưỡng và thẻ
 * Tập luyện, cộng ô nhập cân nặng trong thẻ Cân nặng. Năm lời mời cho cùng một
 * câu hỏi, rải trên một trang phải cuộn — nên câu trả lời "còn thiếu gì" không
 * đọc được ở bất kỳ điểm cuộn nào.
 *
 * ── danh sách RÚT NGẮN dần, không phải danh sách có dấu tick ──
 *
 * Chỉ vẽ việc CHƯA ghi. Một danh sách "cần làm" liệt kê cả việc đã xong là một
 * bảng điểm, không phải một danh sách việc; và trên đầu một trang cuộn, năm
 * dòng luôn hiện chiếm đúng chỗ mà thứ cần chú ý phải nằm. Tiến độ vẫn đọc
 * được — `x/5` ở tiêu đề — và khi hết việc thì thẻ co lại còn một dòng.
 *
 * Thứ tự KHÔNG đổi khi một việc xong: các dòng còn lại giữ nguyên vị trí tương
 * đối, chỉ bớt đi một. Sắp lại theo trạng thái thì mỗi lần ghi xong một thứ là
 * một lần cả danh sách nhảy chỗ.
 *
 * ── ba trong năm trạng thái ĐỌC từ hệ nhiệm vụ đã có ──
 *
 * `useDailyQuests` đã đo bữa ăn / buổi tập / giấc ngủ cho phòng Koa, và nó là
 * nơi chú thích của chính nó ghi lại chuyện "app từng có ba ý kiến về một ngày
 * đi bộ bao xa". Đọc lại từ `dailyLog` ở đây sẽ là ý kiến thứ hai về cùng một
 * ngày, cho cùng một người, trên cùng một màn.
 *
 * Sinh trắc và cân nặng không nằm trong hệ ấy nên đọc thẳng hai query đã có
 * (`useTodayBiometrics`, `useTodayWeight`) — chúng cũng chính là hai query mà
 * thẻ Sinh trắc và thẻ Cân nặng đang dùng, nên vẫn không có nguồn thứ hai nào
 * được sinh ra.
 *
 * ── `ready`, và vì sao thẻ im lặng khi chưa đọc xong ngày ──
 *
 * `useDailyQuests.ready` là `false` cho tới khi ngày thật sự được đọc. Không có
 * nó, một ngày chưa tải xong tính ra là năm việc chưa làm — tức "5 việc cần
 * làm" hiện ra cho người đã ghi suốt buổi sáng. Chú thích của chính hook ấy nói
 * app đã gặp lỗi này đủ nhiều lần để đặt hẳn một cờ.
 */

/** Đích đến của từng dòng. Cân nặng không có route — nó mở ô nhập tại chỗ. */
const ROUTE = {
  meal: '/log-meal',
  workout: '/log-workout',
  sleep: '/log-sleep',
  biometrics: '/log-biometrics',
} as const satisfies Record<Exclude<TodoKey, 'weight'>, string>;

/*
  Icon lấy từ bộ đã dùng, không vẽ mới.

  `Scale` đã là cân nặng ở `reminders.tsx` và ở tab Tiến trình; `Dumbbell` và
  `Moon` cũng đến từ `reminders.tsx`, tức đúng bộ mà app dùng cho "những việc
  nhắc người ta ghi". Bộ `Glyph` riêng của app không có hình nào cho cân nặng,
  và thêm một hình vẽ tay vào đó là đúng cái giá mà `macro-icon-style.mjs` đã
  trả một lần.
*/
const ICON: Record<TodoKey, LucideIcon> = {
  meal: Utensils,
  workout: Dumbbell,
  sleep: Moon,
  biometrics: HeartPulse,
  weight: Scale,
};

/*
  Màu ở lại trong GLYPH, ô sau nó trung tính.

  Cùng luật với hàng chip mà thẻ này thay thế: "màu dành cho GIÁ TRỊ, không
  dành cho LỐI ĐI" — và màu không biến mất, nó dời vào chính cái hình, nơi nó
  phân biệt năm hành động. Xem `tools/raised-pill.mjs`.
*/
const TINT: Record<TodoKey, PaletteKey> = {
  meal: 'metricOrange',
  workout: 'metricBlue',
  sleep: 'metricViolet',
  biometrics: 'readinessRed',
  weight: 'metricCyan',
};

/*
  Mỗi dòng hẹn được giờ, và giờ ấy là một lời nhắc THẬT.

  ── vì sao nó đọc hệ nhắc có sẵn thay vì đẻ ra một cái hẹn riêng ──

  App đã có bộ lập lịch thông báo: `reminder-plan.ts` dựng kế hoạch bảy ngày,
  tự im ở HÔM NAY khi việc ấy đã xong, và cắt theo trần 64 yêu cầu chờ của iOS.
  Một cái "hẹn giờ" riêng của thẻ này sẽ là một lịch thứ hai trong cùng một app
  — hai nơi cùng nói về một buổi sáng, và chỉ một trong hai bắn được thông báo.

  Năm khoá cũ chỉ phủ hai dòng (buổi tập, cân nặng), nên ba khoá `meal`,
  `biometrics`, `sleepLog` được thêm vào chính bộ ấy — xem `ReminderKey`.
*/
const TODO_REMINDER: Record<TodoKey, TimedReminderKey> = {
  meal: 'meal',
  workout: 'workout',
  /* KHÔNG phải `bedtime`: đó là "đi ngủ đi", còn dòng này là "ghi lại đêm qua",
     một việc của buổi sáng. Xem chú thích ở `ReminderKey`. */
  sleep: 'sleepLog',
  biometrics: 'biometrics',
  weight: 'weighIn',
};

export function TodoCard() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const quests = useDailyQuests();
  const { data: bio } = useTodayBiometrics();
  const { data: todayWeight } = useTodayWeight();

  const label: Record<TodoKey, string> = {
    meal: i18n.nTodoMeal,
    workout: i18n.nTodoWorkout,
    sleep: i18n.nSleep,
    biometrics: i18n.nTodoBio,
    weight: i18n.nWeight,
  };

  const done: TodoDone = {
    meal: quests.done.meal,
    workout: quests.done.workout,
    sleep: quests.done.sleep,
    biometrics: bio != null,
    weight: todayWeight != null,
  };

  /* Chưa đọc xong ngày thì chưa nói gì — xem chú thích `ready` ở trên. */
  if (!quests.ready) return null;

  const progress = todoProgress(done);

  return (
    <GlassCard style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{i18n.nTodoTitle}</Text>
        <Text style={styles.count}>
          {progress.done}/{progress.total}
        </Text>
      </View>
      {/*
        NĂM dòng, luôn luôn — việc đã ghi Ở LẠI.

        Bản trước chỉ vẽ việc chưa xong, và chủ dự án báo: "khi log xong thì
        lại bị mất cả". Đúng: một dòng biến mất ngay dưới ngón tay vừa bấm là
        thứ không xác nhận được gì. Bạn không thấy nó đã được ghi, không sửa
        lại được lời nhắc của nó, và nếu bấm nhầm thì không còn gì để bấm lại.
        Ở ngày đã ghi đủ, cả thẻ co về một dòng chữ — tức chỗ trả lời "hôm nay
        thế nào" biến mất đúng lúc nó đáng được đọc nhất.

        Nay việc xong đổi HÌNH chứ không biến mất: ô icon thành dấu tích, chữ
        nhạt đi, và bên phải ghi "Đã ghi". Dòng vẫn bấm được — ghi thêm một bữa
        nữa là chuyện thường.
      */}
      {TODO_ORDER.map((key) => (
        <TodoRow key={key} itemKey={key} label={label[key]} done={done[key]} />
      ))}
    </GlassCard>
  );
}

/**
 * Một dòng việc, và mọi thứ bấm được trên nó đều ≥ 44 điểm.
 *
 * ── số đo, không phải cảm giác ──
 *
 * Bản trước: nút "Ghi" cao 32 với `hitSlop` bù, và nút tắt nhắc là một icon
 * **13 điểm**. Chủ dự án nói thẳng: "người già dùng nút nhỏ như vậy sao họ bấm
 * được". Số liệu đứng về phía câu ấy:
 *
 *   Apple HIG            44×44pt là SÀN cho một đích chạm
 *   WCAG 2.2 · 2.5.5     44×44 (AAA); 2.5.8 chỉ 24×24 (AA)
 *   nghiên cứu người già hiệu năng còn cải thiện tới ~17,5mm, và người ngón
 *                        tay kém linh hoạt cần ≥19mm
 *
 * 44pt trên iPhone ≈ 7,3mm — tức đúng cái SÀN, không phải cái đủ. Nên hình
 * dạng ở đây không chỉ nâng lên 44: nó đổi để đích chạm RỘNG ra theo chiều
 * ngang, thứ rẻ nhất mà bố cục cho phép.
 *
 *   ô icon        30 → 44
 *   nút ghi       32 cao × chữ ngắn → 48 cao, tối thiểu 96 rộng (≈16×8mm)
 *   hàng hẹn giờ  icon 13 → cả một hàng cao 44 chiếm hết cột chữ (≈33×7,3mm)
 *   tắt nhắc      icon 13 → một nút chiếm hết bề ngang trong tấm chọn giờ
 *
 * `hitSlop` bị bỏ ở đây, và đó là chủ ý: nó nới vùng chạm mà KHÔNG nới thứ mắt
 * nhìn thấy. Với người phải ngắm, cái nhìn thấy mới là cái họ nhắm vào.
 */
function TodoRow({
  itemKey,
  label,
  done,
}: {
  itemKey: TodoKey;
  label: string;
  done: boolean;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const tint = graphicOf(c, TINT[itemKey]);
  const [editing, setEditing] = useState(false);

  if (done) {
    return (
      <View style={styles.rowDone}>
        <View style={[styles.tile, styles.tileDone]}>
          <Icon icon={Check} size={20} color={graphicOf(c, 'readinessGreen')} />
        </View>
        <Text style={[styles.label, styles.labelDone]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.doneText}>{i18n.nTodoDone}</Text>
      </View>
    );
  }

  /*
    Cân nặng ghi TẠI CHỖ, vì nó không có màn riêng nào để mở. Ô nhập là
    `WeightEntry` — đúng cái đã nằm trong thẻ Cân nặng, tách ra dùng chung chứ
    không chép. Nó mang cả phần khó: quy đổi kg/lb, ngưỡng hợp lý, đường ghi
    offline.
  */
  const press = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (itemKey === 'weight') setEditing((v) => !v);
    else nav.push(ROUTE[itemKey as Exclude<TodoKey, 'weight'>]);
  };

  return (
    <View style={styles.rowOpen}>
      <View style={styles.rowTop}>
        <View style={styles.tile}>
          <Icon icon={ICON[itemKey]} size={20} color={tint} />
        </View>
        <View style={styles.text}>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          <ReminderRow itemKey={itemKey} label={label} />
        </View>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={`${i18n.nTodoLog} ${label}`}
          accessibilityState={itemKey === 'weight' ? { expanded: editing } : undefined}
          style={styles.action}
          onPress={press}>
          <Text style={styles.actionText}>{i18n.nTodoLog}</Text>
        </PressScale>
      </View>
      {itemKey === 'weight' && editing ? <WeightEntry onLogged={() => setEditing(false)} /> : null}
    </View>
  );
}

/**
 * Hàng hẹn giờ: một đích chạm chiếm hết cột chữ, cao 44.
 *
 * ── vì sao cái đồng hồ gọn của iOS bị bỏ ──
 *
 * Bản trước đặt `DateField display="compact"` thẳng vào hàng. Nó là control
 * native, nên vùng chạm của nó là đúng cái viên ~70×34 mà nó tự vẽ — bọc thêm
 * bao nhiêu `View` cũng không nới ra được. Cạnh nó là một icon 13 điểm để tắt.
 * Hai thứ ấy là hai đích nhỏ nhất trên cả thẻ.
 *
 * Nay hàng này chỉ là một CÁI NÚT to mở tấm chọn giờ, và tấm ấy dùng bánh xe
 * `spinner` — kiểu chọn giờ lớn nhất iOS có. Nút tắt nhắc nằm trong tấm, chiếm
 * hết bề ngang, thay cho cái icon 13 điểm.
 *
 * Trạng thái thứ ba vẫn là im lặng: `available` là `false` ngoài iOS, và ở đó
 * hàng này KHÔNG dựng — một nút hẹn giờ không bao giờ bắn được thông báo thì
 * tệ hơn là không có nút.
 */
function ReminderRow({ itemKey, label }: { itemKey: TodoKey; label: string }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  /*
    Instance thứ ba của `useReminders`, và điều đó AN TOÀN theo đúng thiết kế
    của nó: `prefs` sống ở một store phạm vi module có listener — chú thích
    "the switches are one person's answer, and there were two copies of it" ghi
    lại lần app đã trả giá cho việc mỗi mount giữ một bản riêng. Và lượt ghi
    lịch được chặn bằng chữ ký đã lưu, nên hai mount không đặt lịch hai lần.
  */
  const { prefs, available, toggle, setTime } = useReminders();
  const [open, setOpen] = useState(false);

  if (!available) return null;
  const key = TODO_REMINDER[itemKey];
  const r = prefs[key];
  const clock = `${r.hour}:${String(r.minute).padStart(2, '0')}`;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          r.enabled ? `${i18n.nTodoRemindAt} ${clock} — ${label}` : `${i18n.nTodoSetReminder} — ${label}`
        }
        style={styles.remind}
        onPress={() => {
          Haptics.selectionAsync();
          if (!r.enabled) toggle(key, true);
          setOpen(true);
        }}>
        <Icon icon={r.enabled ? Bell : BellPlus} size={16} color={c.mutedForeground} />
        <Text style={[styles.remindText, r.enabled && styles.remindTextOn]}>
          {r.enabled ? `${i18n.nTodoRemindAt} ${clock}` : i18n.nTodoSetReminder}
        </Text>
      </Pressable>
      <ReminderSheet
        visible={open}
        label={label}
        hour={r.hour}
        minute={r.minute}
        onPick={(h, m) => setTime(key, h, m)}
        onClear={() => {
          toggle(key, false);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/**
 * Tấm chọn giờ: bánh xe `spinner`, và mọi nút chiếm hết bề ngang.
 *
 * `spinner` chứ không `compact`: bánh xe là kiểu chọn giờ lớn nhất iOS có, và
 * cả tấm này tồn tại vì cái `compact` quá nhỏ để ngắm. Hai nút bên dưới cao 52
 * và rộng hết tấm — ở đây không còn lý do gì để tiết kiệm bề ngang.
 */
function ReminderSheet({
  visible,
  label,
  hour,
  minute,
  onPick,
  onClear,
  onClose,
}: {
  visible: boolean;
  label: string;
  hour: number;
  minute: number;
  onPick: (hour: number, minute: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* `accessible={false}`: đây là một vùng NUỐT CHẠM, không phải một nút —
          xem `tools/a11y-swallow.mjs`. */}
      <Pressable accessible={false} style={styles.scrim} onPress={onClose}>
        <Pressable accessible={false} style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle} numberOfLines={2}>
            {i18n.nTodoReminderSheet.replace('{what}', label.toLowerCase())}
          </Text>
          <DateField
            value={timeToDate(hour, minute)}
            mode="time"
            display="spinner"
            onChange={(_, d) => d && onPick(d.getHours(), d.getMinutes())}
          />
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.nTodoSaveTime}
            style={styles.sheetPrimary}
            onPress={() => {
              Haptics.selectionAsync();
              onClose();
            }}>
            <Text style={styles.sheetPrimaryText}>{i18n.nTodoSaveTime}</Text>
          </PressScale>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.nTodoReminderClear}
            style={styles.sheetQuiet}
            onPress={() => {
              Haptics.selectionAsync();
              onClear();
            }}>
            <Text style={styles.sheetQuietText}>{i18n.nTodoReminderClear}</Text>
          </PressScale>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Dùng chung cho công cụ: thứ tự dòng mà thẻ này vẽ. */
export const TODO_KEYS = TODO_ORDER;

const stylesFor = makeStyles((c, m) => ({
  card: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.headline, color: c.foreground },
  /* Tiến độ, không phải một nhãn: số cùng cỡ chữ phụ và cùng màu chữ phụ, nên
     nó đọc ra là ghi chú của tiêu đề chứ không tranh chỗ với tiêu đề. */
  count: { ...type.footnote, fontWeight: '600', color: c.mutedForeground, fontVariant: ['tabular-nums'] },

  /* Việc CHƯA xong chiếm chỗ; việc đã xong thì không. Đó là thứ bậc của một
     danh sách việc, và nó cũng là thứ giữ cho thẻ không cao 500 điểm ở ngày
     chưa ghi gì: hai dòng xong là hai dòng 56 thay vì hai dòng 96. */
  rowOpen: { gap: spacing.sm, paddingVertical: spacing.xs },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  rowDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: 56,
  },

  /* 44, không 30. Ô icon không bấm được, nhưng nó là thứ mắt tìm dòng bằng —
     và ở cỡ 30 với một glyph 16 thì nó là một chấm màu, không phải một dấu
     hiệu. */
  tile: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: m.inset.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileDone: { backgroundColor: alpha(graphicOf(c, 'readinessGreen'), 0.14) },

  text: { flex: 1, gap: 2 },
  label: { ...type.body, color: c.foreground },
  labelDone: { color: c.mutedForeground },
  doneText: { ...type.footnote, fontWeight: '600', color: c.mutedForeground },

  /* Hàng hẹn giờ: cao 44 và chiếm hết cột chữ. Đích chạm ra ~33×7,3mm, thay
     cho một icon 13 điểm. */
  remind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    alignSelf: 'flex-start',
    paddingRight: spacing.sm,
  },
  remindText: { ...type.footnote, color: c.mutedForeground },
  remindTextOn: { color: c.foreground, fontWeight: '600' },

  /* 48 cao, tối thiểu 96 rộng — ≈16×8mm. Apple đặt sàn 44; nghiên cứu về
     người cao tuổi nói hiệu năng còn cải thiện tới ~17,5mm, nên bề NGANG là
     chỗ rẻ nhất để trả thêm. Nền đặc vì đây là hành động chính của dòng. */
  action: {
    minWidth: 96,
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { ...type.headline, color: c.primaryForeground },

  scrim: {
    flex: 1,
    backgroundColor: alpha(m.ink, 0.45),
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    backgroundColor: c.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetTitle: { ...type.headline, color: c.foreground, textAlign: 'center' },
  /* 52, và rộng hết tấm. Trong một tấm mở riêng để chọn giờ thì không còn lý
     do gì để tiết kiệm bề ngang. */
  sheetPrimary: {
    height: 52,
    borderRadius: radius.full,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPrimaryText: { ...type.headline, color: c.primaryForeground },
  sheetQuiet: { height: 52, alignItems: 'center', justifyContent: 'center' },
  sheetQuietText: { ...type.body, color: c.mutedForeground },
}));
