import * as Haptics from 'expo-haptics';
import { Bell, BellPlus, Check, Dumbbell, HeartPulse, type LucideIcon, Moon, Scale, Utensils } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { DateField } from '@/components/ascnd/date-field';
import { WeightEntry } from '@/components/ascnd/weight-entry';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
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
  Icon ĐƠN SẮC, cả năm.

  ── bảng màu cũ, và vì sao nó đi ──

  Chỗ này từng có một bảng `TINT` gán cho mỗi dòng một màu riêng (cam, xanh
  dương, tím, đỏ, lam), theo đúng nửa sau của luật ở `tools/raised-pill.mjs`:
  "màu không biến mất, nó DỜI vào glyph, nơi nó phân biệt năm hành động".

  Chủ dự án nhìn bản dựng thật và quyết định khác: "tôi muốn tất cả icon ở mục
  này về đơn sắc". Nửa đầu của luật ấy vẫn nguyên — màu dành cho GIÁ TRỊ, không
  dành cho lối đi — và năm dòng này là năm lối đi. Cái nhãn đã nói rõ từng dòng
  là gì, nên năm hue chỉ còn là trang trí.

  ── mực, không phải mực nhạt ──

  `c.foreground` trên mặt ô (`m.inset.bg`) đo được **16,01:1** ở bản sáng và
  **14,52:1** ở bản tối; `mutedForeground` chỉ 5,27 và 4,42. Với một thẻ mà chủ
  dự án vừa phải nói là nút quá nhỏ cho người lớn tuổi, chọn vế nhạt hơn ở đây
  là đi ngược lại chính lý do đã làm mọi thứ to lên.

  Dòng ĐÃ XONG thì ngược lại: chữ nhạt đi, nên dấu tích nhạt theo. Trạng thái
  ấy vẫn không phụ thuộc vào màu — nó có HÌNH (dấu tích thay cho glyph việc) và
  có CHỮ ("Đã ghi"), tức WCAG 1.4.1 được thoả bằng hai đường chứ không bằng sắc
  độ.
*/
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
  const [editing, setEditing] = useState(false);

  if (done) {
    return (
      <View style={styles.rowDone}>
        <View style={styles.tile}>
          <Icon icon={Check} size={20} color={c.mutedForeground} />
        </View>
        <Text style={[styles.label, styles.labelFill, styles.labelDone]} numberOfLines={1}>
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
          <Icon icon={ICON[itemKey]} size={20} color={c.foreground} />
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
 * Hàng hẹn giờ: đồng hồ GỐC của iOS, cộng một nút tắt bằng CHỮ.
 *
 * ── một vòng đi và về, và cả hai chiều đều có lý do ──
 *
 * Bản đầu: `DateField display="compact"` cạnh một icon tắt **13 điểm**. Chủ dự
 * án báo cả cụm quá nhỏ, nên bản sau thay bằng một tấm riêng có bánh xe
 * `spinner`. Xem xong tấm ấy, chủ dự án đòi trả lại đồng hồ gọn: "cái đó nhìn
 * mượt hơn đẹp hơn". Đúng — và việc trả lại KHÔNG mâu thuẫn với lý do đã gỡ:
 *
 *   `DateField compact`  là control của HỆ ĐIỀU HÀNH. WCAG 2.2 · 2.5.8 miễn
 *                        trừ hẳn nhóm này ("User agent control": cỡ do user
 *                        agent quyết định và tác giả không sửa). Nó cũng là
 *                        thứ iOS dạy người dùng từ app Đồng hồ và Lịch.
 *   icon tắt 13 điểm     do TÔI vẽ, nên không có miễn trừ nào cả. Đó mới là
 *                        thứ đáng gỡ, và nó không quay lại.
 *
 * Nên: đồng hồ gọn trở lại nguyên trạng, còn chỗ tắt thành một nút CHỮ cao 44.
 * Một từ đọc được ở mọi cỡ mắt; một cái chuông gạch chéo 13 điểm thì không.
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

  if (!available) return null;
  const key = TODO_REMINDER[itemKey];
  const r = prefs[key];

  if (!r.enabled) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${i18n.nTodoSetReminder} — ${label}`}
        style={styles.remind}
        onPress={() => {
          Haptics.selectionAsync();
          toggle(key, true);
        }}>
        <Icon icon={BellPlus} size={16} color={c.mutedForeground} />
        <Text style={styles.remindText}>{i18n.nTodoSetReminder}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.remind}>
      <Icon icon={Bell} size={16} color={c.mutedForeground} />
      <DateField
        value={timeToDate(r.hour, r.minute)}
        mode="time"
        display="compact"
        onChange={(_, d) => d && setTime(key, d.getHours(), d.getMinutes())}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${i18n.nTodoReminderOff} — ${label}`}
        style={styles.remindOff}
        onPress={() => {
          Haptics.selectionAsync();
          toggle(key, false);
        }}>
        <Text style={styles.remindOffText}>{i18n.nTodoOff}</Text>
      </Pressable>
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
  /* TRÒN, không vuông bo.

     Chủ dự án yêu cầu, và tra HIG thì Apple KHÔNG có quy tắc nào cho ô icon
     trong một hàng danh sách — chính app của họ dùng cả hai (Cài đặt vuông bo,
     Danh bạ/Thể dục tròn). Nên đây là một lựa chọn, không phải một chuẩn, và
     nó được ghi lại đúng như thế.

     `radius.full` chứ không phải `22`: React Native tự kẹp bán kính về nửa
     cạnh ngắn, nên một con số gõ tay sẽ thành sai ngay lần đầu ai đó đổi cạnh
     ô — mà cạnh ấy vừa đi từ 30 lên 44 ở lượt trước. */
  tile: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: m.inset.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  text: { flex: 1, gap: 2 },
  label: { ...type.body, color: c.foreground },
  /* Chỉ dòng ĐÃ XONG cần vế này: ở đó chữ nằm thẳng trong hàng, nên nó phải tự
     đẩy "Đã ghi" ra mép phải. Dòng chưa xong đã có cột `text` lo việc đó. */
  labelFill: { flex: 1 },
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
  /* Nút tắt là một TỪ cao 44, không phải một cái chuông gạch chéo 13 điểm.
     Chữ đọc được ở mọi cỡ mắt và nói rõ nó làm gì; glyph thì phải đoán. */
  remindOff: { height: 44, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  remindOffText: { ...type.footnote, fontWeight: '600', color: c.mutedForeground },

  /* 44 cao — SÀN của Apple HIG và WCAG 2.5.5 — và viền rỗng, không nền đặc.

     ── hai thứ đã đổi cùng lúc, và chỉ một trong hai là thứ phải đổi ──

     Lượt trước nút đi từ 32 lên 48 VÀ từ viền rỗng sang nền `c.primary`, mà
     `c.primary` bản sáng là `#1a1917`. Năm viên gần-đen xếp dọc trên một thẻ
     trắng là thứ chủ dự án gọi là "trông ghê quá" — và đúng: thứ được báo hỏng
     là CỠ, không phải hình dáng.

     Nên hình dáng quay về đúng bản không ai chê, còn cỡ ở lại trên sàn:
     44 cao × tối thiểu 72 rộng ≈ 12×7,3mm, và chữ to lên từ `footnote` (13)
     sang `body` (17) — đọc được mà không phải tô đen cả viên.

     Cùng lý do "đặc là hành động chính, viền là hành động phụ" mà nút Sign in
     with Apple ở màn đăng nhập đã phải chọn: ở đây năm dòng ngang hàng nhau,
     nên không dòng nào được đọc ra là chính. */
  action: {
    minWidth: 72,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { ...type.body, fontWeight: '600', color: c.foreground },

}));
