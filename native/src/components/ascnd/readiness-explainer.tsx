import { StyleSheet, Text, View } from 'react-native';

import { FormSheet } from '@/components/ascnd/form-sheet';
import { colors, radius, spacing } from '@/constants/ascnd';
import { ACWR_TINT } from '@/components/ascnd/acwr-tint';
import { ACWR_BANDS, type AcwrZoneKey } from '@/lib/training-card';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';

/** Tên ngắn của từng băng ACWR. Cặp với `ACWR_BANDS`, nên năm băng có đủ năm
 *  tên — bản gõ tay trước đây thiếu hẳn `low`. */
const ZONE_WHAT: Record<AcwrZoneKey, { vi: string; en: string }> = {
  detraining: { vi: 'tập quá thưa', en: 'undertrained' },
  low: { vi: 'nhẹ hơn thường lệ', en: 'lighter than usual' },
  optimal: { vi: 'vùng an toàn', en: 'safe band' },
  elevated: { vi: 'tăng hơi nhanh', en: 'ramping fast' },
  spike: { vi: 'nguy cơ quá tải', en: 'overreaching risk' },
};

/**
 * What the readiness card is actually saying.
 *
 * ── why a card like this needs one ──
 *
 * It shows a number out of a hundred, a colour, and up to five tiles captioned
 * HRV, RHR, SLEEP, LOAD and ACWR — one per component the score actually
 * measured. Every one of those is a term of art. Somebody who does
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
 * this changes with it — `tools/readiness-confidence.mjs` reads every figure
 * back out of this file and fails when it disagrees with the engine.
 *
 * That sentence used to name `tools/readiness-doc.mjs`, which has never
 * existed. Nothing checked any of these numbers; the claim that something did
 * was the only thing keeping anyone from noticing. It is the exact shape this
 * repository has been caught by twice — a comment describing a test that is not
 * there — and it took an audit of a different bug to find it.
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
        ? 'Đêm qua so với mục tiêu của bạn, cộng thêm phần nợ tích lại trong 7 ngày. Ngủ dưới 4 tiếng thì điểm tổng bị chặn ở 40 dù mọi thứ khác đều tốt — đó là một mức trần cứng, không phải trừ điểm.\n\nChỉ THỜI LƯỢNG được chấm. Mức chất lượng bạn tự chọn (mặt cười) không cộng hay trừ một điểm nào — nó dùng để đối chiếu cảm giác của bạn với số giờ đo được, và kết quả đối chiếu đó hiện thành một dòng nhận xét ngay dưới hàng ô.'
        : 'Last night against your own target, plus the debt accumulated over seven days. Under four hours caps the whole score at 40 however good everything else looks — that is a hard ceiling, not a deduction.\n\nOnly DURATION is scored. The quality face you pick adds and subtracts nothing — it is used to compare how you felt against the hours measured, and that comparison appears as a remark under the tiles.',
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
        {/*
          Các băng ĐỌC từ `lib/training-card.ts`, không gõ lại.

          ── hai lỗi của bản gõ tay ──

          Nó liệt kê BỐN băng trong khi `acwrZone` chấm theo NĂM: khoảng
          0.65–0.8 ("nhẹ hơn thường lệ", engine cho 65 điểm) không có mặt, nên
          một người có ACWR 0.72 tra bảng này và không thấy mình ở đâu cả.

          Và nó tô `< 0.65` màu VÀNG trong khi bảng chuẩn — thứ thẻ tập luyện
          vẽ theo — là ĐỎ. Cùng một tỉ số, hai màn hình, hai màu; đúng cái lỗi
          mà chú thích đầu `training-card.ts` ghi lại là đã phải gỡ một lần.

          Thứ tự ở đây là thứ tự của thang đo (thấp → cao), không phải thứ tự
          các nhánh trong engine — đây là một cái bảng để tra, và một cái bảng
          tra không sắp theo thang thì không tra được.
        */}
        <View style={styles.bands}>
          {ACWR_BANDS.map((b) => (
            <View key={b.key} style={styles.band}>
              <View style={[styles.bandDot, { backgroundColor: ACWR_TINT[b.key] }]} />
              <Text style={styles.bandRange}>{b.label}</Text>
              <Text style={styles.bandWhat}>{ZONE_WHAT[b.key][vi ? 'vi' : 'en']}</Text>
            </View>
          ))}
        </View>
      </View>

      {/*
        ── hai mục dưới đây tồn tại vì hai câu hỏi đã bị hỏi thẳng ──

        "Thẻ sẵn sàng có dùng dữ liệu log từ việc ăn uống để tính không?" và
        "tôi chỉ log ăn 100kcal mà đã tính tôi được 80/100 điểm… bấm vào mục xem
        giải thích cách tính cũng không thấy ghi đồ ăn được tính vào".

        Câu thứ hai là chẩn đoán của chính người dùng về câu thứ nhất: sheet này
        liệt kê bốn nguồn và im lặng về mọi thứ khác, mà im lặng thì không phải
        một câu trả lời. Ai đó ghi bữa ăn rồi thấy con số đổi sẽ kết luận điều
        duy nhất còn lại có thể kết luận.

        Đo được trên chính engine: bỏ vào đúng bữa ăn và không gì khác thì
        `computeReadiness` trả `null` — không có điểm nào cả. Con số 80 đến từ
        một buổi tập đã ghi trước đó, và mục thứ hai nói ra vì sao nó luôn là
        đúng 80.
      */}
      <View style={styles.part}>
        <Text style={styles.partTitle}>
          {vi ? 'Những gì KHÔNG tính vào điểm này' : 'What this score does NOT use'}
        </Text>
        <Text style={styles.body}>
          {vi
            ? 'Bữa ăn, calo và macro không tham gia tính điểm sẵn sàng — ghi ăn uống không làm điểm tăng hay giảm một đơn vị nào. Cân nặng, nước uống và số bước cũng vậy. Điểm này chỉ đọc bốn nguồn ở trên.\n\nMột buổi tập nhập từ đồng hồ mà không có set nào (ví dụ một lần chạy bộ) được đếm vào số buổi tập, nhưng không vào tải tập — vì không có set thì không tính ra được khối lượng.'
            : 'Meals, calories and macros play no part in readiness — logging food does not move this number by a single point. Nor do weight, water or step count. This score reads the four sources above and nothing else.\n\nA workout imported from a watch with no sets in it (a run, say) counts toward your session count but not toward training load: with no sets there is no volume to compute.'}
        </Text>
      </View>

      <View style={styles.part}>
        <Text style={styles.partTitle}>
          {vi ? 'Khi mới chỉ có một nguồn' : 'When only one source exists'}
        </Text>
        <Text style={styles.body}>
          {vi
            ? 'Thiếu nguồn nào thì trọng số của nguồn đó được chia lại cho những nguồn còn lại, nên điểm vẫn ra một con số đầy đủ 0–100 dù mới đo được một thứ. Viên chữ dưới vòng tròn nói bạn đang đứng trên mấy chỉ số — hãy đọc nó cùng với con số.\n\nCa hay gặp nhất: buổi tập ĐẦU TIÊN luôn ra đúng 80 điểm, dù nặng hay nhẹ. ACWR so trung bình 7 ngày với trung bình 28 ngày; khi lịch sử mới có một ngày thì hai vế là cùng một con số, tỉ số bằng 1.0, rơi vào vùng an toàn và được 80. Đó là câu "chưa thể vọt lên trên một cái nền chưa tồn tại", không phải câu "cơ thể bạn đã sẵn sàng 80%".'
            : 'When a source is missing its weight is shared out among the ones that remain, so the score still comes out as a full 0–100 even when only one thing was measured. The chip under the ring says how many it rests on — read it together with the number.\n\nThe common case: your FIRST workout always scores exactly 80, heavy or light. ACWR compares your 7-day average against your 28-day average, and with one day of history those are the same number — ratio 1.0, safe band, 80 points. That says "you cannot spike above a baseline that does not exist yet", not "your body is 80% ready".'}
        </Text>
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
