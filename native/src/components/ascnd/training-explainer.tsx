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
      term: 'RPE 8',
      body: vi
        ? 'Mức gắng sức của cả buổi, thang 1–10. 8 nghĩa là còn khoảng 2 rep nữa mới hết sức, 10 là không còn gì. Đây là số bạn tự chấm, app không đo được.'
        : 'How hard the session was, 1–10. 8 means about two reps left in the tank, 10 means nothing left. You set this; the app cannot measure it.',
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
          ? 'Thẻ này trả lời ba câu: buổi gần nhất là khi nào và nặng cỡ nào, tuần vừa rồi bạn làm được bao nhiêu, và tuần này có đang tăng tải quá nhanh không.'
          : 'This card answers three questions: when the last session was and how hard, how much you did this week, and whether the week is ramping up too fast.'}
      </Text>

      <Text style={styles.section}>{vi ? 'Buổi gần nhất' : 'The latest session'}</Text>
      {latestRows.map((r) => (
        <View key={r.term} style={styles.row}>
          <Text style={styles.term}>{r.term}</Text>
          <Text style={styles.body}>{r.body}</Text>
        </View>
      ))}

      <Text style={styles.section}>{vi ? '7 ngày qua' : 'The last 7 days'}</Text>
      <Text style={styles.body}>
        {vi
          ? 'Số buổi và tổng khối lượng của đúng 7 ngày vừa qua — theo ngày trên lịch, không phải "mấy buổi gần đây". Hai con số này chính là tử số của tỉ lệ bên dưới, nên khi tỉ lệ tụt, nguyên nhân nằm ngay đây.'
          : 'Sessions and total volume over exactly the last seven calendar days — not "the last few sessions". These two numbers are the numerator of the ratio below, so when the ratio falls, the reason is right here.'}
      </Text>

      <Text style={styles.section}>{vi ? 'Đà tập' : 'Training load'}</Text>
      <Text style={styles.body}>
        {vi
          ? 'Khối lượng trung bình mỗi ngày trong 7 ngày qua, chia cho trung bình mỗi ngày trong 28 ngày qua. Nói gọn: tuần này bạn tập nặng hơn hay nhẹ hơn thói quen của chính mình — so với bạn, không so với ai khác.'
          : 'Your average daily volume over the last 7 days divided by your average over the last 28. Put plainly: is this week heavier or lighter than your own habit — yours, not anybody else’s.'}
      </Text>
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
