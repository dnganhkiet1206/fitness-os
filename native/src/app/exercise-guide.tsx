import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Check, X } from 'lucide-react-native';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GuideMedia } from '@/components/ascnd/guide-media';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { useExerciseGuide } from '@/hooks/use-exercise-guide';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
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
 *
 * ════════════════════════════════════════════════════════════════════════
 *
 * ── BỐ CỤC: hình dẫn, chữ theo sau ──
 *
 * Ảnh tham chiếu của chủ dự án dựng màn này theo một trật tự rất rõ:
 *
 *     HÌNH (tràn lề, cao, chiếm phần trên)
 *       ↓
 *     TÊN BÀI TẬP (to, căn trái, nằm TRONG phần chữ)
 *       ↓
 *     một dòng siêu dữ liệu mờ:  Biceps · Dumbbell
 *       ↓
 *     nội dung học
 *
 * Bản trước đi ngược: một thanh đầu có tiêu đề 18 điểm căn GIỮA cạnh một nút
 * đóng, rồi hình mới xuất hiện bên dưới như một cái thẻ trong lề 16. Hai thứ
 * đó cùng nói "đây là một trang", trong khi thứ cần nói là "đây là một tờ giấy
 * vừa được kéo lên che buổi tập".
 *
 * Nên: hình tràn lề, mặt giấy bo góc CHỒNG LÊN 28% chiều cao hình, và nút đóng
 * nổi trên hình chứ không tranh chỗ với tên bài. Tên bài xuống dưới, to lên
 * một bậc (28/700), và siêu dữ liệu gộp thành MỘT dòng. Phần chồng ấy là thứ
 * mặt kính nhìn xuyên qua — xem `overlap` và `glassTint`.
 *
 * ── không có hình thì KHÔNG dựng khung ──
 *
 * `video_url` rỗng ở cả mười dòng hạt giống, nên "chưa có hình" là trường hợp
 * thường. Chủ dự án đã chốt ở lượt kiểm media: *"media absent → compact
 * fallback, do NOT reserve the full 16:10 media area."* Quyết định ấy vẫn còn
 * hiệu lực — nay chỉ là khung đã cao hơn, nên giữ chỗ cho nó còn tốn hơn.
 *
 * Nên có URL thì có hình dẫn; không có URL thì mặt giấy bắt đầu ngay từ đỉnh
 * và câu "chưa có hình minh hoạ" xuống dưới siêu dữ liệu, gọn như cũ.
 *
 * Còn khi CÓ url mà tải hỏng: khung hình dẫn ĐỨNG NGUYÊN và câu báo hỏng nằm
 * bên trong nó. Thu khung lại lúc ấy là một cú nhảy bố cục giữa lúc đang đọc —
 * đúng thứ đặt hàng cấm.
 *
 * ── KHÔNG có ba thứ mà ảnh tham chiếu có ──
 *
 * **Không tab** (`Tổng quan · Cơ tác động · Thiết bị · Liên quan`). Ba trong
 * bốn tab ấy không có một dòng dữ liệu nào ở sau, và đặt hàng nói thẳng: *"NO
 * EMPTY TABS. NO PLACEHOLDER CONTENT. NO FAKE PRODUCT FEATURES."*
 *
 * **Không nút "Bắt đầu bài tập"** ở đáy. Màn này được mở TỪ TRONG một buổi tập
 * đang chạy — người ta đang làm chính bài ấy. Một nút mời họ bắt đầu thứ họ
 * đang làm thì hoặc không làm gì, hoặc làm một việc thứ hai mà buổi tập không
 * có khái niệm. Lối ra khỏi màn này là đóng nó lại, và đó là điều duy nhất cần.
 *
 * **Không nút play, không `···`, không dấu trang.** Đoạn minh hoạ tự chạy, tắt
 * tiếng, không điều khiển — đã đo ở lượt kiểm media; một nút play vẽ thêm là
 * một cái nút nói ngược lại hành vi thật. Hai cái kia không có hành động nào ở
 * sau.
 */
export default function ExerciseGuideSheet() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const insets = useSafeAreaInsets();
  /* Bản tối dựng mặt giấy bằng KÍNH MỜ trên hình, nên nó cần biết theme đang
     bật — xem `surfaceGlass`. */
  const { themeName } = useAppSettings();
  const dark = themeName === 'dark';
  /* Hai cột chỉ đúng khi chúng còn đọc được — xem `styles.pair`. */
  const { width, fontScale } = useWindowDimensions();
  /* 3:4 — xem `heroFrame` trong `guide-media.tsx`. Chiều cao phải tính ở đây
     nữa vì chỗ trống trong dòng cuộn phải cao đúng bằng lớp hình. */
  const heroH = Math.round((width * 4) / 3);
  /*
    ── bao nhiêu HÌNH nằm sau mặt kính ──

    Bản trước chồng đúng `radius.xl` = 24 điểm, tức chỉ có 24 điểm hình nằm sau
    mặt giấy. Ở mức ấy "kính" không có gì để làm mờ, và bản tối đọc ra gần như
    đục hẳn — không phải vì độ mờ sai, mà vì KHÔNG CÓ GÌ Ở SAU.

    Bốn ảnh tham chiếu đặt mép trên của mặt giấy ở khoảng 43% chiều cao màn
    (đo trên ảnh: ~815/1900 và ~800/1900). Trên máy 402×874 đó là ~375 điểm, và
    0,72 × 536 = 386 — cùng một chỗ. Nên 28% chiều cao hình, tức 150 điểm, nằm
    sau kính.
  */
  const overlap = Math.round(heroH * 0.28);
  const { ex, name } = useLocalSearchParams<{ ex?: string; name?: string }>();
  const title = (name ?? '').trim();

  const { data, isPending, isError, isRefetching, refetch } = useExerciseGuide(ex, title);

  /*
    Màn này KHÔNG biết gì về cơ sở dữ liệu.

    `g.equipment` và `g.muscleGroup` tới đây ĐÃ LÀ NHÃN của ngôn ngữ đang bật;
    `g.instructions`/`g.formCues` đã được chọn xong theo luật lùi ngôn ngữ;
    `g.hasContent` đã trả lời "có gì để dạy không". Toàn bộ những câu hỏi ấy
    được trả lời một lần trong `use-exercise-guide.ts` — xem HỢP ĐỒNG DỮ LIỆU
    ở đầu tệp ấy.
  */
  const g = data ?? null;
  const steps = g?.instructions ?? [];
  const cues = g?.formCues ?? [];
  const mistakes = g?.commonMistakes ?? [];

  /* Media chỉ được hỏi khi việc đọc đã xong: `null` lúc đang tải hay lúc hỏng
     là "chưa biết", không phải "không có" — xem `guide-media.tsx`. */
  const showMedia = !isPending && !isError;
  const heroUrl = g?.mediaUrl ?? null;
  /*
    ── DEMO_HERO — TẠM THỜI, và đây là một trong hai chỗ phải gỡ ──

    Chủ dự án đưa một ảnh demo (`assets/images/exercise-demo.webp`) để đánh giá
    bố cục, vì `video_url` còn rỗng ở cả mười dòng hạt giống. Nên trong lúc ảnh
    ấy còn nằm đó, MỌI bài đều có hình dẫn: `GuideMedia` lùi về ảnh demo khi
    không có url thật.

    Khi có media thật, gỡ hai chỗ mang dấu `DEMO_HERO`:
      · dòng dưới đây → `const hero = showMedia && !!heroUrl;`
      · nhánh `DEMO_HERO` trong `guide-media.tsx`
    Không chỗ nào khác phải đổi: cùng một khung, cùng một component.
  */
  const hero = showMedia;

  /*
    ── MỘT dòng siêu dữ liệu, không bốn khối ──

    Bản trước vẽ `[icon] Dụng cụ **Tạ đơn**  [icon] Nhóm cơ chính **Ngực**` —
    hai nhãn, hai giá trị, hai glyph, bốn thứ để mắt đi qua trước khi tới nội
    dung. Ảnh tham chiếu gộp hết thành `Biceps · Dumbbell`: nhóm cơ trước, dụng
    cụ sau, chữ mờ, một dòng.

    Nhãn không mất đi — chúng chuyển sang nhãn TRỢ NĂNG, nơi chúng vẫn cần
    thiết: "Ngực · Tạ đơn" đọc lên không nói rõ cái nào là cái gì, còn mắt thì
    không cần được nói.
  */
  const meta = [g?.muscleGroup, g?.equipment].filter(Boolean).join('  ·  ');
  const metaA11y = [
    g?.muscleGroup ? `${i18n.nEgMuscles}: ${g.muscleGroup}` : null,
    g?.equipment ? `${i18n.nEgEquipment}: ${g.equipment}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  /*
    ── "KHÔNG CÓ HƯỚNG DẪN" là một trạng thái riêng ──

    Siêu dữ liệu KHÔNG phải hướng dẫn: form tạo bài tập bắt buộc chọn nhóm cơ,
    nên mọi bài người dùng tự thêm đều có nhóm cơ, và gộp nó vào điều kiện rỗng
    làm trạng thái này không bao giờ hiện ra cho đúng nhóm cần nó nhất. Media
    thì có tính — một đoạn minh hoạ dạy được động tác kể cả khi không có chữ.
  */
  const noContent = showMedia && !g?.hasContent && !heroUrl;

  /*
    Hai cột như ảnh tham chiếu, nhưng KHÔNG ép.

    Mỗi cột rộng chừng (402 − 40 − 20) / 2 ≈ 171 điểm. Ở cỡ chữ hệ thống mặc
    định thì một câu năm chữ vẫn gọn; ở cỡ chữ trợ năng lớn thì cùng câu ấy
    thành bốn dòng gãy vụn, và đặt hàng nói thẳng: *"Do not sacrifice
    readability just to match the screenshot."* Nên hai cột cần CẢ BA: có cả
    hai danh sách, màn đủ rộng, và chữ chưa bị phóng.
  */
  const twoCols = cues.length > 0 && mistakes.length > 0 && width >= 360 && fontScale <= 1.15;

  /*
    Sợi kẻ ngang chỉ tồn tại khi có HAI khối để chia — và cùng điều kiện ấy
    quyết định khoảng trống của khối dưới, nên nó được đặt tên một lần.
  */
  const ruled = steps.length > 0 && (cues.length > 0 || mistakes.length > 0);

  return (
    <View style={styles.root}>
      {/*
        ── HÌNH DẪN nằm SAU mặt giấy, không nằm TRÊN nó ──

        Ảnh tham chiếu bản tối cho thấy hình còn hiện mờ qua phần trên của mặt
        giấy: đó là kính mờ, và kính mờ chỉ có gì để làm mờ khi có thứ nằm phía
        sau. Nếu hình là một khối trong dòng cuộn thì phía sau mặt giấy chỉ có
        nền, và "kính" sẽ mờ một màu phẳng — tức không phải kính.

        Nên hình là một LỚP tuyệt đối ở đỉnh, và dòng cuộn mở đầu bằng một chỗ
        trống cao đúng bằng nó trừ đi phần chồng. Cuộn lên thì mặt giấy trượt
        trên hình, và vùng mờ đổi theo — đúng như ảnh.
      */}
      {hero ? (
        <View style={[styles.heroLayer, { height: heroH }]} pointerEvents="none">
          <GuideMedia
            url={heroUrl}
            name={g?.name || title}
            hasCues={cues.length > 0}
            i18n={i18n}
            hero
          />
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        {hero ? <View style={{ height: heroH - overlap }} /> : null}

        <View style={[styles.surface, hero ? styles.surfaceOverlap : styles.surfaceOpaque]}>
          {/*
            ── MẶT KÍNH: blur TRƯỚC, sắc độ SAU ──

            Bản trước đặt màu mờ vào `backgroundColor` của chính mặt giấy rồi
            thả `BlurView` vào làm con. Thứ tự ấy NGƯỢC: nền của một view được
            tô trước các con của nó, nên `UIVisualEffectView` lấy mẫu một hình
            ĐÃ bị phủ sắc độ — tức độ mờ thật cao hơn con số viết trong style,
            và mọi phép đo dựa trên con số ấy đều là đo trên một thứ khác.

            Nay hai lớp tách hẳn và đúng thứ tự: kính lấy mẫu hình, rồi một lớp
            sắc độ phủ LÊN kính. Con số α vì thế là α thật.

            `expo-blur` còn tự cộng sắc độ vật liệu của nó theo `intensity`.
            Cái đó chỉ làm nền ĐẶC thêm, nên nó luôn đẩy tương phản lên phía an
            toàn — phép đo bên dưới không tính tới nó, và vì vậy vẫn đúng.
          */}
          {hero ? (
            <>
              <BlurView
                intensity={GLASS_BLUR}
                tint={dark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={[StyleSheet.absoluteFill, styles.glassTint]} pointerEvents="none" />
            </>
          ) : null}
          {/* Không nhận chạm: nó là một lời KỂ về cử chỉ, không phải một nút.
              Bắt chạm ở đây sẽ nuốt mất cú vuốt xuống mà nó đang quảng cáo. */}
          <View style={[styles.grabber, hero ? styles.grabberOnGlass : null]} pointerEvents="none" />

          {g?.name || title ? (
            <Text
              style={[styles.title, hero ? null : styles.titleClearsClose]}
              accessibilityRole="header">
              {g?.name || title}
            </Text>
          ) : null}
          {meta ? (
            <Text
              style={[styles.meta, hero ? styles.metaOnGlass : null]}
              accessibilityLabel={metaA11y}>
              {meta}
            </Text>
          ) : null}

          {/* Không có hình thì câu ấy xuống đây, gọn — không dựng một khung
              cao để đựng một câu nói rằng khung ấy trống. */}
          {isPending ? (
            <View style={styles.busy}>
              <ActivityIndicator color={c.mutedForeground} />
            </View>
          ) : null}

          {isError ? (
            <View style={styles.block}>
              <LoadFailed i18n={i18n} onRetry={() => void refetch()} busy={isRefetching} />
            </View>
          ) : null}

          {/*
            ── CÁCH THỰC HIỆN: các bước có SỐ, vì thứ tự là thông tin ──

            Số không phải trang trí: bước hai đứng sau bước một vì phải làm sau.

            Nó nằm trong một ĐĨA trung tính chứ không đứng trần, và đó là thứ
            bốn ảnh tham chiếu đều làm: một đĩa xám nhạt 22 điểm, số ở giữa,
            hạng chữ thấp hơn câu bên cạnh. Đĩa làm hai việc mà con số trần
            không làm được — nó giữ cột số thẳng một mép kể cả khi sang hai chữ
            số, và nó tách "thứ tự" khỏi "nội dung" bằng hình dạng thay vì bằng
            một khoảng trắng người ta phải tự suy ra.

            KHÔNG phải ký tự số-trong-vòng-tròn của Unicode (①②③): phông hệ
            thống chỉ có tới 20, chúng không theo cỡ chữ trợ năng, và bộ đọc màn
            hình đọc chúng mỗi nơi một kiểu.
          */}
          {steps.length ? (
            <View style={styles.block}>
              <Text style={styles.sectionTitle}>{i18n.nEgTitle}</Text>
              <View style={styles.list}>
                {steps.map((t, i) => (
                  <View key={t} style={styles.item}>
                    <View style={styles.step}>
                      <Text style={styles.stepNo}>{i + 1}</Text>
                    </View>
                    <Text style={styles.itemText}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/*
            ── một sợi kẻ NGANG, và nó chỉ tồn tại khi có hai khối để chia ──

            Cách thực hiện là một chuỗi phải đọc theo thứ tự; điểm kỹ thuật và
            lỗi thường gặp là hai danh sách tra cứu. Hai loại đọc khác nhau,
            nên ảnh tham chiếu đặt một sợi tơ giữa chúng — và KHÔNG đặt sợi nào
            quanh hai cột, vì cột không phải ô bảng.

            `hairlineWidth` là 1/scale của máy: trên màn 3× nó ra đúng một điểm
            ảnh vật lý, tức "1px" theo đúng nghĩa đen của đặt hàng.
          */}
          {ruled ? <View style={styles.rule} /> : null}

          {/*
            ── ĐIỂM KỸ THUẬT và LỖI THƯỜNG GẶP ──

            Hai danh sách, một hình dạng, hai dấu. Dấu mang NGHĨA chứ không
            mang trang trí: tick xanh là "làm thế này", chữ thập đỏ là "đừng
            thế này".

            Và nghĩa ấy KHÔNG chỉ nằm ở màu — mỗi mục nằm dưới một tiêu đề nói
            thẳng nó là gì, và hai glyph khác hình nhau. Người không phân biệt
            được đỏ/xanh vẫn đọc đúng, đó là điều kiện của WCAG 1.4.1.

            ── vì sao là một ĐĨA ĐẶC, không phải một glyph trần ──

            Bản trước vẽ `Check` và `AlertCircle` trần, 15 điểm, tô thẳng màu
            xanh/đỏ. Cả bốn ảnh tham chiếu đều dựng chúng thành đĩa đặc 20 điểm
            với glyph trắng bên trong, và lý do không phải khẩu vị: một nét 15
            điểm màu xanh neon trên mặt giấy là một hình MỎNG mang toàn bộ sức
            nặng của tín hiệu, còn một đĩa đặc thì có diện tích — nó tìm thấy
            được khi liếc, và nó không phụ thuộc vào việc phân giải một nét
            2,5 điểm.
          */}
          {cues.length || mistakes.length ? (
            <View
              style={[
                styles.block,
                /* Sợi kẻ đã mang khoảng chia rồi — xem `blockTight`. */
                ruled ? styles.blockTight : null,
                twoCols ? styles.pair : null,
              ]}>
              {cues.length ? (
                <View style={twoCols ? styles.col : undefined}>
                  <Text style={styles.sectionTitle}>{i18n.nEgCues}</Text>
                  <View style={styles.list}>
                    {cues.map((t) => (
                      <View key={t} style={styles.item}>
                        <View style={[styles.mark, styles.markOk]}>
                          <Icon icon={Check} size={11} color={c.primaryForeground} strokeWidth={3} />
                        </View>
                        <Text style={styles.itemText}>{t}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
              {mistakes.length ? (
                <View style={twoCols ? styles.col : undefined}>
                  <Text style={styles.sectionTitle}>{i18n.nEgMistakes}</Text>
                  <View style={styles.list}>
                    {mistakes.map((t) => (
                      <View key={t} style={styles.item}>
                        <View style={[styles.mark, styles.markBad]}>
                          <Icon icon={X} size={11} color={c.primaryForeground} strokeWidth={3} />
                        </View>
                        <Text style={styles.itemText}>{t}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {noContent ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{i18n.nEgEmpty}</Text>
              <Text style={styles.emptyHint}>{i18n.nEgEmptyHint}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/*
        ── LỐI RA: nổi trên hình, không tranh chỗ với tên bài ──

        `SheetHeader` không dùng được ở đây, và đó là một quyết định có ghi lại
        trong `tools/sheet-header.mjs`: nó dựng một tiêu đề 18 điểm CĂN GIỮA
        cạnh nút đóng, tức đúng cái thanh điều hướng mà bố cục này bỏ đi. Thứ
        không được mất là lối ra NHÌN THẤY được — nên nút vẫn là đĩa 44 điểm,
        vẫn `a11yClose`, chỉ là nó nổi trên hình.
      */}
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={i18n.a11yClose}
        hitSlop={8}
        onPress={() => {
          Haptics.selectionAsync();
          nav.back();
        }}
        style={[styles.close, { top: insets.top + spacing.sm }]}>
        {/* Cùng thứ tự hai lớp như mặt giấy: kính lấy mẫu hình, sắc độ phủ lên
            kính. Đặt sắc độ vào `backgroundColor` của chính nút thì kính sẽ lấy
            mẫu một hình đã bị phủ — xem khối chú thích ở `glassTint`. */}
        <BlurView
          intensity={GLASS_BLUR}
          tint={dark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={[StyleSheet.absoluteFill, styles.closeTint]} pointerEvents="none" />
        {/*
          Cái bọc này KHÔNG thừa.

          `Icon` dựng ra một `<svg>` trần. Trên bản web, phần tử không có
          `position` được vẽ ở LƯỢT SỚM HƠN mọi phần tử đã định vị, nên hai lớp
          `absoluteFill` ở trên phủ luôn lên dấu ✕ — đo được trên ảnh chụp bản
          dựng: cái nút thành một đĩa trơn, không còn dấu nào.

          `View` của React Native Web mang sẵn `position: relative`, nên nó kéo
          glyph về đúng lượt vẽ theo thứ tự JSX. Trên iOS thứ tự vẽ vốn đã theo
          thứ tự con, nên cái bọc này không đổi gì — nó chỉ làm hai nền khớp
          nhau.
        */}
        <View>
          <Icon icon={X} size={18} color={c.foreground} />
        </View>
      </PressScale>
    </View>
  );
}

const CLOSE = 44;
/*
  Cường độ kính — con số này điều khiển BÁN KÍNH nhoè, không điều khiển độ mờ.

  Độ mờ là việc của `glassTint` bên dưới, và nó được ĐO. Hai thứ tách nhau là
  có chủ ý: `expo-blur` gộp chúng làm một (intensity càng cao thì sắc độ riêng
  của vật liệu càng dày), nên nếu để nó một mình cầm cả hai thì không con số
  nào của phép đo còn nghĩa.
*/
const GLASS_BLUR = 48;

const stylesFor = makeStyles((c, m) => ({
  root: { flex: 1, backgroundColor: c.card },
  /*
    Không có đệm ngang ở đây: hình phải tràn tới hai mép. Lề nằm trên mặt giấy,
    nơi chữ sống.

    `flexGrow` để mặt giấy luôn CHẠM ĐÁY màn. Không có nó, một màn nội dung
    ngắn — lúc đang tải, lúc đọc hỏng, một bài chưa có hướng dẫn — để lộ dải
    hình còn lại ở phía dưới mặt giấy, và lúc ấy tờ giấy đọc ra như một cái thẻ
    trôi giữa màn chứ không như một tờ giấy được kéo lên.
  */
  scroll: { flexGrow: 1 },

  heroLayer: { position: 'absolute', left: 0, right: 0, top: 0 },
  surface: {
    flexGrow: 1,
    overflow: 'hidden',
    /*
      24, không phải 20.

      Đo trên hai ảnh tham chiếu: mực trái của "Cách thực hiện" ở 28,3đ (bản
      sáng) và 25,5đ (bản tối), của đĩa dấu ở 27,4đ và 26,0đ. Trừ đi phần lưu
      không bên trái của glyph — đo được 0,7đ trên chính bản dựng này — lề thật
      của ảnh tham chiếu là 25–27. `spacing.lg` là bậc token gần nhất.
    */
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  /* Không có hình dẫn thì không có gì để nhìn xuyên qua — mặt giấy đục hẳn. */
  surfaceOpaque: { backgroundColor: c.card },
  /*
    Góc bo của tờ giấy được kéo lên.

    Phần CHỒNG thì không còn bằng bán kính nữa — nó là 28% chiều cao hình, xem
    `overlap`. Bản trước chồng đúng 24 điểm với lý do "chồng nhiều hơn thì ảnh
    mất một dải mà không ai được lợi gì", và lý do ấy đúng cho tới khi mặt giấy
    thành KÍNH: từ lúc đó, dải ảnh bị chồng lên chính là thứ nhìn thấy được
    xuyên qua, nên nó không mất đi — nó là nội dung của chất liệu.
  */
  surfaceOverlap: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  /*
    ── ĐỘ MỜ CỦA KÍNH, và nó được ĐO chứ không được vặn cho đẹp ──

    Đặt hàng nói thẳng: *"DO NOT blindly lower opacity… measure the actual
    contrast… find the LOWEST practical sheet opacity that still maintains
    acceptable text contrast."* Nên đây là phép đo, và đây là kết quả.

    ── phép đo KHÔNG phụ thuộc vào tấm ảnh nào ──

    Lượt trước đo trên chính `exercise-demo.webp`: ép vào khung 402×536, trộn
    từng kênh, lấy phân vị 99,5 tệ nhất. Con số ấy đúng — nhưng nó đúng cho MỘT
    tấm ảnh tạm, và cái sẽ nằm sau kính về sau là đoạn minh hoạ thật của từng
    bài. Đổi ảnh là phải đo lại, và lượt này đổi ảnh thật (cắt bỏ bảng chú
    thích) nên con số cũ tụt từ 4,50 xuống 4,47.

    Nên nay giải cho nền TỆ NHẤT có thể thay vì cho một tấm ảnh: quét cả thang
    xám 0..255 phía sau lớp mờ. Luminance đơn điệu theo từng kênh nên hai cực
    trắng/đen bao trọn mọi màu — đạt ở đây là đạt với mọi hình minh hoạ, mãi
    mãi, không cần ai đo lại.

    Và nó vẫn ở σ=0, tức KHÔNG nhoè: bán kính của `UIBlurEffect` ở intensity 48
    không đo được từ máy này, còn trên Android `BlurView` không nhoè gì cả —
    `liquid-glass.tsx` ghi rõ `experimentalBlurMethod` cố ý không bật. Nhoè chỉ
    làm cực trị dịu đi, nên nó luôn đẩy số lên phía an toàn.

        TỐI  α=0,72 → tên bài + chữ thân 6,71:1 · siêu dữ liệu 4,5:1
        SÁNG α=0,90 → tên bài + chữ thân 14,01:1 · siêu dữ liệu 6,2:1

    ── vì sao bản tối dừng ở 0,72 chứ không xuống nữa ──

    Chữ `foreground` một mình còn đi được sâu hơn nhiều: 4,5:1 vẫn đạt ở α=0,62.
    Thứ chặn lại là DÒNG SIÊU DỮ LIỆU 13 điểm. `mutedForeground` chỉ có 5,02:1
    ngay trên thẻ đục, tức gần như không có dư địa, và trên kính nó tụt xuống
    2,25:1 — nên nó phải đổi màu (xem `metaOnGlass`). Càng trong suốt thì màu
    ấy càng phải sáng, và tới một mức nó không còn phân biệt được với
    `foreground` #ededed. Lúc ấy cái giá của độ trong là MẤT MỘT HẠNG CHỮ.

    0,72 là chỗ gối: màu mờ tối nhất còn đạt 4,5 với MỌI nền là #c4c4c4, tách
    hạng 1,49:1 khỏi `foreground` — đúng cỡ bước `secondaryForeground →
    mutedForeground` mà bảng màu này vốn có (6,8:1 → 5,0:1, tức 1,36:1).

    ── và vì sao bản sáng ĐỤC HƠN chứ không trong hơn ──

    Không phải vì tương phản: bản sáng rộng rãi hơn ở mọi α — sàn của nó là
    0,47, thấp hơn bản tối. Là vì đặt hàng nói hai điều KHÁC NHAU cho hai bản:
    bản tối *"significantly more transparent"*, bản sáng chỉ *"subtly visible"*.
    Ảnh tham chiếu nói cùng thế: mặt giấy bản sáng gần như đặc, chỉ ánh lên một
    chút hình ở mép trên.

    Và con số 0,90 này là thứ ĐÃ SỬA MỘT LẦN. Lượt đầu chốt 0,86 vì nó nằm
    thoải mái trên sàn — rồi ảnh chụp bản dựng thật cho thấy cái giá tạ phía sau
    hiện rõ nguyên hình qua mặt giấy. Đạt sàn không có nghĩa là đúng brief:
    "hơi thấy được" là một câu về SẮC ĐỘ, không phải về tương phản, và 0,86 cho
    ra một vệt bẩn chứ không phải một lớp ánh. 0,90 cho một sắc xám mờ
    (#ececec…#fbfbfb trên giấy trắng) — thấy được, không đọc ra hình.

    0,82 cũ so với 0,70 mới: lượng hình lọt qua tăng từ 18% lên 30%. Nhưng thứ
    thật sự làm bản tối trước đây đọc ra là đục không phải con số ấy — mà là
    chỉ có 24 điểm hình nằm sau mặt giấy. Nay là 150. Xem `overlap`.
  */
  glassTint: { backgroundColor: alpha(c.card, m.lit ? 0.72 : 0.82) },
  /*
    36 × 5 — thanh vuốt hệ thống của iOS.

    `SheetHeader` dùng 52 × 4, đo bằng cách quét điểm ảnh trên MỘT ảnh tham
    chiếu khác (120×8px ở 2,341 px/pt). Con số ấy ở nguyên chỗ nó — màn này
    không sửa sheet khác. Nhưng bốn ảnh tham chiếu của riêng màn hướng dẫn nói
    khác: đo được 31,2đ (bản sáng) và 34,0đ (bản tối), và 36 × 5 của Apple nằm
    đúng giữa hai con số ấy. Giữa "một phép đo cũ trên một ảnh khác" và "hai
    phép đo mới trên đúng ảnh của màn này, khớp với giá trị hệ thống", cái sau
    thắng.

    Đỉnh ở 12: ảnh tham chiếu cho 12,3đ và 10,4đ. Lề dưới 12 để mực tên bài rơi
    vào ~37,7đ — ảnh tham chiếu ở 38,3 và 37,8.
  */
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: c.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  /* Trên kính, `c.border` (#2b2b31 ở bản tối) biến mất: nó được chọn để đứng
     trên một mặt thẻ đứng yên, không trên một tấm ảnh. Mực của theme ở 35% thì
     sáng lên hay tối đi CÙNG chiều với chữ, nên nó còn nhìn thấy ở cả hai bản. */
  grabberOnGlass: { backgroundColor: alpha(m.ink, 0.35) },

  /* 28/700 — bậc `largeTitle` của thang chữ. Ảnh tham chiếu to hơn chút, nhưng
     thang này không có bậc giữa 28 và 44, và 44/300 là bậc của một CON SỐ trả
     lời cả màn, không phải của một cái tên. */
  title: { ...type.largeTitle, color: c.foreground },
  /*
    Không có hình dẫn (lúc đang tải, lúc đọc hỏng): mặt giấy bắt đầu từ đỉnh và
    nút đóng rơi đúng vào chỗ tên bài — ĐO ĐƯỢC, ảnh chụp cảnh không có hình
    cho thấy "Bench Press" bị cái đĩa đóng che một phần. Đẩy tên xuống dưới
    cái đĩa, và lúc ấy nó đọc ra như một nút lùi trên một tiêu đề.
  */
  titleClearsClose: { marginTop: CLOSE - spacing.sm },
  meta: { ...type.footnote, color: c.mutedForeground },
  /*
    Dòng siêu dữ liệu khi nó nằm TRÊN KÍNH — cùng vai, khác vật liệu.

    `mutedForeground` được chọn để đứng trên một mặt thẻ đặc; trên kính nó đo
    được 2,25:1 (tối) và 4,31:1 (sáng), tức hỏng ở cả hai. Đây không phải một
    ngoại lệ vặt: iOS gọi đúng thứ này là vibrancy — mực trên vật liệu không
    cùng giá trị với mực trên mặt phẳng.

    Hai giá trị, giải với MỌI nền (xem `glassTint`), σ=0:

        TỐI  #c8c8c8 trên α=0,72 → ≈4,5:1   (cách `foreground` 37/255)
        SÁNG #57524a trên α=0,90 → ≈6,2:1   (là `secondaryForeground` sẵn có)

    Bản tối BẮT BUỘC phải đổi: ở đó `mutedForeground` rơi xuống 2,25:1, và bảng
    màu không có bậc nào quanh #c8 — `secondaryForeground` là #999999, quá tối.
    Nên nó là một màu VẬT LIỆU của riêng màn này, và nó nằm ngay cạnh con số
    làm ra nó chứ không lên bảng màu chung.

    Bản sáng thì KHÔNG bắt buộc: ở α=0,90 màu mờ sáng nhất còn đạt 4,5 là
    #676767, và `mutedForeground` #6b6559 tối hơn thế nên nó tự đạt. Đổi sang
    `secondaryForeground` — một bậc liền kề, token sẵn có — là lấy thêm dư địa,
    vì mô hình một-con-số của WCAG giả định nền PHẲNG, còn đây là một tấm ảnh.
  */
  metaOnGlass: { color: m.lit ? '#c8c8c8' : c.secondaryForeground },

  busy: { paddingVertical: spacing.lg, alignItems: 'center' },

  /*
    Mục KHÔNG có hộp.

    Cả hai danh sách đã nằm trong một sheet, và một thẻ trong một sheet là hộp
    lồng hộp — đúng thứ đã bị gỡ khỏi hàng "Lần trước" ở màn Plan. Thứ chia
    mục ở đây là một tiêu đề nhỏ và khoảng trắng, không phải một đường viền.

    `marginTop` lớn hơn `gap` giữa tiêu đề và danh sách: khoảng trống TRÊN một
    tiêu đề phải nhiều hơn khoảng trống dưới nó, không thì tiêu đề trôi về khối
    phía trên và đọc ra như dòng cuối của khối ấy.
  */
  block: { marginTop: spacing.lg, gap: spacing.sm },
  sectionTitle: { ...type.headline, color: c.foreground },
  /*
    4, không phải 8.

    Bước hàng đo trên ảnh tham chiếu là ~21,5đ (bản sáng 22,2 và 22,7; bản tối
    20,3). Bản trước cho 29đ — thưa hơn 35%, và đó là chênh lệch mật độ lớn
    nhất giữa bản dựng và ảnh tham chiếu.

    `lineHeight` GIỮ NGUYÊN 21. Muốn xuống đúng 21,5 thì phải hạ nó còn ~17,
    mà chữ Việt xếp hai tầng dấu (`ộ`, `ế`, `ữ`) sẽ chạm nhau ở mức đó. Đặt
    hàng nói thẳng: *"Do not sacrifice accessibility just to make a screenshot
    match"* — nên bước hàng về 25, không về 21,5, và 4đ còn lại là cái giá của
    một ngôn ngữ có dấu.
  */
  list: { gap: spacing.xs },
  /* `flex-start` chứ không `center`: một dòng hai dòng chữ thì dấu phải nằm
     cạnh dòng ĐẦU, không trôi xuống giữa khối. */
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  itemText: { ...type.body, color: c.foreground, flex: 1, minWidth: 0, lineHeight: 21 },
  /*
    Đĩa số: 22 điểm, nền trung tính, số ở giữa.

    `c.secondary` chứ không phải một màu pha tại chỗ — đó là token "nền một bậc
    trên mặt thẻ" của bảng màu, và nó tự đúng ở cả hai theme (#efeae1 trên
    giấy, #18181b trong tối). Số dùng `secondaryForeground`, tức HẠNG THỨ HAI:
    đo được 6,46:1 trên giấy và 6,22:1 trong tối, nên nó vừa đạt AA vừa ở dưới
    câu chữ bên cạnh — đúng thứ ảnh tham chiếu cho thấy.

    ── 18, và con số này ĐI NGƯỢC một lời dặn ──

    Đặt hàng của lượt Pass 4.2 nói "~22–24pt". Nhưng lượt ấy chưa ai đo ảnh
    tham chiếu; đo rồi thì chip trong ảnh bản sáng là **∅15,6đ**, và đĩa dấu
    bên dưới là 16,5–17,5đ — tức trong ảnh tham chiếu HAI LOẠI ĐĨA BẰNG NHAU và
    đều nhỏ hơn hẳn. 22 làm mỗi bước đọc ra như một cái huy hiệu.

    18 là giá trị gần phép đo nhất mà vẫn còn chỗ cho một chữ số: ∅15,6 với
    chữ 11 thì viền chỉ còn 2,3đ mỗi bên. Repo này có luật "phép đo thắng một
    lời dặn chưa đo", nên đây là phép đo thắng — và con số kia được ghi lại
    ngay đây để người duyệt chốt lại nếu muốn.

    Số xuống `caption` (11/500): trong ảnh tham chiếu chữ số rõ ràng nhỏ và mờ
    hơn câu bên cạnh, và 13 trong một đĩa 18 thì gần chạm viền.

    `marginTop` 1,5 = (21 − 18)/2, kéo tâm đĩa về đúng tâm dòng chữ đầu.
  */
  step: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1.5,
  },
  stepNo: { ...type.caption, color: c.secondaryForeground, fontVariant: ['tabular-nums'] },

  /*
    Đĩa dấu: 20 điểm, đặc, glyph 12 điểm ở giữa.

    ∅18 và glyph 11 — đo trên ảnh tham chiếu: đĩa ở đó là **16,5–17,5đ**, còn
    khoảng đĩa→nét chữ đầu là 9,5đ (bản dựng 8,7đ, tức `spacing.sm` đã đúng).
    Cùng một lời dặn "~20–24pt" bị phép đo lật như ở `step` phía trên, và cùng
    một lý do.

    Mực là `primaryForeground` — token "thứ nằm TRÊN màu nhấn" của mỗi theme —
    chứ không phải trắng cứng, và đó là một phép đo chứ không phải một sở
    thích. Bản tối dùng #070708, và nó cho **9,12:1** trên đĩa xanh
    (`readinessGreen` #00c785), **9,09:1** trên đĩa đỏ (`readinessRed`
    #ff8d92). Bản sáng dùng #ffffff trên #078055 và #de0b44: 4,97:1 và 4,96:1.

    Ảnh tham chiếu vẽ tick TRẮNG. Ở bản sáng đó đúng là thứ được dựng; ở bản
    tối thì không — trắng trên hai màu ấy đo được **2,21:1** và **2,22:1**,
    dưới cả sàn 3:1 của WCAG 1.4.11. Phép đo thắng ảnh tham chiếu ở đúng chỗ
    đó.

    ── và con số này ĐÃ ĐỔI MỘT LẦN dưới chân nó ──

    Lượt đầu ghi 14,12:1 và 5,78:1, đo trên `readinessGreen` #2bf5a8 và
    `readinessRed` #ff3b5c. Một lượt khác đổi cả hai màu ở bảng TỐI, và hai
    con số ấy thành sai mà không luật nào kêu — `tools/palette.mjs` canh tương
    phản của token trên NỀN của theme, không canh mực đặt TRÊN token.

    Cách viết này sống sót được qua lần đổi ấy vì nó không gọi tên màu: nó gọi
    `c.primaryForeground` trên `c.readinessGreen`. Màu đổi thì cặp vẫn đúng —
    9,12 thay cho 14,12 — còn một mã màu viết cứng thì đã hỏng im lặng.
  */
  mark: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1.5,
  },
  markOk: { backgroundColor: c.readinessGreen },
  markBad: { backgroundColor: c.readinessRed },

  /* Sợi kẻ ngang giữa "cách thực hiện" và hai cột — xem chỗ dựng nó. Khoảng
     trống hai bên rộng hơn `block` thường: nó là chỗ ĐỔI KIỂU ĐỌC, không phải
     một mục mới. */
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: alpha(m.ink, 0.14),
    marginTop: spacing.sm,
  },
  /*
    Khối hai cột khi CÓ sợi kẻ ở trên: 8 thay cho 24.

    Sợi kẻ đã là dấu chia, nên `block` không cần mang thêm khoảng trống của
    riêng nó nữa. 8 trên kẻ và 8 dưới kẻ — ĐỐI XỨNG, vì một đường chia lệch về
    một phía sẽ đọc ra như gạch chân của khối phía trên chứ không như ranh giới
    giữa hai khối. Đo trên bản dựng: mực-tới-mực 28,3đ, đúng bằng ảnh tham
    chiếu bản sáng (28,3) và sát bản tối (31,7). Bản trước cộng 32 + 24 và cho
    68–71đ, tức hơn gấp đôi.
  */
  blockTight: { marginTop: spacing.sm },

  /* Hai cột, KHÔNG kẻ dọc giữa chúng: một sợi dọc cộng với sợi ngang ở trên
     làm hai danh sách đọc ra như một cái bảng, và bảng là thứ ảnh tham chiếu
     không có. Thứ chia hai cột là khoảng trắng. */
  /*
    Rãnh 32.

    Đo trên ảnh tham chiếu bản tối: cột trái bắt đầu ở 26,0đ, cột phải ở
    218,7đ. Giải ra với lề 24 thì rãnh là 35,4 và mỗi cột rộng 157. `spacing.xl`
    cho 32 và cột 161 — bậc token gần nhất.
  */
  pair: { flexDirection: 'row', gap: spacing.xl },
  col: { flex: 1, minWidth: 0, gap: spacing.sm },

  empty: { alignItems: 'center', gap: 4, marginTop: spacing.lg },
  emptyText: { ...type.body, color: c.foreground },
  emptyHint: { ...type.footnote, color: c.mutedForeground, textAlign: 'center' },

  /*
    Nút đóng nổi trên hình.

    `c.secondary` chứ không phải một lớp trong suốt: nó phải đọc được trên một
    tấm ảnh chưa ai biết trước màu gì. 44 điểm đúng sàn Apple, và đó là phần
    NHÌN THẤY — `hitSlop` chỉ nới thêm ra ngoài.
  */
  close: {
    position: 'absolute',
    left: spacing.md,
    width: CLOSE,
    height: CLOSE,
    borderRadius: radius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /*
    ── nút đóng là KÍNH, không phải một đĩa đặc ──

    Đo trên ảnh tham chiếu bản tối: độ sáng bên trong đĩa dao động 0,125 — tức
    nhìn xuyên được. Trên bản dựng cũ nó dao động 0,015, tức đặc.

    0,65 và đây là một sàn KHÔNG phụ thuộc ảnh: giải cho nền tệ nhất trên cả
    thang xám 0..255, dấu ✕ đo được **4,69:1** ở bản tối và **6,12:1** ở bản
    sáng. WCAG 1.4.11 đòi 3:1 cho một thành phần giao diện, và sàn ấy đạt ở
    α≥0,52. Lấy 0,65 chứ không lấy 0,52 vì đây là LỐI RA NHÌN THẤY ĐƯỢC duy
    nhất của màn: nó không được phép chỉ vừa đủ.

    Lý do phải giải theo "mọi nền" chứ không đo trên ảnh demo: ảnh demo là tạm,
    còn cái nút này sẽ nổi trên bất kỳ đoạn minh hoạ nào sau này.
  */
  closeTint: { backgroundColor: alpha(c.secondary, 0.65) },
}));
