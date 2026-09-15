import * as Haptics from 'expo-haptics';
import { Bell, BellOff, Dumbbell, HeartPulse, type LucideIcon, Moon, Scale, Utensils } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { DateField } from '@/components/ascnd/date-field';
import { WeightEntry } from '@/components/ascnd/weight-entry';
import { radius, spacing, type } from '@/constants/ascnd';
import { graphicOf, makeStyles, type PaletteKey } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { useDailyQuests } from '@/hooks/use-daily-quests';
import { useTodayWeight } from '@/hooks/use-fitness-data';
import { usePalette } from '@/hooks/use-palette';
import { useTodayBiometrics } from '@/hooks/useTodayData';
import { useReminders } from '@/hooks/use-reminders';
import { nav } from '@/lib/nav';
import type { TimedReminderKey } from '@/lib/reminder-plan';
import { timeToDate } from '@/lib/reminder-timing';
import { TODO_ORDER, todoOpen, todoProgress, type TodoDone, type TodoKey } from '@/lib/todo';

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

  const open = todoOpen(done);
  const progress = todoProgress(done);

  return (
    <GlassCard style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{i18n.nTodoTitle}</Text>
        <Text style={styles.count}>
          {progress.done}/{progress.total}
        </Text>
      </View>
      {open.length === 0 ? (
        <Text style={styles.allDone}>{i18n.nTodoAllDone}</Text>
      ) : (
        open.map((key) => (
          <TodoRow key={key} itemKey={key} label={label[key]} action={i18n.nTodoLog} />
        ))
      )}
    </GlassCard>
  );
}

function TodoRow({ itemKey, label, action }: { itemKey: TodoKey; label: string; action: string }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const tint = graphicOf(c, TINT[itemKey]);

  /*
    Cân nặng ghi TẠI CHỖ, vì nó không có màn riêng nào để mở.

    Ô nhập là `WeightEntry`, đúng cái đã nằm trong thẻ Cân nặng — được tách ra
    một tệp dùng chung chứ không chép lại. Nó mang theo cả phần khó: quy đổi
    kg/lb, ngưỡng hợp lý, và đường ghi offline. Chép nó sang đây sẽ là bản thứ
    hai của một logic ghi dữ liệu, và bản thứ hai luôn trôi.
  */
  if (itemKey === 'weight') {
    return <WeightRow label={label} action={action} tint={tint} />;
  }

  return (
    <View style={styles.row}>
      <View style={styles.tile}>
        <Icon icon={ICON[itemKey]} size={16} color={tint} />
      </View>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        <ReminderLine itemKey={itemKey} />
      </View>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`${action} ${label}`}
        /* Mảng màu 32 điểm, vùng chạm 44 — cùng cách trả nợ mà `tools/tap-target.mjs`
           tự khuyên: nút cao bằng một control cạnh dòng chữ, không bằng một tấm biển. */
        hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
        style={styles.action}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          nav.push(ROUTE[itemKey as Exclude<TodoKey, 'weight'>]);
        }}>
        <Text style={styles.actionText}>{action}</Text>
      </PressScale>
    </View>
  );
}

/**
 * Dòng giờ dưới tên việc.
 *
 * ── ba trạng thái, và trạng thái thứ ba là im lặng ──
 *
 * Chưa hẹn thì hiện một lối vào nhạt ("Hẹn giờ"). Đã hẹn thì hiện đúng cái
 * đồng hồ của iOS — cùng `DateField` mà màn Nhắc nhở dùng, nên giờ sửa ở đây
 * hay ở đó đều là một giá trị, một lịch.
 *
 * Trạng thái thứ ba: `available` là `false` ngoài iOS, và ở đó dòng này KHÔNG
 * dựng. Một nút hẹn giờ không bao giờ bắn được thông báo thì tệ hơn là không
 * có nút: nó hứa một việc mà nền tảng không làm.
 */
function ReminderLine({ itemKey }: { itemKey: TodoKey }) {
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

  if (!available) return null;
  const key = TODO_REMINDER[itemKey];
  const r = prefs[key];

  if (!r.enabled) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${i18n.nTodoSetReminder} — ${i18n.nReminderTime}`}
        hitSlop={8}
        style={styles.remindOff}
        onPress={() => {
          Haptics.selectionAsync();
          toggle(key, true);
        }}>
        <Icon icon={Bell} size={12} color={c.mutedForeground} />
        <Text style={styles.remindOffText}>{i18n.nTodoSetReminder}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.remindOn}>
      <Text style={styles.remindLabel}>{i18n.nTodoRemindAt}</Text>
      <DateField
        value={timeToDate(r.hour, r.minute)}
        mode="time"
        display="compact"
        onChange={(_, d) => d && setTime(key, d.getHours(), d.getMinutes())}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={i18n.nTodoReminderOff}
        hitSlop={10}
        onPress={() => {
          Haptics.selectionAsync();
          toggle(key, false);
        }}>
        <Icon icon={BellOff} size={13} color={c.mutedForeground} />
      </Pressable>
    </View>
  );
}

/**
 * Dòng cân nặng: cùng hình dạng với bốn dòng kia cho tới khi được bấm.
 *
 * Nút vẫn là đúng nút ấy — năm dòng phải trông như nhau, vì chúng là năm việc
 * ngang hàng. Khác biệt duy nhất nằm sau cú bấm: bốn dòng kia mở một màn, dòng
 * này mở một ô nhập ngay bên dưới, vì cân nặng không có màn nào để mở.
 */
function WeightRow({ label, action, tint }: { label: string; action: string; tint: string }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const [editing, setEditing] = useState(false);
  return (
    <View>
      <View style={styles.row}>
        <View style={styles.tile}>
          <Icon icon={ICON.weight} size={16} color={tint} />
        </View>
        <View style={styles.text}>
          <Text style={styles.label}>{label}</Text>
          <ReminderLine itemKey="weight" />
        </View>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={`${action} ${label}`}
          accessibilityState={{ expanded: editing }}
          hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
          style={styles.action}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setEditing((v) => !v);
          }}>
          <Text style={styles.actionText}>{action}</Text>
        </PressScale>
      </View>
      {editing ? <WeightEntry onLogged={() => setEditing(false)} /> : null}
    </View>
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
  /* 44 là sàn chạm của Apple, và cả hàng là vùng chạm chứ không riêng cái nút. */
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, minHeight: 44 },
  /* Ô trung tính: `m.inset.bg` là mặt của một chỗ lõm TRÊN THẺ — cùng vai mà
     màn đăng nhập vừa phải sửa sang, và cùng lý do: một mảng tô tự chế trên mặt
     thẻ trắng thì composite ra đúng mặt thẻ. */
  tile: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: m.inset.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Chữ và giờ nằm CHUNG một cột, để cái nút bên phải canh theo cả khối chứ
     không canh theo riêng dòng chữ. */
  text: { flex: 1, gap: 2 },
  label: { ...type.body, color: c.foreground },
  remindOn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  remindLabel: { ...type.caption, color: c.mutedForeground },
  remindOff: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  remindOffText: { ...type.caption, color: c.mutedForeground },
  /* Viền chứ không đặc: năm dòng với năm nút đặc trên một thẻ là năm hành động
     chính, và không có hành động nào là chính cả — chúng ngang hàng nhau. */
  action: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { ...type.footnote, fontWeight: '700', color: c.foreground },
  allDone: { ...type.footnote, color: c.mutedForeground },
}));
