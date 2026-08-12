import { StyleSheet, Text, View } from 'react-native';

import { FormSheet } from '@/components/ascnd/form-sheet';
import { colors, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';

/**
 * What the calorie target is, and the one thing about it that surprises people.
 *
 * ── why this card and not another ──
 *
 * The readiness gauge and the training card already have a `?`. This is the
 * third card that cannot be read correctly by looking at it, and it is the one
 * most people look at most often.
 *
 * The surprise is the exercise calories. Anybody arriving from MyFitnessPal has
 * learned an equation — *goal − food + exercise = remaining* — where training
 * hands you calories back to eat. This app does not do that, and to somebody
 * carrying the other model it looks like a bug: they train for an hour, the
 * number does not move, and the obvious conclusion is that the app failed to
 * notice.
 *
 * It noticed. The target is built from Mifflin-St Jeor times an activity
 * multiplier, and the multiplier *is* the training — adding a session back on
 * top would count the same hour twice. That is a paragraph, it is the
 * difference between trusting the number and overeating by several hundred
 * calories, and there was nowhere in the app that said it.
 *
 * ── and why this is a sheet rather than a tour ──
 *
 * Because it is read at the moment somebody wonders, which is not the moment
 * they install. Nielsen Norman's work on mobile tutorials found the group that
 * read a push-style walkthrough rated the same app *harder* to use than the
 * group that skipped it (4.92 against 5.49) — a tutorial in front of an app
 * mostly teaches people that the app needs a tutorial. On-demand help does not
 * have that problem, and the `?` budget in `help-nudge.ts` means the offer of
 * it is made three times and then never again.
 */
export function NutritionExplainer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';

  const rows = [
    {
      term: vi ? 'Mục tiêu calo đến từ đâu' : 'Where the calorie target comes from',
      body: vi
        ? 'Chuyển hoá cơ bản của bạn (theo công thức Mifflin-St Jeor, từ cân nặng, chiều cao, tuổi, giới) nhân với mức vận động bạn chọn lúc đăng ký, rồi điều chỉnh theo mục tiêu — giảm cân trừ 20%, tăng cân cộng 10%.'
        : 'Your basal metabolic rate (Mifflin-St Jeor, from weight, height, age and sex) times the activity level you picked at sign-up, then adjusted for your goal — 20% off to cut, 10% on to gain.',
    },
    {
      term: vi ? 'Tập xong, số này KHÔNG tăng lên' : 'Training does not add calories back',
      body: vi
        ? 'Đây là chỗ khác với MyFitnessPal, và là chỗ dễ tưởng app tính sai nhất. Ở đó, tập xong bạn được "trả lại" calo để ăn thêm. Ở đây thì không — vì mức vận động bạn chọn ĐÃ bao gồm việc tập rồi. Cộng thêm buổi tập vào nữa là tính cùng một giờ đó hai lần, và đó là cách ăn vượt vài trăm calo mỗi ngày mà vẫn tưởng mình đúng kế hoạch.'
        : 'This is where the app differs from MyFitnessPal, and where it most looks wrong. There, a workout hands calories back to eat. Here it does not — the activity level you chose already includes your training. Adding a session on top counts the same hour twice, which is how somebody eats several hundred calories over while believing they are on plan.',
    },
    {
      term: vi ? 'Nếu mức vận động chọn sai' : 'If the activity level is wrong',
      body: vi
        ? 'Thì mục tiêu sai theo, và cách sửa là sửa nó chứ không phải cộng bù từng buổi. Sau khoảng hai tuần có ghi ăn và cân đều, màn "Mục tiêu thông minh" sẽ ĐO tiêu hao thật của bạn từ lượng ăn và biến động cân nặng, rồi đề xuất con số đúng hơn.'
        : 'Then the target is wrong with it, and the fix is to change it rather than to credit sessions one by one. After about two weeks of logged food and regular weigh-ins, Smart Goals measures what you actually burn — from your intake and what the scale did — and suggests a better number.',
    },
    {
      term: vi ? 'Bốn ô macro' : 'The four macro tiles',
      body: vi
        ? 'Đạm tính theo cân nặng (2,0–2,4 g/kg tuỳ mục tiêu), béo 25% calo, tinh bột là phần còn lại, và chất xơ 14g cho mỗi 1.000 kcal theo khuyến nghị của IOM. Ba cái đầu luôn cộng lại đúng bằng mục tiêu calo — no đủ ba vòng macro thì không thể vượt vòng calo.'
        : 'Protein from body weight (2.0–2.4 g/kg depending on goal), fat at 25% of calories, carbohydrate as the remainder, and fibre at 14 g per 1,000 kcal — the IOM adequate intake. The first three always add up to exactly the calorie target, so filling every macro ring cannot put you over the calorie ring.',
    },
  ];

  return (
    <FormSheet visible={visible} title={i18n.nToday} onClose={onClose}>
      <Text style={styles.lede}>
        {vi
          ? 'Vòng lớn là calo hôm nay so với mục tiêu của riêng bạn. Đây là cách con số đó được tính.'
          : 'The big ring is today’s calories against your own target. Here is how that number is worked out.'}
      </Text>
      {rows.map((r) => (
        <View key={r.term} style={styles.row}>
          <Text style={styles.term}>{r.term}</Text>
          <Text style={styles.body}>{r.body}</Text>
        </View>
      ))}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  lede: { ...type.body, color: colors.foreground, marginBottom: spacing.md },
  row: { gap: 4, marginBottom: spacing.md },
  term: { ...type.headline, color: colors.foreground },
  body: { ...type.footnote, color: colors.mutedForeground, lineHeight: 19 },
});
