import { Bookmark } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { EmptyState } from '@/components/ascnd/empty-state';
import { GlassCard } from '@/components/ascnd/glass-card';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PostCard } from '@/components/ascnd/post-card';
import { Screen } from '@/components/ascnd/screen';
import { Segmented } from '@/components/ascnd/segmented';
import { spacing } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { useSavedPosts } from '@/hooks/use-community-saved';
import { usePalette } from '@/hooks/use-palette';
import { filterSaved, type SavedFilter } from '@/lib/saved-library';

/**
 * Thư viện Đã lưu (#10, người làm: B) — concept mục 8: "Save không chỉ để
 * bookmark, nó phải trở thành một thư viện hữu ích".
 *
 * Mỗi mục là ĐÚNG cái thẻ trên feed (`PostCard`), nên nó giữ nguyên hành động
 * của loại bài: Workout → "Thử workout", Recipe → "Thêm vào bữa ăn". Thư viện
 * không phát minh một kiểu thẻ thứ hai cho cùng một bài.
 *
 * Bộ lọc theo đúng thứ tự của #10 — Buổi tập | Công thức | Tất cả — và mở ở
 * Tất cả: người vừa bấm "Xem thư viện" đang tìm đúng bài vừa lưu, bất kể loại.
 * Bài Progress chỉ ở Tất cả: nó không phải thứ người ta "làm lại" được như một
 * buổi tập hay một món ăn.
 *
 * Hai lối vào: hàng "Đã lưu" trên hồ sơ của chính mình (`community-user`), và
 * nút "Xem thư viện" trên toast sau mỗi lần Lưu (`post-parts`).
 */
export default function CommunitySavedScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const saved = useSavedPosts();
  const [filter, setFilter] = useState<SavedFilter>('all');

  const all = saved.data ?? [];
  const list = filterSaved(all, filter);

  return (
    <Screen refreshable back title={i18n.nSvTitle}>
      <Segmented
        variant="capsule"
        value={filter}
        onChange={setFilter}
        options={[
          { key: 'workout', label: i18n.nSvWorkouts },
          { key: 'recipe', label: i18n.nSvRecipes },
          { key: 'all', label: i18n.nSvAll },
        ]}
      />

      {saved.isPending ? (
        <ActivityIndicator color={c.mutedForeground} style={styles.loading} />
      ) : saved.isError ? (
        <LoadFailed i18n={i18n} onRetry={() => saved.refetch()} />
      ) : list.length === 0 ? (
        /* Chưa lưu gì cả thì dạy cách lưu; đã lưu mà bộ lọc rỗng thì chỉ nói
           loại ấy chưa có — lời dạy lúc ấy là thừa. */
        <GlassCard>
          <EmptyState
            icon={Bookmark}
            title={all.length === 0 ? i18n.nSvEmpty : filter === 'workout' ? i18n.nSvEmptyWorkouts : i18n.nSvEmptyRecipes}
            hint={all.length === 0 ? i18n.nSvEmptyHint : undefined}
          />
        </GlassCard>
      ) : (
        list.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </Screen>
  );
}

const stylesFor = makeStyles(() => ({
  loading: { marginTop: spacing.xl },
}));
