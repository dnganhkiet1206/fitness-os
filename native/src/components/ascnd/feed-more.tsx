import { haptics as Haptics } from '@/lib/haptics';
import { CheckCheck, RotateCw } from 'lucide-react-native';
import { ActivityIndicator, type NativeScrollEvent, type NativeSyntheticEvent, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { usePalette } from '@/hooks/use-palette';
import { nearEnd } from '@/lib/feed-page';

/** Phần của một truy vấn theo trang mà đuôi feed cần. */
type Pages = {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => unknown;
};

/**
 * Tải trang kế khi người đọc tới gần đáy (#20). Trả một `onScroll` để màn nối
 * cạnh `onScroll` của nó.
 *
 * Không tự thử lại khi trang kế HỎNG: mỗi sự kiện cuộn (16ms) sẽ là một lần gọi
 * nữa lên một server đang lỗi. Hỏng thì đuôi feed nói ra và có nút thử lại.
 */
export function useLoadMore(q: Pages) {
  return (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (!q.hasNextPage || q.isFetchingNextPage || q.isFetchNextPageError) return;
    if (nearEnd(contentOffset.y, layoutMeasurement.height, contentSize.height)) q.fetchNextPage();
  };
}

/**
 * Đuôi feed (#20): đang tải · hỏng + thử lại · đã hết · còn nữa.
 *
 * "Còn nữa" là một nút chứ không phải khoảng trống: trang kế thường đã được
 * tải từ 800 điểm trước đáy nên hiếm ai thấy nó, nhưng khi nội dung ngắn hơn
 * màn (không cuộn được thì không có sự kiện cuộn nào) nó là lối duy nhất, và
 * với VoiceOver nó là một thứ gọi được bằng tên.
 */
export function FeedMore({ q }: { q: Pages }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const more = () => {
    Haptics.selection();
    q.fetchNextPage();
  };

  if (q.isFetchingNextPage) {
    return (
      <View style={styles.row} accessible accessibilityLabel={i18n.nCmMoreLoading}>
        <ActivityIndicator color={c.mutedForeground} />
      </View>
    );
  }
  if (q.isFetchNextPageError) {
    return (
      <View style={styles.row}>
        <Text style={styles.note}>{i18n.nCmMoreFailed}</Text>
        <PressScale accessibilityRole="button" accessibilityLabel={i18n.nRetry} hitSlop={4} onPress={more} style={styles.btn}>
          <Icon icon={RotateCw} size={14} color={c.foreground} />
          <Text style={styles.btnText}>{i18n.nRetry}</Text>
        </PressScale>
      </View>
    );
  }
  if (!q.hasNextPage) {
    return (
      <View style={styles.row} accessibilityRole="text">
        <Icon icon={CheckCheck} size={15} color={c.mutedForeground} />
        <Text style={styles.note}>{i18n.nCmFeedEnd}</Text>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <PressScale accessibilityRole="button" hitSlop={4} onPress={more} style={styles.btn}>
        <Text style={styles.btnText}>{i18n.nCmOlder}</Text>
      </PressScale>
    </View>
  );
}

/**
 * Đầu feed khi trang đầu đang giữ KHÔNG phải đầu thật (#171: feed có trần 5
 * trang, trang trên cùng rời bộ nhớ khi cuộn sâu). Thường thì trang ấy đã tự
 * tải lại từ 800 điểm trước khi tới đây (`useLoadNewer`) và người ta không bao
 * giờ thấy hàng này; nó ở đây cho lúc trang ấy HỎNG (không tự thử lại ở mỗi sự
 * kiện cuộn, như đuôi feed) và cho VoiceOver.
 *
 * Cùng một chiều cao ở mọi trạng thái: hàng này nằm TRÊN điểm neo giữ chỗ, nên
 * nó đổi cao lúc đang tải là cả feed nhảy theo.
 */
export function FeedNewer({ q }: { q: Pick<Prev, 'hasPreviousPage' | 'isFetchingPreviousPage' | 'isFetchPreviousPageError' | 'fetchPreviousPage'> }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  if (!q.hasPreviousPage) return null;
  const newer = () => {
    Haptics.selection();
    q.fetchPreviousPage();
  };
  if (q.isFetchingPreviousPage) {
    return (
      <View style={[styles.row, styles.fixed]} accessible accessibilityLabel={i18n.nCmNewerLoading}>
        <ActivityIndicator color={c.mutedForeground} />
      </View>
    );
  }
  if (q.isFetchPreviousPageError) {
    return (
      <View style={[styles.row, styles.fixed]}>
        <Text style={[styles.note, styles.noteOne]} numberOfLines={1}>{i18n.nCmNewerFailed}</Text>
        <PressScale accessibilityRole="button" accessibilityLabel={i18n.nRetry} hitSlop={4} onPress={newer} style={styles.btn}>
          <Icon icon={RotateCw} size={14} color={c.foreground} />
          <Text style={styles.btnText}>{i18n.nRetry}</Text>
        </PressScale>
      </View>
    );
  }
  return (
    <View style={[styles.row, styles.fixed]}>
      <PressScale accessibilityRole="button" hitSlop={4} onPress={newer} style={styles.btn}>
        <Text style={styles.btnText}>{i18n.nCmNewer}</Text>
      </PressScale>
    </View>
  );
}

type Prev = {
  hasPreviousPage: boolean;
  isFetchingPreviousPage: boolean;
  isFetchPreviousPageError: boolean;
  fetchPreviousPage: () => unknown;
};

const stylesFor = makeStyles((c, m) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingVertical: spacing.sm,
  },
  note: { ...type.footnote, color: c.mutedForeground },
  /* Đầu feed (`FeedNewer`) cao CỐ ĐỊNH, chữ một dòng: nó nằm trên điểm neo giữ
     chỗ, và một hàng đổi cao giữa ba trạng thái là cả feed nhảy theo. */
  fixed: { height: 56, minHeight: 56, paddingVertical: 0 },
  noteOne: { flexShrink: 1 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: alpha(m.ink, 0.07),
  },
  btnText: { ...type.footnote, fontWeight: '600', color: c.foreground },
}));
