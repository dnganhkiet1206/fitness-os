import { StyleSheet, Text, View } from 'react-native';

import { FormSheet } from '@/components/ascnd/form-sheet';
import { colors, radius, spacing } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { ACWR_BANDS, type AcwrZoneKey } from '@/lib/training-card';

/**
 * What the training card is saying.
 *
 * ── the two things nobody guesses ──
 *
 * **`4,200 kg`.** Volume load is weight × reps summed over every set, and until
 * somebody says so the number reads as a claim to have lifted four tonnes,
 * which is either nonsense or a bug. It is the most alarming number on the
 * dashboard and it is correct.
 *
 * **The load ratio,** with a banded bar and a one-word verdict the card uses to
 * suggest whether to back off. Advice you cannot interrogate is advice you obey
 * blindly or ignore.
 *
 * ── the bands are imported, not retyped ──
 *
 * `ACWR_BANDS` comes from `lib/training-card.ts`, which is also what the bar
 * and the pill read. This file used to spell the ranges out itself, which is
 * precisely how the card ended up drawing one ratio in two different colours
 * with two different verdicts. A help sheet that has drifted from the screen is
 * worse than none, because it is believed.
 */
export function TrainingExplainer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';

  const zoneTint: Record<AcwrZoneKey, string> = {
    detraining: colors.readinessRed,
    low: colors.readinessYellow,
    optimal: colors.readinessGreen,
    elevated: colors.readinessYellow,
    spike: colors.readinessRed,
  };
  const zoneWhat: Record<AcwrZoneKey, string> = {
    detraining: vi ? 'Tập quá thưa — đang mất nền' : 'Detraining — losing your base',
    low: vi ? 'Hơi ít so với thói quen' : 'Lighter than your habit',
    optimal: vi ? 'Vừa sức — tăng đều' : 'Optimal — steady progression',
    elevated: vi ? 'Tăng nhanh' : 'Ramping fast',
    spike: vi ? 'Nhảy vọt — nguy cơ chấn thương' : 'Spiking — injury risk',
  };

  const latestRows = [
    {
      term: vi ? 'Hôm nay / 5 ngày trước' : 'Today / 5 days ago',
      body: vi
        ? 'Buổi gần nhất được ghi cách đây bao lâu. Nếu quá 7 ngày, chữ chuyển sang vàng và thẻ nói rõ — vì lúc đó mọi con số "7 ngày" bên dưới đều bằng 0 một cách chính đáng, chứ không phải hỏng.'
        : 'How long ago the most recent session was. Past seven days it turns amber and the card says so, because at that point every "7 days" figure below is legitimately zero rather than broken.',
    },
    {
      term: vi ? '12 set' : '12 sets',
      body: vi
        ? 'Số set đã ghi trong buổi đó. Khởi động chỉ được tính nếu bạn có ghi lại.'
        : 'How many sets were logged in that session. Warm-ups count only if you logged them.',
    },
    {
      term: vi ? 'Gắng sức 8/10' : 'Effort 8/10',
      body: vi
        ? 'Mức gắng sức của cả buổi, thang 1–10 (nơi khác gọi là RPE). 8 nghĩa là còn khoảng 2 rep nữa mới hết sức, 10 là không còn gì. Đây là số bạn tự chấm, app không đo được.'
        : 'How hard the session was, 1–10 (elsewhere called RPE). 8 means about two reps left in the tank, 10 means nothing left. You set this; the app cannot measure it.',
    },
    {
      term: vi ? '4.200 kg' : '4,200 kg',
      body: vi
        ? 'KHÔNG phải mức tạ bạn nâng. Đây là tổng khối lượng: cộng (tạ × số rep) của từng set. 60kg × 10 rep × 3 set = 1.800 kg. Nên số hàng nghìn là bình thường, và đó là cách so hai buổi tập với nhau.'
        : 'NOT the weight you lifted. It is volume load: weight × reps, summed over every set. 60kg × 10 reps × 3 sets = 1,800 kg. Numbers in the thousands are normal, and it is how two sessions get compared.',
    },
  ];

  return (
    <FormSheet visible={visible} title={i18n.dcTrainingTitle} onClose={onClose}>
      <Text style={styles.lede}>
        {vi
          ? 'Thẻ này trả lời một câu: tuần này bạn có đang tăng tải quá nhanh so với chính mình không. Mọi thứ còn lại trên thẻ là bằng chứng cho câu trả lời đó.'
          : 'This card answers one question: are you ramping up too fast for yourself? Everything else on it is the evidence for that answer.'}
      </Text>


      <Text style={styles.section}>{vi ? 'Câu ở trên cùng' : 'The sentence at the top'}</Text>
      <Text style={styles.body}>
        {vi
          ? '"Tuần này nặng hơn 70% so với thói quen" là cách so hai con số ngay bên dưới nó: tổng khối lượng 7 ngày qua, và một tuần trung bình của bạn trong 4 tuần gần nhất. Bạn tự chia được — 18.900 so với 11.100 là hơn 70%. Không có gì giấu bên trong.'
          : '"This week is 70% heavier than your habit" compares the two numbers directly beneath it: your volume over the last 7 days, against an average week from your last 4. You can do the division yourself — 18,900 against 11,100 is 70% more. Nothing is hidden.'}
      </Text>
      <Text style={styles.body}>
        {vi
          ? 'So với chính bạn, không so với ai khác. Một người mới tập và một vận động viên có thể cùng ra 1.2 — nghĩa là cả hai đều đang tăng ở mức hợp lý so với nền của chính họ.'
          : 'Against you, not against anybody else. A beginner and an athlete can both read 1.2 — both are progressing sensibly relative to their own base.'}
      </Text>
      <View style={styles.row}>
        <Text style={styles.term}>{vi ? 'Thói quen · 4 tuần' : 'Habit · 4 weeks'}</Text>
        <Text style={styles.body}>
          {vi
            ? 'Tổng 28 ngày chia cho 4. Dùng 4 tuần chứ không phải 1 vì một tuần ốm hay một tuần đi chơi không nên định nghĩa lại thói quen của bạn.'
            : 'The 28-day total divided by four. Four weeks rather than one, because a sick week or a holiday should not redefine what your normal is.'}
        </Text>
      </View>
      <Text style={styles.body}>
        {vi
          ? 'Con số kỹ thuật của tỉ lệ này gọi là ACWR (acute:chronic workload ratio) — nếu bạn từng đọc ở đâu đó thì đây chính là nó.'
          : 'The technical name for this ratio is ACWR — the acute:chronic workload ratio — in case you have met it elsewhere.'}
      </Text>
      <Text style={styles.section}>{vi ? 'Biểu đồ 8 tuần' : 'The 8-week chart'}</Text>
      <Text style={styles.body}>
        {vi
          ? 'Mỗi cột là tổng khối lượng của một tuần, cột ngoài cùng bên phải là tuần này. Đường nét đứt chính là "thói quen" mà câu ở trên đang so — nên bạn thấy được ngay tuần này cao hơn hay thấp hơn nền của mình, và cao hơn theo kiểu nào.'
          : 'Each bar is one week’s total volume, the rightmost being this week. The dashed line is the same "habit" the sentence above compares against — so you can see at a glance whether this week is above your baseline, and in what shape.'}
      </Text>
      <Text style={styles.body}>
        {vi
          ? 'Đây là thứ mà một con số không nói được: nặng hơn 70% có thể là tuần thứ tư của một chu kỳ tăng dần có chủ đích, cũng có thể là một buổi quá đà sau hai tuần nghỉ. Hai chuyện đó rất khác nhau, và nhìn biểu đồ là phân biệt được.'
          : 'This is what a single number cannot say: 70% heavier might be the fourth week of a deliberate build, or one wild session after a fortnight off. Those are very different, and the chart tells them apart.'}
      </Text>

      <Text style={styles.section}>{vi ? 'Năm mức của tỉ lệ' : 'The ratio’s five levels'}</Text>
      <View style={styles.zones}>
        {ACWR_BANDS.map((b) => (
          <View key={b.key} style={styles.zone}>
            <View style={[styles.dot, { backgroundColor: zoneTint[b.key] }]} />
            <Text style={styles.zoneRange}>{b.label}</Text>
            <Text style={styles.zoneWhat}>{zoneWhat[b.key]}</Text>
          </View>
        ))}
      </View>
      {/*
        The half nobody expects. Both ends are red, and the low end surprises
        anybody who reads the whole thing as an overtraining warning.
      */}
      <Text style={styles.note}>
        {vi
          ? 'Cả hai đầu đều đỏ. Tập quá ít cũng bị cảnh báo chứ không riêng tập quá nhiều — mất nền thể lực là thứ khiến bạn dễ chấn thương khi quay lại.'
          : 'Both ends are red. Training too little is flagged as well as too much — losing your base is what makes coming back risky.'}
      </Text>

      <Text style={styles.section}>{vi ? 'Buổi gần nhất' : 'The latest session'}</Text>
      {latestRows.map((r) => (
        <View key={r.term} style={styles.row}>
          <Text style={styles.term}>{r.term}</Text>
          <Text style={styles.body}>{r.body}</Text>
        </View>
      ))}

      <Text style={styles.section}>{vi ? 'Hai dấu hiệu còn lại' : 'Two more markers'}</Text>
      <View style={styles.row}>
        <Text style={styles.term}>PR!</Text>
        <Text style={styles.body}>
          {vi
            ? 'Có một buổi trong 7 ngày qua đạt kỷ lục cá nhân ở ít nhất một bài.'
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
          ? 'Mọi con số ở đây tính từ những gì bạn đã ghi. Buổi tập không ghi thì không tồn tại với thẻ này — đà tập sẽ tụt dù bạn vẫn đang tập.'
          : 'Every number here comes from what you logged. A session you did not record does not exist to this card — the load falls even though you trained.'}
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
  term: { fontSize: 13, fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
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
