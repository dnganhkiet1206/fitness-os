import { StyleSheet, Text, View } from 'react-native';

import { FormSheet } from '@/components/ascnd/form-sheet';
import { colors, radius, spacing } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';

/**
 * What the training card is saying.
 *
 * ── the two things nobody guesses ──
 *
 * **`4,200 kg`.** Volume load is the sum of weight × reps over every set, and
 * until somebody tells you that, the number reads as a claim that you lifted
 * four tonnes, which is either nonsense or a bug. It is the single most
 * alarming number on the dashboard and it is correct.
 *
 * **`Acute:Chronic Ratio 1.14`,** with a five-zone bar and the words Optimal,
 * Elevated, Spike, Detraining, Low. Every part of that is jargon, and the card
 * uses it to tell you whether to back off — advice you cannot interrogate is
 * advice you obey blindly or ignore.
 *
 * The bands here are the same ones `readiness-engine.ts` scores against and
 * `today-widgets-2.tsx` draws, written once more in words. If they ever
 * disagree, the numbers on screen win and this file is wrong.
 */
export function TrainingExplainer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';

  const rows = [
    {
      term: vi ? 'RPE 8/10' : 'RPE 8/10',
      body: vi
        ? 'Mức gắng sức của cả buổi, thang 1–10. 8 nghĩa là còn khoảng 2 rep nữa mới hết sức, 10 là không còn gì. Đây là con số bạn tự chấm, không phải app đo.'
        : 'How hard the whole session was, 1–10. 8 means roughly two reps left in the tank, 10 means nothing left. You set this number; the app does not measure it.',
    },
    {
      term: vi ? '12 sets' : '12 sets',
      body: vi
        ? 'Số set đã ghi trong buổi đó — không tính khởi động nếu bạn không ghi chúng.'
        : 'How many sets were logged in that session — warm-ups only count if you logged them.',
    },
    {
      term: vi ? '4.200 kg' : '4,200 kg',
      body: vi
        ? 'Đây KHÔNG phải mức tạ bạn nâng. Đó là tổng khối lượng: cộng (tạ × số rep) của từng set. 60kg × 10 rep × 3 set = 1.800 kg. Nên con số hàng nghìn là bình thường, và nó là cách so sánh khối lượng giữa hai buổi.'
        : 'This is NOT the weight you lifted. It is volume load: weight × reps, summed over every set. 60kg × 10 reps × 3 sets = 1,800 kg. Numbers in the thousands are normal, and it is how two sessions get compared.',
    },
  ];

  const zones = [
    { range: '< 0.65', tint: colors.readinessRed, en: 'Detraining', vi: 'Tập quá thưa — đang mất phong độ' },
    { range: '0.65 – 0.8', tint: colors.readinessYellow, en: 'Low', vi: 'Hơi ít so với thói quen' },
    { range: '0.8 – 1.3', tint: colors.readinessGreen, en: 'Optimal', vi: 'Vùng an toàn — tăng vừa phải' },
    { range: '1.3 – 1.6', tint: colors.readinessYellow, en: 'Elevated', vi: 'Tăng hơi nhanh' },
    { range: '> 1.6', tint: colors.readinessRed, en: 'Spike', vi: 'Nhảy vọt — nguy cơ chấn thương' },
  ];

  return (
    <FormSheet visible={visible} title={i18n.dcTrainingTitle} onClose={onClose}>
      <Text style={styles.lede}>
        {vi
          ? 'Thẻ này trả lời hai câu: buổi gần nhất nặng cỡ nào, và tuần này bạn có đang tăng tải quá nhanh không.'
          : 'This card answers two questions: how hard the last session was, and whether this week is ramping up too fast.'}
      </Text>

      <Text style={styles.section}>{vi ? 'Dòng buổi gần nhất' : 'The latest-session line'}</Text>
      {rows.map((r) => (
        <View key={r.term} style={styles.row}>
          <Text style={styles.term}>{r.term}</Text>
          <Text style={styles.body}>{r.body}</Text>
        </View>
      ))}

      <Text style={styles.section}>{vi ? 'Tỉ lệ cấp tính / mãn tính' : 'Acute-to-chronic ratio'}</Text>
      <Text style={styles.body}>
        {vi
          ? 'Khối lượng trung bình mỗi ngày trong 7 ngày qua, chia cho trung bình mỗi ngày trong 28 ngày qua. Nói gọn: tuần này bạn tập nặng hơn hay nhẹ hơn thói quen của chính mình — so với bạn, không so với ai khác.'
          : 'Your average daily volume over the last 7 days divided by your average over the last 28. Put plainly: is this week heavier or lighter than your own habit — yours, not anybody else’s.'}
      </Text>
      <View style={styles.zones}>
        {zones.map((z) => (
          <View key={z.range} style={styles.zone}>
            <View style={[styles.dot, { backgroundColor: z.tint }]} />
            <Text style={styles.zoneRange}>{z.range}</Text>
            <Text style={styles.zoneWhat}>{vi ? z.vi : z.en}</Text>
          </View>
        ))}
      </View>
      {/*
        The half nobody expects. Both ends of the bar are red, and the low end
        surprises people who read the whole thing as an overtraining warning.
      */}
      <Text style={styles.note}>
        {vi
          ? 'Cả hai đầu đều đỏ. Tập quá ít cũng bị cảnh báo, không riêng gì tập quá nhiều — mất nền thể lực làm bạn dễ chấn thương khi quay lại.'
          : 'Both ends are red. Training too little is flagged as well as training too much — losing your base is what makes coming back risky.'}
      </Text>

      <Text style={styles.section}>{vi ? 'Những thứ còn lại' : 'The rest of the card'}</Text>
      <View style={styles.row}>
        <Text style={styles.term}>{i18n.dcTraining7dVolume}</Text>
        <Text style={styles.body}>
          {vi
            ? 'Tổng khối lượng của mọi buổi trong 7 ngày qua. Không có buổi nào thì là 0 — đó là con số thật, không phải lỗi.'
            : 'Volume load added up across every session in the last 7 days. No sessions means 0 — that is the real number, not a fault.'}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.term}>PR!</Text>
        <Text style={styles.body}>
          {vi
            ? 'Có một buổi trong 7 ngày qua đạt mức kỷ lục cá nhân ở ít nhất một bài.'
            : 'A session in the last 7 days hit a personal record on at least one lift.'}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.term}>{i18n.dcTrainingPain}</Text>
        <Text style={styles.body}>
          {vi
            ? 'Chỗ đau bạn đã đánh dấu trong buổi gần nhất, kèm mức 0–10. Chỉ hiện khi mức lớn hơn 0.'
            : 'Pain you flagged during the latest session, with its 0–10 level. Only shown when the level is above zero.'}
        </Text>
      </View>

      <Text style={styles.caveat}>
        {vi
          ? 'Mọi con số ở đây tính từ những gì bạn đã ghi. Buổi tập không ghi thì không tồn tại với thẻ này — tỉ lệ sẽ tụt xuống dù bạn vẫn tập.'
          : 'Every number here comes from what you logged. A session you did not record does not exist to this card — the ratio falls even though you trained.'}
      </Text>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  lede: { fontSize: 14, lineHeight: 20, color: colors.foreground },
  section: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    color: colors.mutedForeground,
    marginTop: spacing.sm,
  },
  row: { gap: 3 },
  term: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
  body: { fontSize: 13, lineHeight: 19, color: colors.mutedForeground },
  zones: { gap: 6, marginTop: 2 },
  zone: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  zoneRange: {
    width: 84,
    fontSize: 12,
    fontFamily: 'Menlo',
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
  zoneWhat: { flex: 1, fontSize: 12, color: colors.mutedForeground },
  note: { fontSize: 12, lineHeight: 18, color: colors.mutedForeground, fontStyle: 'italic' },
  caveat: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.mutedForeground,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
  },
});
