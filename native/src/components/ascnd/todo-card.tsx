import * as Haptics from 'expo-haptics';
import {
  Bell,
  BellOff,
  BicepsFlexed,
  Check,
  HeartPulse,
  type LucideIcon,
  CircleMinus,
  Moon,
  SquarePen,
  Soup,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { HANDOVER_AT, HANDOVER_SCALE, SwipeRow, useSwipeOpenness, type SwipeAction } from '@/components/ascnd/swipe-row';
import { DateField } from '@/components/ascnd/date-field';
import { WeightEntry } from '@/components/ascnd/weight-entry';
import { BodyScale } from '@/constants/app-icons';
import { radius, spacing, type } from '@/constants/ascnd';
import { iconTint } from '@/constants/icon-tint';
import { alpha, makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { useDailyQuests } from '@/hooks/use-daily-quests';
import { useTodayWeight } from '@/hooks/use-fitness-data';
import { useMaterial, usePalette } from '@/hooks/use-palette';
import { useTodayBiometrics } from '@/hooks/useTodayData';
import { useReminders } from '@/hooks/use-reminders';
import { useTodoSkip } from '@/hooks/use-todo-skip';
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
  Năm hình, và chúng phải khác nhau ở KHỐI chứ không chỉ ở chi tiết.

  ── vì sao ba cái phải đổi ──

  Chủ dự án nói ba dòng đầu nhìn giống nhau quá. Dựng thử cả bộ ứng viên ở đúng
  cỡ 20pt rồi nhìn thì lý do hiện ra ngay: `Utensils`, `Dumbbell` và `Scale`
  đều là hình MẢNH, THƯA, gần như chỉ mấy nét thẳng — trong khi `Moon` là một
  khối lưỡi liềm đặc và `HeartPulse` là một hình khép kín. Ba dòng không có
  khối đứng cạnh hai dòng có khối thì đọc ra là "ba cái giống nhau", dù chúng
  vẽ ba vật hoàn toàn khác.

  Nên ba cái mới đều là hình KHÉP KÍN, và mỗi cái một dáng:

    Soup          bát tròn, miệng rộng, có hơi bốc — dáng NGANG
    BicepsFlexed  bắp tay gập, một khối cong đặc — dáng CHÉO
    BodyScale     cân điện tử, mặt vuông có màn hình — dáng VUÔNG

  ── `BodyScale` là hình DUY NHẤT app tự vẽ, và đây là lý do ──

  Dòng này đã trượt hai lần. Lucide `Scale` là cán cân CÔNG LÝ — hai đĩa treo
  trên một đòn cân — nên nó nói về so sánh, không phải cái cân người ta bước
  lên. Thay bằng `Weight` thì gần hơn nhưng vẫn sai: đó là QUẢ CÂN của cái cân
  đòn. Chủ dự án khoanh lại lần nữa: "nó phải là một cái cân điện tử hình vuông".

  Đã dựng cả bộ ứng viên vuông của lucide ở đúng 20pt rồi nhìn — không cái nào
  là cân sức khoẻ; gần nhất là `panel-bottom`, một tấm panel giao diện. Nên
  `constants/app-icons.ts` vẽ đúng MỘT hình, bằng chính `createLucideIcon` của
  lucide, theo bố cục chủ dự án gửi kèm.

  ── `BicepsFlexed` cũng gỡ một chỗ trùng ──

  `Dumbbell` là glyph của MỤC "Thể lực" ngay bên dưới thẻ này, cùng màu thép.
  Cùng một hình cho một mục và cho một dòng việc, cách nhau vài trăm điểm, là
  đúng cái bẫy `tools/glyph-meaning.mjs` được viết ra để bắt.

  Bốn trong năm hình đến từ lucide, và hình thứ năm dựng bằng factory của chính
  lucide chứ không bằng một `<Svg>` tự ráp — đúng bài học `macro-icon-style.mjs`
  đã trả giá một lần: một bộ vẽ tay ĐỘC LẬP luôn trôi khỏi bộ gốc.
*/
const ICON: Record<TodoKey, LucideIcon> = {
  meal: Soup,
  workout: BicepsFlexed,
  sleep: Moon,
  biometrics: HeartPulse,
  weight: BodyScale,
};

/*
  Màu icon ĐẾN TỪ bảng chuẩn của app, không từ một bảng gõ tay ở đây.

  ── một vòng nữa, và lần này nó dừng ở chỗ đúng ──

  Bản đầu có bảng `TINT` riêng (cam, xanh dương, tím, đỏ, lam) — tức bảng màu
  thứ hai cho cùng những khái niệm. Chủ dự án cho về đơn sắc, rồi nói lại: trả
  màu về, nhưng "màu cần chuẩn và có ý nghĩa hơn theo mặt nghĩa đen".

  Đúng chỗ để lấy là `constants/icon-tint.ts` — bảng app đã dựng sẵn cho việc
  này, và nó đã suy luận theo đúng nghĩa đen: *"Tạ, đĩa tạ, đòn gánh: thứ người
  ta cầm lên đều bằng thép. Một cái tạ màu xanh neon là một cái tạ không ai từng
  thấy."* Nên ở đây không còn bảng nào cả, chỉ một lời gọi `iconTint()`:

      Soup         → FOOD      readinessGreen   thức ăn
      BicepsFlexed → TRAINING  champagne        thép, thứ người ta cầm lên
      Moon         → NIGHT     metricPurple     đêm
      HeartPulse   → VITAL     readinessRed     tín hiệu của cơ thể
      BodyScale    → INSIGHT   metricBlue       con số bạn nhìn nó đi đâu

  ── dòng cuối KHÔNG còn đỏ, và đó là một chỗ sai đã sửa ──

  Hai dòng cuối từng cùng `VITAL`, tức cùng đỏ, và lời biện hộ ở đây là "màu nói
  MIỀN chứ không nói danh tính". Chủ dự án khoanh đúng dòng ấy: "cân nặng thì
  liên quan gì đến màu đỏ". Đỏ trong app nói máu và nói báo động; không cái nào
  là con số bạn bước lên cân để đọc. Lý do đổi nằm ở `icon-tint.ts` cạnh chính
  mục ấy — gồm cả vì sao KHÔNG mở một miền thứ tám.

  Đo trên mặt ô icon, cả năm màu: 4,52–5,41:1 ở bản sáng và 4,79–11,92:1 ở bản
  tối, trên sàn 3:1 của WCAG 1.4.11 cho vật thể đồ hoạ; riêng màu mới đo
  4,55:1 và 6,54:1, cao hơn màu đỏ nó thay.

  Dòng ĐÃ XONG thì không lấy màu miền: chữ nhạt đi nên dấu tích nhạt theo. Trạng
  thái ấy vẫn không phụ thuộc màu — nó có HÌNH (dấu tích) và có CHỮ ("Đã ghi").
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
/**
 * Việc ĐÃ GHI nhạt đi bao nhiêu, và vì sao không nhạt hơn được.
 *
 * ── đặt hàng ──
 *
 * Chủ dự án: "khi đã được ghi thì chỉ nút ghi hiện đã ghi, còn thẻ và icon giữ
 * nguyên chỉ mờ đi so với các thẻ còn lại".
 *
 * ── vì sao KHÔNG phải một `opacity` trên cả dòng ──
 *
 * Đó là cách hiển nhiên, và nó phá sàn tương phản của chính app. Đo trên mặt
 * thẻ ở cả hai diện mạo: ở `opacity` 0,75 thì chữ nhắc tụt còn 3,20:1 và icon
 * buổi tập còn 2,96:1 — dưới 4,5:1 của WCAG 1.4.3 và 3:1 của 1.4.11. Lý do là
 * hai thứ ấy vốn đã sát sàn khi CHƯA mờ (4,71 và 4,57), nên chúng không có chỗ
 * để nhạt. Một `opacity` mờ đủ để nhìn ra thì đã mờ quá mức đọc được.
 *
 * Và ngoại lệ "thành phần không hoạt động" của 1.4.3 KHÔNG cứu được chỗ này:
 * nó chỉ áp cho thứ "nhìn thấy nhưng không thao tác được". Dòng đã ghi ở đây
 * vẫn bấm được (để sửa) và vẫn vuốt được, nên nó là thành phần ĐANG hoạt động.
 *
 * ── nên nhạt bằng hai đường khác, mỗi đường có số của nó ──
 *
 *   chữ   đổi TOKEN chứ không mờ: `foreground` → `mutedForeground`, tức
 *         17,57→5,78 bản sáng và 15,46→4,71 bản tối. Rơi rất nhiều về thị
 *         giác mà vẫn trên sàn 4,5.
 *   nút   bỏ nền đen đặc, còn lại một nút chữ. Đây là chỗ rơi nặng nhất, và
 *         đúng chỗ chủ dự án chỉ: "chỉ nút ghi hiện đã ghi".
 *   icon  mờ 0,80 NHƯNG ô icon giữ nguyên, nên icon nhạt về phía ô chứ không
 *         về phía thẻ. Đo cả năm miền: thấp nhất 3,16:1 ở 0,80, còn 0,75 đã
 *         là 2,90 — nên 0,80 là SÀN, không phải một con số cho đẹp.
 *
 * Trạng thái vẫn không phụ thuộc sắc độ: nút ghi hẳn chữ "Đã ghi" (WCAG 1.4.1).
 */
const DONE_ICON_ALPHA = 0.8;

/**
 * Viên "Đã ghi": vì sao nó có nền trở lại, và vì sao CHỮ không xanh.
 *
 * ── đặt hàng ──
 *
 * Chủ dự án đưa một ảnh dựng và nói *"nút đã ghi thì nên làm như này"*: một
 * viên xanh nhạt, dấu tích xanh, chữ xanh — đứng cạnh bốn viên đen đặc của mấy
 * dòng chưa ghi.
 *
 * Yêu cầu ấy sửa đúng một chỗ hỏng mà lượt trước tạo ra. Bỏ nền viên đi
 * (`backgroundColor: 'transparent'`) làm dòng đã ghi trông như một cái NHÃN,
 * trong khi nó vẫn là một cái NÚT: bấm vào là sửa được lượt ghi sai. HIG nói
 * thẳng điều này — một control còn thao tác được thì phải còn trông như
 * control. Nên viên quay lại, và nó quay lại với một sắc thái khẳng định.
 *
 * ── nhưng chữ xanh thì KHÔNG đứng được ở bản sáng, và đây là số ──
 *
 * `readinessGreen` bản sáng là `#078055`, mới chỉ **4,97:1** trên giấy trắng.
 * Viên xanh nhạt làm nền TỐI đi, nên chữ xanh trên viên xanh rớt xuống dưới
 * 4,5:1 của WCAG 1.4.3 ở MỌI độ đậm — 4,46 ngay từ α 0,08, và càng đậm càng
 * tệ. Không phải ý thích, là số học: màu ấy không có chỗ để nhạt.
 *
 * Ba đường còn lại đều đo rồi:
 *
 *   viên bằng bề mặt sẵn có (`secondary`/`muted`/`accent`) + chữ xanh
 *       → 4,15 · 4,30 · 3,89 ở bản sáng. Vẫn rớt, vì vấn đề là màu CHỮ.
 *   làm xanh đậm hơn cho bản sáng (`#0a6f4a` trở đi thì đạt)
 *       → phải thêm một token bảng màu, và `readinessGreen` còn tô icon món
 *         ăn, vòng sẵn sàng, dải xu hướng. Đổi nó là đổi cả một miền nghĩa cho
 *         một cái viên. Ngoài phạm vi việc này.
 *   giữ viên xanh, chuyển màu XANH sang chỗ nó đủ sức đứng: DẤU TÍCH.
 *       → icon chịu sàn 3:1 của WCAG 1.4.11 chứ không phải 4,5:1, và trên viên
 *         nó đo được 4,23 (sáng) · 9,75 (tối). Dư.
 *
 * Đường thứ ba là đường được chọn, nên: **viên xanh, tích xanh, chữ
 * `secondaryForeground`** — 6,59:1 bản sáng · 4,88:1 bản tối, một token cho cả
 * hai diện mạo. (`mutedForeground`, màu chữ hiện nay, đạt 4,92 ở bản sáng
 * nhưng chỉ 3,62 ở bản tối, nên nó không đi được cả hai.)
 *
 * ── và "đã ghi" vẫn phải NHẠT hơn "chưa ghi" ──
 *
 * Đó là đặt hàng cũ, và nó không bị bản này phá: viên đen của dòng chưa ghi
 * tách khỏi mặt thẻ **17,57:1**, viên xanh này tách **1,175:1** (sáng) và
 * **1,301:1** (tối). Nó là thứ yên nhất trong cột, chỉ là không còn tàng hình.
 * Sàn dưới 1,134 là bậc bề mặt nhỏ nhất iOS tự tạo ra — cùng con số
 * `bar-track.mjs` và `plan-week.mjs` dùng, và vì cùng lý do.
 *
 * ── dấu tích này KHÔNG phải dấu tích đã bị bỏ ──
 *
 * Cái bị bỏ ở lượt trước thay THẾ ô icon của dòng, nên ghi xong là dòng đổi cả
 * bố cục và mất lối sửa. Cái này nằm BÊN TRONG viên, ô icon giữ nguyên. Nó
 * cộng thêm một dấu hiệu không-phải-màu chứ không lấy đi cái nào — chữ "Đã
 * ghi" vẫn ở đó, WCAG 1.4.1 vẫn được giữ bằng chữ.
 *
 * ── BỎ QUA không dùng viên này, và đó là một quyết định ──
 *
 * `quiet` gộp `done` và `skipped` cho ô icon và cho nhãn, vì cả hai đều là
 * "dòng này xong việc của hôm nay". Nhưng viên thì tách: xanh + tích là lời
 * khen, còn "Bỏ qua" là một việc người dùng CHỦ ĐỘNG bỏ. Khen một việc bị bỏ
 * là nói sai về chính họ. Chủ dự án chỉ vào nút "Đã ghi", nên chỉ nút ấy đổi.
 */
const DONE_PILL_ALPHA = 0.12;

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
  const skip = useTodoSkip();
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

  /* Chưa đọc xong ngày thì chưa nói gì — xem chú thích `ready` ở trên. Kho bỏ
     qua cũng phải xong: đếm trước khi đĩa trả lời là để con số nhảy một nhịp. */
  if (!quests.ready || !skip.ready) return null;

  const progress = todoProgress(done, skip.skipped);

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
        <TodoRow
          key={key}
          itemKey={key}
          label={label[key]}
          done={done[key]}
          skipped={skip.skipped.includes(key)}
          onSkip={() => skip.toggle(key)}
        />
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
  skipped,
  onSkip,
}: {
  itemKey: TodoKey;
  label: string;
  done: boolean;
  skipped: boolean;
  onSkip: () => void;
}) {
  const c = usePalette();
  const m = useMaterial();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const [editing, setEditing] = useState(false);
  const { prefs, available, toggle } = useReminders();

  /*
    Cân nặng ghi TẠI CHỖ, vì nó không có màn riêng nào để mở. Ô nhập là
    `WeightEntry` — đúng cái đã nằm trong thẻ Cân nặng, tách ra dùng chung chứ
    không chép. Nó mang cả phần khó: quy đổi kg/lb, ngưỡng hợp lý, đường ghi
    offline.
  */
  const press = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    /* Bấm để ghi trên một dòng đã bỏ qua là đổi ý, nên nó gỡ cờ luôn — lời hứa
       ở chú thích `todoProgress` ("chính lượt ghi ấy gỡ cờ bỏ qua"). Không gỡ
       thì việc vừa ghi vẫn nằm ngoài mẫu số và con số không nhúc nhích. */
    if (skipped) onSkip();
    if (itemKey === 'weight') setEditing((v) => !v);
    else nav.push(ROUTE[itemKey as Exclude<TodoKey, 'weight'>]);
  };

  /*
    ── HAI nút ở mép phải, và vì sao nút thứ ba bị gỡ ──

    Đặt hàng là ba. Sau khi dùng thử trên máy thật, chủ dự án báo lại: "tôi thấy
    nút hẹn giờ hiện tại là nút rỗng không có ý nghĩa, nút sửa lại cũng vậy".
    Cả hai đều đúng, và mỗi cái sai một kiểu:

      Hẹn giờ   khi lời nhắc ĐÃ bật thì nó không làm được gì — đồng hồ gọn của
                iOS không mở được bằng mã, nó chỉ mở khi ngón tay chạm đúng nó.
                Mà khi lời nhắc CHƯA bật thì nó trùng y hệt nút "Bật" bên cạnh.
                Không trạng thái nào nó có việc riêng, nên nó bị gỡ hẳn: đồng hồ
                NGAY TRÊN HÀNG chính là chỗ hẹn giờ.
      Sửa lại   trên dòng chưa ghi, nó đi đúng chỗ mà nút "Ghi" ngay cạnh đã đi.
                Một lối tắt tới thứ đang hiện ngay đó không phải một lối tắt.
                Nên nó chỉ còn trên dòng ĐÃ GHI, nơi nó là đường duy nhất để
                chữa một lượt ghi sai.

    Còn lại: dòng chưa ghi có một nút, dòng đã ghi có hai. Ít hơn đặt hàng, và
    tôi nói thẳng chứ không lặng lẽ giữ hai cái nút không bấm được.

    ── màu: `primary`, KHÔNG phải màu miền ──

    Bản đầu tô "Sửa lại" xanh dương và "Tắt nhắc" tím. Cả hai đo đủ tương phản
    (5,00 và 5,94 bản sáng), và cả hai vẫn sai: `icon-tint.ts` đã tiêu xanh
    dương cho cân nặng và tím cho giấc ngủ, nên một viên nang tím trượt ra cạnh
    dòng Giấc ngủ đang nói hai điều khác nhau bằng cùng một màu.

    Còn lại đúng một cặp không mang nghĩa miền nào: `primary` với
    `primaryForeground` — cặp app định nghĩa cho HÀNH ĐỘNG, và là cặp có dư địa
    lớn nhất (17,57:1 bản sáng · 9,14:1 bản tối). Hai nút phân biệt nhau bằng
    HÌNH và bằng CHỮ. Màu duy nhất trên cả hàng là cái nút đỏ ở mép kia.
  */
  const reminderKey = TODO_REMINDER[itemKey];
  const reminderOn = available && prefs[reminderKey].enabled;

  /*
    ── nút bỏ qua, và vì sao CHỈ chiều bỏ mới hỏi lại ──

    Chủ dự án gửi ảnh Nhạc và Nhắc nhở của iOS: nút là một viên nang ĐỎ với một
    dấu trừ TRÒN màu trắng, và kéo hết cỡ thì nó nở ra chiếm hết khoảng đã kéo
    rồi một hộp thoại hệ thống hỏi lại.

    Hỏi lại chỉ gắn vào cú KÉO DÀI, và chỉ khi đang BỎ QUA. Lấy lại một việc đã
    bỏ thì không cần hỏi — nó chỉ trả mọi thứ về như cũ. Hỏi ở đó là hỏi một câu
    không có hậu quả nào, và đó là cách nhanh nhất để người ta thôi đọc hộp
    thoại.

    Câu hỏi nói ra ĐÚNG hai hậu quả, vì đây không phải một cú xoá: việc quay lại
    vào ngày mai, và hôm nay bớt đi một việc (mẫu số co lại — xem `todoProgress`).
  */
  const skipAction: SwipeAction = {
    icon: CircleMinus,
    label: skipped ? i18n.nTodoUnskip : i18n.nTodoSkip,
    tint: c.destructive,
    ink: c.destructiveForeground,
    confirm: skipped
      ? undefined
      : {
          title: i18n.nTodoSkipAsk.replace('{n}', label.toLocaleLowerCase()),
          message: i18n.nTodoSkipWhy,
          ok: i18n.nTodoSkip,
        },
    onPress: onSkip,
  };

  const rightActions: SwipeAction[] = [
    ...(done ? [{ icon: SquarePen, label: i18n.nTodoEdit, tint: c.primary, onPress: press }] : []),
    ...(available
      ? [
          {
            icon: reminderOn ? BellOff : Bell,
            label: reminderOn ? i18n.nTodoOff : i18n.nTodoOn,
            tint: c.primary,
            onPress: () => {
              Haptics.selectionAsync();
              toggle(reminderKey, !reminderOn);
            },
          },
        ]
      : []),
  ];

  const tint = c[iconTint(ICON[itemKey]) ?? 'foreground'];
  /* Bỏ qua và đã ghi cùng một sắc độ: cả hai đều là "dòng này xong việc của
     hôm nay". Chữ trên nút mới là thứ nói chúng khác nhau thế nào. */
  const quiet = done || skipped;
  const word = skipped ? i18n.nTodoSkipped : done ? i18n.nTodoDone : i18n.nTodoLog;

  return (
    <SwipeRow
      fullSwipe
      lifts
      style={styles.bleed}
      cancelLabel={i18n.cancel}
      left={[skipAction]}
      right={rightActions}>
      <RowBody
        itemKey={itemKey}
        label={label}
        word={word}
        quiet={quiet}
        done={done}
        tint={tint}
        editing={editing}
        onPress={press}
        onLogged={() => setEditing(false)}
      />
    </SwipeRow>
  );
}

/**
 * Phần nhìn thấy của một dòng — và nó là component RIÊNG vì một lý do cụ thể.
 *
 * `useSwipeOpenness()` chỉ trả lời được khi đứng BÊN TRONG `SwipeRow`. `TodoRow`
 * là chỗ dựng `SwipeRow`, nên hook gọi ở đó sẽ nằm ngoài provider và luôn nhận
 * `null`. Tách ra là cách rẻ nhất để nội dung hàng biết hàng đang bị kéo bao xa.
 */
function RowBody({
  itemKey,
  label,
  word,
  quiet,
  done,
  tint,
  editing,
  onPress,
  onLogged,
}: {
  itemKey: TodoKey;
  label: string;
  word: string;
  quiet: boolean;
  /* Tách khỏi `quiet` CHỈ để quyết cái viên — xem `DONE_PILL_ALPHA`: bỏ qua
     không được nhận viên khen. Ô icon và nhãn vẫn đi theo `quiet`. */
  done: boolean;
  tint: string;
  editing: boolean;
  onPress: () => void;
  onLogged: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();

  /*
    ── nút "Ghi" NHƯỜNG CHỖ khi hàng bị kéo ──

    Chủ dự án: "nút ghi sẽ ẩn đi khi trượt sang 2 bên kèm animation đồng bộ".
    Lý do nó phải ẩn: nút vuốt và nút "Ghi" cùng đòi một đầu hàng. Vuốt sang
    trái thì nút vuốt trồi lên đúng chỗ "Ghi" đang đứng, và trong lúc hàng chưa
    đi hết thì hai nút chồng lên nhau; vuốt sang phải thì "Ghi" bị mép thẻ cắt
    một nửa — cả hai đều đọc ra là một cái nút hỏng.

    "Đồng bộ" nghĩa là chạy theo CHÍNH cú kéo, không phải một animation riêng
    bắt đầu khi hàng mở: `openness` là giá trị `SwipeRow` dùng cho góc bo và cho
    mặt hàng, nên ba thứ ấy là một chuyển động.

    Tắt ở 0,55 chứ không phải 1: nút phải biến mất TRƯỚC khi nút vuốt tới nơi,
    không thì có một quãng hai cái cùng hiện. Và nó thu nhỏ chứ không chỉ mờ —
    một nút mờ dần tại chỗ đọc ra là hỏng, một nút co lại đọc ra là nhường chỗ.

    `fallback` cho trường hợp đứng ngoài một `SwipeRow`: `useSwipeOpenness()`
    trả `null` ở đó, và hook thì không gọi có điều kiện được.
  */
  const fallback = useSharedValue(0);
  const openness = useSwipeOpenness() ?? fallback;
  /* Hai hằng số ĐỌC từ `swipe-row.tsx`, không chép: nút vuốt làm đúng phép này
     đảo chiều trong đúng khoảng này, và hai bên lệch nhau thì có một quãng hai
     nút cùng hiện hoặc một quãng không nút nào. Xem `HANDOVER_AT`. */
  const yield_ = useAnimatedStyle(() => ({
    opacity: interpolate(openness.value, [0, HANDOVER_AT], [1, 0], 'clamp'),
    transform: [{ scale: interpolate(openness.value, [0, HANDOVER_AT], [1, HANDOVER_SCALE], 'clamp') }],
  }));

  return (
    <View style={[styles.rowOpen, styles.rowSwipe]}>
      <View style={styles.rowTop}>
        <View style={styles.tile}>
          <Icon icon={ICON[itemKey]} size={20} color={quiet ? alpha(tint, DONE_ICON_ALPHA) : tint} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.label, quiet && styles.labelDone]} numberOfLines={1}>
            {label}
          </Text>
          <ReminderRow itemKey={itemKey} />
        </View>
        <Animated.View style={yield_}>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={`${word} — ${label}`}
            accessibilityState={itemKey === 'weight' ? { expanded: editing } : undefined}
            style={[styles.action, quiet && styles.actionQuiet, done && styles.actionDone]}
            onPress={onPress}>
            {done ? <Icon icon={Check} size={16} color={c.readinessGreen} /> : null}
            <Text style={[styles.actionText, quiet && styles.actionTextQuiet, done && styles.actionTextDone]}>
              {word}
            </Text>
          </PressScale>
        </Animated.View>
      </View>
      {itemKey === 'weight' && editing ? <WeightEntry onLogged={onLogged} /> : null}
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
function ReminderRow({ itemKey }: { itemKey: TodoKey }) {
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
  const { prefs, available, setTime } = useReminders();

  if (!available) return null;
  const key = TODO_REMINDER[itemKey];
  const r = prefs[key];

  /*
    ── NHẮC ĐANG TẮT: dòng không nói gì cả ──

    Chủ dự án: "nếu tắt thông báo thì nút này biến mất khỏi thẻ", và "xoá chữ
    tắt trên thẻ vì đã có nút rồi".

    Bản trước để hai thứ ở đây mà cú vuốt nay đã mang: một nút "Hẹn giờ" để bật
    nhắc, và một nút chữ "Tắt" để tắt. Giữ lại là hai lối vào cho cùng một công
    tắc, cách nhau mười điểm — và trên máy thật nó đọc ra đúng như vậy: mỗi dòng
    có một chữ "Tắt" lửng lơ cạnh giờ.

    Nên khi nhắc tắt, dòng chỉ còn NHÃN VIỆC. Sạch, và đúng thứ tự người ta gặp
    nó: bật nhắc là một quyết định hiếm, đổi giờ là việc làm sau đó.
  */
  if (!r.enabled) return null;

  /*
    ── NHẮC ĐANG BẬT: chỉ còn đúng cái đồng hồ ──

    `display="compact"` là đồng hồ gọn của iOS — chủ dự án đã một lần bảo trả nó
    lại sau khi tôi thay bằng một tấm chọn tự vẽ ("lúc nãy cái đó nhìn mượt hơn
    đẹp hơn"). Nó tự lo phần kéo/chọn giờ, và WCAG 2.5.8 loại trừ "User agent
    control" khỏi sàn kích thước, nên nó không cần một khung 44 điểm quanh mình.
  */
  return (
    <View style={styles.remind}>
      <Icon icon={Bell} size={16} color={c.mutedForeground} />
      <DateField
        value={timeToDate(r.hour, r.minute)}
        mode="time"
        display="compact"
        onChange={(_, d) => d && setTime(key, d.getHours(), d.getMinutes())}
      />
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
  /* Nền của hàng KHÔNG còn ở đây: `SwipeRow` tô nó qua prop `surface`, vì nó
     phải ĐỔI khi hàng được vuốt ra — mặt thẻ lúc nằm yên, mặt lõm lúc được
     chọn. Hai chỗ tô nền cho một hàng là hai chỗ sẽ lệch nhau. */
  rowSwipe: { paddingHorizontal: spacing.card },
  /*
    ── hàng chạy HẾT bề ngang thẻ ──

    Thẻ có đệm `spacing.card` (20). Không bù lại thì hàng trượt đi sẽ dừng ở
    mép trong của đệm: ô icon biến mất nhưng chữ đứng sựng lại cách mép thẻ 20
    điểm, không bị cắt, và đọc ra là một lỗi bố cục — đúng ảnh chụp máy thật,
    nơi "Bữa ăn" thành "a ăn" nằm hẫng ở mép.

    Danh sách của iOS chạy hết bề ngang và phần thụt vào nằm BÊN TRONG hàng, nên
    nội dung trượt ra khỏi mép rồi bị chính góc bo của khung cắt. Margin âm ở
    đây trả lại đúng hình ấy, và `paddingHorizontal` trên `rowSwipe` dựng lại
    phần thụt vào để hàng đóng trông không đổi.

    Nó cũng đưa nút vuốt ra sát mép thẻ thay vì thụt vào 20 điểm — chỗ Apple đặt
    chúng.
  */
  bleed: { marginHorizontal: -spacing.card },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },

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

  /*
    ── nhãn và đồng hồ nằm CÙNG một dòng ──

    Chủ dự án: "tôi muốn thẻ giữ nguyên kích thước mặc định khi chưa có đồng hồ".
    Bản trước xếp dọc — nhãn trên, hàng hẹn giờ dưới — nên mỗi lời nhắc được bật
    là hàng ấy cao thêm một dòng, và thẻ phình ra theo. Trên máy thật ba dòng có
    giờ cao gần gấp đôi hai dòng không có.

    Nay xếp NGANG: đồng hồ đứng cạnh nhãn, và vì nó thấp hơn ô icon 44 điểm nên
    nó không quyết định chiều cao hàng nữa — ô icon quyết. Bật hay tắt lời nhắc,
    hàng vẫn đúng một chiều cao.
  */
  text: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minWidth: 0 },
  label: { ...type.body, color: c.foreground, flexShrink: 1 },
  labelDone: { color: c.mutedForeground },

  /* Hàng hẹn giờ: cao 44 và chiếm hết cột chữ. Đích chạm ra ~33×7,3mm, thay
     cho một icon 13 điểm. */
  /* Không còn `height: 44` và không còn chiếm hết cột chữ: hàng hẹn giờ nay chỉ
     là cái đồng hồ, và đồng hồ gọn của iOS tự lo đích chạm của nó — WCAG 2.5.8
     loại trừ "User agent control" khỏi sàn kích thước. Ràng nó về 44 là ép hàng
     cao thêm cho một thứ không cần. */
  remind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
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

     ── và nền đặc quay lại, theo yêu cầu ──

     Chủ dự án xem bản viền rỗng rồi chốt: "nút ghi nên để màu đen". Thứ từng
     bị chê là CỠ — 48 cao, tối thiểu 96 rộng, năm mảng gần-đen chạy dọc thẻ —
     chứ không phải bản thân màu. Nên nền đặc trở lại ở cỡ đã hạ: 44 cao (sàn
     Apple HIG / WCAG 2.5.5) × tối thiểu 72 rộng ≈ 12×7,3mm, so với 48×96 của
     bản bị chê. Chữ giữ `body` (17) thay cho `footnote` (13).

     `c.primary` chứ không phải một mã đen gõ tay: bản sáng nó là `#1a1917`,
     bản tối là bạc `#a8afbd` — tức nút vẫn đọc được ở cả hai diện mạo, còn một
     chữ "đen" viết cứng sẽ biến mất trên trang gần đen. */
  action: {
    minWidth: 72,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: c.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionText: { ...type.body, fontWeight: '600', color: c.primaryForeground },

  /* Dòng xong việc hôm nay: bỏ nền đen đặc. Khung 44×72 giữ nguyên để đích
     chạm không co lại — nó vẫn là lối nhìn thấy được để sửa một lượt ghi sai,
     và `tools/swipe.mjs` đòi mọi hành động vuốt phải còn một lối khác. */
  actionQuiet: { backgroundColor: 'transparent' },
  /* Chữ `mutedForeground`: 5,78:1 bản sáng · 4,71:1 bản tối, trên sàn 4,5. */
  actionTextQuiet: { color: c.mutedForeground },

  /* ĐÃ GHI đè lên `actionQuiet`: viên xanh nhạt quay lại, vì một control còn
     bấm được thì phải còn trông như control. Chữ KHÔNG xanh — lý do và cả bốn
     con số nằm ở `DONE_PILL_ALPHA`, và đây là chỗ duy nhất `readinessGreen`
     được phép chạm vào cái viên: nó tô DẤU TÍCH, thứ chịu sàn 3:1 chứ không
     phải 4,5:1. `secondaryForeground` là 6,59:1 sáng · 4,88:1 tối. */
  actionDone: { backgroundColor: alpha(c.readinessGreen, DONE_PILL_ALPHA) },
  actionTextDone: { color: c.secondaryForeground },

}));
