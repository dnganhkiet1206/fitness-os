import { useLocalSearchParams } from 'expo-router';
import { AlertCircle, Check, Dumbbell, Target } from 'lucide-react-native';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { GuideMedia } from '@/components/ascnd/guide-media';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { SheetHeader } from '@/components/ascnd/sheet-header';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { useExerciseGuide } from '@/hooks/use-exercise-guide';
import { useI18n } from '@/hooks/use-app-settings';
import { usePalette } from '@/hooks/use-palette';
import { nav } from '@/lib/nav';

/**
 * CÁCH LÀM bài tập này — mở từ buổi tập, đóng lại là về đúng chỗ cũ.
 *
 * ── vì sao là một MODAL chứ không phải một trang ──
 *
 * Nó được mở GIỮA một hiệp. Buổi tập đang dở: hiệp nào xong, tạ bao nhiêu,
 * đồng hồ nghỉ đang chạy, set nào đang mở. Đặt hàng nói rõ: *"Opening the Guide
 * must NOT reset… the user should return to the workout they were doing."*
 *
 * `presentation: 'modal'` của expo-router dựng một `pageSheet` iOS thật: màn
 * Plan **vẫn mounted** ngay dưới, nên state React của nó không đi đâu cả — và
 * vuốt xuống là về. Không có gì phải lưu, phải khôi phục, hay phải truyền
 * ngược. Cách an toàn nhất để giữ state là không đụng vào nó.
 *
 * Màn Plan còn ghi tiến độ xuống AsyncStorage (`dayProgressKey`), nên ngay cả
 * khi hệ điều hành thu hồi màn phía dưới thì hiệp đã tick vẫn còn. Hai lớp,
 * và lớp thứ nhất là thứ chạy trong mọi trường hợp bình thường.
 *
 * ── nó KHÔNG phải `/exercise-insight` ──
 *
 * Hai màn, hai câu hỏi. Đây trả lời *"làm thế nào"*; kia trả lời *"tôi đang
 * tiến bộ ra sao"*. Insight mở từ hàng "Lần trước" và vẫn nguyên vẹn — xem
 * `exercise-progress.tsx`. Gộp lại sẽ làm cả hai dài ra mà không cái nào sắc
 * hơn, và câu hỏi thứ hai thì không ai hỏi giữa lúc đang thở dốc.
 *
 * ── tham số: DANH TÍNH, không phải nội dung ──
 *
 * Màn này nhận `ex` (khoá chính tắc `exercises.id`) và `name`. Nó KHÔNG nhận
 * state buổi tập, và không được nhận: một bản sao của "hiệp nào đang mở" ở đây
 * là một nguồn sự thật thứ hai sẽ lệch.
 *
 * `name` đi kèm vì hai việc: làm đường lui khi kế hoạch không có id (template
 * cũ, bài thêm tay), và làm tiêu đề hiện ra NGAY trong lúc truy vấn còn chạy —
 * người ta biết mình đã mở đúng bài trước khi mạng trả lời.
 */
export default function ExerciseGuideSheet() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { ex, name } = useLocalSearchParams<{ ex?: string; name?: string }>();
  const title = (name ?? '').trim();

  const { data, isPending, isError, isRefetching, refetch } = useExerciseGuide(ex, title);

  /*
    Màn này KHÔNG biết gì về cơ sở dữ liệu.

    `g.equipment` và `g.muscleGroup` tới đây ĐÃ LÀ NHÃN của ngôn ngữ đang bật;
    `g.formCues` đã được chọn xong theo luật lùi ngôn ngữ; `g.hasContent` đã
    trả lời "có gì để dạy không". Toàn bộ những câu hỏi ấy được trả lời một
    lần trong `use-exercise-guide.ts` — xem HỢP ĐỒNG DỮ LIỆU ở đầu tệp ấy.
  */
  const g = data ?? null;
  const cues = g?.formCues ?? [];
  const mistakes = g?.commonMistakes ?? [];
  /* "Rỗng" nghĩa là không có gì để DẠY. Một dòng thư viện khớp được mà mọi cột
     hướng dẫn đều trống vẫn là rỗng — người đọc không quan tâm nó khớp hay
     không, họ quan tâm có gì để đọc không. */
  /*
    ── "chưa có gì" KHÁC "không đọc được", và bản đầu của màn này lẫn hai thứ ──

    `tools/empty-vs-failed.mjs` bắt đúng lỗi ấy: truy vấn hỏng thì `data` là
    `undefined`, nên nhánh rỗng chạy và màn hình khẳng định *"Bài này chưa có
    hướng dẫn"* — một câu SAI về dữ liệu của chính người dùng. Hướng dẫn có thể
    đang nằm đó đầy đủ; thứ hỏng là đường mạng.

    Hai trạng thái, hai câu, và câu thứ hai có nút thử lại. `isError` phải được
    hỏi TRƯỚC: rỗng chỉ có nghĩa khi việc đọc đã thành công.
  */
  /*
    ── "KHÔNG CÓ HƯỚNG DẪN" là một trạng thái riêng, và nó từng không bao giờ
       hiện ra ──

    Bản trước còn đòi thêm `!hasFacts`. Nhưng form tạo bài tập BẮT BUỘC chọn
    nhóm cơ, nên mọi bài người dùng tự thêm đều có `hasFacts` — và điều kiện
    ấy không bao giờ đúng cho đúng nhóm người cần nó nhất. Đo được: mở hướng
    dẫn của một bài tự thêm thì màn hình hiện "Dụng cụ · Kettlebell", "Nhóm cơ
    chính · Forearms", rồi im lặng. Không câu nào nói rằng bài này chưa có
    hướng dẫn; chỉ có một khoảng trắng mà người đọc phải tự diễn giải.

    Siêu dữ liệu KHÔNG phải hướng dẫn. Media thì có — một đoạn minh hoạ dạy
    được động tác kể cả khi không có chữ nào — nên nó vẫn tắt trạng thái này.
  */
  const noContent = !isPending && !isError && !g?.hasContent && !g?.mediaUrl;

  return (
    <View style={styles.root}>
      <SheetHeader title={g?.name || title || i18n.nEgTitle} onClose={nav.back} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/*
          Khung hình: to khi CÓ media thật, gọn lại thành một khối thông tin
          nhỏ khi chưa có. Cả phép chọn video/ảnh, cả hai trạng thái hỏng, cả
          việc tôn trọng "giảm chuyển động" đều nằm trong `GuideMedia` — màn
          này chỉ đưa cho nó một URL và một cái tên.

          ── và nó chỉ được hỏi KHI ĐÃ BIẾT CÂU TRẢ LỜI ──

          `g?.mediaUrl ?? null` có ba nguồn gốc khác hẳn nhau:

              chưa biết  ·  đọc hỏng  ·  biết chắc là không có

          `GuideMedia` chỉ có hai câu để nói, và câu mặc định của nó là *"chưa
          có hình minh hoạ"*. Đưa cả ba nguồn ấy vào một tham số thì hai nguồn
          đầu ra một câu SAI về dữ liệu của người dùng — đo được, không phải
          suy đoán: giữ phản hồi `exercises` lại 3 giây thì màn hình khẳng
          định "No demonstration yet" trong suốt lúc còn đang tải, rồi video
          nhảy vào; và khi truy vấn HỎNG thì nó nói "No demonstration yet"
          ngay bên trên "Could not load your data" — hai câu ngược nhau trong
          một màn.

          Đây đúng là lớp lỗi `tools/empty-vs-failed.mjs` đã xử cho hai danh
          sách bên dưới; ô media chỉ là chỗ nó chưa được xử. Cách sửa không
          phải thêm một câu thứ ba, mà là ĐỪNG HỎI khi chưa có câu trả lời:
          lúc đang tải đã có vòng quay, lúc hỏng đã có thẻ "không đọc được".
        */}
        {!isPending && !isError ? (
          <GuideMedia
            url={g?.mediaUrl ?? null}
            name={g?.name || title}
            hasCues={cues.length > 0}
            i18n={i18n}
          />
        ) : null}

        {/* Hai sự thật một dòng, ngay dưới hình — chúng trả lời "cần gì" và
            "vào cơ nào" trong một cái liếc, nên không xứng một thẻ riêng. */}
        {g?.hasMetadata ? (
          <View style={styles.facts}>
            {g.equipment ? (
              <View style={styles.fact}>
                <Icon icon={Dumbbell} size={14} color={c.mutedForeground} />
                <Text style={styles.factLabel}>{i18n.nEgEquipment}</Text>
                <Text style={styles.factValue}>{g.equipment}</Text>
              </View>
            ) : null}
            {g.muscleGroup ? (
              <View style={styles.fact}>
                <Icon icon={Target} size={14} color={c.mutedForeground} />
                <Text style={styles.factLabel}>{i18n.nEgMuscles}</Text>
                <Text style={styles.factValue}>{g.muscleGroup}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {isPending ? (
          <View style={styles.busy}>
            <ActivityIndicator color={c.mutedForeground} />
          </View>
        ) : null}

        {/*
          ── ĐIỂM KỸ THUẬT và LỖI THƯỜNG GẶP ──

          Hai danh sách, một hình dạng, hai dấu. Dấu mang NGHĨA chứ không mang
          trang trí: tick xanh là "làm thế này", chấm than đỏ là "đừng thế này".

          Và nghĩa ấy KHÔNG chỉ nằm ở màu — mỗi mục nằm dưới một tiêu đề nói
          thẳng nó là gì, và hai glyph khác hình nhau. Người không phân biệt
          được đỏ/xanh vẫn đọc đúng, đó là điều kiện của WCAG 1.4.1.
        */}
        {cues.length ? (
          <Section title={i18n.nEgCues} styles={styles}>
            {cues.map((t) => (
              <View key={t} style={styles.item}>
                <Icon icon={Check} size={15} color={c.readinessGreen} strokeWidth={2.5} />
                <Text style={styles.itemText}>{t}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {mistakes.length ? (
          <Section title={i18n.nEgMistakes} styles={styles}>
            {mistakes.map((t) => (
              <View key={t} style={styles.item}>
                <Icon icon={AlertCircle} size={15} color={c.readinessRed} strokeWidth={2.5} />
                <Text style={styles.itemText}>{t}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {isError ? (
          <LoadFailed i18n={i18n} onRetry={() => void refetch()} busy={isRefetching} />
        ) : null}

        {noContent ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{i18n.nEgEmpty}</Text>
            <Text style={styles.emptyHint}>{i18n.nEgEmptyHint}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** Một mục: tiêu đề nhỏ, rồi các dòng. Không hộp, không viền — xem `section`. */
function Section({
  title,
  styles,
  children,
}: {
  title: string;
  styles: ReturnType<typeof stylesFor>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.list}>{children}</View>
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  root: { flex: 1, backgroundColor: c.card },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.lg },


  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factLabel: { ...type.caption, color: c.mutedForeground },
  factValue: { ...type.footnote, color: c.foreground, fontWeight: '600' },

  busy: { paddingVertical: spacing.lg, alignItems: 'center' },

  /*
    Mục KHÔNG có hộp.

    Cả hai danh sách đã nằm trong một sheet, và một thẻ trong một sheet là hộp
    lồng hộp — đúng thứ vừa bị gỡ khỏi hàng "Lần trước" ở màn Plan. Thứ chia
    mục ở đây là một tiêu đề nhỏ và khoảng trắng, không phải một đường viền.
  */
  section: { gap: spacing.sm },
  sectionTitle: { ...type.headline, color: c.foreground },
  list: { gap: spacing.sm },
  /* `flex-start` chứ không `center`: một dòng hai dòng chữ thì dấu phải nằm
     cạnh dòng ĐẦU, không trôi xuống giữa khối. */
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  itemText: { ...type.body, color: c.foreground, flex: 1, minWidth: 0, lineHeight: 21 },

  empty: { alignItems: 'center', gap: 4, paddingVertical: spacing.lg },
  emptyText: { ...type.body, color: c.foreground },
  emptyHint: { ...type.footnote, color: c.mutedForeground, textAlign: 'center' },
}));
