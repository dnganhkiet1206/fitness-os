import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Đoạn minh hoạ, và là tệp DUY NHẤT trong app import `expo-video`.
 *
 * ── vì sao nó phải là một tệp riêng ──
 *
 * `expo-video/build/NativeVideoModule.js` gọi `requireNativeModule('ExpoVideo')`
 * ở PHẠM VI MODULE:
 *
 *     export default requireNativeModule('ExpoVideo');
 *
 * Nghĩa là chỉ riêng việc `import` gói ấy đã ném, nếu bản app đang chạy chưa
 * có phần native. Và `guide-media.tsx` được `exercise-guide.tsx` import, mà
 * `exercise-guide.tsx` là một ROUTE — `expo-router` nạp mọi route lúc khởi
 * động để kiểm cây route (`validateRouteTreeExports`). Nên một module native
 * thiếu không làm hỏng màn hướng dẫn: nó làm CẢ APP không mở được, kèm một
 * lỗi thứ hai đọc chẳng liên quan gì (`Cannot read property 'ErrorBoundary' of
 * undefined`, vì route nạp hụt trả về `undefined`).
 *
 * Chuyện đó đã xảy ra thật: `expo-video` được thêm vào ở `a13e648`, và bất kỳ
 * binary nào dựng TRƯỚC commit ấy — máy của chủ dự án, máy người khác, mọi bản
 * TestFlight cũ — mở lên là chết trắng. `npm install` không sửa được, vì thứ
 * thiếu là mã Swift chứ không phải mã JS.
 *
 * Nên cửa vào `expo-video` được dồn vào đúng một chỗ, và `guide-media.tsx`
 * mở cửa ấy bằng `require` trong `try/catch`. Thiếu phần native thì app vẫn
 * chạy và ô media rơi vào trạng thái "không tải được hình minh hoạ" — một câu
 * ĐÚNG: có một URL, và máy không mở được nó.
 *
 * ── nó vẫn không phải một trình phát ──
 *
 *     nativeControls={false}    không nút, không thanh tua, không toàn màn
 *     muted                     phòng tập đã đủ ồn
 *     loop                      5 giây lặp, đúng như một ảnh động
 *     play() ngay               là minh hoạ, không phải nội dung để chọn xem
 *
 * "Giảm chuyển động" thì đứng ở khung đầu: vẫn thấy tư thế, không còn thứ
 * nhấp nháy ở đuôi mắt suốt lúc đọc.
 */
export function GuideVideo({
  url,
  alt,
  reduced,
  style,
  onFail,
  onDuration,
  controls = false,
}: {
  /** URL video đã xác định — không bao giờ `null` ở đây. */
  url: string;
  /** nhãn trợ năng */
  alt: string;
  /** người dùng đã xin giảm chuyển động */
  reduced: boolean;
  style: StyleProp<ViewStyle>;
  /** một URL đúng vẫn 404 được; chỗ gọi cần biết để đổi sang trạng thái hỏng */
  onFail: () => void;
  /**
   * Thời lượng THẬT, giây, khi trình giải mã đã đọc được nó.
   *
   * Chỉ gọi khi `> 0`: `player.duration` là 0 suốt lúc `loading`, và một chip
   * "0:00" trên hình là một con số SAI chứ không phải một con số chưa có.
   */
  onDuration?: (seconds: number) => void;
  /**
   * Điều khiển gốc của hệ điều hành — phát/dừng, thanh tiến trình, thời gian.
   *
   * MẶC ĐỊNH TẮT, và đó là quyết định của khung hình dẫn: ở đó đoạn minh hoạ
   * tự chạy, lặp, tắt tiếng, và một trình phát đầy nút nói ngược lại hành vi
   * ấy — đã ghi ở đầu tệp và `tools/exercise-guide.mjs` canh nó.
   *
   * BẬT ở màn xem toàn màn, nơi người ta chủ động mở video ra để xem: ở đó
   * không có điều khiển mới là thiếu. Và dùng điều khiển GỐC chứ không tự vẽ —
   * `AVPlayerViewController` mang sẵn tua, tốc độ, phụ đề và AirPlay, tất cả
   * đúng cử chỉ mà người dùng iOS đã biết.
   */
  controls?: boolean;
}) {
  const player = useVideoPlayer(url, (p) => {
    /* Toàn màn thì KHÔNG lặp và KHÔNG tắt tiếng: người ta vừa chủ động mở nó
       ra. Khung dẫn thì ngược lại — xem `controls`. */
    p.loop = !controls;
    p.muted = !controls;
    if (!reduced && !controls) p.play();
  });

  /* `status` đọc qua sự kiện chứ không đọc một lần: một video đang tải sẽ đi
     qua `loading` → `readyToPlay`, và lỗi mạng tới SAU khi component đã dựng. */
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const broke = status === 'error';

  useEffect(() => {
    if (broke) onFail();
  }, [broke, onFail]);

  /* Thời lượng chỉ có nghĩa từ `readyToPlay` trở đi — trước đó `duration` là 0.
     Đọc trong hiệu ứng theo `status` chứ không đọc mỗi lần render: nó là một
     giá trị của TRÌNH PHÁT, không phải một giá trị của React. */
  useEffect(() => {
    if (status !== 'readyToPlay') return;
    const d = player.duration;
    if (d > 0) onDuration?.(d);
  }, [status, player, onDuration]);

  /* Trả `null` NGAY thay vì đợi chỗ gọi dựng lại: giữa hai thứ đó là một khung
     hình có một trình phát vỡ trên màn. */
  if (broke) return null;

  return (
    <VideoView
      player={player}
      style={style}
      contentFit="cover"
      nativeControls={controls}
      /* Một minh hoạ không đi đâu cả: không toàn màn, không cửa sổ nổi.
         `fullscreenOptions.enable` chứ không phải `allowsFullscreen` — đó là
         tên prop THẬT của `expo-video@57`, đọc ra khỏi `VideoView.types` của
         chính gói đã cài chứ không nhớ theo bản cũ. */
      fullscreenOptions={{ enable: false }}
      allowsPictureInPicture={false}
      accessibilityLabel={alt}
    />
  );
}
