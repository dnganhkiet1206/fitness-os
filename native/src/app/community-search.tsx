import { useLocalSearchParams } from 'expo-router';
import { BadgeCheck, ChefHat, Search, UserPlus, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { CommunityAvatar } from '@/components/ascnd/community-avatar';
import { EmptyState } from '@/components/ascnd/empty-state';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PostCard } from '@/components/ascnd/post-card';
import { PressScale } from '@/components/ascnd/press-scale';
import { Screen } from '@/components/ascnd/screen';
import { SegmentPanel, Segmented } from '@/components/ascnd/segmented';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import {
  type CommunityAuthor,
  searchTerm,
  useFindRecipes,
  useFollow,
  useFollowSuggestions,
  useSearchPeople,
} from '@/hooks/use-community';
import { usePalette } from '@/hooks/use-palette';
import { nav } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { fillCopy } from '@/lib/copy-fill';

/**
 * Tìm người & gợi ý theo dõi — issue #19.
 *
 * Trước màn này, cách DUY NHẤT để theo dõi ai là bấm vào tên trên một bài tình
 * cờ gặp ở Khám phá — và tab "Đang theo dõi" của người mới thì trống.
 *
 * ── hai trạng thái của cùng một ô ──
 *
 *   ô trống          gợi ý: tài khoản ASCND chính thức, rồi người có bài công
 *                    khai gần đây mà mình chưa theo dõi — kèm LÝ DO vì sao họ
 *                    ở đây, để một gợi ý không đọc ra như quảng cáo.
 *   ≥ 2 ký tự        kết quả tìm (tối đa 20, server lọc cặp đã chặn nhau).
 *
 * Gõ tới đâu tìm tới đó, trễ 250ms: đủ để không hỏi server ở mỗi phím, đủ ngắn
 * để không ai kịp nghĩ là nó không chạy.
 *
 * Nút Theo dõi nằm ngay trên dòng — việc người ta tới đây để làm — còn chạm vào
 * phần còn lại của dòng thì mở hồ sơ để xem trước khi quyết.
 *
 * ── Công thức (#43) ──
 *
 * Cùng một ô tìm, hai kết quả: đổi phân đoạn thì chữ đã gõ ở lại. Công thức
 * tìm theo tên món, không phân biệt dấu (server gập cả hai phía). Mỗi kết quả
 * là ĐÚNG cái thẻ trên feed (`PostCard`), như Thư viện Đã lưu: công thức là thứ
 * DÙNG được, nên kết quả tìm mang luôn "Thêm vào bữa ăn". Không có gợi ý khi ô
 * trống — chỉ một câu nói tìm được gì và gõ thế nào. `?mode=recipe` mở thẳng
 * phân đoạn Công thức.
 */
export default function CommunitySearchScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'people' | 'recipe'>(params.mode === 'recipe' ? 'recipe' : 'people');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerm(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const recipes = mode === 'recipe';
  const searching = searchTerm(term).length >= 2;
  /* Chỉ hỏi server cho phân đoạn đang mở. */
  const results = useSearchPeople(recipes ? '' : term);
  const recipeHits = useFindRecipes(recipes ? term.trim() : '');
  const suggestions = useFollowSuggestions();
  const follow = useFollow();

  const toggle = (userId: string, on: boolean) =>
    follow.mutate({ userId, on }, { onError: (e: Error) => toast.fail(e) });

  const list = searching ? results : suggestions;
  const rows = (list.data ?? []) as (CommunityAuthor & { i_follow?: boolean; recent_posts?: number })[];

  return (
    <Screen back refreshable title={recipes ? i18n.nSrRecipeTitle : i18n.nSrTitle}>
      <Segmented
        variant="capsule"
        value={mode}
        onChange={setMode}
        options={[
          { key: 'people', label: i18n.nSrPeople },
          { key: 'recipe', label: i18n.nSrRecipes },
        ]}
      />
      <View style={styles.field}>
        <Icon icon={Search} size={18} color={c.mutedForeground} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={recipes ? i18n.nSrRecipePlaceholder : i18n.nSrPlaceholder}
          placeholderTextColor={c.mutedForeground}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          maxLength={40}
          accessibilityLabel={recipes ? i18n.nSrRecipePlaceholder : i18n.nSrPlaceholder}
          style={styles.input}
        />
        {q ? (
          <Pressable accessibilityRole="button" accessibilityLabel={i18n.nSrClear} hitSlop={12} onPress={() => setQ('')}>
            <Icon icon={X} size={18} color={c.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {/* Mọi thứ dưới ô tìm là panel của phân đoạn đang mở, nên nó được bọc như
          mọi panel của một segmented control (`tools/segmented.mjs`). Ô tìm thì
          ở NGOÀI: nó là control dùng chung của hai phân đoạn, và chữ đã gõ phải
          ở lại khi đổi. */}
      <SegmentPanel segment={mode}>
      {!searching && searchTerm(q).length === 1 ? <Text style={styles.hint}>{i18n.nSrMin}</Text> : null}

      {recipes ? (
        !searching ? (
          <GlassCard>
            <EmptyState icon={ChefHat} title={i18n.nSrRecipeIntro} hint={i18n.nSrRecipeIntroHint} />
          </GlassCard>
        ) : recipeHits.isError ? (
          <LoadFailed i18n={i18n} onRetry={() => recipeHits.refetch()} />
        ) : recipeHits.isPending ? (
          <ActivityIndicator color={c.mutedForeground} style={styles.loading} />
        ) : (recipeHits.data ?? []).length === 0 ? (
          <GlassCard>
            <EmptyState icon={Search} title={fillCopy(i18n.nSrRecipeNone, { q: term.trim() })} hint={i18n.nSrRecipeNoneHint} />
          </GlassCard>
        ) : (
          (recipeHits.data ?? []).map((post) => <PostCard key={post.id} post={post} />)
        )
      ) : null}

      {!recipes && !searching ? <Text style={styles.heading}>{i18n.nSrSuggested}</Text> : null}

      {recipes ? null : list.isError ? (
        <LoadFailed i18n={i18n} onRetry={() => list.refetch()} />
      ) : list.isPending && (searching || !suggestions.data) ? (
        <ActivityIndicator color={c.mutedForeground} style={styles.loading} />
      ) : rows.length === 0 ? (
        <GlassCard>
          {searching ? (
            <EmptyState icon={Search} title={i18n.nSrNone.replace('{q}', searchTerm(term))} hint={i18n.nSrNoneHint} />
          ) : (
            <EmptyState icon={UserPlus} title={i18n.nSrNoSuggestions} />
          )}
        </GlassCard>
      ) : (
        <GlassCard style={styles.list}>
          {rows.map((p, i) => {
            const following = p.i_follow === true;
            const why = p.is_official
              ? i18n.nSrWhyOfficial
              : p.recent_posts
                ? fillCopy(i18n.nSrWhyActive, { n: String(p.recent_posts) })
                : `@${p.handle}`;
            return (
              <View key={p.user_id} style={[styles.row, i > 0 && styles.rowRule]}>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`${p.display_name}, @${p.handle}`}
                  onPress={() => nav.push({ pathname: '/community-user', params: { id: p.user_id } })}
                  style={styles.who}>
                  <CommunityAvatar mascotId={p.mascot_id} size={44} />
                  <View style={styles.text}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {p.display_name}
                      </Text>
                      {p.is_official ? <Icon icon={BadgeCheck} size={16} color={c.metricBlue} /> : null}
                    </View>
                    {/* Lý do gợi ý là CÂU của app, được xuống hai dòng; handle
                        thì một dòng, cắt được. Ở 320, cạnh nút Theo dõi, "Tài
                        khoản chính thức ASCND" một dòng thành "Tài khoản chính
                        th…" (#48, lượt quét hẹp của live.mjs). */}
                    <Text style={styles.meta} numberOfLines={searching ? 1 : 2}>
                      {searching ? `@${p.handle}` : why}
                    </Text>
                  </View>
                </PressScale>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`${following ? i18n.nCmFollowing : i18n.nCmFollow} ${p.display_name}`}
                  accessibilityState={{ selected: following }}
                  disabled={follow.isPending}
                  hitSlop={4}
                  onPress={() => toggle(p.user_id, !following)}
                  style={following ? styles.quietPill : styles.solidPill}>
                  <Text style={following ? styles.quietText : styles.solidText}>
                    {following ? i18n.nCmFollowing : i18n.nCmFollow}
                  </Text>
                </PressScale>
              </View>
            );
          })}
        </GlassCard>
      )}
      </SegmentPanel>
    </Screen>
  );
}

const stylesFor = makeStyles((c, m) => ({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
  },
  input: { ...type.body, flex: 1, color: c.foreground, paddingVertical: spacing.sm },
  hint: { ...type.footnote, color: c.mutedForeground, paddingHorizontal: spacing.xs },
  heading: { ...type.headline, color: c.foreground, marginTop: spacing.xs },
  loading: { marginVertical: spacing.lg },
  list: { paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  rowRule: { borderTopWidth: 1, borderTopColor: c.border },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { ...type.body, color: c.foreground, fontWeight: '600', flexShrink: 1 },
  meta: { ...type.footnote, color: c.mutedForeground },
  /* 36 + hitSlop 4 = 44: viên nhỏ để tên đứng trước, vùng chạm vẫn đủ. */
  solidPill: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: m.actionSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  solidText: { ...type.footnote, color: c.primaryForeground, fontWeight: '600' },
  quietPill: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietText: { ...type.footnote, color: c.foreground, fontWeight: '600' },
}));
