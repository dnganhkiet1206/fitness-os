import { Check, ChevronRight, Lock, UserRound, UtensilsCrossed } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState } from '@/components/ascnd/empty-state';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { RecipePostCard } from '@/components/ascnd/recipe-post-card';
import { Screen } from '@/components/ascnd/screen';
import { Segmented } from '@/components/ascnd/segmented';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import {
  AlreadySharedError,
  type FeedPost,
  ProfileRequiredError,
  useCommunitySettings,
  useMyCommunityProfile,
  useMySharedSessions,
} from '@/hooks/use-community';
import { EmptyMealError, useShareableMeals, useShareRecipe } from '@/hooks/use-community-recipe';
import { usePalette } from '@/hooks/use-palette';
import { getLocale } from '@/lib/i18n';
import { nav } from '@/lib/nav';
import { payloadFromMeal } from '@/lib/recipe-post';
import { toast } from '@/lib/toast';
import { fillCopy } from '@/lib/copy-fill';

/** Giới hạn của `share_recipe` — ô nhập dừng đúng ở đó để server không phải từ chối. */
const TITLE_MAX = 80;
const CAPTION_MAX = 500;

/**
 * Chia sẻ một công thức (#7, người làm: B): chọn một bữa đã ghi → xem trước
 * ĐÚNG cái thẻ sẽ được đăng → đặt tên món + chú thích → chọn ai thấy → Đăng.
 *
 * Cùng khuôn với màn chia sẻ buổi tập của A (`community-share.tsx`), từng khối:
 * trạng thái tải / lỗi / chưa có hồ sơ, danh sách chọn với dấu "Đã chia sẻ",
 * thẻ xem trước, biểu mẫu, dòng quyền riêng tư, nút Đăng. Hai màn chia sẻ nằm
 * cạnh nhau sau cùng một câu hỏi "Bạn muốn chia sẻ gì?", nên chúng phải là
 * một bộ.
 *
 * ── thứ khác của Recipe: TÊN MÓN ──
 *
 * `meal_entries` không có cột tên, chỉ có loại bữa. Một thẻ Recipe không tên là
 * "Bữa trưa" của một người lạ, nên server bắt buộc tên (1–80 ký tự) và màn này
 * hỏi nó ĐẦU TIÊN trong biểu mẫu. Không tự đặt tên từ món đầu tiên: "Ức gà" cho
 * một bữa ức gà + cơm + bơ là đoán thay người ta, và họ sẽ đăng nó mà không để ý.
 *
 * ── bản xem trước là bài thật ──
 *
 * `payloadFromMeal` dựng thẻ theo đúng từng vế của câu SQL trong `share_recipe`
 * (bước cổng "bài Recipe" chạy nó trên dữ liệu của bộ test SQL và đòi ra cùng
 * con số). Client vẫn không gửi con số nào — chỉ ID của bữa và phần chữ.
 */
export default function CommunityShareRecipeScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const locale = getLocale(lang);
  const me = useMyCommunityProfile();
  const meals = useShareableMeals();
  const shared = useMySharedSessions();
  const share = useShareRecipe();

  const [picked, setPicked] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  /* Chưa chạm thì theo "Mặc định khi đăng" trong Quyền riêng tư; đã chọn thì
     giữ lựa chọn — cài đặt về muộn không được lật ngược thứ người ta vừa bấm.
     Cùng ba dòng với hai màn chia sẻ của A. */
  const settings = useCommunitySettings();
  const [visPick, setVis] = useState<'public' | 'followers' | null>(null);
  const vis = visPick ?? settings.data?.defaultVisibility ?? 'public';

  const list = meals.data ?? [];
  const meal = list.find((m) => m.id === picked) ?? null;

  const mealLabel: Record<string, string> = {
    breakfast: i18n.nBreakfast,
    lunch: i18n.nLunch,
    dinner: i18n.nDinner,
    snack: i18n.nSnack,
    preworkout: i18n.nPreWorkout,
    postworkout: i18n.nPostWorkout,
  };
  const fmt = (n: number) => Math.round(n).toLocaleString(locale);

  const preview: FeedPost | null =
    meal && me.data
      ? {
          id: 'preview',
          kind: 'recipe',
          /* `payload` là hình Workout và chỉ có nghĩa với bài Workout — thẻ
             Recipe đọc `raw`. Cùng cách màn Progress của A dựng bản xem trước. */
          payload: { title: null, performedAt: null, volumeKg: 0, pr: false, minutes: null, exerciseCount: 0, exercises: [] },
          raw: payloadFromMeal(title, meal.mealType, meal.rows, meal.servingG),
          caption: caption.trim(),
          visibility: vis,
          like_count: 0,
          comment_count: 0,
          save_count: 0,
          hidden: false,
          created_at: new Date().toISOString(),
          author: me.data,
          liked: false,
          saved: false,
          mine: true,
        }
      : null;

  const post = () => {
    if (!meal || share.isPending) return;
    if (!title.trim()) {
      toast.fail(new Error(i18n.nRcNameNeeded));
      return;
    }
    share.mutate(
      { entryId: meal.id, title, caption, visibility: vis },
      {
        onSuccess: () => {
          toast.success(i18n.nCmPosted);
          nav.back();
        },
        onError: (e: Error) => {
          if (e instanceof AlreadySharedError) toast.fail(new Error(i18n.nRcAlreadyShared));
          else if (e instanceof ProfileRequiredError) nav.push('/community-profile');
          else if (e instanceof EmptyMealError) toast.fail(new Error(i18n.nRcEmptyMeal));
          else toast.fail(e);
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen back title={i18n.nRcShareTitle}>
        {me.isPending || meals.isPending ? (
          <ActivityIndicator color={c.mutedForeground} style={styles.loading} />
        ) : me.isError || meals.isError ? (
          <LoadFailed i18n={i18n} onRetry={() => (me.refetch(), meals.refetch())} />
        ) : !me.data ? (
          /* Không có hồ sơ thì không đăng được — bài cần một cái tên. */
          <GlassCard>
            <EmptyState
              icon={UserRound}
              title={i18n.nCmSetupTitle}
              hint={i18n.nCmSetupHint}
              action={{ label: i18n.nCmSetupCta, onPress: () => nav.push('/community-profile') }}
            />
          </GlassCard>
        ) : !meal ? (
          list.length === 0 ? (
            <GlassCard>
              <EmptyState icon={UtensilsCrossed} title={i18n.nRcNoMeals} />
            </GlassCard>
          ) : (
            <GlassCard style={styles.pickCard}>
              <Text style={styles.label}>{i18n.nRcPickMeal}</Text>
              {list.map((m, i) => {
                const done = shared.data?.includes(m.id) ?? false;
                return (
                  <Pressable
                    key={m.id}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: done }}
                    disabled={done}
                    onPress={() => setPicked(m.id)}
                    style={[styles.pickRow, i > 0 && styles.rule]}>
                    <View style={styles.pickText}>
                      <Text style={[styles.pickName, done && styles.dim]} numberOfLines={1}>
                        {mealLabel[m.mealType] ?? i18n.nRcRecipe}
                      </Text>
                      {/* Không `numberOfLines`: ở 320pt, hàng có dấu "Đã chia sẻ"
                          cắt mất số kcal — xuống dòng thì không giấu con số nào. */}
                      <Text style={styles.pickMeta}>
                        {new Date(m.dateTime).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                        {` · ${fillCopy(i18n.nRcItems, { n: String(m.preview.ingredientCount) })}`}
                        {` · ${fmt(m.preview.kcal)} ${i18n.dcActivityKcal}`}
                      </Text>
                    </View>
                    {done ? (
                      <View style={styles.sharedTag}>
                        <Icon icon={Check} size={14} color={c.mutedForeground} />
                        <Text style={styles.sharedText}>{i18n.nCmShared}</Text>
                      </View>
                    ) : (
                      <Icon icon={ChevronRight} size={18} color={c.mutedForeground} />
                    )}
                  </Pressable>
                );
              })}
            </GlassCard>
          )
        ) : (
          <>
            {/* `full`: người đăng thấy MỌI dòng sẽ rời tài khoản, không chỉ ba
                dòng đầu — và không có dòng "+N nguyên liệu khác" dẫn tới một
                bài `preview` chưa tồn tại. */}
            {preview ? <RecipePostCard post={preview} preview full /> : null}

            <GlassCard style={styles.form}>
              <Text style={styles.label}>{i18n.nRcName}</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={i18n.nRcNamePh}
                placeholderTextColor={c.mutedForeground}
                maxLength={TITLE_MAX}
                returnKeyType="next"
                style={[styles.input, styles.inputLine]}
              />
              <Text style={styles.label}>{i18n.nCmCaption}</Text>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder={i18n.nRcCaptionPh}
                placeholderTextColor={c.mutedForeground}
                maxLength={CAPTION_MAX}
                multiline
                style={[styles.input, styles.inputArea]}
              />
              <Text style={styles.label}>{i18n.nCmVisibility}</Text>
              <Segmented
                value={vis}
                onChange={setVis}
                options={[
                  { key: 'public', label: i18n.nCmPublic },
                  { key: 'followers', label: i18n.nCmFollowersOnly },
                ]}
              />
            </GlassCard>

            <View style={styles.note}>
              <Icon icon={Lock} size={14} color={c.mutedForeground} />
              <Text style={styles.noteText}>{i18n.nRcPrivacyNote}</Text>
            </View>

            <PressScale
              accessibilityRole="button"
              disabled={share.isPending}
              onPress={post}
              style={[styles.postBtn, share.isPending && styles.busy]}>
              {share.isPending ? (
                <ActivityIndicator color={c.primaryForeground} />
              ) : (
                <Text style={styles.postText}>{i18n.nCmPost}</Text>
              )}
            </PressScale>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

/* Cùng số đo với `community-share.tsx`, từng giá trị — hai màn chia sẻ là một bộ. */
const stylesFor = makeStyles((c, m) => ({
  root: { flex: 1, backgroundColor: c.background },
  loading: { marginTop: spacing.xl },
  label: { ...type.footnote, color: c.mutedForeground },
  pickCard: { gap: spacing.xs },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  pickText: { flex: 1, minWidth: 0, gap: 2 },
  pickName: { ...type.headline, color: c.foreground },
  pickMeta: { ...type.footnote, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  dim: { color: c.mutedForeground },
  sharedTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sharedText: { ...type.footnote, color: c.mutedForeground },
  form: { gap: spacing.sm },
  input: {
    ...type.body,
    color: c.foreground,
    backgroundColor: c.secondary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: spacing.sm,
  },
  /* Tên món: một dòng, cao 44 — vùng chạm tối thiểu, như mọi ô một dòng. */
  inputLine: { minHeight: 44 },
  inputArea: { minHeight: 88, textAlignVertical: 'top' },
  note: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', paddingHorizontal: spacing.xs },
  noteText: { ...type.footnote, color: c.mutedForeground, flex: 1, lineHeight: 18 },
  postBtn: { height: 50, borderRadius: radius.full, backgroundColor: m.actionSurface, alignItems: 'center', justifyContent: 'center' },
  busy: { opacity: 0.6 },
  postText: { ...type.headline, color: c.primaryForeground },
}));
