import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useExerciseGuide } from '@/hooks/use-exercise-guide';
import { useI18n } from '@/hooks/use-app-settings';
import { usePalette } from '@/hooks/use-palette';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { nav } from '@/lib/nav';

/**
 * Media của bài tập, TOÀN MÀN — ảnh, bộ ảnh vuốt ngang, hoặc video.
 *
 * ── vì sao nó là một MÀN, không phải một `<Modal>` bên trong sheet ──
 *
 * Đặt hàng nói thẳng: *"Do NOT put the Exercise Guide's glass sheet over the
 * fullscreen media. Fullscreen media is a separate presentation layer."* Một
 * `<Modal>` dựng bên trong `exercise-guide.tsx` sẽ nằm TRONG cây của sheet ấy,
 * nên mặt kính, lề an toàn và cả bo góc pageSheet đều đi theo.
 *
 * Là một route riêng thì nó là một tầng riêng thật: nền đen tràn màn, và cái
 * sheet hướng dẫn nằm nguyên vẹn phía dưới chờ quay lại.
 *
 * ── buổi tập KHÔNG bị đụng, và đó là cả một chuỗi ──
 *
 *     Buổi tập  →  Hướng dẫn  →  Media toàn màn  →  Hướng dẫn  →  Buổi tập
 *
 * Cả hai bước đều là `push`/`back` trên cùng một stack, nên không màn nào bị
 * dựng lại: màn Plan vẫn mounted dưới sheet, sheet vẫn mounted dưới màn này.
 * Tạ đã gõ, hiệp đã tick, đồng hồ nghỉ đang chạy — không thứ nào đi qua đây.
 *
 * ── nó ĐỌC LẠI hook thay vì nhận media qua tham số ──
 *
 * Tham số route là chuỗi; nhét cả bộ media vào đó nghĩa là serialize rồi parse
 * một mô hình đã có sẵn, và tạo ra một bản sao sẽ lệch. `useExerciseGuide` có
 * `staleTime` 30 phút và cùng `queryKey`, nên lượt đọc ở đây là một cú CHẠM
 * CACHE — không có truy vấn thứ hai nào ra mạng.
 *
 * Chỉ `ex` và `name` đi qua tham số, đúng như sheet: DANH TÍNH, không nội dung.
 *
 * ── dọc, và chỉ dọc ──
 *
 * Đặt hàng: *"The fullscreen viewer should remain portrait. Do not introduce
 * landscape rotation in this phase."* Nên không có `expo-screen-orientation`,
 * không `supportedInterfaceOrientations`. Thứ được dựng là một khung dọc có
 * vuốt ngang qua từng tấm, không phải một trình phát xoay ngang.
 */
export default function MediaViewer() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();

  const { ex, name } = useLocalSearchParams<{ ex?: string; name?: string }>();
  const title = (name ?? '').trim();
  const { data, isPending } = useExerciseGuide(ex, title);
  const media = data?.media ?? { type: 'none' as const, items: [] };

  /* Trang đang xem. Chỉ có nghĩa ở bộ ảnh; ảnh đơn và video luôn là 0. */
  const [page, setPage] = useState(0);
  const last = useRef(0);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
      /* Chỉ `setState` khi trang THẬT SỰ đổi: `onMomentumScrollEnd` bắn ở cuối
         mỗi cú vuốt kể cả khi người ta kéo rồi thả về chỗ cũ. */
      if (i !== last.current) {
        last.current = i;
        setPage(i);
      }
    },
    [width],
  );

  const close = useCallback(() => nav.back(), []);

  /*
    Video dựng qua ĐÚNG cửa đã có — `guide-video.tsx`, tệp duy nhất trong app
    import `expo-video`. Thêm một chỗ import thứ hai ở đây sẽ phá đúng cái khoá
    đã cứu app khỏi lỗi "Cannot find native module 'ExpoVideo'": gói ấy gọi
    `requireNativeModule` ở phạm vi module, và mọi route đều được nạp lúc khởi
    động. Nên cùng một `require` trong `try/catch`, cùng một lý do.
  */
  const GuideVideo = videoGate();

  const body = () => {
    if (isPending) return <ActivityIndicator color="#ffffff" />;

    if (media.type === 'video') {
      const v = media.items[0];
      if (!GuideVideo) return <Text style={styles.fail}>{i18n.nEgMediaFailed}</Text>;
      return (
        <GuideVideo
          url={v.uri}
          alt={v.alt ?? i18n.nEgMediaAlt.replace('{v}', data?.name || title)}
          reduced={reduced}
          style={{ width, height: height - insets.top - insets.bottom }}
          onFail={close}
          /* Toàn màn thì điều khiển GỐC của hệ điều hành: phát/dừng, tiến
             trình, tua. Khung dẫn thì không — xem `controls` ở `guide-video`. */
          controls
        />
      );
    }

    if (media.items.length === 0) return <Text style={styles.fail}>{i18n.nEgNoMedia}</Text>;

    return (
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        /* Một tấm ngoài rìa mỗi phía được giữ sẵn. Bộ năm ảnh vì thế không
           dựng năm bản giải mã cùng lúc, mà vuốt sang tấm kế vẫn có sẵn. */
        removeClippedSubviews>
        {media.items.map((m, i) => (
          <View key={m.uri} style={{ width, height: height - insets.top - insets.bottom }}>
            <Image
              source={{ uri: m.uri }}
              style={StyleSheet.absoluteFill}
              /* `contain`, không `cover`: toàn màn là chỗ người ta mở ra để
                 NHÌN KỸ, nên không được cắt mất mép nào của tấm ảnh. */
              contentFit="contain"
              transition={reduced ? 0 : 150}
              /* Tấm đang xem và hai tấm kề được ưu tiên; phần còn lại đợi. */
              priority={Math.abs(i - page) <= 1 ? 'high' : 'low'}
              accessibilityLabel={m.alt ?? i18n.nEgMediaAlt.replace('{v}', data?.name || title)}
              accessible
            />
          </View>
        ))}
      </ScrollView>
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.stage, { marginTop: insets.top, marginBottom: insets.bottom }]}>
        {body()}
      </View>

      {/* Chấm trang: CHỈ khi thật sự có nhiều tấm. Một tấm mà có chấm là nói
          rằng còn tấm nữa. */}
      {media.items.length > 1 ? (
        <View style={[styles.dots, { bottom: insets.bottom + spacing.lg }]} pointerEvents="none">
          {media.items.map((m, i) => (
            <View key={m.uri} style={[styles.dot, i === page ? styles.dotOn : null]} />
          ))}
        </View>
      ) : null}

      <PressScale
        accessibilityRole="button"
        accessibilityLabel={i18n.a11yClose}
        hitSlop={8}
        onPress={close}
        style={[styles.close, { top: insets.top + spacing.sm }]}>
        <Icon icon={X} size={18} color="#ffffff" />
      </PressScale>
    </View>
  );
}

/** Cùng cái khoá như `guide-media.tsx` — xem lý do ở đó. */
function videoGate(): typeof import('@/components/ascnd/guide-video').GuideVideo | null {
  try {
    return (require('@/components/ascnd/guide-video') as typeof import('@/components/ascnd/guide-video'))
      .GuideVideo;
  } catch {
    return null;
  }
}

/** 44 — sàn vùng chạm của Apple, ở phần NHÌN THẤY. Cùng con số và cùng lý do
    như `exercise-guide.tsx`; `tools/sheet-header.mjs` canh cả hai, vì cả hai
    được miễn `<SheetHeader>` và vì thế phải tự dựng lối ra. */
const CLOSE = 44;

const stylesFor = makeStyles(() => ({
  /* Đen, không `c.background`: một màn xem media là một phòng tối, và nó không
     đổi theo theme — ảnh và video mang màu của chính chúng. */
  root: { flex: 1, backgroundColor: '#000000' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fail: { ...type.body, color: '#ffffff' },
  dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotOn: { backgroundColor: '#ffffff' },
  close: {
    position: 'absolute',
    left: spacing.md,
    width: CLOSE,
    height: CLOSE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    /* Đĩa tối trên nền đen, viền bằng chính lớp phủ: nút phải tìm thấy được
       trên một tấm ảnh chưa ai biết trước màu gì, kể cả ảnh trắng toát. */
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
}));
