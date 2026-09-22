import { Image } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import { useCallback, useState } from 'react';
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
  i18n: NativeStrings;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const reduced = useReducedMotion();

  /* Media hỏng là chuyện của MÁY chứ không của dữ liệu: đường dẫn đúng vẫn 404
     được. Nên cả hai đều là state cục bộ. */
  const [imgBroke, setImgBroke] = useState(false);
  const [vidBroke, setVidBroke] = useState(false);
  const onVideoFail = useCallback(() => setVidBroke(true), []);

  const isImage = !!url && IMAGE_EXT.test(url);
  const videoUrl = url && !isImage ? url : null;

  /* Thiếu phần native thì URL video ấy KHÔNG tải được — và đó đúng nghĩa là
     "không tải được", không phải "chưa có hình". Có một đoạn minh hoạ; máy này
     mở không nổi. */
  const showVideo = !!videoUrl && !!GuideVideo && !vidBroke;
  const showImage = isImage && !imgBroke;
  const alt = i18n.nEgMediaAlt.replace('{v}', name);

  if (showVideo) {
    return (
      <View style={[styles.box, styles.frame]}>
        <GuideVideo
          url={videoUrl}
          alt={alt}
          reduced={reduced}
          style={styles.fill}
          onFail={onVideoFail}
        />
      </View>
    );
  }

  if (showImage) {
    return (
      <View style={[styles.box, styles.frame]}>
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
      style={[styles.box, styles.compact]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={failed ? i18n.nEgMediaFailed : i18n.nEgNoMedia}>
      <Icon icon={ImageOff} size={16} color={c.mutedForeground} />
      <View style={styles.compactText}>
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

const stylesFor = makeStyles((c, m) => ({
  box: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: alpha(m.ink, 0.05),
  },
  /*
    16:10 CHỈ khi có media thật.

    Nó ở style riêng chứ không ở `box` rồi gỡ ra, vì gỡ bằng
    `aspectRatio: undefined` KHÔNG chạy: React Native bỏ qua giá trị `undefined`
    lúc gộp style — nó không ghi đè gì cả. Cộng vào thì chạy; trừ đi thì không.
  */
  frame: { aspectRatio: 16 / 10 },
  fill: { width: '100%', height: '100%' },

  /* Một khối thông tin nhỏ: một hàng, glyph bên trái, chữ bên phải. */
  compact: {
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
