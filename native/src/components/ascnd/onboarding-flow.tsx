import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeInDown, useSharedValue } from 'react-native-reanimated';

import { BodyScaleFigure } from '@/components/ascnd/body-scale-figure';
import { BRAND_TAGLINE, BrandLockup } from '@/components/ascnd/brand-lockup';
import { DateField } from '@/components/ascnd/date-field';
import { Icon } from '@/components/ascnd/icon';
import { KoaFigure } from '@/components/ascnd/koa/koa-figure';
import { GlassCard } from '@/components/ascnd/glass-card';
import { ChoiceCard } from '@/components/ascnd/onboarding/choice-card';
import { OnboardingScreen } from '@/components/ascnd/onboarding/onboarding-screen';
import { PressScale } from '@/components/ascnd/press-scale';
import { Segmented } from '@/components/ascnd/segmented';
import { Ruler, RULER_H } from '@/components/ascnd/weight-goal-ruler';
import { radius, spacing, type } from '@/constants/ascnd';
import { duration } from '@/constants/motion';
import { alpha, makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { usePalette } from '@/hooks/use-palette';
import { useRulerIndex } from '@/hooks/use-ruler-index';
import { useScaleWake } from '@/hooks/use-scale-wake';
import { useStageMotion } from '@/hooks/use-stage-motion';
import { useUnits } from '@/hooks/use-units';
import { useVolumeUnit } from '@/hooks/use-volume-unit';
import { useOnlineMutation } from '@/hooks/use-online-mutation';
import { supabase } from '@/integrations/supabase/client';
import { useRise } from '@/lib/entrance';
import { errorText } from '@/lib/error-copy';
import { planFromEntry } from '@/lib/fitness-calc';
import { isHealthKitAvailable, requestHealthPermissions } from '@/lib/health';
import { getLegal, type LegalDoc } from '@/lib/legal-content';
import { localDateStr } from '@/lib/local-date';
import { levelFromXp, rankForLevel } from '@/lib/mascot-room';
import { BOUNDS, statMessage } from '@/lib/plausible';
import type { HeightUnit, WeightUnit } from '@/lib/units';
import {
  displayHeight,
  displayVolume,
  displayWeight,
  formatHeight,
  heightToCm,
  lengthLabel,
  volumeLabel,
  weightLabel,
  weightToKg,
} from '@/lib/units';
import { fillCopy } from '@/lib/copy-fill';

/**
 * Thứ tự các màn, viết ra thành DỮ LIỆU.
 *
 * ── ba mảng song song, và cái giá của chúng ──
 *
 * Trước đây thứ tự này sống ở BA chỗ cùng lúc, cả ba đánh số theo vị trí, và
 * ba mươi mấy nhánh `step === 0…6` rải khắp phần JSX. Chèn một màn vào giữa là
 * phải sửa đúng ba chỗ theo đúng một thứ tự, còn sót một chỗ thì màn hình vẫn
 * dựng ra được — chỉ là màn sai.
 *
 * Giai đoạn 1 gỡ việc đó đi đúng một bước TRƯỚC KHI luồng này chèn thêm sáu
 * màn vào giữa. Nhờ vậy lượt chèn ấy là sửa một bảng, không phải chép tay mười
 * tám lần một phép đánh số.
 *
 * ── vì sao không còn `icon` và `title` ──
 *
 * Khung cũ vẽ một ô icon và một dòng "Bước 3/7" trên mỗi màn. Mười ba màn thì
 * dòng ấy thành một cái đồng hồ đếm ngược, và ô icon nói một điều mà câu hỏi
 * ngay dưới nó đã nói rõ hơn. Khung mới chỉ còn một thanh tiến độ mỏng, nên
 * bảng này giữ đúng thứ nó phải giữ: THỨ TỰ, và không gì khác.
 */
const STEPS = [
  { key: 'welcome' },
  { key: 'intention' },
  { key: 'goal' },
  { key: 'koa' },
  { key: 'sex' },
  { key: 'dob' },
  { key: 'height' },
  { key: 'weight' },
  { key: 'activity' },
  { key: 'experience' },
  { key: 'plan' },
  { key: 'health' },
  { key: 'ready' },
] as const satisfies readonly { key: string }[];

type StepKey = (typeof STEPS)[number]['key'];

/** Vị trí của một màn, hỏi bằng tên. `-1` nếu màn ấy không còn trong luồng. */
const stepAt = (key: StepKey) => STEPS.findIndex((s) => s.key === key);

/**
 * Màn khép lại phần SỐ ĐO CƠ THỂ — cổng `planFromEntry` chốt ở đây.
 *
 * ── vì sao là màn cân nặng, chứ không phải màn chiều cao ──
 *
 * Luồng cũ hỏi chiều cao và cân nặng trên CÙNG một màn, nên cái chốt cũng chỉ
 * có một chỗ để đứng. Luồng này tách chúng ra: 05 giới tính, 06 ngày sinh, 07
 * chiều cao, 08 cân nặng. Cổng cần đủ sáu đầu vào, và đầu vào cuối cùng tới ở
 * màn 08 — nên 08 là màn đầu tiên mà câu hỏi *"cơ thể này có hợp lệ không"* có
 * nghĩa. Chốt sớm hơn là chốt trên một câu hỏi chưa trả lời xong.
 *
 * ── và nó được SUY RA ──
 *
 * `stepAt('weight')` chứ không phải `7`. Giai đoạn 0 từng đặt tên cho hằng này
 * nhưng vẫn viết tay con số, nên cái tên mới chỉ là một nhãn: dời màn mà quên
 * sửa dòng ấy thì cái khoá lặng lẽ chuyển sang canh một màn khác, và không có
 * gì báo. Nay không còn con số nào để quên.
 */
const BODY_STATS_STEP = stepAt('weight');

/**
 * Sáu mục tiêu, chia hai tầng.
 *
 * Màn 02 hỏi NHÁNH, màn 03 hỏi giá trị `goal` thật bên trong nhánh ấy. Sáu giá
 * trị không rút bớt được — chúng đã nằm trong `calcTargetCalories` và
 * `calcMacros` — nhưng chia hai tầng thì mỗi màn nhiều nhất ba thẻ.
 *
 * Nhánh `maintain` có đúng MỘT giá trị, nên màn 03 tự bỏ qua: hỏi một câu chỉ
 * có một đáp án là bắt người ta bấm hai lần cho cùng một ý.
 */
const BRANCHES = {
  body: ['bulk', 'cut', 'recomp'],
  capacity: ['strength', 'endurance'],
  maintain: ['maintain'],
} as const;

type Branch = keyof typeof BRANCHES;
/** Sáu giá trị `goal` thật, suy RA khỏi bảng nhánh — không gõ lại lần thứ hai. */
type GoalKey = (typeof BRANCHES)[Branch][number];

/** Chỗ đứng khi chưa biết gì về người dùng. Không phải một phép đoán về họ. */
const DEFAULT_CM = 170;
const DEFAULT_KG = 70;
/** Bề rộng chiếc cân so với bề ngang màn — chừa lề, và không phình trên màn lớn. */
const SCALE_FRACTION = 0.72;
const SCALE_MAX = 300;

export function OnboardingFlow() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { width: screenW } = useWindowDimensions();
  /*
    ── đơn vị: hồ sơ nói trước, người dùng nói sau ──

    `null` nghĩa là *chưa ai chọn gì trong luồng này*, và khi ấy đơn vị đi theo
    hồ sơ. Hồ sơ về muộn hơn lần vẽ đầu — nó là một truy vấn — nên một
    `useState(units.height)` sẽ đóng băng giá trị mặc định trước khi câu trả
    lời thật kịp tới. Một `useEffect` đuổi theo thì lại phải nhớ THÔI đuổi khi
    người dùng đã chạm vào, tức đúng cái ref `placed` của `useRulerIndex`, dựng
    lại lần thứ hai.

    Một `??` không có cả hai vấn đề ấy: chưa chọn thì đọc hồ sơ mỗi lần vẽ,
    chọn rồi thì hồ sơ thôi có tiếng nói. Không hiệu ứng, không ref, không đua.
  */
  const units = useUnits();
  const [hPick, setHPick] = useState<HeightUnit | null>(null);
  const [wPick, setWPick] = useState<WeightUnit | null>(null);
  const hUnit = hPick ?? units.height;
  const wUnit = wPick ?? units.weight;
  const { unit: vUnit } = useVolumeUnit();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const dirSV = useSharedValue<number>(1);
  const crossSV = useSharedValue<number>(0);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [goal, setGoal] = useState<GoalKey | ''>('');
  const [sex, setSex] = useState('');
  const [dob, setDob] = useState(new Date(2000, 0, 1));
  const [heightCm, setHeightCm] = useState(String(DEFAULT_CM));
  const [weightKg, setWeightKg] = useState(String(DEFAULT_KG));
  const [activityLevel, setActivityLevel] = useState('');
  const [trainingLevel, setTrainingLevel] = useState('');
  const [legalTab, setLegalTab] = useState<'terms' | 'privacy' | 'health' | null>(null);

  const here = STEPS[step];
  const at: StepKey = here.key;

  /*
    Màn 03 vắng mặt khi nhánh chỉ có một giá trị, nên "còn bao xa" phải đếm
    theo số màn THẬT SỰ hiện ra. Đếm theo `STEPS.length` thì người chọn "Giữ
    đều" thấy thanh tiến độ bỏ qua một nấc mà không có màn nào tương ứng.
  */
  /*
    Màn 12 cũng vắng mặt khi máy KHÔNG CÓ HealthKit — Android, máy ảo, web.
    Một lời mời không thể nhận lời còn tệ hơn không mời: người dùng bấm "Kết
    nối Sức khoẻ" và không có gì xảy ra, kể cả một bảng từ chối.
  */
  const health = isHealthKitAvailable();
  const skip = useCallback(
    (key: StepKey) => (key === 'goal' && branch === 'maintain') || (key === 'health' && !health),
    [branch, health],
  );
  const shown = useMemo(() => STEPS.filter((s) => !skip(s.key)), [skip]);
  const shownAt = shown.findIndex((s) => s.key === at) + 1;

  /*
    ── the two numbers the whole account is built from ──

    `Number(weightKg) || 70` and `Number(heightCm) || 170` used to stand here,
    and between them they did both halves of the same damage. A cleared field
    became a 70 kg, 170 cm person without saying so, and a typo was accepted at
    face value: measured on this exact chain, a height typed as `17` prescribes
    1,500 kcal a day, and one typed as `70` prescribes 1,570 instead of 2,539 —
    a thousand calories a day, arrived at silently.

    Luồng này thu hai con số bằng THƯỚC chứ không phải bàn phím, nên một số
    ngoài dải không gõ vào được nữa. Cái cổng vẫn đứng nguyên đây: *"không gõ
    được"* là một phát biểu về màn hình, và màn hình là thứ đổi mỗi vòng thiết
    kế. Câu ghi thì không được đổi theo.
  */
  const attempt = planFromEntry({
    heightText: heightCm,
    weightText: weightKg,
    dob: localDateStr(dob),
    sex: (sex || 'other') as 'male' | 'female' | 'other',
    goal: goal || 'maintain',
    activity_level: activityLevel || 'moderate',
  });
  const statsBad = !attempt.ok;
  const missing = attempt.ok ? [] : attempt.missing;
  const statError = missing.includes('height_cm')
    ? statMessage('height_cm', 'out-of-range', i18n.outOfRange)
    : missing.includes('weight_kg')
      ? statMessage('weight_kg', 'out-of-range', i18n.outOfRange)
      : null;
  /*
    Ngày sinh có câu báo RIÊNG, và nó hiện ở MÀN 06.

    `statMessage` không nhận `dob`: `BOUNDS` là bảng của các đại lượng có min/max
    đo được, còn "phải ở quá khứ" thì không phải một khoảng. Nên chuỗi này là
    một khoá riêng.

    Vì sao phải có: cổng từ chối một ngày sinh tương lai bằng `missing: ['dob']`,
    nên dữ liệu an toàn — nhưng trước lượt này người dùng chọn nhầm ở màn 06 rồi
    đi tiếp bình thường, và mãi tới MÀN 08 mới gặp một nút bị khoá không nói gì.
    Một cái nút khoá mà không nói vì sao là một màn hình chết, và ở đây nó còn
    chết cách chỗ gây ra hai màn.
  */
  const dobBad = missing.includes('dob');

  /* Mỗi màn hỏi đúng một điều, nên nút Tiếp mở ra khi điều ấy đã được trả lời
     — không phải khi cả hồ sơ đã đầy. */
  const unanswered =
    (at === 'intention' && !branch) ||
    (at === 'goal' && !goal) ||
    (at === 'sex' && !sex) ||
    (at === 'dob' && dobBad) ||
    (at === 'activity' && !activityLevel) ||
    (at === 'experience' && !trainingLevel);

  const hop = (d: 1 | -1) => {
    Haptics.selectionAsync();
    let n = step + d;
    /* Màn vắng mặt thì bước qua nó ở CẢ HAI chiều — nếu không thì nút Quay lại
       dẫn người ta tới một câu hỏi họ chưa từng thấy. */
    while (STEPS[n] && skip(STEPS[n].key)) n += d;
    n = Math.max(0, Math.min(STEPS.length - 1, n));
    /*
      Hai giá trị này phải được đặt TRƯỚC `setStep`, và phải là shared value.

      Style của hai tấm đọc chúng lúc worklet CHẠY, không phải lúc render, nên
      chúng phải mô tả cú chuyển sắp xảy ra chứ không phải cú vừa xong. Lý do
      đầy đủ nằm ở `use-stage-motion.ts`.
    */
    dirSV.value = d;
    crossSV.value = RULER_SCREENS.has(at) && RULER_SCREENS.has(STEPS[n].key) ? 1 : 0;
    if (painted) run(at, STEPS[n].key === 'plan');
    setDir(d);
    setStep(n);
  };
  const goNext = () => hop(1);
  const goPrev = () => hop(-1);

  const pickBranch = (b: Branch) => {
    setBranch(b);
    /* Nhánh một giá trị thì chọn nhánh CHÍNH LÀ chọn mục tiêu. */
    setGoal(BRANCHES[b].length === 1 ? BRANCHES[b][0] : '');
  };

  const connectHealth = async () => {
    Haptics.selectionAsync();
    /* No error path. A refusal is an answer, not a failure, and the app works
       without it — telling somebody off for declining is how the next prompt
       gets declined too. */
    await requestHealthPermissions();
    goNext();
  };

  const finish = useOnlineMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      /* The button on the weight screen makes this unreachable. It is here
         anyway because the row this writes is the one every later number is
         derived from, and "unreachable" is a claim about a screen, not about a
         write. */
      if (!attempt.ok) {
        throw new Error(i18n.statsRequired);
      }
      const { error } = await supabase.from('profiles').upsert(
        {
          user_id: user.id,
          name: 'Athlete',
          sex,
          dob: localDateStr(dob),
          height_cm: attempt.height_cm,
          weight_kg: attempt.weight_kg,
          goal,
          activity_level: activityLevel,
          training_level: trainingLevel,
          tdee_target_kcal: attempt.plan.tdee_target_kcal,
          macro_protein_g: attempt.plan.macro_protein_g,
          macro_carbs_g: attempt.plan.macro_carbs_g,
          macro_fat_g: attempt.plan.macro_fat_g,
          macro_fiber_g: attempt.plan.macro_fiber_g,
          water_target_ml: attempt.plan.water_target_ml,
          /* Đơn vị người ta vừa nhập bằng. Không ghi thì app quay lại hệ mét ở
             màn tiếp theo và con số họ vừa đọc đổi hình ngay sau khi bấm. */
          units_height: hUnit,
          units_weight: wUnit,
          onboarding_completed: true,
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
    onError: (e: Error) => Alert.alert('ASCND', errorText(e, i18n)),
  });

  const goalLabel = goal ? i18n[GOAL_COPY[goal].label] : '';

  /*
    ── chuyển màn: cùng một khung, chỉ RUỘT đi qua ──

    Hai tấm dưới kia bọc đúng phần ruột, nên thanh tiến độ, nút quay lại và nút
    chính đứng yên suốt cú chuyển — đo được `rãnh tx0 ty0 · lùi tx0 ty0` ở mọi
    mẫu của mọi lượt. Đó là điều cả ba bảng chuyển cảnh của board đều mở đầu
    bằng: "bộ khung không đổi một điểm nào".

    Cơ chế nằm ở `use-stage-motion.ts`, và ở đó cũng ghi vì sao nó KHÔNG đi qua
    `entering`/`exiting` của Reanimated. Chỗ này chỉ quyết ba điều: đi hướng
    nào, hai màn có dùng chung dụng cụ không, và màn tới có tự mang cú đến của
    nó không. Cả ba được đặt trong `hop()` ngay trước khi màn đổi.

    ── ba chế độ, mỗi cái trả lời một câu khác nhau ──

    ĐẨY (mặc định) hai màn khác nhau. Màn vào ±100% → 0, màn ra 0 → ∓30%, cùng
       nhịp `duration.swap` và cùng easing. Nó có HƯỚNG, và đó là cái Giai đoạn
       3 thiếu: một `FadeIn` vô hướng cho mọi lượt khiến bấm Tiếp và bấm Quay
       lại cho ra hình ảnh y hệt. `ios.md` nói đúng một câu về việc này: *push
       slides, dismiss reverses the entrance*. Đo: tiến `+193 → 0` với tấm ra
       `→ −120,6`; lùi `−263 → 0` với tấm ra `→ +120,6`.

    CROSSFADE hai màn CÙNG MANG CÂY THƯỚC. Không một điểm dịch nào — chỉ độ mờ,
       vì chỉ nội dung đổi. Board nói thẳng về cặp 07→08: thứ phải GIỮ là
       "chính cái thước — cùng `Ruler`, cùng TICK_W 4, cùng cây kim, cùng dòng
       'Kéo để chỉnh' ở cùng độ cao", và kết bằng *"Nếu cái thước cũng đổi theo
       thì hai màn sẽ đứt."* `crossSV` hỏi CẢ HAI đầu chứ không hỏi một: vào
       màn 07 từ màn 06 vẫn ĐẨY, vì ở đó cây thước là thứ MỚI.

    TỰ MANG màn 11. Cascade năm bậc ở dưới đã là cú đến, nên khung không thêm
       gì nữa. Bản trước có cả `FadeIn` của tấm bọc LẪN cascade, và audit đo
       được hai thứ chạy chồng (tấm bọc 0,167→0,584→1 dưới năm bậc 0,9→1). Một
       trong hai đủ nói, và cascade là cái mang thứ tự đọc.

    ── hai điều KHÔNG có nhánh ở đây, và cả hai là phép ĐO ──

    ① Lần vẽ ĐẦU không chuyển cảnh, vì `hop()` là chỗ duy nhất gọi `run()` và
       nó không chạy lúc mở app. `useRise` đã viết sẵn nguyên tắc: trên lần vẽ
       đầu tiên không có trạng thái trước nào để làm dịu. `painted` đọc ra từ
       chính hook ấy nên hai chỗ không thể lệch nhau.

    ② Reduce Motion không có nhánh riêng. Bản đầu của khối này có
       `reduced ? FadeIn : slide`, viện đúng câu của `ios.md`: *"Crossfade
       instead of parallax and large slides."* Bật `prefers-reduced-motion`
       trên bản dựng thật rồi đọc `getComputedStyle` giữa lúc chuyển:

           01→02  +40ms  tấm ra −120,6 · tấm vào 0   — đã ở ĐÍCH
           07→08  +40ms  tấm ra op 0  · tấm vào op 1  — đã ở ĐÍCH

       `withTiming` được hệ tự triệt tiêu: giá trị nhảy thẳng tới đích, không
       một giá trị trung gian nào, không một quãng dịch nào. Thêm một nhánh
       `reduced` ở đây là thêm code không bao giờ làm gì khác — và đặt hàng cấm
       đúng điều đó: *"không thêm fallback animation riêng"*.

    `sameTool` dưới đây KHÁC `crossSV`: nó nói về màn ĐANG HIỆN, và chỉ dùng để
    tắt hiệu ứng vào của chính cây thước. `crossSV` nói về cú chuyển đang xảy
    ra. Hai câu hỏi khác nhau, hai giá trị khác nhau.
  */
  const prev = STEPS[step - dir];
  const sameTool = RULER_SCREENS.has(at) && !!prev && RULER_SCREENS.has(prev.key);
  const rise = useRise();
  const painted = rise(0) !== undefined;
  const { inFace, outFace, outKey, run } = useStageMotion<StepKey>({ screenW, dirSV, crossSV });

  /* ── các mảnh chỉ luồng này dùng ── */

  const Ask = ({ q, why }: { q: string; why: string }) => (
    <View>
      <Text style={styles.q}>{q}</Text>
      <Text style={styles.why}>{why}</Text>
    </View>
  );

  /** Thước chạy HẾT bề ngang màn — một dụng cụ bị thụt lề hai bên đọc ra là
      một cái thẻ. Lề của `OnboardingScreen` được trả lại bằng margin âm. */
  const RulerStrip = ({
    count,
    min10,
    listRef,
    onIndex,
    onContentSizeChange,
  }: {
    count: number;
    min10: number;
    listRef: React.RefObject<Animated.ScrollView | null>;
    onIndex: (i: number) => void;
    onContentSizeChange: () => void;
  }) => (
    /*
      Hiệu ứng vào của cây thước chỉ chạy khi cây thước là NỘI DUNG MỚI.

      Ở 07↔08 nó là vật dùng chung, và audit đo được nó tự phản bội đúng chỗ
      phải giữ: `op 0 → 0,236 → 0,652` kèm `y 672 → 666 → 656 → 647`, tức mờ từ
      số không và dâng lên 25 điểm, trong khi tấm bọc phía trên đã crossfade
      đúng. Ngón tay mất điểm neo ngay ở cặp màn cần nó nhất.

      Vào màn 07 từ màn 06 thì vẫn chạy — ở đó cây thước thật sự vừa xuất hiện.
    */
    <Animated.View
      entering={sameTool ? undefined : FadeInDown.duration(duration.move).delay(60)}
      style={styles.bleed}>
      <View style={styles.ruler}>
        <Ruler
          count={count}
          min10={min10}
          width={screenW}
          scrollRef={listRef}
          onIndex={onIndex}
          onContentSizeChange={onContentSizeChange}
        />
        <View style={styles.needle} pointerEvents="none" />
      </View>
      <Text style={styles.hint}>{i18n.obDragHint}</Text>
    </Animated.View>
  );

  /*
    ── màn 13 dựng khung của RIÊNG nó ──

    Mười hai màn kia đều là "đọc một câu, bấm Tiếp". Màn 13 là câu GHI: nút của
    nó quay vòng chờ, nó không có đường quay lại, và nó mang dòng pháp lý. Gộp
    nó vào khung chung nghĩa là nhồi ba prop chỉ một màn dùng vào chỗ mười hai
    màn kia phải đi qua.

    Và nó khoá theo `statsBad` một lần nữa — đây là cái chốt THỨ HAI mà Luật D
    của `tools/profile-onboarding.mjs` đòi: khoá nút đi tiếp của màn số đo mà
    không khoá nút ghi thì vẫn còn một đường vòng tới câu ghi.
  */
  /*
    ── RUỘT của một màn, hỏi bằng KHOÁ ──

    Tách ra khỏi phần dựng khung vì hệ chuyển cảnh cần dựng ĐỒNG THỜI hai màn:
    màn đang tới và màn đang đi. Trước đây chuỗi nhánh này bám vào `at`, tức
    chỉ dựng được màn hiện tại, và đó là lý do bản trước không có vế RA nào.
  */
  const body = (k: StepKey) =>
    k === 'ready' ? (
      <View style={styles.centre}>
        <Text style={styles.eyebrow}>{i18n.obReadyEyebrow}</Text>
        <View style={styles.grow} />
        <KoaFigure expression="delighted" pose="idle" size={280} />
        <Text style={styles.readyLine}>{i18n.obReadyLine}</Text>
        <View style={styles.grow} />
        <View style={styles.chips}>
          {[
            goalLabel,
            `${group(attempt.ok ? attempt.plan.tdee_target_kcal : 0, lang)} kcal`,
            `Level ${pad2(levelFromXp(0))}`,
          ]
            .filter(Boolean)
            .map((t) => (
              <Text key={t} style={styles.chip}>
                {t}
              </Text>
            ))}
        </View>
        {finish.isPending ? (
          <ActivityIndicator style={styles.pending} color={c.mutedForeground} />
        ) : null}
        {statError ? <Text style={styles.fieldError}>{statError}</Text> : null}
      </View>
    ) : (
      <>
        {k === 'welcome' && (
          <View style={styles.fill}>
            <BrandLockup />
            <View style={styles.grow} />
            <Text style={styles.hero}>{BRAND_TAGLINE}</Text>
            <View style={styles.grow} />
            <View style={styles.koaAnchor}>
              <KoaFigure expression="happy" pose="idle" size={88} />
            </View>
          </View>
        )}

        {k === 'intention' && (
          <View style={styles.fill}>
            <Ask q={i18n.obIntentionQ} why={i18n.obIntentionWhy} />
            <View style={styles.grow} />
            <View style={styles.stackBig}>
              {(['body', 'capacity', 'maintain'] as const).map((b) => (
                <ChoiceCard
                  key={b}
                  size="lg"
                  label={i18n[BRANCH_COPY[b].label]}
                  desc={i18n[BRANCH_COPY[b].desc]}
                  selected={branch === b}
                  onPress={() => pickBranch(b)}
                />
              ))}
            </View>
            <View style={styles.growWide} />
          </View>
        )}

        {k === 'goal' && (
          <View style={styles.fill}>
            {/* Nhánh vừa chọn quay lại làm EYEBROW ngay TRÊN câu hỏi, nên hai
                dòng đọc liền thành một đường đi. Đặt nó DƯỚI câu hỏi thì nó đọc
                ra như một chú thích, và người duyệt bản Round 2 đọc đúng thế. */}
            <Text style={styles.eyebrowLeft}>{branch ? i18n[BRANCH_COPY[branch].label] : ''}</Text>
            <Text style={styles.qTight}>{i18n.obGoalQ}</Text>
            <View style={styles.grow} />
            <View style={styles.stackTight}>
              {(branch ? BRANCHES[branch] : []).map((g) => (
                <ChoiceCard
                  key={g}
                  label={i18n[GOAL_COPY[g].label]}
                  desc={i18n[GOAL_COPY[g].desc]}
                  selected={goal === g}
                  onPress={() => setGoal(g)}
                />
              ))}
            </View>
            <View style={styles.growWide} />
          </View>
        )}

        {k === 'koa' && (
          <View style={styles.centre}>
            <View style={styles.grow} />
            <KoaFigure expression="happy" pose="turn34" size={300} />
            <Text style={styles.koaName}>{i18n.obKoaName}</Text>
            <Text style={styles.koaLine}>{i18n.obKoaLine}</Text>
            <View style={styles.grow} />
          </View>
        )}

        {k === 'sex' && (
          <View style={styles.fill}>
            <Ask q={i18n.obSexQ} why={i18n.obSexWhy} />
            <View style={styles.grow} />
            <View style={styles.stackTight}>
              {(['male', 'female', 'other'] as const).map((s) => (
                <ChoiceCard
                  key={s}
                  label={i18n[SEX_COPY[s]]}
                  selected={sex === s}
                  onPress={() => setSex(s)}
                />
              ))}
            </View>
            <View style={styles.growWide} />
          </View>
        )}

        {k === 'dob' && (
          <View style={styles.fill}>
            <Ask q={i18n.obDobQ} why={i18n.obDobWhy} />
            <View style={styles.grow} />
            <View style={styles.wheel}>
              {/*
                `maximumDate` KHÔNG phải một chi tiết thừa.

                Luồng bảy màn có nó; lượt viết lại này làm rơi mất, và hậu quả
                đo được: chọn 2030-06-15 thì cổng trả `missing: ['dob']`, tức
                nút Tiếp của màn 08 khoá lại — hai màn sau chỗ gây ra, không
                một dòng giải thích. Chặn ngay ở bánh xe là rẻ nhất: cái ngày
                ấy không chọn được nữa.

                Câu báo dưới đây vẫn giữ, vì `maximumDate` là một phát biểu về
                MÀN HÌNH: một hồ sơ cũ mang ngày sinh hỏng, hay một lần đổi
                ngưỡng tuổi, vẫn đi tới được đây.
              */}
              <DateField
                value={dob}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={(_, d) => d && setDob(d)}
              />
            </View>
            {dobBad ? <Text style={styles.fieldError}>{i18n.obDobBad}</Text> : null}
            <View style={styles.growWide} />
          </View>
        )}

        {k === 'height' && (
          <HeightBody
            /*
              ── vì sao `key` ──

              Đổi đơn vị là đổi THANG của cây thước: `min10` nhảy từ 1.000 sang
              394 và số vạch từ 1.501 xuống 591. `useRulerIndex` thì đã lật
              `placed` sau lần đặt đầu tiên, và nó lật có lý do — chính cái ref
              ấy ngăn cú `scrollTo` mở màn bị ghi nhận thành một lượt người dùng
              chọn số. Nên nó KHÔNG đặt lại thước, và kim ở lại đúng chỗ cũ
              trong khi thang dưới chân nó đã khác: kim chỉ một đằng, số đọc một
              nẻo.

              `key` dựng lại đúng một cây thước mới cho một thang mới, tức nói
              ra bằng React điều vốn đã đúng về mặt vật lý. Rẻ hơn nhiều so với
              dạy hook phân biệt "thang vừa đổi" với "người dùng vừa kéo" —
              phép phân biệt ấy là thứ nó đã trả giá một lần để học.

              ── cái giá, đã đo ──

              Đổi sang inch rồi quay lại cm KHÔNG khép kín: 170,0 → 5'7" →
              169,9. Thước inch chỉ diễn tả được bội của 0,1 in, và 170,0 cm
              không nằm trên nó — 66,9 in là vạch gần nhất, tức 169,93 cm.

              Nó là LƯỢNG TỬ HOÁ, không phải rò rỉ: đo qua năm vòng đổi đi đổi
              lại, con số dừng ở 169,9 ngay từ vòng đầu và đứng yên — 169,9 cm
              đúng là 66,9 in, nên vòng sau không đổi gì nữa. Sai số 0,7mm,
              không đủ để dời một chữ số nào của TDEE.

              Giữ nguyên thay vì che: một cây thước inch đo ra số inch. Che nó
              đi sẽ phải nhớ một giá trị "thật" song song với giá trị người
              dùng NHÌN THẤY, và hai con số cho một phép đo là bài học repo này
              đã trả nhiều lần.
            */
            key={hUnit}
            cm={heightCm}
            unit={hUnit}
            styles={styles}
            ask={<Ask q={i18n.obHeightQ} why={i18n.obHeightWhy} />}
            strip={RulerStrip}
            onCm={setHeightCm}
            onUnit={setHPick}
          />
        )}

        {k === 'weight' && (
          <WeightBody
            /* Cùng lý do `key` của màn 07. */
            key={wUnit}
            kg={weightKg}
            unit={wUnit}
            width={Math.min(SCALE_MAX, screenW * SCALE_FRACTION)}
            styles={styles}
            title={i18n.obWeightQ}
            error={statError}
            strip={RulerStrip}
            onKg={setWeightKg}
            onUnit={setWPick}
          />
        )}

        {k === 'activity' && (
          <View style={styles.fill}>
            <Ask q={i18n.obActivityQ} why={i18n.obActivityWhy} />
            <View style={styles.grow} />
            {/*
              Năm hàng trong MỘT mặt, ngăn bằng hairline — đặc hơn hẳn năm thẻ
              rời, và đó là chủ đích: đây là màn duy nhất có năm lựa chọn, và
              năm thẻ ở cỡ của màn 05 sẽ đẩy cụm này tràn khỏi màn.
            */}
            <View style={styles.rows}>
              {ACTIVITY.map((a, i) => (
                <PressScale
                  key={a.val}
                  accessibilityRole="radio"
                  accessibilityLabel={`${i18n[a.label]}. ${i18n[a.desc]}`}
                  accessibilityState={{ selected: activityLevel === a.val }}
                  style={[
                    styles.row,
                    i > 0 && styles.rowLine,
                    activityLevel === a.val && styles.rowOn,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setActivityLevel(a.val);
                  }}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{i18n[a.label]}</Text>
                    <Text style={styles.rowDesc}>{i18n[a.desc]}</Text>
                  </View>
                  {activityLevel === a.val ? (
                    <Icon icon={Check} size={18} color={c.foreground} />
                  ) : null}
                </PressScale>
              ))}
            </View>
            <View style={styles.growWide} />
          </View>
        )}

        {k === 'experience' && (
          <View style={styles.fill}>
            <Ask q={i18n.obExpQ} why={i18n.obExpWhy} />
            <View style={styles.grow} />
            <View style={styles.stackTight}>
              {LEVELS.map((l) => (
                <ChoiceCard
                  key={l.val}
                  label={i18n[l.label]}
                  desc={i18n[l.desc]}
                  selected={trainingLevel === l.val}
                  onPress={() => setTrainingLevel(l.val)}
                />
              ))}
            </View>
            <View style={styles.growWide} />
          </View>
        )}

        {k === 'plan' && attempt.ok && (
          <View style={styles.fill}>
            {/* Thác đổ bắt đầu ở khoảng một phần ba màn, không phải giữa màn:
                dựng thật ở 402×874 thì `growWide` để lại 430 điểm trống phía
                trên một cụm chữ cao chưa tới 400. */}
            <View style={styles.growSmall} />
            {/*
              ── cú đến của màn 11 ──

              Đây là chỗ DUY NHẤT trong luồng đáng một cú dàn dựng. Board gọi
              đúng tên nó: *"chín màn vừa lấy đi của người dùng thứ gì đó; đây
              là màn đầu tiên trả lại"*. Nên nó không hiện ra một lượt — nó
              được DỰNG DẦN, theo đúng thứ tự mắt phải đọc: con số trước, rồi
              mục tiêu, rồi macro, rồi hai dòng nhỏ, rồi bậc.

              Nhịp là `rise(i)` — cascade dùng chung của app, cùng thứ Hôm nay
              và Tiến trình chạy, cách nhau 60ms mỗi bậc. Không dựng một nhịp
              riêng cho một màn: `constants/motion.ts` đã ghi cái giá của việc
              ấy, và `tools/motion.mjs` đếm từng nhịp mới.

              Năm bậc, tức 240ms cho cả cú đến. `rise` tự kẹp trần ở bậc thứ
              mười nên thêm dòng cũng không kéo dài ra được.
            */}
            <Animated.View entering={rise(0)}>
              <Text style={styles.eyebrowLeft}>{i18n.obPlanEyebrow}</Text>
            </Animated.View>
            {/*
              Một THÁC ĐỔ, không phải một lưới. Bản Round 1 xếp macro thành ba
              cột bằng nhau — đó chính là hình dạng một dashboard, và màn này là
              chỗ TRẢ LẠI công sức chứ không phải chỗ tra cứu. Thang đọc đi
              xuống đúng một chiều: kcal 44 → mục tiêu 15 → macro 15 → nước và
              ngủ 13 → bậc 15/11 màu phụ.
            */}
            <Animated.View entering={rise(0)} style={styles.readout}>
              <Text style={styles.num}>{group(attempt.plan.tdee_target_kcal, lang)}</Text>
              <Text style={styles.numUnit}>kcal</Text>
            </Animated.View>
            <Animated.View entering={rise(1)}>
              <Text style={styles.planFor}>{i18n.obPlanFor.replace('{goal}', goalLabel)}</Text>
            </Animated.View>
            <Animated.View entering={rise(2)}>
              <Text style={styles.planMacro}>
                {i18n.obPlanMacros
                  .replace('{p}', String(attempt.plan.macro_protein_g))
                  .replace('{c}', String(attempt.plan.macro_carbs_g))
                  .replace('{f}', String(attempt.plan.macro_fat_g))}
              </Text>
            </Animated.View>
            <Animated.View entering={rise(3)}>
              <View style={styles.hair} />
              <Text style={styles.planQuiet}>
                {i18n.obPlanWater.replace(
                  '{v}',
                  `${displayVolume(attempt.plan.water_target_ml, vUnit).toFixed(1)} ${volumeLabel(vUnit)}`,
                )}
              </Text>
              <Text style={styles.planQuiet}>{fillCopy(i18n.obPlanSleep, { h: '8,0' })}</Text>
            </Animated.View>
            <View style={styles.growSmall} />
            <Animated.View entering={rise(4)}>
              <View style={styles.ladder}>
                {RANK_DOTS.map((lvl) => (
                  <View key={lvl} style={[styles.rung, lvl === 1 && styles.rungOn]} />
                ))}
              </View>
              <Text style={styles.rankName}>{rankForLevel(levelFromXp(0)).name[lang] ?? ''}</Text>
              <Text style={styles.rankLine}>
                {i18n.obPlanRank.replace('{n}', pad2(levelFromXp(0)))}
              </Text>
            </Animated.View>
            <View style={styles.growSmall} />
          </View>
        )}

        {k === 'health' && (
          <View style={styles.fill}>
            <Text style={styles.q}>{i18n.obHealthQ}</Text>
            <Text style={styles.healthBody}>{i18n.onboardingHealthWhy}</Text>
            <View style={styles.grow} />
            {/* Bảy cột một tuần: bốn nhạt là ngày bạn tự ghi, ba đặc là ngày
                đồng hồ tự điền. Hình nói đúng điều đoạn chữ vừa nói. */}
            <View style={styles.week}>
              {WEEK.map((h, i) => (
                <View
                  key={h}
                  style={[styles.bar, { height: h }, i > 3 ? styles.barOn : styles.barOff]}
                />
              ))}
            </View>
            <Text style={styles.why}>{i18n.obHealthChart}</Text>
            <View style={styles.growSmall} />
            <View style={styles.reads}>
              {READS.map((r) => (
                <View key={r} style={styles.read}>
                  <View style={styles.readDot} />
                  <Text style={styles.readText}>{i18n[r]}</Text>
                </View>
              ))}
            </View>
            <View style={styles.growWide} />
          </View>
        )}
      </>
    );

  /*
    ── hai tấm, một tiến trình ──

    Bản trước dùng `entering`/`exiting` của Reanimated với hàm tự viết, và
    runtime nói thẳng vì sao không được: *"Couldn't load entering/exiting
    animation. Current version supports only predefined animations with
    modifiers: duration, delay, easing…"* — trên web chúng bị VỨT kèm cảnh báo,
    nên phép đo ra `dịch 0` ở mọi mốc và không có gì để duyệt.

    Nên chuyển cảnh không đi qua layout animation nữa. Hai tấm cùng có mặt, một
    shared value `t` chạy 0→1, và hai `useAnimatedStyle` đọc nó. Chạy giống
    nhau ở cả hai nền, đo được ở cả hai, và quãng parallax là một phép nhân chứ
    không phải một thứ phải xin thư viện.

    Tấm ĐI dựng TRƯỚC nên tấm TỚI nằm đè lên — đúng thứ tự của một cú push: màn
    mới trượt phủ lên màn cũ, và cái khe bên trái là chỗ duy nhất thấy parallax.
  */
  const panes = (
    <>
      {outKey ? (
        <Animated.View style={[styles.canvasOut, outFace]} pointerEvents="none">
          {body(outKey)}
        </Animated.View>
      ) : null}
      <Animated.View style={[styles.canvas, inFace]}>{body(at)}</Animated.View>
    </>
  );

  if (at === 'ready') {
    return (
      <OnboardingScreen
        step={shownAt}
        total={shown.length}
        cta={i18n.obReadyCta}
        onCta={() => finish.mutate()}
        disabled={statsBad || finish.isPending}
        legal={i18n.obReadyLegal}
        onLegal={() => {
          Haptics.selectionAsync();
          setLegalTab('terms');
        }}>
        {panes}
        <LegalSheet
          tab={legalTab}
          lang={lang}
          styles={styles}
          c={c}
          onTab={setLegalTab}
          onClose={() => setLegalTab(null)}
        />
      </OnboardingScreen>
    );
  }

  return (
    <OnboardingScreen
      step={at === 'welcome' ? 0 : shownAt}
      total={shown.length}
      onBack={step > 0 ? goPrev : undefined}
      backLabel={i18n.obBack}
      cta={CTA[at] ? i18n[CTA[at]] : i18n.obNext}
      onCta={at === 'health' ? connectHealth : goNext}
      /* Cái chốt của màn số đo. Nó nêu TÊN màn chứ không nêu một vị trí viết
         thẳng: đổi thứ tự thì cái khoá đi theo. */
      disabled={(step === BODY_STATS_STEP && statsBad) || unanswered}
      secondary={at === 'health' ? { label: i18n.obHealthLater, onPress: goNext } : undefined}
      legal={at === 'health' ? i18n.obHealthLegal : undefined}>
      {panes}
    </OnboardingScreen>
  );
}

type Styles = ReturnType<typeof stylesFor>;
type Strip = (p: {
  count: number;
  min10: number;
  listRef: React.RefObject<Animated.ScrollView | null>;
  onIndex: (i: number) => void;
  onContentSizeChange: () => void;
}) => React.ReactElement;

/**
 * Màn 07 — chiều cao.
 *
 * Dùng ĐÚNG `Ruler` của cân nặng, không dựng một thước dọc riêng: một thước
 * thứ hai là bản vẽ tay thứ hai của cùng một dụng cụ. Đơn vị đọc từ
 * `units_height`, nên `ft` ra `ft` chứ không phải `cm` đổi nhãn.
 */
function HeightBody({
  cm,
  unit,
  styles,
  ask,
  strip: Strip,
  onCm,
  onUnit,
}: {
  cm: string;
  unit: HeightUnit;
  styles: Styles;
  ask: React.ReactNode;
  strip: Strip;
  onCm: (v: string) => void;
  onUnit: (u: HeightUnit) => void;
}) {
  const min10 = Math.ceil(displayHeight(BOUNDS.height_cm.min, unit) * 10);
  const max10 = Math.floor(displayHeight(BOUNDS.height_cm.max, unit) * 10);
  const count = max10 - min10 + 1;
  const seed = Math.max(
    0,
    Math.min(count - 1, Math.round(displayHeight(Number(cm) || 0, unit) * 10) - min10),
  );
  const pick = useCallback(() => {
    Haptics.selectionAsync();
  }, []);
  const { value, listRef, onIndex, onContentSizeChange } = useRulerIndex({
    seedIndex: seed,
    min10,
    onPick: pick,
  });
  const commit = useCallback(
    (i: number) => {
      onIndex(i);
      /*
        ── làm tròn NGAY TRƯỚC khi ghi, về 0,1 cm ──

        `heightToCm(66.9, 'in')` trả về `169.92600000000002`. Cái đuôi ấy không
        phải một phép đo — nó là dư của phép nhân nhị phân với 2,54 — và nó đi
        thẳng xuống một cột `numeric` rồi nằm đó mãi.

        0,1 là hạt mà cây thước THẬT SỰ diễn tả được (mỗi vạch là một phần mười
        đơn vị đang hiện) và cũng đúng con số màn hình đang in ra. Nên làm tròn
        ở đây không bỏ đi thông tin nào: nó ghi lại đúng thứ người dùng vừa
        chọn, thay vì đúng thứ ấy cộng một dư số nhị phân.

        KHÔNG làm tròn về cm nguyên như `edit-profile` làm. Cm nguyên sẽ khép
        được vòng cm → in → cm, nhưng nó phá hạt của chính cây thước cm, vốn
        chia 0,1 — và màn hình sẽ in `170.0` cho một giá trị không giữ nổi chữ
        số thập phân ấy.

        Vòng cm → in → cm VẪN không khép: 0,1 cm và 0,1 in = 0,254 cm là hai
        hạt không thông ước, nên không quy tắc làm tròn nào vừa khép được vòng
        vừa giữ được 0,1 cm. Đó là sự thật về hai cây thước, không phải lỗi.
      */
      onCm(String(Math.round(heightToCm((min10 + i) / 10, unit) * 10) / 10));
    },
    [onIndex, onCm, min10, unit],
  );
  const imperial = unit === 'in';
  return (
    <View style={styles.fill}>
      {ask}
      {/* Bộ chọn đứng ngay dưới câu hỏi vì nó quyết định câu trả lời được ĐỌC
          bằng gì — nó thuộc về câu hỏi, không thuộc về cây thước. */}
      <View style={styles.unitRow}>
        {/*
          Chiều cao để MẶC ĐỊNH (44), không truyền `height`.

          Bản đầu truyền 36. 44 là sàn chạm của Apple, và `Segmented` đặt mặc
          định đúng ở đó — `edit-profile` dùng cùng control này ở cùng bề rộng
          một nấc (Field nửa hàng ≈ 82đ, ở đây 80đ) và để mặc định. Truyền 36
          là đưa cùng một control xuống dưới sàn ở một màn mà không ở màn kia.

          Lập luận cho 38 trong chú thích của `Segmented` là lập luận cho biến
          thể VIÊN NANG, nơi mỗi mục rộng gần nửa màn hình (201đ) nên thứ giới
          hạn là mắt chứ không phải ngón tay. Ở 80đ lập luận ấy không áp được.

          `tools/tap-target.mjs` không bắt được, và không phải vì nó hỏng: nó
          quét thẻ `<PressScale>` mang `styles.X` có `height:` là số viết
          thẳng, còn đây là `PickRow.Item` với chiều cao tính ra.

          `compact` thì GIỮ: nó không sinh ra con số 36, nó chỉ chọn
          `radius.full`. Bỏ nó đi là đổi viên nang thành chữ nhật bo.
        */}
        <Segmented
          options={UNIT_H}
          value={unit}
          onChange={(u) => {
            Haptics.selectionAsync();
            onUnit(u);
          }}
          compact
        />
      </View>
      <View style={styles.grow} />
      <View style={styles.readoutCentre}>
        {/*
          ── vì sao hệ imperial đọc bằng HAI dòng ──

          `66.9 in` là một con số đúng mà không ai dùng để nói về chiều cao của
          mình; người ta nói `5'6"`, và tab Tiến trình của chính app đã in ra
          đúng chuỗi ấy qua `formatHeight`. Hai màn nói hai kiểu về cùng một cơ
          thể, và bản của luồng này là bản sai.

          Nhưng `5'6"` MỘT MÌNH thì không dùng được ở đây: thước chia theo phần
          mười inch, nên `Math.round` gộp mười vạch vào một chuỗi và chín trong
          mười vạch kéo sẽ không đổi gì cả — cây thước động mà màn hình đứng im,
          tức người dùng đọc ra là nó kẹt. Chia vạch theo inch NGUYÊN cũng không
          cứu được: 59 vạch × 4đ = 236đ, ngắn hơn cả màn hình 402đ, tức không
          kéo được nữa.

          Nên dòng lớn nói theo cách người ta nói, dòng nhỏ đổi theo TỪNG vạch.
          Hệ mét không cần vế thứ hai: `170.0` vốn đã đổi mỗi vạch.
        */}
        <Text style={styles.num}>{imperial ? formatHeight(heightToCm(value, unit), unit) : value.toFixed(1)}</Text>
        <Text style={styles.numUnit}>
          {imperial ? `${value.toFixed(1)} ${lengthLabel(unit)}` : lengthLabel(unit)}
        </Text>
      </View>
      <View style={styles.grow} />
      <Strip
        count={count}
        min10={min10}
        listRef={listRef}
        onIndex={commit}
        onContentSizeChange={onContentSizeChange}
      />
    </View>
  );
}

/**
 * Màn 08 — cân nặng. Khoảnh khắc chữ ký của ASCND.
 *
 * Chiếc cân THỨC DẬY lúc thước bắt đầu chạy và ngủ lại sau ba giây không ai
 * chạm — cùng một `useScaleWake` với `/log-weight`, nên hai chiếc cân trong app
 * không thể lệch nhịp. Hai hình xếp lớp và hai lớp mờ thì dựng ở ĐÂY: hook
 * không biết gì về chiếc cân, và lý do đầy đủ nằm ở chú thích của nó.
 */
function WeightBody({
  kg,
  unit,
  width,
  styles,
  title,
  error,
  strip: Strip,
  onKg,
  onUnit,
}: {
  kg: string;
  unit: WeightUnit;
  width: number;
  styles: Styles;
  title: string;
  error: string | null;
  strip: Strip;
  onKg: (v: string) => void;
  onUnit: (u: WeightUnit) => void;
}) {
  const { touch, lit: litFace, rest: restFace } = useScaleWake();
  const min10 = Math.ceil(displayWeight(BOUNDS.weight_kg.min, unit) * 10);
  const max10 = Math.floor(displayWeight(BOUNDS.weight_kg.max, unit) * 10);
  const count = max10 - min10 + 1;
  const seed = Math.max(
    0,
    Math.min(count - 1, Math.round(displayWeight(Number(kg) || 0, unit) * 10) - min10),
  );
  const { value, listRef, onIndex, onContentSizeChange } = useRulerIndex({
    seedIndex: seed,
    min10,
    /* Chính cú kéo là thứ đánh thức cân — không phải một sự kiện riêng. */
    onPick: touch,
  });
  const commit = useCallback(
    (i: number) => {
      onIndex(i);
      /* `weightToKg(154.3, 'lbs')` = `69.98930269254848`. Cùng một dư số nhị
         phân, cùng một phép tròn, cùng một lý do — xem chú thích dài ở đường
         ghi chiều cao. 0,1 là hạt cây thước diễn tả được và là con số mặt cân
         đang in ra. */
      onKg(String(Math.round(weightToKg((min10 + i) / 10, unit) * 10) / 10));
    },
    [onIndex, onKg, min10, unit],
  );
  return (
    <View style={styles.fill}>
      <Text style={styles.qCentre}>{title}</Text>
      <View style={styles.unitRow}>
        {/* Chiều cao mặc định (44), cùng lý do và cùng phép đo như màn 07 —
            và CÙNG con số, vì hai màn này crossfade vào nhau: hai viên nang
            lệch 8 điểm sẽ cùng hiện suốt ~320ms của cú chuyển. */}
        <Segmented
          options={UNIT_W}
          value={unit}
          onChange={(u) => {
            Haptics.selectionAsync();
            onUnit(u);
          }}
          compact
        />
      </View>
      <View style={styles.grow} />
      <View style={styles.stage}>
        <View>
          <Animated.View style={restFace}>
            <BodyScaleFigure value={value.toFixed(1)} unit={weightLabel(unit)} width={width} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, litFace]} pointerEvents="none">
            <BodyScaleFigure value={value.toFixed(1)} unit={weightLabel(unit)} width={width} lit />
          </Animated.View>
        </View>
      </View>
      <View style={styles.growSmall} />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      <Strip
        count={count}
        min10={min10}
        listRef={listRef}
        onIndex={commit}
        onContentSizeChange={onContentSizeChange}
      />
    </View>
  );
}

/**
 * Ba tài liệu, mở ngay trong luồng.
 *
 * ── vì sao nó phải có ──
 *
 * Màn 13 nói *"Bắt đầu tức là bạn đồng ý với Điều khoản, Quyền riêng tư và Dữ
 * liệu sức khoẻ"*. Board vẽ câu ấy là chữ CHẾT. Một lời chấp thuận cho ba tài
 * liệu mà người ta không mở nổi thì không phải một lời chấp thuận — và trong
 * luồng này chưa có đường nào khác tới chúng: `src/app/legal.tsx` nằm sau cổng
 * onboarding, tức chỉ với tới được SAU khi đã đồng ý.
 *
 * ── vì sao là Modal chứ không phải một route ──
 *
 * Stack router chưa được gắn trong lúc onboarding. Luồng cũ đã gặp đúng việc
 * này và đã trả lời bằng một `Modal`; câu trả lời ấy còn đúng, nên nó được giữ
 * chứ không nghĩ lại.
 */
function LegalSheet({
  tab,
  lang,
  styles,
  c,
  onTab,
  onClose,
}: {
  tab: 'terms' | 'privacy' | 'health' | null;
  lang: 'vi' | 'en';
  styles: Styles;
  c: ReturnType<typeof usePalette>;
  onTab: (t: 'terms' | 'privacy' | 'health') => void;
  onClose: () => void;
}) {
  const legal = getLegal(lang);
  const tabs = [
    { key: 'terms', label: legal.tabTerms },
    { key: 'privacy', label: legal.tabPrivacy },
    { key: 'health', label: legal.tabHealth },
  ] as const;
  const doc: LegalDoc | null = tab ? legal[tab] : null;
  return (
    <Modal
      visible={tab !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={styles.legalRoot}>
        <View style={styles.legalHeader}>
          <Text style={styles.legalTitle} numberOfLines={1}>
            {doc?.title}
          </Text>
          <PressScale accessibilityRole="button" hitSlop={8} style={styles.legalClose} onPress={onClose}>
            <Icon icon={X} size={18} color={c.foreground} />
          </PressScale>
        </View>
        {/* Ba tài liệu, một sheet: mở ra đọc được cả ba mà không phải đóng lại
            rồi mở lại từ một câu chữ chỉ có một chỗ bấm. */}
        <View style={styles.legalTabs}>
          {tabs.map((t) => (
            <PressScale
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.key }}
              style={[styles.legalTab, tab === t.key && styles.legalTabOn]}
              onPress={() => {
                Haptics.selectionAsync();
                onTab(t.key);
              }}>
              <Text style={[styles.legalTabText, tab === t.key && styles.legalTabTextOn]}>
                {t.label}
              </Text>
            </PressScale>
          ))}
        </View>
        <ScrollView contentContainerStyle={styles.legalContent}>
          {doc?.blocks.map((b, i) => (
            <GlassCard elevation="inset" key={i}>
              <Text style={styles.legalBlockTitle}>{b.title}</Text>
              {b.body ? <Text style={styles.legalBlockBody}>{b.body}</Text> : null}
              {b.intro ? (
                <Text style={[styles.legalBlockBody, styles.legalIntro]}>{b.intro}</Text>
              ) : null}
              {b.bullets?.map((line, j) => (
                <View key={j} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{line}</Text>
                </View>
              ))}
            </GlassCard>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ── bảng chữ, tách khỏi phần dựng hình ── */

const BRANCH_COPY = {
  body: { label: 'obBranchBody', desc: 'obBranchBodyDesc' },
  capacity: { label: 'obBranchCapacity', desc: 'obBranchCapacityDesc' },
  maintain: { label: 'obBranchMaintain', desc: 'obBranchMaintainDesc' },
} as const;

const GOAL_COPY = {
  bulk: { label: 'obGoalBulk', desc: 'obGoalBulkDesc' },
  cut: { label: 'obGoalCut', desc: 'obGoalCutDesc' },
  recomp: { label: 'obGoalRecomp', desc: 'obGoalRecompDesc' },
  strength: { label: 'obGoalStrength', desc: 'obGoalStrengthDesc' },
  endurance: { label: 'obGoalEndurance', desc: 'obGoalEnduranceDesc' },
  maintain: { label: 'obBranchMaintain', desc: 'obBranchMaintainDesc' },
} as const;

const SEX_COPY = { male: 'obSexMale', female: 'obSexFemale', other: 'obSexOther' } as const;

const ACTIVITY = [
  { val: 'sedentary', label: 'obActSedentary', desc: 'obActSedentaryDesc' },
  { val: 'light', label: 'obActLight', desc: 'obActLightDesc' },
  { val: 'moderate', label: 'obActModerate', desc: 'obActModerateDesc' },
  { val: 'high', label: 'obActHigh', desc: 'obActHighDesc' },
  { val: 'athlete', label: 'obActAthlete', desc: 'obActAthleteDesc' },
] as const;

/**
 * Ba bậc kinh nghiệm, không phải bốn.
 *
 * Board vẽ bốn thẻ, trong đó có "Quay lại sau một thời gian". Cột
 * `training_level` nhận đúng BA giá trị mà app hiểu — `beginner`,
 * `intermediate`, `advanced` — và `settings.tsx` tra nhãn theo đúng ba giá trị
 * ấy. Thẻ thứ tư sẽ hoặc ghi một giá trị thứ tư mà không chỗ nào đọc nổi, hoặc
 * ghi TRÙNG giá trị với một thẻ khác — tức hai thẻ khác nhau cho ra cùng một
 * kết quả, một lời nói dối với người đang chọn.
 *
 * Nên giọng tự-mô-tả của board thì giữ, còn số thẻ thì theo cột. Board là bản
 * phác; cột dữ liệu là thứ đã có thật.
 */
const LEVELS = [
  { val: 'beginner', label: 'obExpNew', desc: 'obExpNewDesc' },
  { val: 'intermediate', label: 'obExpSteady', desc: 'obExpSteadyDesc' },
  { val: 'advanced', label: 'obExpDeep', desc: 'obExpDeepDesc' },
] as const;

const READS = ['obHealthRead1', 'obHealthRead2', 'obHealthRead3', 'obHealthRead4'] as const;

/** Bảy cột của biểu đồ tuần. Một hình MINH HOẠ, không phải dữ liệu của ai. */
const WEEK = [20, 30, 26, 38, 52, 64, 72];

/** Hai màn dùng chung MỘT dụng cụ — xem ngoại lệ ④ của phép chọn chuyển cảnh. */
/*
  Đơn vị, viết ra thành DỮ LIỆU.

  Nhãn KHÔNG dịch và không đi qua `i18n`: `cm`, `in`, `kg`, `lbs` là ký hiệu
  đơn vị, giống hệt `kcal` và `ms` đã nằm trong danh sách giữ nguyên của
  `tools/i18n.mjs`. Dịch chúng là bịa ra một ký hiệu không tồn tại.

  Và đây đúng bộ giá trị mà `HeightUnit`/`WeightUnit` cho phép, nên thêm một
  viên thứ ba sẽ đỏ ở `tsc` chứ không lặng lẽ ghi một chuỗi app không hiểu.
*/
/**
 * Bề rộng hàng đơn vị.
 *
 * `Segmented` dựng trên `PickRow`, và mọi ô của nó là `flex: 1` — tức control
 * KHÔNG có bề rộng tự thân và phải nhận từ cha. Bản đầu để `alignSelf:'center'`
 * một mình: dựng ra thì hai nhãn dính thành một chữ `cmin` trong một viên bị
 * bóp lại. Đó là loại lỗi chỉ hiện ra khi dựng, không hiện ra khi đọc.
 *
 * 160 chứ không phải cả hàng: hai nấc kéo dài 354đ đọc ra là một thanh điều
 * hướng mục, không phải một lựa chọn nhỏ về cách đọc con số bên dưới. 80đ mỗi
 * nấc vẫn quá sàn chạm 44 của Apple theo chiều ngang.
 */
const UNIT_ROW_W = 160;

const UNIT_H: readonly { key: HeightUnit; label: string }[] = [
  { key: 'cm', label: 'cm' },
  { key: 'in', label: 'in' },
];
const UNIT_W: readonly { key: WeightUnit; label: string }[] = [
  { key: 'kg', label: 'kg' },
  { key: 'lbs', label: 'lbs' },
];

const RULER_SCREENS: ReadonlySet<StepKey> = new Set(['height', 'weight']);

/** Sáu bậc của thang hạng — `RANKS` có sáu mục, và cái thang vẽ đúng sáu nấc. */
const RANK_DOTS = [1, 2, 3, 4, 5, 6];

/** Nút chính của những màn KHÔNG nói "Tiếp". */
const CTA: Partial<Record<StepKey, 'obStart' | 'obKoaCta' | 'obHealthConnect'>> = {
  welcome: 'obStart',
  koa: 'obKoaCta',
  health: 'obHealthConnect',
};

const group = (n: number, lang: string) => n.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US');
const pad2 = (n: number) => String(n).padStart(2, '0');

const stylesFor = makeStyles((c, m) => ({
  fill: { flex: 1 },
  /*
    Tấm chuyển cảnh: chạy hết bề ngang, và có NỀN ĐỤC.

    Nền không phải trang trí. Màn ra chỉ lùi 30% nên nó vẫn nằm phần lớn trên
    màn hình; nếu màn vào trong suốt thì hai bộ chữ chồng lên nhau đọc được cả
    hai. Trên iOS mỗi view controller tự đục, và cái đục ấy chính là thứ khiến
    parallax chỉ lộ ra ở khe bên trái trong lúc màn mới còn đang tới.

    Lề ngang được trả lại rồi lấy lại, nên ruột vẫn thụt 24 như cũ còn tấm thì
    chạm hai mép — `styles.bleed` của cây thước vẫn triệt tiêu đúng như trước.
  */
  canvas: {
    flex: 1,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: c.background,
  },
  /* Tấm ĐI ra khỏi luồng bố cục — nó không được đẩy gì cả, nó chỉ đang rời đi. */
  canvasOut: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -spacing.lg,
    right: -spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: c.background,
  },
  centre: { flex: 1, alignItems: 'center' },
  /*
    ── nhịp dọc, và con số đã đo ──

    Mọi màn hỏi đều cùng một hình dạng: câu hỏi neo TRÊN, cụm điều khiển nổi
    trong khoảng còn lại, khoảng dưới rộng hơn khoảng trên một chút. Tỉ lệ là
    `grow` : `growWide` = 1 : 1,15.

    Bản đầu đóng bằng `growSmall` (0,35), tức 1 : 0,35. Dựng thật ở 402×874 rồi
    đo trên ảnh: ba thẻ bị đẩy xuống sát nút, và giữa dòng lý do với thẻ đầu
    tiên còn lại 255 điểm TRỐNG — không phải "khoảng thở", mà là một lỗ. Ở
    1 : 1,15 cái lỗ ấy còn 140 và cụm thẻ đứng ngay dưới câu hỏi nó trả lời.

    `growSmall` vẫn còn dùng, nhưng chỉ ở chỗ nó đúng: giữa con số và cây thước
    của hai màn 07/08, nơi hai thứ ấy là MỘT cụm và không được tách ra.
  */
  /*
    ── hai đệm giãn phải cộng lại ≥ 1 ──

    Bản đầu của màn 07 đặt `growSmall` ở CẢ HAI phía con số, tổng 0,70. Spec
    flexbox nói rõ: khi tổng `flex-grow` nhỏ hơn 1, các phần tử chỉ chiếm ĐÚNG
    tỉ lệ ấy của khoảng trống — 30% còn lại rơi xuống đáy. Đo trên bản dựng:
    139 điểm trống nằm giữa dòng "Kéo để chỉnh" và nút chính, tức cây thước
    thôi chạm đáy vùng nội dung.

    `tsc` sạch, không cảnh báo nào, và không luật nào bắt. Nó chỉ hiện ra khi
    dựng ra và NHÌN. Ghi lại ở đây vì con số 0,35 trông vô hại, và nó chỉ vô
    hại khi đứng CẠNH một số ≥ 0,65.
  */
  grow: { flex: 1 },
  growSmall: { flex: 0.35 },
  growWide: { flex: 1.15 },
  /*
    Hàng đơn vị, canh giữa và sát ngay dưới câu hỏi.

    `marginTop` bằng `spacing.card` chứ không phải `lg`: nó là một phần của cụm
    câu hỏi, không phải một khối mới. Bề rộng tự co theo hai viên chứ không
    giãn hết hàng — một ô chọn hai nấc kéo dài 354đ đọc ra là một thanh điều
    hướng, không phải một lựa chọn nhỏ.
  */
  unitRow: { alignSelf: 'center', width: UNIT_ROW_W, marginTop: spacing.card },

  /* ── chữ dẫn ── */
  hero: { ...type.hero, color: c.foreground, lineHeight: 50 },
  q: { ...type.largeTitle, color: c.foreground, marginTop: 14, lineHeight: 33 },
  qTight: { ...type.largeTitle, color: c.foreground, marginTop: 6, lineHeight: 33 },
  qCentre: {
    ...type.largeTitle,
    color: c.foreground,
    marginTop: 14,
    textAlign: 'center',
    lineHeight: 33,
  },
  why: { ...type.footnote, color: c.mutedForeground, marginTop: spacing.sm + 2, lineHeight: 19 },
  eyebrow: {
    ...type.caption,
    color: c.mutedForeground,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  eyebrowLeft: {
    ...type.caption,
    color: c.mutedForeground,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
  },

  /* ── 01 ── */
  koaAnchor: { alignSelf: 'flex-start', marginLeft: -spacing.xs, opacity: 0.9 },

  /* ── 02 / 03 / 05 / 10 ── */
  stackBig: { gap: 14 },
  stackTight: { gap: 10 },

  /* ── 04 ── */
  koaName: {
    ...type.largeTitle,
    color: c.foreground,
    marginTop: spacing.stack,
    textAlign: 'center',
  },
  koaLine: { ...type.body, color: c.mutedForeground, marginTop: spacing.xs, textAlign: 'center' },

  /* ── 06 ── */
  wheel: { alignItems: 'center' },

  /* ── 07 / 08 ── */
  readout: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  readoutCentre: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    alignSelf: 'center',
  },
  /*
    KHÔNG `type.mono`.

    Bản đầu viết `...type.hero, ...type.mono`, và chú thích của chính `type.hero`
    đã nói trước rằng đó là sai: *"Một con số đứng yên trên thẻ thì không cần
    cột, và Menlo ở cỡ lớn đọc ra là một dòng terminal chứ không phải một chỉ số
    sức khoẻ."* Dựng ra rồi nhìn thì đúng thế — `2.031` ở 44pt thành một dòng
    lệnh.

    `fontVariant` thì GIỮ: đó là phần lợi ích thật của mono (cột số không nhảy
    khi thước chạy) mà không đổi mặt chữ.
  */
  num: { ...type.hero, fontVariant: ['tabular-nums'] as ['tabular-nums'], color: c.foreground },
  numUnit: { ...type.headline, color: c.mutedForeground, paddingBottom: 8 },
  stage: { alignItems: 'center' },
  /* Trả lại lề ngang của khung để thước chạm hai mép màn. */
  bleed: { marginHorizontal: -spacing.lg },
  ruler: { height: RULER_H, alignSelf: 'stretch', justifyContent: 'center' },
  needle: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 0,
    width: 3,
    height: 68,
    borderRadius: 1.5,
    backgroundColor: c.foreground,
  },
  hint: { ...type.footnote, color: c.mutedForeground, textAlign: 'center', marginTop: spacing.sm },

  /* ── 09 ── */
  rows: {
    backgroundColor: c.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    overflow: 'hidden',
  },
  row: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.card,
    paddingVertical: 12,
  },
  rowText: { flex: 1, gap: 2 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  /*
    ── vì sao hàng được chọn cần DẤU TÍCH, không chỉ cần đổi nền ──

    Đo trên chính bảng màu đang ship: `secondary` trên `card` ra **1,198** ở bản
    sáng và **1,088** ở bản tối. Bậc bề mặt nhỏ nhất của iOS là 1,134 — tức ở
    bản TỐI cái nền này còn chưa tới ngưỡng nhìn thấy, và WCAG 1.4.11 đòi 3:1
    cho một đồ hoạ mang nghĩa. "Hàng nào đang được chọn" đúng là một đồ hoạ
    mang nghĩa.

    Dấu tích vẽ bằng `c.foreground`: 17,57:1 ở bản sáng, 16,46:1 ở bản tối. Nền
    `secondary` thì GIỮ — nó là tín hiệu thứ hai, đọc được bằng đuôi mắt, và hai
    tín hiệu cùng lúc là cách một trạng thái sống được ở cả hai diện mạo.

    `ChoiceCard` không cần dấu tích vì viền của nó đã là `foreground`, tức cùng
    mức tương phản ấy. Hàng đặc thì không có viền để mượn.
  */
  rowOn: { backgroundColor: c.secondary },
  rowLabel: { ...type.body, fontWeight: '600', color: c.foreground },
  rowDesc: { ...type.footnote, color: c.mutedForeground },

  /* ── 11 ── */
  planFor: { ...type.body, color: c.mutedForeground, marginTop: spacing.xs },
  planMacro: { ...type.body, color: c.foreground, marginTop: spacing.sm + 2 },
  hair: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: spacing.md },
  planQuiet: { ...type.footnote, color: c.mutedForeground, marginTop: spacing.xs },
  ladder: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  rung: { width: 22, height: 3, borderRadius: 1.5, backgroundColor: alpha(c.foreground, 0.14) },
  rungOn: { backgroundColor: c.foreground },
  /*
    15/600 màu PHỤ, không phải 15/600 màu mực.

    Ở bản Round 2 tên bậc để mực đậm và nó nặng hơn hai dòng nước và ngủ ngay
    trên nó — bậc ba của thang đứng trên bậc hai, tức thang bị đảo ở đúng nấc
    cuối. Hạ xuống `secondaryForeground` thì cả cột đọc đúng một chiều.
  */
  rankName: {
    ...type.body,
    fontWeight: '600',
    color: c.secondaryForeground,
    marginTop: spacing.sm,
  },
  rankLine: { ...type.caption, color: c.mutedForeground, marginTop: 2 },

  /* ── 12 ── */
  healthBody: {
    ...type.body,
    color: c.secondaryForeground,
    marginTop: spacing.sm + 2,
    lineHeight: 22,
  },
  week: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 84 },
  bar: { flex: 1, borderRadius: 4 },
  barOff: { backgroundColor: alpha(c.foreground, 0.12) },
  barOn: { backgroundColor: c.foreground },
  reads: { gap: spacing.sm + 2 },
  read: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  readDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.mutedForeground },
  readText: { ...type.body, color: c.secondaryForeground },

  /* ── 13 ── */
  readyLine: {
    ...type.largeTitle,
    color: c.foreground,
    marginTop: 18,
    textAlign: 'center',
    lineHeight: 33,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  chip: {
    ...type.footnote,
    color: c.mutedForeground,
    backgroundColor: c.secondary,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  pending: { marginTop: spacing.md },

  /*
    Câu báo lỗi dưới cụm điều khiển.

    Ở luồng này hai con số đến từ THƯỚC, nên một giá trị ngoài dải gần như
    không tạo ra được. "Gần như" không phải "không": một hồ sơ cũ, một lần đổi
    đơn vị giữa chừng, một lần đổi `BOUNDS` — và người dùng sẽ thấy một nút bị
    khoá. Khoá nút mà không nói vì sao là một màn hình chết.
  */
  fieldError: {
    ...type.footnote,
    color: c.readinessRed,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  /* ── sheet tài liệu ── */
  legalRoot: { flex: 1, backgroundColor: c.background },
  legalHeader: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    borderBottomWidth: m.inset.borderWidth,
    borderBottomColor: m.inset.border,
  },
  legalTitle: { ...type.headline, flex: 1, color: c.foreground },
  legalClose: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(m.ink, 0.06),
  },
  legalTabs: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, paddingBottom: 0 },
  legalTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
  },
  legalTabOn: { backgroundColor: c.foreground },
  legalTabText: { ...type.footnote, color: c.mutedForeground },
  legalTabTextOn: { color: c.background },
  legalContent: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  legalBlockTitle: { ...type.headline, color: c.foreground, marginBottom: 4 },
  legalBlockBody: { ...type.footnote, color: c.mutedForeground, lineHeight: 20 },
  legalIntro: { color: c.foreground, marginBottom: spacing.xs },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 6 },
  bulletDot: { ...type.footnote, color: c.primary },
  bulletText: { ...type.footnote, color: c.mutedForeground, flex: 1, lineHeight: 20 },
}));
