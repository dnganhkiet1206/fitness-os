import { ArrowUp } from 'lucide-react-native';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommunityAvatar } from '@/components/ascnd/community-avatar';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { radius, spacing, type } from '@/constants/ascnd';
import { BOUNCE, spring } from '@/constants/motion';
import { makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import type { FeedPost } from '@/hooks/use-community';
import { usePalette } from '@/hooks/use-palette';
import { fillCopy } from '@/lib/copy-fill';

/**
 * Viên "N bài mới" nổi ở đầu feed (#160) — như X: mũi tên lên, tối đa ba
 * avatar của người vừa đăng, con số. Chạm là lên đầu và thấy chúng.
 *
 * Trượt xuống từ dưới đồng hồ bằng lò xo. Điểm xuất phát chỉ cách chỗ đứng
 * 16 điểm và cỡ 0.92, không phải từ ngoài màn và không từ trong suốt: một khung
 * hình bị lỡ lúc app đang bận (đúng lúc feed vừa tải lại) để lại một viên hơi
 * lệch, không bao giờ một viên vô hình — cùng luật `SegmentPanel` đã phải học.
 * Reduce Motion: hiện ngay tại chỗ.
 */
export function NewPostsPill({ posts, onPress }: { posts: readonly FeedPost[]; onPress: () => void }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) t.value = withSpring(1, spring(0.4, BOUNCE.snappy));
  }, [reduce, t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - t.value) * -16 }, { scale: 0.92 + 0.08 * t.value }],
  }));

  /* Một người đăng ba bài là một avatar, không phải ba cái giống nhau. */
  const faces: FeedPost['author'][] = [];
  for (const p of posts) {
    if (faces.length === 3) break;
    if (p.author && !faces.some((f) => f?.user_id === p.author!.user_id)) faces.push(p.author);
  }
  const n = String(posts.length);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
      <Animated.View style={style}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={fillCopy(i18n.nCmNewPostsA11y, { n })}
          onPress={onPress}
          style={styles.pill}>
          <Icon icon={ArrowUp} size={16} color={c.primaryForeground} />
          {faces.length ? (
            <View style={styles.faces}>
              {faces.map((f, i) => (
                <View key={f!.user_id} style={[styles.face, i > 0 && styles.faceOverlap]}>
                  <CommunityAvatar mascotId={f!.mascot_id} size={22} />
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.label}>{fillCopy(i18n.nCmNewPosts, { n })}</Text>
        </PressScale>
      </Animated.View>
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: m.actionSurface,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  faces: { flexDirection: 'row' },
  /* Viền cùng màu viên, để các avatar chồng nhau đọc ra thành từng cái. */
  face: { borderRadius: radius.full, borderWidth: 2, borderColor: m.actionSurface },
  faceOverlap: { marginLeft: -8 },
  label: { ...type.headline, color: c.primaryForeground },
}));
