/**
 * Fixture matrix — issue #370 (C-31).
 *
 * Ma trận fixture gọn, DETERMINISTIC cho 5 màn Today / Workout / Rest / Finish /
 * Summary, phủ en/vi/es. Mỗi entry là một trong hai loại:
 *
 *   kind: 'copy' — một chuỗi user-facing: tham chiếu KHOÁ từ điển thật
 *           (src/lib/native-strings.ts), KHÔNG bịa copy mới. Cổng
 *           `fixture-matrix.mjs` render chuỗi bằng đúng luật fillCopy của app
 *           (src/lib/copy-fill.ts) rồi assert.
 *   kind: 'data' — giá trị đầu vào (tên dài, số lớn, tạ thập phân): literal cố
 *           định, không random / Date() / UUID. Tính deterministic được cổng
 *           kiểm tra bằng quét mã nguồn của chính tệp này.
 *
 * Các assert trên từng entry:
 *   - key tồn tại ở cả 3 locale (thiếu localization → đỏ trước merge).
 *   - pluralVar: template en PHẢI có bộ chọn {n:một|nhiều}; render n=1 và n=5
 *     phải khác nhau đúng dạng (pluralization sai → đỏ).
 *   - a11y: template PHẢI chứa placeholder động {…} (label VoiceOver tĩnh cho
 *     control có nội dung động → đỏ).
 *   - minLen: chuỗi render ở cả 3 locale PHẢI dài ≥ ngưỡng (fixture "dài" mà
 *     ngắn thì vô nghĩa — không đo được clipping/truncation → đỏ).
 *   - render xong không còn `{…}` sót lại (biến thiếu → đỏ, cùng luật với
 *     BAD_TEXT của live.mjs).
 *
 * Real-device VoiceOver: NOT TESTED (ghi rõ trong docs/FIXTURE-MATRIX.md).
 */

export const SCREENS = ['Today', 'Workout', 'Rest', 'Finish', 'Summary'];
export const LOCALES = ['en', 'vi', 'es'];

export const FIXTURES = [
  /* ── Today ─────────────────────────────────────────────── */
  {
    id: 'today-long-template-name',
    screen: 'Today',
    kind: 'data',
    note: 'Tên buổi tập dài: phải wrap/xuống dòng, không được cắt mất chữ ở mép thẻ.',
    value: {
      en: 'Very Long Workout Template Name That Wraps Past The Card Edge',
      vi: 'Tên buổi tập rất dài sẽ xuống dòng và không được cắt mất ở mép thẻ',
      es: 'Nombre de plantilla muy largo que se ajusta sin cortarse en el borde',
    },
    minLen: 40,
  },
  {
    id: 'today-day-status',
    screen: 'Today',
    kind: 'copy',
    key: 'nDayDone',
    varsList: [{}],
    note: 'Trạng thái ngày trên strip tuần — chip nhỏ, dễ bị cắt ở cỡ chữ lớn.',
  },
  {
    id: 'today-sessions-plural',
    screen: 'Today',
    kind: 'copy',
    key: 'nSessionCount',
    varsList: [{ n: 1 }, { n: 5 }],
    pluralVar: 'n',
    note: '"1 session logged" vs "5 sessions logged" — số ít/số nhiều.',
  },

  /* ── Workout ───────────────────────────────────────────── */
  {
    id: 'workout-reps-plural',
    screen: 'Workout',
    kind: 'copy',
    key: 'nRepsN',
    varsList: [{ n: 1 }, { n: 8 }],
    pluralVar: 'n',
    note: 'Luật 5 của plural-copy: "{n} {n:rep|reps}" — cấm "× 1 reps".',
  },
  {
    id: 'workout-set-row-values',
    screen: 'Workout',
    kind: 'data',
    note: 'Set row: tạ lớn, tạ thập phân, reps số nhiều; tên bài dài.',
    value: {
      exercise: {
        en: 'Barbell Back Squat With An Extremely Long Exercise Name',
        vi: 'Gánh tạ đòn sau lưng với tên bài tập cực kỳ dài',
        es: 'Sentadilla con barra con un nombre de ejercicio larguísimo',
      },
      heavy: { weight: 999.5, reps: 12 },
      decimal: { weight: 62.5, reps: 1 },
    },
    minLen: 30, // áp cho tên bài ở cả 3 locale
  },
  {
    id: 'workout-set-a11y',
    screen: 'Workout',
    kind: 'a11y-pattern',
    note:
      'Label VoiceOver của set row được ghép trong code ' +
      '(`${s.exerciseName} ${setNumbers[idx]} ${wl}` — log-workout.tsx:779). ' +
      'Pattern PHẢI mang nội dung động; các khoá dùng trong câu ghép phải đủ 3 locale.',
    pattern: '{exercise}, {weight} kg × {reps} reps',
    keys: ['nExercise', 'nReps'],
    example: { exercise: 'Squat', weight: 62.5, reps: 12 },
  },

  /* ── Rest ──────────────────────────────────────────────── */
  {
    id: 'rest-set-of',
    screen: 'Rest',
    kind: 'copy',
    key: 'nRestSetOf',
    varsList: [{ n: 2, t: 4 }],
    a11y: true,
    note: '"Set 2/4" — label đọc trên rest timer, mang số set động.',
  },
  {
    id: 'rest-next-label',
    screen: 'Rest',
    kind: 'copy',
    key: 'nRestNext',
    varsList: [{}],
    note: 'Nhãn tĩnh "Up next" — chỉ kiểm tra đủ 3 locale.',
  },

  /* ── Finish ────────────────────────────────────────────── */
  {
    id: 'finish-pr-title',
    screen: 'Finish',
    kind: 'copy',
    key: 'nPrTitle',
    varsList: [{}],
    note: 'Tiêu đề kỷ lục mới trên màn Finish.',
  },
  {
    id: 'finish-pr-plural',
    screen: 'Finish',
    kind: 'copy',
    key: 'nPrTitleMany',
    varsList: [{ n: 2 }, { n: 3 }],
    // KHÔNG pluralVar: khoá này nằm trong EXEMPT của plural-copy.mjs —
    // chỉ render khi records.length > 1, số ít là câu khác hẳn (nPrTitle).
    note: 'Exempt khỏi bộ chọn theo plural-copy.mjs (chỉ dùng khi n > 1).',
  },

  /* ── Summary ───────────────────────────────────────────── */
  {
    id: 'summary-volume-label',
    screen: 'Summary',
    kind: 'copy',
    key: 'nVolume',
    varsList: [{}],
    note: 'Nhãn "Khối lượng" trên màn Summary.',
  },
  {
    id: 'summary-volume-values',
    screen: 'Summary',
    kind: 'data',
    note: 'Số lớn (1,240 kg) và thập phân (62.5 kg) cạnh nhãn Volume.',
    value: { large: 1240, decimal: 62.5 },
  },

  /* ── Error / offline (dùng chung các màn) ───────────────── */
  {
    id: 'error-long-message',
    screen: 'Workout',
    kind: 'copy',
    key: 'nCxNothingWrittenSession',
    varsList: [{}],
    minLen: 60,
    note: 'Message lỗi dài — dễ tràn/clip trong banner, cả 3 locale đều ≥ 60 ký tự.',
  },
  {
    id: 'offline-banner',
    screen: 'Today',
    kind: 'copy',
    key: 'nOffline',
    varsList: [{}],
    minLen: 20,
    note: 'Banner offline — phải đủ 3 locale, không rớt chữ.',
  },
];
