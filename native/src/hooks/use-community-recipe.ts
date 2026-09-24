import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { AlreadySharedError, ProfileRequiredError } from '@/hooks/use-community';
import { useOnlineMutation } from '@/hooks/use-online-mutation';
import { supabase } from '@/integrations/supabase/client';
import { type MealItemRow, payloadFromMeal, type RecipePayload } from '@/lib/recipe-post';

/**
 * Cộng đồng · bài RECIPE (#7, người làm: B) — đọc bữa để chia sẻ, và đăng.
 *
 * Tệp RIÊNG của B, theo luật ở issue #6: `use-community.ts` là của A, nên thứ
 * dùng chung thì đọc lại từ đó (`AlreadySharedError`, `ProfileRequiredError`,
 * `useMySharedSessions` — nó trả `source_id` của MỌI bài mình đã đăng, bất kể
 * loại, nên đánh dấu được cả bữa đã chia sẻ) chứ không chép.
 */

/** Ba mươi ngày, như màn chia sẻ buổi tập: đủ để đăng bữa tuần trước, đủ ngắn
    để danh sách không thành một kho lưu trữ. */
const DAYS = 30;

export interface ShareableMeal {
  id: string;
  dateTime: string;
  mealType: string;
  /** Các dòng của bữa, đã lọc đúng khoá — bản xem trước dựng lại từ đây mỗi
      lần tên món đổi, bằng `payloadFromMeal`. */
  rows: MealItemRow[];
  /** Khối lượng một khẩu phần của từng món gốc mà bữa trỏ tới. */
  servingG: Record<string, number>;
  /** Bản xem trước không tên — cho số kcal · số món ở hàng chọn bữa. */
  preview: RecipePayload;
}

/**
 * Bữa của CHÍNH mình trong 30 ngày, mỗi bữa kèm đủ dữ liệu để dựng bản xem trước.
 *
 * ── ba truy vấn phẳng, không phép nhúng PostgREST ──
 *
 * Thế giới giả không mô phỏng phép nhúng (và tới #17 cũng không lọc `eq`/`in`;
 * nay có, nhưng vẫn không lọc `gte`), nên không dùng phép nhúng. Bữa, món và
 * kho món được đọc riêng, phép ghép chạy ở
 * đây, kèm một lượt lọc lại phía client theo đúng khoá — thế giới giả (hay một
 * bộ lọc sai về sau) trả thừa dòng cũng không lọt vào thẻ của bữa khác.
 *
 * Kết quả là mảng và object thường, không `Set`/`Map`: cache được persist qua
 * `JSON.stringify`, và một `Set` đi qua đó thành `{}`.
 */
export function useShareableMeals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_shareable_meals', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ShareableMeal[]> => {
      const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
      const { data: entries, error } = await supabase
        .from('meal_entries')
        .select('id, user_id, date_time, meal_type')
        .eq('user_id', user!.id)
        .gte('date_time', since)
        .order('date_time', { ascending: false });
      if (error) throw error;
      const mine = (entries ?? []).filter((e) => e && typeof e.id === 'string' && e.user_id === user!.id);
      if (mine.length === 0) return [];

      const ids = mine.map((e) => e.id);
      const { data: items, error: itemsErr } = await supabase
        .from('meal_entry_items')
        .select('id, meal_entry_id, food_item_id, food_name, servings, kcal, protein_g, carbs_g, fat_g, created_at')
        .in('meal_entry_id', ids);
      if (itemsErr) throw itemsErr;
      const rows = ((items ?? []) as MealItemRow[]).filter((r) => ids.includes(r.meal_entry_id));

      const foodIds = rows
        .map((r) => r.food_item_id)
        .filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
      let servingG: Record<string, number> = {};
      if (foodIds.length > 0) {
        const { data: foods, error: foodsErr } = await supabase
          .from('food_items')
          .select('id, serving_g')
          .in('id', foodIds);
        if (foodsErr) throw foodsErr;
        servingG = Object.fromEntries(
          (foods ?? []).filter((f) => foodIds.includes(f.id)).map((f) => [f.id, Number(f.serving_g) || 0]),
        );
      }

      return (
        mine
          .map((e) => {
            const own = rows.filter((r) => r.meal_entry_id === e.id);
            const sg = Object.fromEntries(
              own.filter((r) => r.food_item_id && r.food_item_id in servingG).map((r) => [r.food_item_id!, servingG[r.food_item_id!]]),
            );
            return {
              id: e.id,
              dateTime: e.date_time,
              mealType: e.meal_type,
              rows: own,
              servingG: sg,
              preview: payloadFromMeal('', e.meal_type, own, sg),
            };
          })
          /* Bữa rỗng không đăng được (server trả 22023) — nên nó không được mời. */
          .filter((m) => m.preview.ingredientCount > 0)
      );
    },
  });
}

/** Server từ chối một bữa không có món nào. Màn chia sẻ đã lọc bữa rỗng, nên
    lỗi này chỉ đến khi bữa bị xoá hết món giữa lúc chọn và lúc đăng. */
export class EmptyMealError extends Error {}

/** Đăng: chỉ ID của bữa và phần CHỮ đi lên. Mọi con số do `share_recipe` dựng. */
export function useShareRecipe() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async (a: { entryId: string; title: string; caption: string; visibility: 'public' | 'followers' }) => {
      const { data, error } = await supabase.rpc('share_recipe', {
        p_entry_id: a.entryId,
        p_title: a.title,
        p_caption: a.caption,
        p_visibility: a.visibility,
      });
      if (error?.code === '23505') throw new AlreadySharedError(error.message);
      if (error?.code === 'P0001') throw new ProfileRequiredError(error.message);
      if (error?.code === '22023' && /empty meal/.test(error.message)) throw new EmptyMealError(error.message);
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['community_feed'] });
      qc.invalidateQueries({ queryKey: ['community_user_posts'] });
      qc.invalidateQueries({ queryKey: ['community_shared_sessions', user?.id] });
      qc.invalidateQueries({ queryKey: ['community_shareable_meals', user?.id] });
    },
  });
}
