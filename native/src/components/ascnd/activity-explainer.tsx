import { StyleSheet, Text, View } from 'react-native';

import { FormSheet } from '@/components/ascnd/form-sheet';
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { EXERCISE_TARGET_MIN, MOVE_TARGET_KCAL } from '@/lib/activity';

/**
 * Ba vòng hoạt động đang nói gì, và ba câu không đoán được từ hình vẽ.
 *
 * ── vì sao thẻ này cần một sheet ──
 *
 * Nó vẽ ba vòng đồng tâm và ba con số, và không con số nào tự nói ra mình đến
 * từ đâu:
 *
 *   1. **Hai trong ba vòng CHỈ Apple Health mới lấp được.** Không đeo đồng hồ
 *      thì MOVE và STEPS đứng ở 0 cả ngày, kể cả hôm vừa tập hai tiếng. Số 0 ở
 *      đó nghĩa là "chưa ai đo", và nó trông y hệt "bạn không vận động".
 *
 *   2. **Vòng EXERCISE đổi NGUỒN.** Health có số thì lấy số đo; Health báo 0
 *      thì nó chuyển sang ước lượng từ set đã ghi. Cùng một vòng, hai loại số,
 *      và người đọc chỉ biết nếu có ai nói ra.
 *
 *   3. **Hai trong ba mục tiêu là hằng số**, không phải mục tiêu người dùng
 *      đặt và cũng không suy ra từ hồ sơ. Chỉ STEPS là của họ.
 *
 * ── các con số được ĐỌC ra khỏi `lib/activity.ts` ──
 *
 * `MOVE_TARGET_KCAL` và `EXERCISE_TARGET_MIN` được import chứ không gõ lại, nên
 * chỉnh mục tiêu trong engine là sheet đi theo. `tools/activity-explainer.mjs`
 * giữ cho hai bên không trôi khỏi nhau — chú thích ở `readiness-explainer.tsx`
 * ghi rằng repo này từng có một chú thích viện dẫn một công cụ CHƯA TỪNG TỒN
 * TẠI, và một help sheet lệch khỏi mã thì tệ hơn không có help sheet, vì nó
 * được tin.
 *
 * ── và nó nói ra thứ thẻ này KHÔNG làm ──
 *
 * Câu cuối trả lời câu đã bị hỏi thẳng nhiều lần: ba vòng này không tham gia
 * tính điểm sẵn sàng. `ReadinessInput` không có trường bước chân hay calo hoạt
 * động nào, và `tools/readiness-copy.mjs` giữ cho nó không có.
 */
export function ActivityExplainer({
  visible,
  onClose,
  stepsTarget,
}: {
  visible: boolean;
  onClose: () => void;
  /** mục tiêu bước chân CỦA NGƯỜI DÙNG — sheet nói đúng con số họ đã đặt */
  stepsTarget: number;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  /* Cùng phép rơi về mặc định với `activityModel`, để sheet không bao giờ nói
     một mục tiêu khác với mục tiêu vòng tròn đang vẽ. */
  const steps = stepsTarget > 0 ? stepsTarget : 10000;

  const rows = [
    {
      term: vi ? 'MOVE — calo hoạt động' : 'MOVE — active calories',
      body: vi
        ? `Calo bạn đốt thêm ngoài mức trao đổi chất khi nghỉ, đọc từ Apple Health. Mục tiêu ${MOVE_TARGET_KCAL} kcal là một hằng số của app — không phải con số bạn đặt, cũng không suy ra từ hồ sơ.`
        : `The calories you burn beyond resting metabolism, read from Apple Health. The ${MOVE_TARGET_KCAL} kcal target is a fixed app constant — not something you set, and not derived from your profile.`,
    },
    {
      term: vi ? 'EXERCISE — phút tập, và nó có HAI nguồn' : 'EXERCISE — minutes, from two sources',
      body: vi
        ? `Mục tiêu ${EXERCISE_TARGET_MIN} phút, cũng là hằng số. Có số từ Apple Health thì số đo thắng; Health báo 0 thì vòng chuyển sang ƯỚC LƯỢNG từ các set bạn đã ghi hôm nay, và thẻ ghi rõ lúc đó nó đang ước lượng.\n\nNó không lấy số lớn hơn trong hai nguồn: "cái nào lớn hơn thì thắng" là luật không ai nhớ nổi, và một vòng lặng lẽ đổi loại số nó đang hiện thì không ghi nhãn cho trung thực được.`
        : `A fixed ${EXERCISE_TARGET_MIN}-minute target. When Apple Health has a number the measurement wins; when Health reports 0 the ring falls back to an ESTIMATE from the sets you logged today, and the card says so.\n\nIt does not take the larger of the two: "whichever is bigger wins" is a rule nobody can hold in their head, and a ring that quietly changes which kind of number it shows cannot be labelled honestly.`,
    },
    {
      term: vi ? 'STEPS — mục tiêu duy nhất là của bạn' : 'STEPS — the only target that is yours',
      body: vi
        ? `${steps.toLocaleString()} bước, đổi được trong Cài đặt; chưa đặt thì mặc định 10.000. Số bước đến từ Apple Health.`
        : `${steps.toLocaleString()} steps, changeable in Settings; unset, it defaults to 10,000. The step count comes from Apple Health.`,
    },
    {
      term: vi ? 'Số 0 ở đây nghĩa là gì' : 'What a zero here means',
      body: vi
        ? 'MOVE và STEPS chỉ Apple Health mới lấp được. Không kết nối Health thì hai vòng đó ở 0 cả ngày — đó là "chưa ai đo", không phải "bạn không vận động". EXERCISE vẫn chạy được từ buổi tập bạn tự ghi.'
        : 'MOVE and STEPS can only be filled by Apple Health. Without it they sit at 0 all day — that means "nobody measured", not "you did not move". EXERCISE still works from the sessions you log yourself.',
    },
    {
      term: vi ? 'Ba vòng này không tính vào điểm sẵn sàng' : 'These rings are not in the readiness score',
      body: vi
        ? 'Điểm sẵn sàng chỉ đọc HRV, nhịp tim nghỉ, giấc ngủ và tải tập tính từ các buổi tập đã ghi. Bước chân và calo hoạt động không nằm trong công thức nào.'
        : 'Readiness reads only HRV, resting heart rate, sleep, and training load computed from logged sessions. Steps and active calories are in no formula.',
    },
  ];

  return (
    <FormSheet visible={visible} title={i18n.dcActivity} onClose={onClose}>
      <Text style={styles.lede}>
        {vi
          ? 'Ba vòng cho ba câu hỏi khác nhau về hôm nay: bạn đốt bao nhiêu, bạn tập bao lâu, và bạn đi được bao xa. Một vòng "đóng" khi nó chạm hoặc vượt mục tiêu của nó.'
          : 'Three rings for three different questions about today: how much you burned, how long you trained, and how far you walked. A ring "closes" when it reaches or passes its target.'}
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

const stylesFor = makeStyles((c) => ({
  lede: { ...type.body, color: c.foreground, marginBottom: spacing.md },
  row: { gap: 4, marginBottom: spacing.md },
  term: { ...type.headline, color: c.foreground },
  body: { ...type.footnote, color: c.mutedForeground, lineHeight: 19 },
}));
