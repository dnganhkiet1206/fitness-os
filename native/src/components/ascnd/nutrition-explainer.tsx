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
 * The surprise is the exercise calories. Several well-known trackers use an
 * equation — *goal − food + exercise = remaining* — where training hands you
 * calories back to eat. This app does not, and to somebody carrying that model
 * it looks like a bug: they train for an hour, the number does not move, and
 * the obvious conclusion is that the app failed to notice.
 *
 * It noticed. The target is built from Mifflin-St Jeor times an activity
 * multiplier, and the multiplier *is* the training — adding a session back on
 * top would count the same hour twice. That is a paragraph, it is the
 * difference between trusting the number and overeating by several hundred
 * calories, and there was nowhere in the app that said it.
 *
 * ── and it names no competitor ──
 *
 * The first draft of the text below opened by comparing this app to a named
 * one. That assumes the reader came from it, and reads as defensive to
 * everybody who did not. The sentence has to stand on its own terms — *some
 * apps do X, this one does not, here is why* — and the comparison belongs in
 * this comment, where it explains why the paragraph exists at all.
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
        ? 'Một số app trả lại calo cho bạn sau mỗi buổi tập. App này thì không, vì mức vận động bạn chọn ĐÃ bao gồm việc tập rồi — cộng thêm buổi tập vào nữa là tính cùng một giờ đó hai lần. Đó là cách ăn vượt vài trăm calo mỗi ngày mà vẫn tưởng mình đúng kế hoạch.'
        : 'Some apps hand calories back after a workout. This one does not, because the activity level you chose already includes your training — adding a session on top counts the same hour twice. That is how somebody eats several hundred calories over while believing they are on plan.',
    },
    {
      term: vi ? 'Nếu mức vận động chọn sai' : 'If the activity level is wrong',
      body: vi
        ? 'Thì mục tiêu sai theo, và cách sửa là sửa nó chứ không phải cộng bù từng buổi. Sau khoảng hai tuần có ghi ăn và cân đều, màn "Hiệu chỉnh mục tiêu" (trong tab Tiến độ, dưới thẻ thay đổi cân nặng) sẽ ĐO tiêu hao thật của bạn từ lượng ăn và biến động cân nặng, rồi đề xuất con số đúng hơn.'
        : 'Then the target is wrong with it, and the fix is to change it rather than to credit sessions one by one. After about two weeks of logged food and regular weigh-ins, Target calibration — on the Progress tab, under the weight-changes card — measures what you actually burn from your intake and what the scale did, and suggests a better number.',
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
