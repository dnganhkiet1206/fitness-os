import { Image } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { NativeStrings } from '@/lib/native-strings';

/**
 * Hình minh hoạ của một bài tập — và cái chỗ trống khi chưa có hình.
 *
 * ── CÓ hình thì to, KHÔNG có thì nhỏ ──
 *
 * Đây là nguyên tắc chủ dự án chốt, và nó không phải khẩu vị. Cột `video_url`
 * của bảng `exercises` mặc định chuỗi rỗng và cả mười dòng seed đều trống, nên
 * hôm nay "không có hình" là trường hợp THƯỜNG, không phải ngoại lệ. Giữ một ô
 * 16:10 cho nó là dành một phần ba màn cho một thứ không tồn tại, và đẩy điểm
 * kỹ thuật — thứ người ta mở hướng dẫn để đọc — xuống dưới nếp gấp.
 *
 * Nên khung 16:10 chỉ tồn tại khi có media thật. Không có thì đây là một DÒNG:
 * một glyph, một câu, cao bằng một khối thông tin nhỏ. Không hộp nào biến mất
 * và không bố cục nào nhảy — thứ đổi là chiều cao, vì nội dung bên trong đổi.
 *
 * ── vì sao có `expo-video`, và vì sao nó tối giản đến mức này ──
 *
 * `video_url` là cột có thật trong schema từ migration đầu tiên, và một đoạn
 * minh hoạ ngắn là NĂNG LỰC CỐT LÕI của hướng dẫn chứ không phải trang trí.
 * `expo-image` vẽ được ảnh động nhưng không vẽ được `.mp4`, nên nếu không có
 * thư viện video thì mọi URL video thật sẽ rơi vào nhánh hỏng.
 *
 * Thứ dựng ra ở đây KHÔNG phải một trình phát:
 *
 *     nativeControls={false}    không nút, không thanh tua, không toàn màn
 *     muted                     phòng tập đã đủ ồn, và không ai muốn app hét
 *     loop                      5 giây lặp, đúng như một ảnh động
 *     play() ngay               nó là minh hoạ, không phải nội dung để chọn xem
 *
 * Không tua, không âm lượng, không PiP, không "now playing". Một đoạn minh hoạ
 * cư xử như một hình vẽ biết động, không như một video mạng xã hội.
 *
 * ── "giảm chuyển động" ──
 *
 * Một vòng lặp vô tận LÀ chuyển động liên tục. Bật cài đặt ấy thì khung hình
 * đứng yên ở khung đầu: vẫn thấy được tư thế, không còn thứ nhấp nháy ở đuôi
 * mắt suốt lúc đọc.
 */

/* Cột tên là `video_url`, nên mặc định coi nó là VIDEO. Chỉ những đuôi ẢNH rõ
   ràng mới đi đường `expo-image` — ở đó ảnh động (GIF/WebP/APNG) chạy tốt hơn
   và rẻ hơn một trình giải mã video. */
const IMAGE_EXT = /\.(gif|webp|png|jpe?g|avif|heic|bmp)(\?|#|$)/i;

/*
  ── DEMO_HERO — TẠM THỜI ──

  `video_url` rỗng ở cả mười dòng hạt giống, nên nếu chờ media thật thì không ai
  xem được bố cục hình dẫn. Chủ dự án đưa một ảnh demo để đánh giá bố cục:
  *"lấy tạm hình này làm demo cho toàn bộ, sau này sẽ sửa"*.

  Nó KHÔNG phải một hệ media thứ hai: cùng `box`, cùng `heroFrame`, cùng
  component. Chỉ là một nguồn lùi khi chưa có url — hai chỗ mang dấu
  `DEMO_HERO`, ở đây và ở `exercise-guide.tsx`, và gỡ cả hai là xong.

  Nhãn trợ năng cố ý nói nó là ảnh MINH HOẠ TẠM, không nói nó là bản demo của
  bài tập đang mở: ảnh là một động tác cuốn tạ, và màn này mở cho bài nào cũng
  dùng nó. Thứ KHÔNG bị ảnh này che: trạng thái "bài này chưa có hướng dẫn" vẫn
  hiện như cũ, vì một tấm ảnh tạm không phải nội dung.
*/
const DEMO_HERO = require('../../../assets/images/exercise-demo.webp');
/*
  DEMO_HERO — thời lượng GIỮ CHỖ của ảnh tạm.

  Ảnh tham chiếu có nhãn `0:05` cạnh media, và đặt hàng cho phép dựng nó ở chế
  độ ảnh demo: *"it may display the demo duration placeholder required by the
  reference layout, but make the implementation clearly distinguishable from a
  real video duration."*

  Nó KHÔNG đi qua `secs` — đường của thời lượng thật — mà là một hằng riêng
  mang dấu `DEMO_HERO`. Gỡ ảnh tạm là gỡ luôn nó, và lúc ấy chip chỉ còn hiện
  khi trình giải mã thật sự đọc được một con số.
*/
const DEMO_SECS = 5;

/*
  ── CỬA DUY NHẤT vào `expo-video`, và nó có khoá ──

  `expo-video` gọi `requireNativeModule('ExpoVideo')` ở phạm vi module, nên chỉ
  riêng việc import nó đã NÉM trên một bản app chưa có phần native. Tệp này bị
  `exercise-guide.tsx` import, mà đó là một ROUTE — `expo-router` nạp mọi route
  lúc khởi động để kiểm cây route. Nên một import tĩnh ở đây làm CẢ APP không
  mở được, chứ không chỉ làm hỏng một màn.

  Đã xảy ra thật: `expo-video` vào từ `a13e648`, và mọi binary dựng trước commit
  ấy mở lên là chết trắng kèm một lỗi thứ hai đọc chẳng liên quan
  (`Cannot read property 'ErrorBoundary' of undefined`). `npm install` không sửa
  được, vì thứ thiếu là mã Swift.

  `require` trong `try/catch` thì lỗi ấy dừng lại ở đây. Metro vẫn đóng gói
  `guide-video.tsx` tĩnh — `require` này không phải import động — nên không có
  chunk nào phải tải lúc chạy; thứ được hoãn là việc GỌI vào native.
*/
const GuideVideo: typeof import('./guide-video').GuideVideo | null = (() => {
  try {
    return (require('./guide-video') as typeof import('./guide-video')).GuideVideo;
  } catch {
    return null;
  }
})();

export function GuideMedia({
  url,
  name,
  hasCues,
  hero = false,
  coveredBy = 0,
  i18n,
}: {
  /** `video_url` của dòng thư viện, đã trim. `null` khi chưa có gì. */
  url: string | null;
  /** tên bài tập, cho nhãn trợ năng */
  name: string;
  /**
   * Có điểm kỹ thuật nào ở DƯỚI không.
   *
   * Câu an ủi của chỗ trống — *"các điểm kỹ thuật bên dưới vẫn mô tả động
   * tác"* — là một khẳng định về nội dung của màn, và nó SAI khi không có
   * điểm kỹ thuật nào. Đo được: một bài người dùng tự thêm chỉ có nhóm cơ và
   * dụng cụ vẫn in ra câu ấy, rồi bên dưới không có gì cả. Nên ô media phải
   * được CHO BIẾT, chứ không được đoán.
   */
  hasCues: boolean;
  /**
   * Vẽ như HÌNH DẪN tràn lề của màn hướng dẫn, thay vì một khối gọn trong lề.
   *
   * Chỗ gọi chỉ bật cờ này khi `url` khác `null` — có gì để dẫn thì mới dẫn.
   * Và khi đã bật, khung ĐỨNG NGUYÊN kể cả lúc tải hỏng: thu nó lại giữa lúc
   * người ta đang đọc là một cú nhảy bố cục, đúng thứ đặt hàng cấm.
   */
  hero?: boolean;
  /**
   * Bao nhiêu ĐIỂM ở đáy khung bị mặt giấy che.
   *
   * Khung hình cao hết 3:4, nhưng mặt giấy chồng lên 28% đáy của nó — nên một
   * nhãn neo vào `bottom: 0` rơi vào vùng không ai thấy. Đã xảy ra: chip thời
   * lượng có trong cây nhưng khuất hẳn sau kính.
   *
   * Khung KHÔNG tự biết con số ấy (nó là quyết định bố cục của màn), nên chỗ
   * gọi phải nói ra. 0 nghĩa là không bị che gì.
   */
  coveredBy?: number;
  i18n: NativeStrings;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const reduced = useReducedMotion();

  /* Media hỏng là chuyện của MÁY chứ không của dữ liệu: đường dẫn đúng vẫn 404
     được. Nên cả hai đều là state cục bộ. */
  const [imgBroke, setImgBroke] = useState(false);
  /* Thời lượng THẬT, chỉ có khi trình giải mã đã đọc được — xem `onDuration`
     trong `guide-video.tsx`. `null` nghĩa là CHƯA BIẾT, không phải 0 giây. */
  const [secs, setSecs] = useState<number | null>(null);
  const [vidBroke, setVidBroke] = useState(false);
  const onVideoFail = useCallback(() => setVidBroke(true), []);
  const onDuration = useCallback((d: number) => setSecs(d), []);

  const isImage = !!url && IMAGE_EXT.test(url);
  const videoUrl = url && !isImage ? url : null;

  /* Thiếu phần native thì URL video ấy KHÔNG tải được — và đó đúng nghĩa là
     "không tải được", không phải "chưa có hình". Có một đoạn minh hoạ; máy này
     mở không nổi. */
  const showVideo = !!videoUrl && !!GuideVideo && !vidBroke;
  const showImage = isImage && !imgBroke;
  const alt = i18n.nEgMediaAlt.replace('{v}', name);

  /*
    ── CHIP THỜI LƯỢNG ──

    Ảnh tham chiếu có một nhãn `0:05` gắn với media. Ở đây nó có HAI nguồn rất
    khác nhau, và mã phân biệt chúng rõ ràng vì một trong hai là tạm:

      · media THẬT  → `secs`, đọc từ chính trình giải mã
      · DEMO_HERO   → `DEMO_SECS`, một con số giữ chỗ

    Hằng `DEMO_SECS` mang đúng dấu `DEMO_HERO` như hai chỗ kia, nên khi ảnh tạm
    được gỡ thì nó đi cùng, và chip chỉ còn hiện khi có thời lượng thật. Không
    có thời lượng thì KHÔNG vẽ chip — một ô trống còn thật hơn một con số bịa.
  */
  const clock = useMemo(() => {
    if (secs === null) return null;
    const t = Math.max(0, Math.round(secs));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }, [secs]);

  if (showVideo) {
    return (
      <View style={[styles.box, styles.heroFrame]}>
        <GuideVideo
          url={videoUrl}
          alt={alt}
          reduced={reduced}
          style={styles.fill}
          onFail={onVideoFail}
          onDuration={onDuration}
        />
        {hero && clock ? <Clock label={clock} styles={styles} lift={coveredBy} /> : null}
      </View>
    );
  }

  /* DEMO_HERO: chưa có url thật nhưng đang ở vai hình dẫn. */
  if (!url && hero) {
    return (
      <View style={[styles.box, styles.heroFrame]}>
        <Image
          source={DEMO_HERO}
          style={styles.fill}
          contentFit="cover"
          accessibilityLabel={i18n.nEgMediaDemo}
          accessible
        />
        {/* DEMO_HERO */}
        <Clock label={`0:${String(DEMO_SECS).padStart(2, '0')}`} styles={styles} lift={coveredBy} />
      </View>
    );
  }

  if (showImage) {
    return (
      <View style={[styles.box, styles.heroFrame]}>
        <Image
          source={{ uri: url! }}
          style={styles.fill}
          contentFit="cover"
          autoplay={!reduced}
          transition={reduced ? 0 : 200}
          onError={() => setImgBroke(true)}
          accessibilityLabel={alt}
          accessible
        />
      </View>
    );
  }

  /* ── chỗ trống, và nó GỌN ──
     Hỏng thì nói hỏng; chưa có thì nói chưa có, kèm một câu bảo rằng phần chữ
     bên dưới vẫn mô tả được động tác. Hai câu khác nhau vì hai sự thật khác
     nhau — xem `tools/empty-vs-failed.mjs`. */
  const failed = vidBroke || imgBroke || (!!videoUrl && !GuideVideo);
  return (
    <View
      style={[styles.box, hero ? styles.heroEmpty : styles.compact]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={failed ? i18n.nEgMediaFailed : i18n.nEgNoMedia}>
      <Icon icon={ImageOff} size={16} color={c.mutedForeground} />
      <View style={hero ? styles.heroText : styles.compactText}>
        <Text style={styles.compactTitle}>
          {failed ? i18n.nEgMediaFailed : i18n.nEgNoMedia}
        </Text>
        {!failed && hasCues ? (
          <Text style={styles.compactHint}>{i18n.nEgNoMediaHint}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Nhãn thời lượng, góc dưới-phải của khung hình.
 *
 * Không nhận chạm và giấu khỏi cây trợ năng: nó là một CON SỐ về media, và
 * nhãn trợ năng của chính khung hình đã nói khung ấy là gì. Đọc thêm "0:05"
 * giữa lúc người ta đang dò tìm nội dung là tiếng ồn.
 */
function Clock({
  label,
  styles,
  lift,
}: {
  label: string;
  styles: ReturnType<typeof stylesFor>;
  /** đẩy lên khỏi phần đáy bị mặt giấy che — xem `coveredBy` */
  lift: number;
}) {
  return (
    <View
      style={[styles.clock, { bottom: lift + spacing.md }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text style={styles.clockText}>{label}</Text>
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  box: {
    overflow: 'hidden',
    backgroundColor: alpha(m.ink, 0.05),
  },
  /*
    ── HÌNH DẪN: 3:4, tràn lề, không bo góc ──

    Tỉ lệ cũ là 16:10, đúng cho thời nó là một cái THẺ nằm trong lề 16. Ảnh
    tham chiếu của chủ dự án thì dựng hình thành phần trên của cả màn: trên một
    máy 402×874, 3:4 cho 536 điểm, tức 61% chiều cao — khớp với ảnh. 16:10 ở
    vai trò ấy chỉ cho 251 điểm và đọc ra vẫn là một cái thẻ.

    Không `borderRadius`: hai mép trên chạy thẳng ra rìa máy, còn hai mép dưới
    được che bởi góc bo của mặt giấy chồng lên — xem `surfaceOverlap` trong
    `exercise-guide.tsx`. Bo ở cả hai chỗ là bo hai lần.

    Tỉ lệ ở style RIÊNG chứ không ở `box` rồi gỡ ra, vì gỡ bằng
    `aspectRatio: undefined` KHÔNG chạy: React Native bỏ qua giá trị `undefined`
    lúc gộp style — nó không ghi đè gì cả. Cộng vào thì chạy; trừ đi thì không.
  */
  heroFrame: { aspectRatio: 3 / 4 },
  /* Mực TRẮNG trên một lớp đen 55%: chip nổi trên một tấm ảnh chưa ai biết
     trước màu gì, nên nó phải mang nền của chính nó. Trắng trên đen-55%-trên-
     trắng cho 4,76:1 — đo bằng cách quét cả thang xám 0..255 phía sau, nên nó đạt sàn 4,5 với MỌI hình minh hoạ. */
  clock: {
    position: 'absolute',
    right: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  clockText: { ...type.caption, color: '#ffffff', fontVariant: ['tabular-nums'] },
  fill: { width: '100%', height: '100%' },

  /* Hỏng mà ĐANG ở vai trò hình dẫn: khung giữ nguyên chiều cao, câu báo nằm
     giữa. Thu khung lại là cú nhảy bố cục. */
  heroEmpty: {
    aspectRatio: 3 / 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  heroText: { alignItems: 'center', gap: 2 },

  /* Một khối thông tin nhỏ: một hàng, glyph bên trái, chữ bên phải. */
  compact: {
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  compactText: { flex: 1, minWidth: 0, gap: 1 },
  compactTitle: { ...type.footnote, color: c.foreground },
  compactHint: { ...type.caption, color: c.mutedForeground },
}));
