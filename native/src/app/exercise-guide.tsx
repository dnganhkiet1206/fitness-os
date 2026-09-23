import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Bookmark, Check, Maximize2, Play, X } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GuideMedia } from '@/components/ascnd/guide-media';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { MuscleArt } from '@/components/ascnd/muscle-art';
import { PressScale } from '@/components/ascnd/press-scale';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { useExerciseGuide } from '@/hooks/use-exercise-guide';
import { useExercises } from '@/hooks/use-library';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { usePalette } from '@/hooks/use-palette';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { nav } from '@/lib/nav';
import {
  captionedItems,
  hasMedia,
  mediaLabel,
  showsDots,
  type MediaItem,
  type MediaState,
} from '@/lib/exercise-media';
import {
  sameEquipment,
  sameMuscle,
  type LibraryRow,
  type RelatedItem,
} from '@/lib/guide-related';

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
 * ── BỐN TAB, và chúng THẬT ──
 *
 * Hai lượt đầu, hàng tab là một hình vẽ: `pointerEvents="none"`, giấu khỏi cây
 * trợ năng, vì ba trong bốn "không có dữ liệu ở sau". Lý do ấy được ghi lại
 * đầy đủ và nó không sai — nhưng nó là một câu về SCHEMA, không phải về repo.
 *
 * Chủ dự án chốt: *"bấm được cả và search để thêm thông tin cho các mục đó"*.
 * Nên lượt này đi TÌM, và tìm ra:
 *
 *     Tổng quan     hướng dẫn / điểm kỹ thuật / lỗi thường gặp  (đã có)
 *     Cơ tác động   `muscleKeys` → bộ hình giải phẫu `muscle-art.tsx`,
 *                   thứ bốn màn khác trong app đã dùng
 *     Thiết bị      nhãn dụng cụ + bài KHÁC cùng dụng cụ
 *     Liên quan     bài KHÁC cùng nhóm cơ
 *
 * Hai tab cuối đọc `useExercises()` — truy vấn màn Plan ĐÃ chạy sẵn — nên
 * chúng không thêm một byte nào vào lúc mở sheet: xem `needsLibrary`. Và
 * `lib/guide-related.ts` giữ phép lọc ở một tệp THUẦN, để luật kiểm chạy được
 * nó thật chứ không dò chuỗi.
 *
 * Thứ KHÔNG được làm, và đặt hàng nói thẳng: *"Do not create fake screens
 * merely to make the tab clickable."* Nên tab nào không có gì thật để nói thì
 * nói thẳng là chưa có — ba câu khác nhau cho ba sự thật khác nhau, xem
 * `nEgNoMuscles` trong `native-strings.ts`. Không có màn nào được bịa ra để
 * cái tab có chỗ dẫn tới.
 *
 * ── HAI thứ vẫn không bấm được ──
 *
 * **Dấu trang** — không có kho nào để lưu vào; đặt hàng cấm dựng schema mới ở
 * lượt này. Nó vẫn là hình vẽ, vẫn im lặng với bộ đọc màn hình.
 *
 * **Danh sách bài khác** — chúng là THÔNG TIN, không phải lối đi. Mở hướng dẫn
 * của một bài khác từ đây sẽ làm nút lớn ở đáy nói dối: "bắt đầu bài tập" quay
 * về buổi tập đang chạy, mà buổi ấy không có bài vừa mở. Nên chúng là chữ đọc
 * được — không giấu khỏi trợ năng, vì chữ thì có thật — chứ không phải nút.
 *
 * Nút lớn ở đáy làm đúng một việc có thật: `nav.back()`, cùng lệnh với dấu ✕
 * và cú vuốt xuống. Màn này chỉ mở được từ trong một buổi đang chạy, nên "bắt
 * đầu bài tập" nghĩa là thôi đọc và quay lại làm.
 *
 * Còn `···` ở góc trên-phải thì vẫn không dựng: đặt hàng không nhắc tới nó, và
 * nó không có cả một hình dáng để giữ chỗ cho cái gì.
 *
 * ── ĐỔI TAB KHÔNG ĐỤNG VÀO MEDIA ──
 *
 * Hình dẫn là một LỚP nằm ngoài dòng cuộn (xem `heroLayer`), và bộ media sống
 * trong cache của `useExerciseGuide`. `tab` chỉ chọn thứ vẽ BÊN DƯỚI hàng tab.
 * Nên chuyển qua lại bốn tab không dựng lại khung hình, không tải lại ảnh,
 * không reset video — đúng lời dặn *"Switching tabs must preserve the Exercise
 * Guide's media state."*
 */
export default function ExerciseGuideSheet() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  /* Bản tối dựng mặt giấy bằng KÍNH MỜ trên hình, nên nó cần biết theme đang
     bật — xem `surfaceGlass`. */
  const { lang, themeName } = useAppSettings();
  const dark = themeName === 'dark';
  /*
    CHỈ `insets.bottom`, và chỉ cho khu hành động ở đáy.

    `insets.top` thì KHÔNG, và `tools/exercise-guide.mjs` luật 21 cấm nó: một
    pageSheet đã nằm dưới thanh trạng thái rồi, nên cộng vào là cộng hai lần và
    cái đĩa đóng rơi xuống chỗ tên bài — đã xảy ra trên máy thật. Mép DƯỚI thì
    khác: sheet chạm đáy màn, nên thanh home thật sự nằm đè lên nó.
  */
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
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
  /*
    ── MEDIA LÀ MỘT MÔ HÌNH, và giao diện là HỆ QUẢ ──

    Bốn trạng thái (`lib/exercise-media.ts`) quyết định TẤT CẢ: có nút mở
    không, có chấm trang không, có thời lượng không. Màn này không bao giờ hỏi
    tên bài, không đoán đuôi tệp, và không có nhánh nào đúng-cho-ảnh-demo.
  */
  const media: MediaState = g?.media ?? NO_MEDIA;
  const openable = showMedia && hasMedia(media);
  /*
    ── CÁC BƯỚC CÓ HÌNH ──

    Mỗi tấm media mang một chú thích đã bản địa hoá, và đặt hàng nói rõ thứ tự
    đọc: *ảnh → số bước → tiêu đề → mô tả*. Chúng chỉ tồn tại khi CÓ chữ: bốn
    tấm ảnh không ai giải thích thì không phải một mục hướng dẫn.
  */
  /*
    ── VUỐT NGANG TRONG KHUNG DẪN ──

    Khung dẫn là một LỚP TUYỆT ĐỐI nằm SAU dòng cuộn dọc (xem `heroLayer`), nên
    nó không bao giờ nhận được chạm — dòng cuộn phủ lên nó. Hệ quả cũ: bốn tấm
    mà chỉ tấm đầu hiện ra, chấm trang cứng ở chấm thứ nhất, và vuốt ngang
    không làm gì cả. Chỉ toàn màn mới vuốt được.

    Sửa bằng cách TÁCH CỬ CHỈ KHỎI HÌNH, không phải bằng cách đổi bố cục:

      · chỗ trống mở đầu dòng cuộn dọc — vốn chỉ là một `<View>` giữ chiều cao —
        nay là một dải cuộn NGANG, TRONG SUỐT, `pagingEnabled`
      · độ lệch của nó đẩy thẳng vào `heroX`, và `GuideMedia` dịch dải ảnh theo

    Hai chiều không tranh nhau: cuộn lồng VUÔNG GÓC là thứ React Native xử lý
    sẵn — dải ngang nhận cú vuốt ngang, dòng dọc nhận cú vuốt dọc. Và vì dải
    nằm TRONG dòng cuộn dọc chứ không đè lên nó, cuộn dọc bắt đầu từ trên hình
    vẫn chạy như cũ.

    Cách làm hiển nhiên hơn — chuyển hẳn khung vào dòng cuộn — bị loại: lúc ấy
    hình cuộn đi cùng nội dung và mất hiệu ứng mặt giấy TRƯỢT TRÊN hình, thứ
    được đo theo bốn ảnh tham chiếu và ghi ở `overlap`.
  */
  const heroX = useRef(new Animated.Value(0)).current;
  const [heroPage, setHeroPage] = useState(0);
  const lastHero = useRef(0);
  const onHeroPage = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      /* Kẹp vào khoảng hợp lệ: kéo quá mép cho `contentOffset` âm hoặc vượt
         tấm cuối, và một chấm thứ năm sáng lên là một lời nói dối. */
      const raw = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
      const i = Math.min(Math.max(raw, 0), Math.max(0, media.items.length - 1));
      if (i !== lastHero.current) {
        lastHero.current = i;
        setHeroPage(i);
      }
    },
    [width, media.items.length],
  );
  /* Dải chỉ tồn tại khi có NHIỀU tấm. Một tấm mà có dải cuộn là một cú vuốt
     không đi tới đâu, và `showsDots` đã là nguồn duy nhất của câu hỏi ấy. */
  const swipable = showsDots(media);

  const [tab, setTab] = useState<GuideTab>('overview');
  /*
    ── HAI trạng thái, vì hai thứ đổi ở hai thời điểm khác nhau ──

    `tab` là viên tab đang sáng: nó đổi NGAY lúc ngón tay nhấc lên, không đợi
    gì cả. `shown` là nội dung đang vẽ: nó đổi ở GIỮA cú chuyển, sau khi nội
    dung cũ đã mờ đi.

    Một trạng thái duy nhất thì không thể có hiệu ứng "mờ đi rồi mới đổi" mà
    vẫn giữ được phản hồi tức thì của cái nút — hoặc nút trễ theo nội dung,
    hoặc nội dung nhảy theo nút.
  */
  const [shown, setShown] = useState<GuideTab>('overview');

  /*
    ── ĐỔI TAB: mờ đi, đổi, hiện lên — khung KHÔNG nhúc nhích ──

    Đặt hàng vẽ hẳn ba bước: *"Nội dung cũ (fade out + dịch lên nhẹ) →
    Crossfade → Nội dung mới (fade in + dịch lên từ dưới)"*, kèm con số:
    ≈10–16 điểm, 200–250ms, ease-out.

    Nên hai giá trị chứ không một: một giá trị duy nhất bắt lượt ra và lượt
    vào dùng CHUNG một phép nội suy, và khi ấy nội dung cũ sẽ trôi XUỐNG khi
    mờ đi — ngược hẳn với hình đặt hàng vẽ.

        ra:   độ mờ 1→0, dịch  0 → −8    100ms
        (đổi `shown`, đặt dịch = +12 ngay lập tức, không animate)
        vào:  độ mờ 0→1, dịch +12 → 0    140ms

    Tổng 240ms, nằm trong khoảng đặt hàng cho. Biên độ 12 điểm cũng vậy.
    `useNativeDriver` chạy được vì cả hai thứ đổi đều là độ mờ và transform.

    "Giảm chuyển động" thì đổi thẳng, không animate — đó là luật của cả app,
    và một cú chuyển 240ms vẫn là chuyển động.
  */
  const fade = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const pickTab = useCallback(
    (id: GuideTab) => {
      Haptics.selectionAsync();
      /* Viên tab sáng lên NGAY — xem khối chú thích ở `shown`. */
      setTab(id);
      if (id === shown) return;
      if (reduced) {
        setShown(id);
        return;
      }
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: 100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(slide, { toValue: -8, duration: 100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished) return;
        setShown(id);
        slide.setValue(12);
        Animated.parallel([
          Animated.timing(fade, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(slide, { toValue: 0, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]).start();
      });
    },
    [fade, slide, reduced, shown],
  );

  const steps4 = captionedItems(media);
  /* Bốn bước cách nhau `lg`, không `sm`: mỗi bước là ảnh + ba dòng chữ, nên
     khoảng giữa hai bước phải lớn hơn hẳn khoảng bên trong một bước — không
     thì mô tả của bước trên đọc ra như đang thuộc về ảnh của bước dưới. */
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
  const noContent = showMedia && !g?.hasContent && !hasMedia(media);

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
    ── TAB ĐANG CHỌN, và nó là state của màn chứ không của route ──

    Không đẩy vào tham số route: đổi tab là một cử chỉ trong một tờ giấy đang
    mở, không phải một chỗ mới để quay lui về. Nếu nó nằm ở URL thì nút Back
    của hệ thống sẽ lần lượt lùi qua bốn tab trước khi đóng sheet — và thứ
    người ta muốn lùi về là BUỔI TẬP.
  */
  const overview = shown === 'overview';
  /*
    ── bốn nhãn trong một hàng, và ở 320 điểm chúng KHÔNG vừa ──

    Đo trên bản dựng thật: mỗi viên được (W − 48 − 6)/4. Máy 402 cho 87 điểm và
    cả bốn nhãn vừa ở hạng `footnote` 13. Màn 320 — iPhone SE — chỉ cho 66, và
    ở đó ngay cả "Tổng quan" cũng bị cắt thành "Tổng qu…".

    Nên hạng chữ xuống một bậc khi màn hẹp. `caption` 11 là bậc app đã dùng cho
    nhãn phụ (đếm bài ở lưới cơ), và nó đúng cỡ nhãn thanh tab của chính iOS.
    Thứ KHÔNG được làm là để nguyên 13 rồi chấp nhận dấu ba chấm: một nhãn bị
    cắt là một cái nút không nói được nó dẫn tới đâu.
  */
  const tightTabs = width < 360;

  /*
    ── thư viện chỉ được hỏi khi tab cần tới nó ──

    `useExercises()` là truy vấn màn Plan đã chạy sẵn, nên ở đây nó gần như
    luôn là một cú chạm cache. "Gần như" chưa đủ: `staleTime` mặc định là 1
    phút, và một người đọc hướng dẫn lâu hơn thế sẽ làm nó gọi lại mạng. Mở
    sheet rồi đọc "Tổng quan" — đường đi thường gặp nhất — vì thế không được
    trả cái giá ấy, và với `enabled` thì nó không trả.
  */
  const needsLibrary = tab === 'equipment' || tab === 'related';
  const {
    data: libraryRows,
    isPending: libraryBusy,
    isError: libraryFailed,
  } = useExercises(needsLibrary);

  /*
    Cả hai danh sách được tính từ CÙNG một bộ dữ liệu và cùng một chủ thể, nên
    chúng đi chung một `useMemo`: tách ra là chép lại `subject` hai lần và tạo
    ra một cặp sẽ lệch.
  */
  const related = useMemo(() => {
    if (!g) return { equipment: [] as RelatedItem[], muscle: [] as RelatedItem[] };
    const subject = {
      id: g.id,
      name: g.name,
      /* CHIẾU ra khoá, không dịch: nhãn đã nằm sẵn cạnh mỗi khoá trong hợp
         đồng, và phép lọc thì so khoá với khoá. */
      muscleKeys: g.muscles.map((m) => m.key),
      equipmentKey: g.equipmentKey,
    };
    const rows = (libraryRows ?? []) as LibraryRow[];
    return {
      equipment: sameEquipment(rows, subject, lang),
      muscle: sameMuscle(rows, subject, lang),
    };
  }, [g, libraryRows, lang]);

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
            media={media}
            name={g?.name || title}
            hasCues={cues.length > 0}
            i18n={i18n}
            hero
            /* Mặt giấy chồng lên đáy khung — nhãn thời lượng phải nhảy lên trên
               phần bị che, không thì nó nằm sau kính. */
            coveredBy={overlap}
            /* Ba thứ lái dải ảnh — xem `heroX`. */
            offsetX={swipable ? heroX : null}
            pageWidth={width}
            page={heroPage}
          />
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        {/*
          Chỗ trống mở đầu dòng cuộn — và khi có nhiều tấm, nó cũng là DẢI CỬ
          CHỈ. Trong suốt: hình thật nằm ở lớp tuyệt đối phía sau, đây chỉ là
          thứ ngón tay chạm vào.
        */}
        {hero && swipable ? (
          <Animated.ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ height: heroH - overlap, flexGrow: 0, flexShrink: 0 }}
            /*
              MỘT sự kiện, hai người nghe.

              `Animated.event` đẩy độ lệch thẳng xuống luồng giao diện, nên dải
              ảnh bám ngón tay mà không đi qua JavaScript. `listener` là cửa
              chính thức để cùng sự kiện ấy vẫn tới được JS — và chấm trang
              phải nghe từ ĐÂY chứ không từ `onMomentumScrollEnd`: harness đo
              được là ảnh dịch đúng (-402, -804, -1206 điểm) trong khi chấm
              vẫn đứng ở tấm đầu, vì cú vuốt không sinh quán tính thì sự kiện
              kết-quán-tính không bao giờ bắn. Nghe từ chính dòng cuộn thì chấm
              đi theo ngón tay, và đúng cả khi người ta kéo chậm rồi thả.
            */
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: heroX } } }], {
              useNativeDriver: true,
              listener: onHeroPage,
            })}
            scrollEventThrottle={16}>
            {media.items.map((m) => (
              <View key={m.uri} style={{ width }} />
            ))}
          </Animated.ScrollView>
        ) : hero ? (
          <View style={{ height: heroH - overlap }} />
        ) : null}

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

          {/*
            ── HÀNG ĐẦU: chữ bên trái, nút play bên phải ──

            Ảnh tham chiếu bản TỐI — thứ đặt hàng gọi là nguồn sự thật thị giác
            — đặt nút play trong hàng tên bài, không phải nổi trên hình. Ảnh
            bản sáng đặt nó dưới góc phải hình; hai ảnh không thống nhất, và
            bản tối thắng vì nó được chỉ định.
          */}
          <View style={[styles.headRow, hero ? null : styles.titleClearsClose]}>
            <View style={styles.headText}>
              {g?.name || title ? (
                <Text style={styles.title} accessibilityRole="header">
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
            </View>
            {/*
              ── nút play KHÔNG NHẬN CHẠM, và đó là một lời nói thật ──

              Đoạn minh hoạ tự chạy, lặp, tắt tiếng, không điều khiển — đã đo ở
              lượt kiểm media và vẫn đúng. Nên không có gì để "play". Đặt hàng
              đòi hình dáng ấy và cấm thêm hành vi sản phẩm mới ("Do not add new
              product behavior"), nên nó được dựng như một hình vẽ: không
              `onPress`, và giấu khỏi cây trợ năng để bộ đọc màn hình không gọi
              nó là một cái nút.

              Khi có media THẬT và có API tạm dừng, đây là chỗ nó nối vào.
            */}
            {/*
              ── nút MỞ MEDIA — một hành động, ba hành vi ──

              Nó KHÔNG còn là một nút phát giả. Nó chỉ tồn tại khi thật sự có
              media, và nó mở màn xem toàn màn; việc ở đó là xem ảnh, vuốt qua
              bộ ảnh, hay phát video thì do `media.type` quyết định — không do
              cái nút này.

              Glyph vẫn theo ảnh tham chiếu (tam giác phát cho video), nhưng với
              ẢNH thì nó là dấu phóng to: gọi một tấm ảnh là "phát" ở trong mã
              lẫn ngoài màn đều là nói sai loại. Nhãn trợ năng nói đúng việc nó
              làm — `nEgOpenMedia`, "Mở hình minh hoạ".
            */}
            {openable ? (
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={i18n.nEgOpenMedia}
                hitSlop={8}
                onPress={() => {
                  Haptics.selectionAsync();
                  nav.push({
                    pathname: '/media-viewer',
                    /* Mở ĐÚNG tấm đang xem. Vuốt tới tấm ba rồi bấm mở mà ra
                       tấm một là hai màn nói hai chuyện về cùng một bộ. */
                    params: { ex: g?.id ?? '', name: g?.name || title, i: String(heroPage) },
                  });
                }}
                style={styles.play}>
                <Icon
                  icon={media.type === 'video' ? Play : Maximize2}
                  size={16}
                  color={c.foreground}
                  fill={media.type === 'video' ? c.foreground : undefined}
                />
              </PressScale>
            ) : null}
          </View>

          {/*
            ── HÀNG TAB: bốn nhãn, một cái được chọn, và CẢ BỐN bấm được ──

            `Pressable` trần chứ không `PressScale`: cả ba thanh tab khác của
            app (`meal-plan`, `week-strip`, `pick-row`) dựng đúng thế, và một
            viên tab co lại khi bấm sẽ đọc ra như một cái nút hành động chứ
            không như một chỗ đang chuyển.

            `accessibilityRole="tab"` + `accessibilityState={{ selected }}` là
            thứ khiến VoiceOver đọc ra "tab, đã chọn, 2 trên 4" — và nay nó nói
            ĐÚNG, vì bấm vào thật sự đổi nội dung. Hai lượt trước cả hàng bị
            giấu khỏi cây trợ năng, đúng cho lúc ấy: không giấu thì nó là bốn
            lời hứa suông.
          */}
          {showMedia ? (
            <View style={[styles.tabs, hero ? styles.tabsOnGlass : null]}>
              {TABS.map(({ id, key }) => {
                const on = tab === id;
                const label = i18n[key];
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    /*
                      ── `aria-selected` KHÔNG thừa, và đây là một PHÉP ĐO ──

                      Đo trên bản dựng web thật: bốn viên tab ra `role="tab"`,
                      `aria-label`, `tabindex` — và KHÔNG có `aria-selected`.
                      Tức react-native-web (bản trong kho này) không dịch
                      `accessibilityState.selected` ra thuộc tính nào, nên trên
                      web cả bốn viên đọc lên giống hệt nhau: người dùng bàn
                      phím và trình đọc màn hình không biết mình đang ở tab nào.

                      `aria-selected` là bí danh CHÍNH THỨC của React Native
                      cho đúng trạng thái ấy (từ 0.71) và nó được ưu tiên hơn
                      `accessibilityState` trên native — nên một dòng này đúng
                      ở CẢ hai nền, và nó là thứ `guide6.mjs` đo được.

                      Giữ cả hai vì chúng nói cùng một điều cho hai bộ đọc khác
                      nhau; bỏ dòng trên thì mã thôi giống ba thanh tab khác
                      của app, mà chúng chưa được sửa ở lượt này.
                    */
                    aria-selected={on}
                    accessibilityLabel={label}
                    onPress={() => pickTab(id)}
                    style={[styles.tab, on ? styles.tabOn : null]}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.tabText,
                        tightTabs ? styles.tabTextTight : null,
                        on ? styles.tabTextOn : hero ? styles.metaOnGlass : null,
                      ]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/*
            ── THÂN TAB: một lớp duy nhất, và cú chuyển sống ở đây ──

            Mọi thứ dưới hàng tab nằm trong MỘT `Animated.View`, nên cú chuyển
            là một phép đổi độ mờ và một phép dịch — không phải bốn nhánh tự
            hiện tự tắt. Xem `pickTab` cho ba bước và các con số.

            Nó KHÔNG mang chiều cao nào: khung ngoài đứng yên là nhờ dải cử chỉ
            không nuốt chỗ trống nữa (xem `flexGrow: 0` ở dải), không phải nhờ
            ghim một con số ở đây. Ghim chiều cao sẽ cắt mất nội dung tab dài.
          */}
          <Animated.View
            style={{ opacity: fade, transform: [{ translateY: slide }] }}>

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
          {/*
            ── CÁC BƯỚC CÓ HÌNH: ảnh → số → tiêu đề → mô tả ──

            Đặt hàng dựng thứ tự đọc này thành một sơ đồ, và lý do nó theo thứ
            tự ấy: tấm ảnh trả lời "trông thế nào", con số trả lời "bước mấy",
            rồi chữ mới giải thích. Đảo lại là bắt người ta đọc một lời giải
            thích về thứ chưa nhìn thấy.

            CHỮ KHÔNG NẰM TRONG ẢNH. Bốn tấm nói bằng giải phẫu, tư thế, mũi
            tên và dấu ✓/✗; mọi câu chữ đến từ `exercise_media_content` và đổi
            theo ngôn ngữ mà không đụng một byte nào của ảnh.
          */}
          {overview && steps4.length ? (
            <View style={styles.steps4}>
              {steps4.map((m, i) => (
                <MediaStep
                  key={m.uri}
                  item={m}
                  index={i}
                  name={g?.name || title}
                  styles={styles}
                  reduced={reduced}
                  onOpen={() => {
                    Haptics.selectionAsync();
                    nav.push({
                      pathname: '/media-viewer',
                      params: { ex: g?.id ?? '', name: g?.name || title, i: String(i) },
                    });
                  }}
                />
              ))}
            </View>
          ) : null}

          {overview && steps.length ? (
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
          {overview && ruled ? <View style={styles.rule} /> : null}

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
          {overview && (cues.length || mistakes.length) ? (
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

          {overview && noContent ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{i18n.nEgEmpty}</Text>
              <Text style={styles.emptyHint}>{i18n.nEgEmptyHint}</Text>
            </View>
          ) : null}

          {/*
            ── CƠ TÁC ĐỘNG ──

            Bộ hình giải phẫu đã có sẵn và bốn màn khác đang dùng nó: lưới cơ ở
            tab Tập luyện, bộ lọc của trình dựng buổi, thẻ mẫu tập, màn thư
            viện. Đây là chỗ thứ năm, và nó không thêm một tài nguyên nào.

            `g.muscles` là TỪNG nhóm một — khoá để tra hình, nhãn đã dịch để
            in. `Lưng/Chân` của deadlift là HAI ô, và `muscleArtKeysFor` đã
            tách sẵn — xem `muscle-group.ts`.
          */}
          {showMedia && shown === 'muscles' ? (
            <View style={styles.block}>
              <Text style={styles.sectionTitle}>{i18n.nEgMuscles}</Text>
              {g?.muscles.length ? (
                <View style={styles.tiles}>
                  {g.muscles.map((m) => (
                    <View key={m.key} style={styles.tile}>
                      <MuscleArt group={m.key} size={64} />
                      <Text style={styles.tileName} numberOfLines={1}>
                        {m.label}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                /* Không có hình nào thì nói THẲNG là chưa ghi nhóm cơ — không
                   dựng một khung trống rồi để người ta tự đoán. Và đây là một
                   câu riêng, không phải câu "chưa có hướng dẫn": một bài có thể
                   có đủ hướng dẫn mà cột nhóm cơ vẫn là một chuỗi thư viện
                   không nhận ra. */
                <Text style={styles.emptyHint}>{i18n.nEgNoMuscles}</Text>
              )}
            </View>
          ) : null}

          {/*
            ── THIẾT BỊ ──

            Một nhãn, rồi những bài KHÁC dùng đúng dụng cụ ấy. Nhãn thôi thì
            trùng dòng siêu dữ liệu ngay trên và tab này không đáng có; danh
            sách kia mới là thứ chỉ tab này nói được — "cái tạ đơn đang cầm còn
            làm được gì nữa".
          */}
          {showMedia && shown === 'equipment' ? (
            <View style={styles.block}>
              <Text style={styles.sectionTitle}>{i18n.nEgEquipment}</Text>
              {g?.equipment ? (
                <Text style={styles.itemText}>{g.equipment}</Text>
              ) : (
                <Text style={styles.emptyHint}>{i18n.nEgNoEquipment}</Text>
              )}
              {g?.equipment ? (
                <RelatedList
                  title={i18n.nEgAlsoEquipment.replace('{v}', g.equipment)}
                  items={related.equipment}
                  busy={libraryBusy}
                  failed={libraryFailed ? i18n.nLoadFailed : null}
                  styles={styles}
                  tint={c.mutedForeground}
                />
              ) : null}
            </View>
          ) : null}

          {/*
            ── LIÊN QUAN ──

            Bài khác đánh vào ít nhất một nhóm cơ chung, nhiều nhóm trùng thì
            đứng trước. Rỗng có HAI nguyên nhân khác nhau và chúng nói hai câu
            khác nhau: không biết bài này đánh vào đâu, hay biết mà thư viện
            không có bài nào khác.
          */}
          {showMedia && shown === 'related' ? (
            <View style={styles.block}>
              <Text style={styles.sectionTitle}>{i18n.nEgAlsoMuscles}</Text>
              {g?.muscles.length ? (
                <RelatedList
                  items={related.muscle}
                  busy={libraryBusy}
                  failed={libraryFailed ? i18n.nLoadFailed : null}
                  empty={i18n.nEgNoRelated}
                  styles={styles}
                  tint={c.mutedForeground}
                />
              ) : (
                <Text style={styles.emptyHint}>{i18n.nEgNoMuscles}</Text>
              )}
            </View>
          ) : null}
          </Animated.View>
        </View>
      </ScrollView>

      {/*
        ── KHU HÀNH ĐỘNG Ở ĐÁY ──

        Neo vào đáy chứ không cuộn theo: ảnh tham chiếu đặt nó cố định, và một
        CTA trôi mất khi cuộn thì không còn là CTA.

        **Nút lớn ĐÓNG sheet.** Đó là hành động thật duy nhất tồn tại ở đây:
        màn này chỉ mở được từ trong một buổi tập đang chạy (luật 4 của cổng
        canh rằng có đúng MỘT lối vào, từ `day-plan`), nên người đọc nó đang
        làm chính bài ấy. "Bắt đầu bài tập" = thôi đọc, quay lại làm. Cùng một
        lệnh `nav.back()` với dấu ✕ và cú vuốt xuống — KHÔNG có hành vi sản
        phẩm mới nào được thêm, đúng như đặt hàng dặn.

        **Dấu trang thì KHÔNG bấm được.** Không có kho nào để lưu vào, và đặt
        hàng cấm đụng schema, migration lẫn mô hình dữ liệu của màn này. Một
        cái nút bật/tắt một trạng thái không tồn tại là nói dối; một hình vẽ
        giữ chỗ thì không. Nên nó được dựng như hàng tab: không `onPress`, và
        giấu khỏi cây trợ năng.
      */}
      {showMedia ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.nEgStart}
            onPress={() => {
              Haptics.selectionAsync();
              nav.back();
            }}
            style={styles.cta}>
            <Text style={styles.ctaText}>{i18n.nEgStart}</Text>
          </PressScale>
          <View
            style={styles.mark2}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
            <Icon icon={Bookmark} size={18} color={c.foreground} />
          </View>
        </View>
      ) : null}

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
        style={styles.close}>
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

/*
  ── hình học của nút đóng, và vì sao nó KHÔNG cộng `insets.top` ──

  Bản trước đặt nút ở `insets.top + spacing.sm`. Trên bản web `insets.top` là 0
  nên mọi ảnh chụp đều đẹp; trên MÁY THẬT nó là ~62, và đo trên ảnh chủ dự án
  gửi thì cái đĩa rơi xuống đúng 70đ dưới mép sheet — tức đúng chỗ tên bài.
  Ảnh cho thấy "Dumbbell Curl" bị che thành "mbbell Curl".

  `presentation: 'modal'` dựng một pageSheet: mép trên của nó ĐÃ nằm dưới thanh
  trạng thái (đo được 56đ trên cùng ảnh ấy). Cộng thêm inset của cửa sổ là cộng
  hai lần. Và đó cũng là điều `SheetHeader` — thanh đầu dùng chung của mọi sheet
  trong app — đã làm đúng từ đầu: `root: { paddingTop: spacing.sm }`, không
  inset nào. Màn này đi lệch khỏi quy ước ấy, nay quay về.

  ── và hai con số nay BUỘC VÀO NHAU ──

  Lỗi trên không phải "một số sai" mà là "hai số trôi khỏi nhau": vị trí nút
  tính theo `insets`, còn khoảng tránh của tên bài là một hằng số viết tay. Nên
  `TITLE_CLEAR` dưới đây được DẪN RA từ đúng những số dựng nên cái nút và thanh
  vuốt. Đổi bất kỳ số nào trong đó thì khoảng tránh tự đi theo.
*/
/**
 * Bốn tab, theo đúng thứ tự ảnh tham chiếu.
 *
 * Danh sách nằm ngoài component nên nó không được dựng lại mỗi lượt vẽ, và
 * `key` là KHOÁ CHỮ chứ không phải chuỗi đã dịch: dùng nhãn làm `key` của React
 * thì đổi ngôn ngữ giữa chừng sẽ dựng lại cả bốn viên.
 */
type GuideTab = 'overview' | 'muscles' | 'equipment' | 'related';
const TABS: { id: GuideTab; key: 'nEgTabOverview' | 'nEgTabMuscles' | 'nEgTabEquipment' | 'nEgTabRelated' }[] = [
  { id: 'overview', key: 'nEgTabOverview' },
  { id: 'muscles', key: 'nEgTabMuscles' },
  { id: 'equipment', key: 'nEgTabEquipment' },
  { id: 'related', key: 'nEgTabRelated' },
];

/**
 * Danh sách bài khác — CHỮ, không phải nút.
 *
 * Mỗi dòng là tên một bài có thật trong thư viện, kèm nhóm cơ của nó. Không
 * `onPress`: mở hướng dẫn của một bài khác từ đây sẽ làm nút lớn ở đáy nói dối
 * — nó quay về buổi tập đang chạy, và buổi ấy không có bài vừa mở. Nhưng nó
 * KHÔNG bị giấu khỏi cây trợ năng như dấu trang: đây là chữ đọc được, và thứ
 * cần giấu là một lời hứa suông chứ không phải một câu thông tin.
 *
 * Ba trạng thái, và chúng không được gộp: đang đọc thư viện (vòng quay), đọc
 * xong mà không có gì (câu `empty` do người gọi đưa, vì lý do rỗng khác nhau ở
 * hai tab), và có danh sách.
 */
function RelatedList({
  title,
  items,
  busy,
  failed,
  empty,
  styles,
  tint,
}: {
  title?: string;
  items: RelatedItem[];
  busy: boolean;
  /** câu để nói khi thư viện đọc HỎNG — chuỗi, không phải `true`/`false` */
  failed: string | null;
  empty?: string;
  styles: ReturnType<typeof stylesFor>;
  tint: string;
}) {
  if (busy) {
    return (
      <View style={styles.busy}>
        <ActivityIndicator color={tint} />
      </View>
    );
  }
  /*
    ── ĐỌC HỎNG không phải "KHÔNG CÓ" ──

    Cùng lớp lỗi mà `guide-media.tsx` đã phải sửa: một danh sách rỗng gộp ba
    sự thật khác nhau. Thư viện đọc hỏng thì `data` là `undefined`, phép lọc
    trả mảng rỗng, và nếu ở đây nói "thư viện chưa có bài nào khác" thì đó là
    một KHẲNG ĐỊNH SAI về dữ liệu của người dùng — họ có thể có ba mươi bài.
  */
  if (failed) return <Text style={styles.emptyHint}>{failed}</Text>;
  if (!items.length) return empty ? <Text style={styles.emptyHint}>{empty}</Text> : null;
  return (
    <View style={styles.also}>
      {title ? <Text style={styles.alsoTitle}>{title}</Text> : null}
      <View style={styles.alsoList}>
        {items.map((r) => (
          <View key={r.id} style={styles.alsoRow}>
            <Text style={styles.alsoName} numberOfLines={1}>
              {r.name}
            </Text>
            <Text style={styles.alsoMeta} numberOfLines={1}>
              {r.muscleLabel}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Một BƯỚC có hình — ảnh, số, tiêu đề, mô tả.
 *
 * ── vì sao nó bấm được, và bấm ra cái gì ──
 *
 * Tấm ảnh ở đây bị thu nhỏ vào lề chữ; chi tiết giải phẫu mà nó vẽ ra thì
 * không đọc được ở cỡ ấy. Nên chạm vào là mở ĐÚNG tấm ấy ở màn toàn màn đã có
 * — `media-viewer` nhận thêm `i`, không có màn nào mới, không có cách xem thứ
 * hai nào được dựng.
 *
 * Nhãn trợ năng là chú thích ĐÃ bản địa hoá (`mediaLabel`), không bao giờ là
 * tên tệp. Mô tả không vào nhãn: nó nằm ngay dưới dưới dạng chữ đọc được, và
 * đọc nó hai lần là tiếng ồn.
 */
function MediaStep({
  item,
  index,
  name,
  styles,
  reduced,
  onOpen,
}: {
  item: MediaItem;
  index: number;
  name: string;
  styles: ReturnType<typeof stylesFor>;
  reduced: boolean;
  onOpen: () => void;
}) {
  const label = mediaLabel(name, item) ?? item.alt ?? name;
  return (
    <View style={styles.step4}>
      {/*
        `button`, KHÔNG `imagebutton` — và đây là một phép đo.

        `imagebutton` là vai chính xác hơn trên iOS ("ảnh, nút"). Nhưng đo trên
        bản dựng web thật: react-native-web KHÔNG phát ra thuộc tính `role` nào
        cho nó, chỉ còn `aria-label` — tức trên web nó là một `<div>` có nhãn mà
        không ai được kể rằng bấm được. `button` được cả hai nền phát ra đúng,
        và nó vẫn nói thật: việc của thứ này là MỞ tấm ảnh ra toàn màn.

        Cùng lớp phát hiện với `accessibilityState` ở hàng tab — xem chỗ ấy.
      */}
      <PressScale accessibilityRole="button" accessibilityLabel={label} onPress={onOpen}>
        <Image
          source={{ uri: item.uri }}
          style={styles.step4Img}
          contentFit="contain"
          transition={reduced ? 0 : 200}
          /* `accessible={false}`: cái bọc `PressScale` ĐÃ mang nhãn, nên để ảnh
             tự giới thiệu nữa là bộ đọc màn hình đọc cùng một câu hai lần. */
          accessible={false}
        />
      </PressScale>
      <View style={styles.step4Row}>
        <View style={styles.step}>
          <Text style={styles.stepNo}>{index + 1}</Text>
        </View>
        <View style={styles.step4Text}>
          <Text style={styles.step4Title}>{item.title}</Text>
          {item.description ? (
            <Text style={styles.step4Desc}>{item.description}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const CLOSE = 44;
const CLOSE_TOP = spacing.sm;
/** Hằng cho nhánh "chưa đọc xong" — `g` là `null` thì chưa biết gì cả. */
const NO_MEDIA: MediaState = { type: 'none', items: [] };
const GRAB = { top: 12, h: 5, bottom: 12 };
/** đáy đĩa đóng − đáy khối thanh vuốt − khoảng cách giữa các con của mặt giấy */
const TITLE_CLEAR =
  CLOSE_TOP + CLOSE - (GRAB.top + GRAB.h + GRAB.bottom) - spacing.xs;
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
    /* 48 (CTA) + hai lề + chỗ cho `insets.bottom` — nội dung không được
       chui xuống dưới khu hành động neo đáy. */
    paddingBottom: 48 + spacing.xl + spacing.xl,
    gap: spacing.xs,
  },
  /* Không có hình dẫn thì không có gì để nhìn xuyên qua — mặt giấy đục hẳn. */
  surfaceOpaque: { backgroundColor: c.card },

  /* Tên bài + siêu dữ liệu bên trái, nút play bên phải, đáy căn theo dòng
     siêu dữ liệu. `minWidth: 0` để tên dài cắt bớt thay vì đẩy nút ra ngoài. */
  headRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  headText: { flex: 1, minWidth: 0, gap: spacing.xs },
  play: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },

  /*
    Hàng tab: một rãnh mờ, viên đang chọn được tô nhạt.

    `alpha(m.ink, …)` chứ không phải một token màu: nó phải đọc ra là một lớp
    VẬT LIỆU trên kính, và mực của theme tự lật chiều. Không viền — đặt hàng
    nói thẳng *"no heavy border"*.
  */
  tabs: {
    flexDirection: 'row',
    borderRadius: radius.full,
    backgroundColor: alpha(m.ink, 0.06),
    padding: 3,
    marginTop: spacing.md,
  },
  tabsOnGlass: { backgroundColor: alpha(m.ink, 0.1) },
  /*
    ── `paddingHorizontal` KHÔNG phải trang trí, và nó là một PHÉP ĐO ──

    Bốn viên chia đều bề rộng. Trên máy 402 mỗi viên được (402−48−6)/4 ≈ 87
    điểm và mọi nhãn đều vừa. Trên màn 320 — iPhone SE — mỗi viên chỉ còn 66,
    và ảnh chụp bản dựng cho thấy "Tổng quan" dính liền "Cơ tác đ…": không có
    lề ngang nào, nên hai nhãn chạm nhau và đọc ra như MỘT chuỗi.

    Nhãn dài nhất cũng được đổi cùng lúc, vì lề ngang một mình không cứu được
    một chuỗi 11 ký tự trong 66 điểm — xem `nEgTabMuscles` ở `native-strings.ts`.
  */
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: { backgroundColor: alpha(m.ink, 0.12) },
  tabText: { ...type.footnote, color: c.mutedForeground },
  /* Chỉ CỠ đổi, màu và nét giữ nguyên — xem `tightTabs`. */
  tabTextTight: { fontSize: type.caption.fontSize },
  tabTextOn: { color: c.foreground, fontWeight: '600' },

  /*
    ── khu hành động: neo đáy, nổi trên dòng cuộn ──

    CTA lấy `c.foreground` làm nền và `c.card` làm chữ, nên nó SÁNG trên bản
    tối và TỐI trên bản sáng — đúng cả hai ảnh tham chiếu, và đúng lời dặn
    *"Do not make the CTA dark in dark mode."* Đo được: 16,46:1 ở bản tối,
    17,57:1 ở bản sáng.

    Cao 48: ảnh tham chiếu đo được 46,3đ, và 48 là bậc nút lớn quen thuộc của
    iOS — chênh 1,7đ, đổi lại một vùng chạm tử tế.
  */
  footer: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cta: {
    flex: 1,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: c.foreground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...type.headline, color: c.card },
  mark2: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    height: GRAB.h,
    borderRadius: GRAB.h / 2,
    backgroundColor: c.border,
    alignSelf: 'center',
    marginTop: GRAB.top,
    marginBottom: GRAB.bottom,
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
  titleClearsClose: { marginTop: TITLE_CLEAR },
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

  /*
    ── ô hình giải phẫu ──

    `c.secondary`, cùng token với đĩa số và nút mở media ngay trên cùng tờ
    giấy. KHÔNG `m.inset.bg`: `tools/on-page-fill.mjs` ghi lại năm lần cùng một
    lỗi — trên bản sáng `inset.bg` ĐÚNG BẰNG nền trang, nên một khối dùng nó
    đứng ở chỗ không có mặt thẻ phía sau sẽ tan vào nền. Ở đây thì có mặt giấy
    thật ở sau, nhưng mặt ấy là KÍNH, và một chỗ "lõm" vào kính không có nghĩa.
    `c.secondary` là bậc nền đặc mà ba thứ khác trên cùng tờ giấy này đã dùng.

    `wrap` vì `Lưng/Chân` là hai hình và cỡ chữ trợ năng lớn làm nhãn rộng ra;
    hai hình 64 điểm cộng lề vẫn vừa một hàng trên máy 402, ba thì xuống dòng.
  */
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: c.secondary,
  },
  tileName: { ...type.footnote, fontWeight: '600', color: c.foreground },

  /*
    ── danh sách bài khác ──

    Tên ở hạng `body` như mọi câu nội dung khác của màn; nhóm cơ xuống
    `caption` và `mutedForeground`, tức hạng phụ — nó trả lời "vì sao bài này ở
    đây", không phải "bài này tên gì".

    Tiêu đề có khoảng trống lớn hơn ở trên: cùng luật với `block`, khoảng trống
    TRÊN một tiêu đề phải nhiều hơn khoảng trống dưới nó.
  */
  also: { marginTop: spacing.md, gap: spacing.sm },
  alsoTitle: { ...type.footnote, fontWeight: '600', color: c.mutedForeground },
  /*
    12 giữa hai dòng, 1 bên trong một dòng.

    `list` dùng chung cho mọi danh sách của màn này có `gap: 4`, và ở đây 4 là
    SAI: mỗi mục là HAI dòng chữ (tên + nhóm cơ), nên khoảng cách trong một mục
    phải nhỏ hơn hẳn khoảng cách giữa hai mục — không thì bốn mục đọc ra thành
    tám dòng rời. Đo trên ảnh chụp bản dựng: với gap 4, "Ngực" của mục trên
    cách "A Video" của mục dưới đúng bằng khoảng cách của chính nó tới tên nó.
  */
  alsoList: { gap: spacing.sm + spacing.xs },
  alsoRow: { gap: 1 },
  alsoName: { ...type.body, color: c.foreground },
  alsoMeta: { ...type.caption, color: c.mutedForeground },

  /*
    ── một bước có hình ──

    ── CHIỀU CAO CỐ ĐỊNH, không phải một TỈ LỆ, và đó là một phép đo ──

    Bản đầu dùng `aspectRatio: 3/4` cho khớp khung hình dẫn. Ảnh chụp bản dựng
    cho thấy vì sao đó là sai chỗ: ở lề chữ 354 điểm, 3:4 cho **472 điểm**, tức
    một tấm ảnh cao hơn cả vùng nội dung đang thấy — chú thích của chính nó bị
    đẩy khỏi màn, nên người ta đọc lời giải thích ở một màn khác với thứ nó
    giải thích. Đặt hàng dựng thứ tự *ảnh → số → tiêu đề → mô tả* thành một
    khối ĐỌC CÙNG NHAU; một tấm ảnh chiếm trọn màn phá đúng điều đó.

    340 + chú thích ≈ 430 điểm, nên hai bước vừa một màn sau khi mặt giấy trượt
    lên. Và nó là một CHIỀU CAO chứ không phải tỉ lệ vì ở đây chưa ai biết
    trước hình dạng của asset thật: một con số tỉ lệ là một lời đoán về kích
    thước tấm ảnh chưa có.

    `contain` chứ không `cover`: bốn tấm minh hoạ là ảnh DỌC của một hình nộm
    đứng cả người. `cover` trong một khung thấp hơn sẽ cắt mất đầu và chân —
    đúng những phần mà tấm "tư thế bắt đầu" tồn tại để cho xem. Nền đệm quanh
    ảnh là lớp `alpha(m.ink, 0.05)` của chính ô.

    Bo `radius.md` vì ở đây nó là một KHỐI trong lề chữ, khác hình dẫn tràn lề
    không bo góc nào.

    Con số và chữ dùng lại `styles.step`/`styles.stepNo` — đúng cái đĩa số mà
    mục "Cách thực hiện" đã dùng, nên hai loại bước đọc ra cùng một ngôn ngữ
    thị giác thay vì hai.
  */
  steps4: { marginTop: spacing.lg, gap: spacing.xl },
  step4: { gap: spacing.sm },
  step4Img: {
    width: '100%',
    height: 340,
    borderRadius: radius.md,
    backgroundColor: alpha(m.ink, 0.05),
  },
  step4Row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  step4Text: { flex: 1, minWidth: 0, gap: 2 },
  step4Title: { ...type.headline, color: c.foreground },
  step4Desc: { ...type.body, color: c.mutedForeground, lineHeight: 21 },

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
    top: CLOSE_TOP,
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
