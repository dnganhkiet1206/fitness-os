import { StyleSheet, Text, View } from 'react-native';

import { FormSheet } from '@/components/ascnd/form-sheet';
import { colors, radius, spacing } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';

/**
 * What the readiness card is actually saying.
 *
 * ── why a card like this needs one ──
 *
 * It shows a number out of a hundred, a colour, and four tiles captioned RHR,
 * SLEEP, LOAD and ACWR. Every one of those is a term of art. Somebody who does
 * not already know what an acute-to-chronic workload ratio is cannot learn it
 * from seeing `1.14` in a small box, and the card's whole job is to change what
 * they do today — advice you cannot interrogate is advice you either obey
 * blindly or ignore, and both of those are worse than understanding it.
 *
 * ── the numbers here are read out of the engine, not written to match it ──
 *
 * Every weight and threshold below is what `lib/readiness-engine.ts` actually
 * computes: the 30/20/30/20 split and its no-HRV fallback, the 0.8–1.3 safe
 * band, the four-hour sleep cap. A help sheet that drifts from the code is
 * worse than no help sheet, because it is believed. If the engine changes,
 * this changes with it — `tools/readiness-doc.mjs` fails when they disagree.
 */
export function ReadinessExplainer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';

  const parts = [
    {
      tag: 'HRV',
      title: vi ? 'Biến thiên nhịp tim' : 'Heart-rate variability',
      weight: '30%',
      body: vi
        ? 'Khoảng cách giữa các nhịp tim khi nghỉ. Dao động nhiều thường là dấu hiệu hệ thần kinh đã hồi phục; dao động ít là dấu hiệu còn căng. Cần Apple Health hoặc nhập tay — không có thì trọng số được chia lại cho ba phần còn lại.'
        : 'The spacing between resting heartbeats. More variation usually means a recovered nervous system; less means you are still under strain. Needs Apple Health or a manual entry — without it the weight is redistributed across the other three.',
    },
    {
      tag: 'RHR',
      title: vi ? 'Nhịp tim nghỉ' : 'Resting heart rate',
      weight: vi ? '20% (25% nếu không có HRV)' : '20% (25% without HRV)',
      body: vi
        ? 'So với chính bạn, không so với người khác: app lấy nền 28 ngày gần nhất và tính hôm nay lệch bao nhiêu. Cao hơn nền thường đi kèm mệt, thiếu ngủ hoặc sắp ốm.'
        : 'Compared against you, not against anyone else: the app takes your own 28-day baseline and measures how far today sits from it. Above the baseline usually travels with fatigue, short sleep, or an illness starting.',
    },
    {
      tag: 'SLEEP',
      title: vi ? 'Giấc ngủ' : 'Sleep',
      weight: vi ? '30% (45% nếu không có HRV)' : '30% (45% without HRV)',
      body: vi
        ? 'Đêm qua so với mục tiêu của bạn, cộng thêm phần nợ tích lại trong 7 ngày. Ngủ dưới 4 tiếng thì điểm tổng bị chặn ở 40 dù mọi thứ khác đều tốt — đó là một mức trần cứng, không phải trừ điểm.'
        : 'Last night against your own target, plus the debt accumulated over seven days. Under four hours caps the whole score at 40 however good everything else looks — that is a hard ceiling, not a deduction.',
    },
    {
      tag: 'LOAD',
      title: vi ? 'Tải tập luyện' : 'Training load',
      weight: vi ? '20% (30% nếu không có HRV)' : '20% (30% without HRV)',
      body: vi
        ? 'Tính từ ACWR bên dưới. Trong vùng an toàn được 80 điểm; tập quá ít (dưới 0.65) cũng bị trừ chứ không phải chỉ tập quá nhiều mới bị.'
        : 'Derived from the ACWR below. Inside the safe band it scores 80; training too *little* (under 0.65) costs points too, not only training too much.',
    },
  ];

  return (
    <FormSheet visible={visible} title={i18n.dcReadinessTitle} onClose={onClose}>
      <Text style={styles.lede}>
        {vi
          ? 'Một số từ 0 đến 100 trả lời đúng một câu hỏi: hôm nay cơ thể bạn chịu được bao nhiêu. Nó ghép bốn nguồn lại, mỗi nguồn một trọng số.'
          : 'A number from 0 to 100 answering one question: how much your body can take today. It combines four sources, each with its own weight.'}
      </Text>

      {parts.map((p) => (
        <View key={p.tag} style={styles.part}>
          <View style={styles.partHead}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{p.tag}</Text>
            </View>
            <Text style={styles.partTitle}>{p.title}</Text>
            <Text style={styles.weight}>{p.weight}</Text>
          </View>
          <Text style={styles.body}>{p.body}</Text>
        </View>
      ))}

      <View style={styles.part}>
        <View style={styles.partHead}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>ACWR</Text>
          </View>
          <Text style={styles.partTitle}>
            {vi ? 'Tải cấp tính / mãn tính' : 'Acute-to-chronic ratio'}
          </Text>
        </View>
        <Text style={styles.body}>
          {vi
            ? 'Khối lượng trung bình mỗi ngày trong 7 ngày qua, chia cho trung bình mỗi ngày trong 28 ngày qua. Nói cách khác: tuần này bạn tập nặng hơn hay nhẹ hơn thói quen của chính mình.'
            : 'Your average daily volume over the last 7 days, divided by your average daily volume over the last 28. Put plainly: is this week heavier or lighter than your own habit?'}
        </Text>
        {/* The bands the engine actually scores against, in its own order. */}
        <View style={styles.bands}>
          {[
            { range: '0.8 – 1.3', tint: colors.readinessGreen, what: vi ? 'vùng an toàn' : 'safe band' },
            { range: '1.3 – 1.6', tint: colors.readinessYellow, what: vi ? 'tăng hơi nhanh' : 'ramping fast' },
            { range: '> 1.6', tint: colors.readinessRed, what: vi ? 'nguy cơ quá tải' : 'overreaching risk' },
            { range: '< 0.65', tint: colors.readinessYellow, what: vi ? 'tập quá thưa' : 'undertrained' },
          ].map((b) => (
            <View key={b.range} style={styles.band}>
              <View style={[styles.bandDot, { backgroundColor: b.tint }]} />
              <Text style={styles.bandRange}>{b.range}</Text>
              <Text style={styles.bandWhat}>{b.what}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.part}>
        <Text style={styles.partTitle}>{vi ? 'Ba vùng màu' : 'The three zones'}</Text>
        <View style={styles.bands}>
          {[
            { range: '75 – 100', tint: colors.readinessGreen, what: i18n.dcReadinessTrain },
            { range: '50 – 74', tint: colors.readinessYellow, what: i18n.dcReadinessModerate },
            { range: '0 – 49', tint: colors.readinessRed, what: i18n.dcReadinessRecover },
          ].map((b) => (
            <View key={b.range} style={styles.band}>
              <View style={[styles.bandDot, { backgroundColor: b.tint }]} />
              <Text style={styles.bandRange}>{b.range}</Text>
              <Text style={styles.bandWhat}>{b.what}</Text>
            </View>
          ))}
        </View>
      </View>

      {/*
        Said plainly and last. The card looks clinical — a ring, a score, four
        acronyms — and looking clinical is exactly what makes people treat it as
        a diagnosis. It is arithmetic over what you logged.
      */}
      <Text style={styles.caveat}>
        {vi
          ? 'Đây là ước lượng từ dữ liệu bạn đã ghi, không phải chẩn đoán y tế. Cảm giác của bạn luôn được ưu tiên hơn con số này.'
          : 'This is an estimate from what you logged, not a medical assessment. How you actually feel outranks it.'}
      </Text>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  lede: { fontSize: 14, lineHeight: 20, color: colors.foreground },
  part: { gap: 6 },
  partHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm - 4,
    backgroundColor: colors.secondary,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.mutedForeground,
    fontVariant: ['tabular-nums'],
  },
  partTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.foreground },
  weight: { fontSize: 11, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  body: { fontSize: 13, lineHeight: 19, color: colors.mutedForeground },
  bands: { gap: 6, marginTop: 2 },
  band: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bandDot: { width: 7, height: 7, borderRadius: 3.5 },
  bandRange: {
    width: 78,
    fontSize: 12,
    fontFamily: 'Menlo',
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
  bandWhat: { flex: 1, fontSize: 12, color: colors.mutedForeground },
  caveat: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.mutedForeground,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
  },
});
