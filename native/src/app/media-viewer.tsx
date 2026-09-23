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
import { mediaLabel } from '@/lib/exercise-media';
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

  const { ex, name, i } = useLocalSearchParams<{ ex?: string; name?: string; i?: string }>();
  const title = (name ?? '').trim();
  const { data, isPending } = useExerciseGuide(ex, title);
  const media = data?.media ?? { type: 'none' as const, items: [] };

  /*
    ── TẤM NÀO mở ra trước ──

    Danh sách các bước ở màn hướng dẫn mở đúng tấm được chạm, nên `i` đi theo.
    Nó là một CHUỖI (mọi tham số route đều thế) và có thể là rác, nên nó được
    kẹp vào khoảng hợp lệ chứ không tin: `Number('x')` là `NaN`, và một
    `contentOffset` bằng `NaN` làm `ScrollView` không dựng được nội dung nào.

    Không có `i` thì 0, đúng như khi mở từ nút media ở hàng tên bài.
  */
  const start = (() => {
    const n = Math.floor(Number(i));
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), Math.max(0, media.items.length - 1)) : 0;
  })();

  /*
    Trang đang xem. Chỉ có nghĩa ở bộ ảnh; ảnh đơn và video luôn là 0.

    Khởi tạo 0, KHÔNG phải `start` — và đó là một lỗi đã xảy ra thật, harness
    bắt được: ở lượt vẽ ĐẦU TIÊN truy vấn chưa trả về, nên `media.items` rỗng,
    nên `start` bị kẹp về 0. `useState(start)` đóng băng đúng con số ấy và
    không bao giờ đổi khi dữ liệu tới. Màn mở ra luôn ở tấm đầu, kèm chú thích
    của tấm đầu — một lỗi trông y hệt "màn chạy bình thường".

    Cú nhảy vì thế xảy ra khi NỘI DUNG ĐÃ ĐO XONG — xem `onContentSizeChange`.
  */
  const [page, setPage] = useState(0);
  const last = useRef(0);
  const scroller = useRef<ScrollView>(null);
  /* Đúng MỘT lần. Không có cờ này thì mỗi lần nội dung đổi kích thước — xoay
     máy, một tấm tải xong — màn lại nhảy về tấm được chạm lúc đầu. */
  const jumped = useRef(false);
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

  /* Tấm đang xem — nguồn của chú thích dưới đáy. */
  const current = media.items[page] ?? media.items[0] ?? null;

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
          alt={
            mediaLabel(data?.name || title, v)
            ?? v.alt
            ?? i18n.nEgMediaAlt.replace('{v}', data?.name || title)
          }
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
        ref={scroller}
        /*
          ── nhảy tới tấm được chạm, và LÚC NÀO thì nhảy ──

          `contentOffset` KHÔNG dùng được ở đây, vì hai lý do cùng lúc: nó là
          prop iOS-only (bản web bỏ qua hoàn toàn), và ở lượt vẽ đầu tiên
          `media.items` còn rỗng nên giá trị nó nhận được là 0.

          `onContentSizeChange` bắn đúng lúc các tấm đã được đo — tức đúng lúc
          `scrollTo` có nghĩa — và nó chạy trên cả hai nền.

          `animated: false`: một cú cuộn qua ba tấm ngay khi màn mở ra là
          chuyển động không ai yêu cầu, và nó còn bắn `onMomentumScrollEnd`
          giữa chừng.
        */
        onContentSizeChange={() => {
          if (jumped.current || !media.items.length) return;
          jumped.current = true;
          if (start <= 0) return;
          last.current = start;
          setPage(start);
          scroller.current?.scrollTo({ x: start * width, animated: false });
        }}
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
              /* Cùng thứ tự ba nguồn như khung hình dẫn — chú thích đã bản địa
                 hoá thắng `alt`, thắng câu dựng sẵn. Xem `mediaLabel`. */
              accessibilityLabel={
                mediaLabel(data?.name || title, m)
                ?? m.alt
                ?? i18n.nEgMediaAlt.replace('{v}', data?.name || title)
              }
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

      {/*
        ── CHÚ THÍCH, trên nền tối, dưới tấm ảnh ──

        Cùng chữ mà màn hướng dẫn hiện dưới mỗi bước — không một hệ nội dung
        thứ hai, không một bản dịch thứ hai. Ở đây nó nằm TRÊN ảnh vì màn này
        không có chỗ nào khác, nên nó mang một lớp nền tối của riêng mình:
        chữ trắng trên một tấm ảnh chưa ai biết trước màu gì thì không đọc
        được, và trắng-trên-đen-70% thì đọc được trên mọi nền.

        Nó KHÔNG nhận chạm — vuốt ngang phải đi xuyên qua nó sang tấm kế.
      */}
      {current?.title ? (
        <View
          style={[styles.caption, { bottom: insets.bottom + (media.items.length > 1 ? 44 : spacing.lg) }]}
          pointerEvents="none">
          <Text style={styles.capTitle}>{current.title}</Text>
          {current.description ? (
            <Text style={styles.capText}>{current.description}</Text>
          ) : null}
        </View>
      ) : null}

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
  /*
    Lớp nền của chú thích: đen 70%.

    Đo bằng cách quét cả thang xám 0..255 phía sau — trắng trên đen-70%-trên-
    trắng cho 6,05:1, nên nó đạt sàn 4,5 với MỌI hình minh hoạ, kể cả một tấm
    trắng toát. Cùng cách giải đã dùng cho nhãn thời lượng và nút đóng.
  */
  caption: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  capTitle: { ...type.headline, color: '#ffffff' },
  capText: { ...type.footnote, color: '#e6e6e6', lineHeight: 19 },
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
