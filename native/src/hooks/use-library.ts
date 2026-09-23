import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { supabase } from '@/integrations/supabase/client';
import { confirmWrite } from '@/lib/write-result';
import { diaryStamp, localDateStr, localDayRangeISO } from '@/lib/local-date';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from './use-auth';

const today = () => localDateStr();

/** Supplements with today's taken state (same shape as the web checklist) */
export function useSupplementChecklist(date?: string) {
  const { user } = useAuth();
  const dateStr = date ?? today();
  return useQuery({
    queryKey: ['supplement_checklist', user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const { data: supplements, error: supErr } = await supabase
        .from('supplements')
        .select('id, name, dose_text, timing, category')
        .eq('user_id', user!.id)
        .order('timing');
      if (supErr) throw supErr;
      /* Cùng một hình dạng lỗi với `useTodayLog`: lượt đọc đầu ném, lượt thứ
         hai thì không. Bỏ `error` ở đây làm `intakes` thành `undefined`, mọi
         thực phẩm bổ sung hiện ra là CHƯA uống, và hàng tắt ở tab Dinh dưỡng
         ghi `0/4 hôm nay` cho một người đã tích đủ bốn. Không phân biệt được
         với một ngày chưa uống gì — nên người ta uống lại liều thứ hai. */
      const { data: intakes, error: intakeErr } = await supabase
        .from('supplement_intake_logs')
        .select('supplement_id, taken')
        .eq('user_id', user!.id)
        .gte('date_time', localDayRangeISO(dateStr).start)
        .lt('date_time', localDayRangeISO(dateStr).end);
      if (intakeErr) throw intakeErr;
      const takenIds = new Set((intakes ?? []).filter((i) => i.taken).map((i) => i.supplement_id));
      return (supplements ?? []).map((s) => ({ ...s, taken: takenIds.has(s.id) }));
    },
  });
}

/**
 * Một dòng của danh sách như `useSupplementChecklist` trả về.
 *
 * Chỉ `id` và `taken` được luật vá lạc quan bên dưới đụng tới; các trường còn
 * lại có mặt để `setQueryData` giữ nguyên chúng chứ không phải để đọc.
 */
interface SuppRow {
  id: string;
  taken: boolean;
}

export function useToggleSupplement(date?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ supplementId, taken }: { supplementId: string; taken: boolean }) => {
      /*
        ── read here, in the tap, not in the render ──

        This was `const dateStr = today()` in the hook body, which runs when the
        component renders. The app gets left open; a phone showing the
        supplements list at eleven at night is still showing it at ten past
        midnight, and the range below is what decides **which day's row gets
        deleted**.

        So un-ticking a supplement after midnight looked for today's entry
        inside yesterday's window: today's tick survived, and if yesterday had
        one it was removed instead. The checkbox bounced back and a day that was
        already finished quietly lost an entry.
      */
      /* `date ?? today()` đọc ở đây, trong thân mutation — tức lúc CHẠM, không
         phải lúc render. Cùng lý do đã ghi dài ở `use-water.ts`: một ứng dụng
         mở qua nửa đêm mà đọc ngày lúc render sẽ ghi vào hôm qua. Có ngày chọn
         thì nó là hằng số và tính chất ấy không mất đi. */
      const dateStr = date ?? today();
      if (taken) {
        const { error } = await supabase.from('supplement_intake_logs').insert({
          user_id: user!.id,
          supplement_id: supplementId,
          taken: true,
          /* Stamped here rather than left to the column default. It changes
             nothing while this write is online — which it always is, see below
             — but it is the honest value and costs nothing.

             `diaryStamp` thay cho `new Date()`: đường XOÁ ngay dưới đã lọc theo
             `localDayRangeISO(dateStr)`, nên nếu dòng insert vẫn đóng dấu "bây
             giờ" thì tick cho thứ Ba ghi vào hôm nay rồi bỏ tick lại không tìm
             thấy nó. Hai nửa của cùng một nút phải nói cùng một ngày. */
          ...diaryStamp(dateStr),
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('supplement_intake_logs')
          .delete()
          .eq('user_id', user!.id)
          .eq('supplement_id', supplementId)
          .gte('date_time', localDayRangeISO(dateStr).start)
          .lt('date_time', localDayRangeISO(dateStr).end);
        if (error) throw error;
      }
    },
    /**
     * Ô tích đổi NGAY, không đợi mạng.
     *
     * ── lỗi nó sinh ra để sửa ──
     *
     * Chủ dự án: "khi tích vào ô thực phẩm bổ sung còn bị delay".
     *
     * Bản cũ chỉ có `onSuccess`, nên một cú chạm phải đi hết BA lượt mạng
     * trước khi cái ô đổi hình: lượt ghi ở trên, rồi `invalidateQueries` bắt
     * `useSupplementChecklist` nạp lại, và truy vấn ấy là HAI lượt đọc
     * (`supplements` cộng `supplement_intake_logs`). Cả cú rung xác nhận cũng
     * nằm trong `onSuccess`, nên ngón tay rời ô rồi mà máy mới rung.
     *
     * Đây là đúng bài mà nút Nước đã giải và ghi lại: "Adding water is the
     * most-tapped button in the app and the round trip was the only reason it
     * ever felt like it had not registered." Ô tích này bấm mỗi ngày vài lần,
     * cùng hạng.
     *
     * ── và một chỗ nó KHÔNG giống nút Nước ──
     *
     * `patchWater` BỎ QUA phép vá khi offline, vì lượt ghi nước được hàng đợi
     * giữ lại: nó không bao giờ hỏng, nên cũng không bao giờ được hoàn tác, và
     * một phép vá còn lại trong cache bền là nước không ai uống.
     *
     * Tích bổ sung thì KHÔNG nằm trong hàng đợi ấy, và đó là một quyết định có
     * ghi lý do (xem `lib/offline-write.ts`): nó hai chiều — tích thì insert,
     * bỏ tích thì delete — nên một hàng đợi chỉ giữ nửa insert sẽ ghi âm thầm
     * điều không đúng. Chú thích ấy kết luận rằng hành vi hiện tại "fails
     * visibly offline, which is recoverable", và câu đó chính là ràng buộc ở
     * đây: offline thì lượt ghi HỎNG NGAY, `onError` trả ô về trạng thái thật,
     * và người dùng thấy nó bật lại. Nên ở đây vá cả khi offline — bỏ vá mới
     * là thứ phá mất tính chất ấy.
     */
    onMutate: async ({ supplementId, taken }) => {
      /* Rung ở LÚC CHẠM. Trước đây nó nằm trong `onSuccess`, tức lúc máy chủ
         trả lời — muộn hơn ngón tay hàng trăm mili-giây. Cùng câu mà
         `use-water.ts` đã ghi: một cú rung nói "đã ghi" thì phải rơi vào lúc
         bấm. Khác một điều: bên ấy phải BỎ vì chỗ gọi đã tự rung, còn hai chỗ
         gọi ở đây không rung, nên cú rung được DỜI chứ không bỏ. */
      Haptics.selectionAsync();
      /* Đọc đồng hồ ở đây, trong cú chạm — cùng lý do đã ghi dài trong
         `mutationFn` ngay trên. `onMutate` chạy ngay trước nó nên hai bên nói
         cùng một ngày. */
      const key = ['supplement_checklist', user?.id, date ?? today()];
      /* Nếu không huỷ, một lượt nạp lại đang bay về sẽ đáp xuống SAU phép vá
         này và xoá nó đi — ô tích bật lại một nhịp rồi mới đúng. */
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<SuppRow[]>(key);
      if (prev) {
        queryClient.setQueryData<SuppRow[]>(
          key,
          prev.map((s) => (s.id === supplementId ? { ...s, taken } : s)),
        );
      }
      return { key, prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(ctx.key, ctx.prev);
    },
    /*
      `onSettled`, không phải `onSuccess`: hỏng thì cũng phải hỏi lại máy chủ,
      nếu không cái ô sống bằng bản vá đã hoàn tác mà không ai kiểm lại.

      Khoá lấy từ `ctx` chứ không dựng lại: đó ĐÚNG khoá vừa được vá, nên không
      có đường nào để hai bên lệch ngày. `ctx` chỉ vắng khi `onMutate` ném, và
      khi ấy lùi về khoá rộng.
    */
    onSettled: (_d, _e, _v, ctx) => {
      queryClient.invalidateQueries({ queryKey: ctx?.key ?? ['supplement_checklist'] });
      queryClient.invalidateQueries({ queryKey: ['daily_log'] });
    },
  });
}

/** Add a supplement to the user's stack (port of the web useAddSupplement) */
export function useAddSupplement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sup: { name: string; category: string; dose_text: string; timing: string }) => {
      const { error } = await supabase.from('supplements').insert({
        user_id: user!.id,
        name: sup.name,
        category: sup.category,
        dose_text: sup.dose_text,
        timing: sup.timing,
        notes: '',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['supplement_checklist'] });
    },
  });
}

export function useDeleteSupplement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await confirmWrite(
        supabase.from('supplements').delete().eq('id', id),
        'Không xoá được thực phẩm bổ sung này',
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplement_checklist'] }),
  });
}

/**
 * Cả thư viện bài tập.
 *
 * `enabled` mặc định `true`, nên mọi chỗ gọi cũ không đổi một chữ. Nó có mặt
 * cho đúng một loại người gọi: màn chỉ cần thư viện SAU một cử chỉ — sheet
 * hướng dẫn mở tab "Thiết bị"/"Liên quan". Mở sheet mà không chạm hai tab ấy
 * thì không có lượt mạng nào, đúng lời dặn *"Do not load all media/tabs
 * eagerly"*.
 *
 * Cùng `queryKey` với lượt gọi không tham số, nên khi màn Plan đã chạy nó rồi
 * thì đây là một cú CHẠM CACHE — không phải một truy vấn thứ hai. Và câu
 * `select` KHÔNG được nới ra vì ba tab ấy: `tools/exercise-guide.mjs` luật 3
 * canh đúng chuyện đó.
 */
export function useExercises(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['exercises', user?.id],
    enabled: enabled && !!user,
    queryFn: async () => {
      // Seed exercises have user_id NULL and are visible to everyone (web parity)
      const { data, error } = await supabase
        .from('exercises')
        /* `exercise_kind` is what tells the trend engine whether an estimated
           one-rep-max means anything for this movement — a curl's is a category
           error, a squat's is not. See `lib/exercise-kind.ts`. */
        .select('id, user_id, name, muscle_group, equipment, exercise_kind')
        .or(`user_id.is.null,user_id.eq.${user!.id}`)
        .order('muscle_group')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDeleteExercise() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await confirmWrite(
        supabase.from('exercises').delete().eq('id', id).eq('user_id', user!.id),
        'Không xoá được bài tập này',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises', user?.id] });
    },
  });
}

export function useAddExercise() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ex: {
      name: string;
      muscle_group: string;
      equipment?: string;
      /**
       * What kind of movement it is, which decides what the trend engine reads
       * for it — see `lib/exercise-kind.ts`. Optional, and `undefined` is a real
       * answer: it means nobody has said, and the engine infers. What it must
       * never be is a default, because a default is a claim.
       */
      exercise_kind?: string;
    }) => {
      const { data, error } = await supabase
        .from('exercises')
        .insert({ ...ex, user_id: user!.id })
        .select('id, name, muscle_group, equipment, exercise_kind')
        .single();
      if (error) throw error;
      return data;
    },
    /* Rung lúc chạm. `selectionAsync` nghĩa là "một lựa chọn đang đổi", nên
       đặt nó sau một vòng mạng là nói sai thời điểm của chính thứ nó đại diện;
       báo KẾT QUẢ thì đã có `notificationAsync`, và 27 chỗ khác trong app dùng
       đúng nó. Xem `tools/tap-feedback.mjs`. */
    onMutate: () => {
      Haptics.selectionAsync();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises', user?.id] });
    },
  });
}

export interface TemplateExercise {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  reps: number;
  weight: number;
  rpe?: number;
  restSeconds?: number;
}

export function useAddWorkoutTemplate() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    /*
      Returns the new row's id.

      It used to return nothing, which was enough for as long as the only thing
      anybody did after saving a workout was leave the screen. The builder can
      now be opened *from* Plan, carrying the day it was opened for, and putting
      the workout on that day means writing `routine_days.template_id` — an id
      that does not exist until this insert has run and which nothing else on
      the client can work out. Reading it back by name would be a guess: two
      workouts are allowed to share a name, and the second one would silently
      schedule the first.
    */
    mutationFn: async (tpl: { name: string; type: string; exercises: TemplateExercise[] }) => {
      const { data, error } = await supabase
        .from('workout_templates')
        .insert({
          user_id: user!.id,
          name: tpl.name,
          type: tpl.type || 'custom',
          exercises: tpl.exercises as unknown as Json,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['workout_templates', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['workout_template_names', user?.id] });
    },
  });
}

export function useDeleteWorkoutTemplate() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await confirmWrite(
        supabase.from('workout_templates')
          .delete()
          .eq('id', id)
          .eq('user_id', user!.id),
        'Không xoá được mẫu tập này',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_templates', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['workout_template_names', user?.id] });
    },
  });
}

export function useRoutineDays() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['routine_days', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('routine_days')
        .select('id, day_of_week, is_rest, is_deload, notes, template_id')
        .eq('user_id', user!.id)
        .order('day_of_week');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWorkoutTemplateNames() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['workout_template_names', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_templates')
        .select('id, name')
        .eq('user_id', user!.id);
      if (error) throw error;
      /* Object thuần, không phải `Map`. Cache của app này được persist qua
         JSON.stringify, thứ biến `Map` thành `{}` — và `.get(...)` ở lần khởi
         động sau là một cú ném. Lỗi này nằm im từ lâu vì hook hiện KHÔNG được
         dùng ở đâu; nó sẽ nổ vào ngày ai đó nối nó vào. */
      return Object.fromEntries((data ?? []).map((t) => [t.id, t.name] as const));
    },
  });
}

/** Full workout templates for the routine planner picker */
export function useWorkoutTemplates() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['workout_templates', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_templates')
        // `created_at` is what the Workouts tab sorts on — it shows the three
        // you made most recently, and a routine you wrote this morning being
        // filed under "A" is not a reason to see it first. The order below
        // stays alphabetical because the routine planner's picker reads this
        // same query and a picker is a list you scan by name.
        .select('id, name, type, exercises, created_at')
        .eq('user_id', user!.id)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Assign / clear a routine day — same upsert contract as the web app */
export function useUpsertRoutineDay() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (day: {
      day_of_week: number;
      template_id?: string | null;
      is_rest?: boolean;
      is_deload?: boolean;
    }) => {
      const { error } = await supabase
        .from('routine_days')
        .upsert({ user_id: user!.id, ...day }, { onConflict: 'user_id,day_of_week' });
      if (error) throw error;
    },
    /* Rung lúc chạm — và MỘT lần. `week-plan.tsx` có hai chỗ gọi: `assign`
       từng tự rung thêm ở `onPress` nên nó rung hai lần (một lúc chạm, một khi
       mạng xong), còn `toggleDeload` thì không rung gì cho tới khi mạng xong.
       Đặt ở đây thì cả hai chỗ có đúng một cú, đúng lúc. */
    onMutate: () => {
      Haptics.selectionAsync();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['routine_days', user?.id] });
    },
  });
}

export function useMealPlans() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['meal_plans', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meal_plans')
        .select('id, name, goal, meals_per_day, start_date, end_date')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Mỗi thực đơn đã lấp được bao nhiêu ô, trong MỘT truy vấn.
 *
 * ── vì sao không dùng `useMealPlanItems` ──
 *
 * Hook kia lấy theo từng plan. Danh sách xem trước hiện ba plan, nên nó sẽ là
 * ba truy vấn cho một khối duy nhất trên màn hình — và con số đó lớn dần theo
 * số plan người dùng có.
 *
 * ── vì sao chỉ lấy hai cột ──
 *
 * Khối này chỉ cần biết Ô NÀO đã có món, không cần biết món gì. Kéo cả tên món,
 * calo và bốn macro về để rồi đếm là trả tiền băng thông cho dữ liệu bị vứt đi
 * ngay dòng sau.
 *
 * ── vì sao KHÔNG trả về Map ──
 *
 * Cache của app này được persist xuống AsyncStorage qua `JSON.stringify`, và
 * `JSON.stringify(new Map())` cho ra `{}`. Lần khởi động sau, `.get(...)` trên
 * nó là "undefined is not a function".
 *
 * Lỗi đó đã xảy ra một lần trong repo này với một `Set`, và bản đầu của chính
 * hàm này mắc lại y hệt — `tools/persisted-query.mjs` không bắt được vì nó chỉ
 * soi những `return {` dạng object literal, tức chỉ bắt đúng hình dạng của lần
 * đầu. Luật đã được sửa cùng lúc với hàm này.
 *
 * Nên: object thuần, thứ đi qua JSON và về nguyên vẹn. Tra cứu bằng `?.[]` chứ
 * không phải `.get()`.
 */
export function useMealPlanFill(planIds: string[]) {
  const { user } = useAuth();
  const key = planIds.slice().sort().join(',');
  return useQuery({
    queryKey: ['meal_plan_fill', user?.id, key],
    enabled: !!user && planIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meal_plan_items')
        .select('meal_plan_id, day_index')
        .in('meal_plan_id', planIds);
      if (error) throw error;
      const out: Record<string, Record<number, number>> = {};
      for (const row of data ?? []) {
        const days = (out[row.meal_plan_id] ??= {});
        days[row.day_index] = (days[row.day_index] ?? 0) + 1;
      }
      return out;
    },
  });
}

export function useCreateMealPlan() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: { name: string; goal: string; meals_per_day: number }) => {
      const { data, error } = await supabase
        .from('meal_plans')
        .insert({ user_id: user!.id, ...plan })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['meal_plans', user?.id] });
    },
  });
}

export function useDeleteMealPlan() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await confirmWrite(
        supabase.from('meal_plans')
          .delete()
          .eq('id', id)
          .eq('user_id', user!.id),
        'Không xoá được thực đơn này',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans', user?.id] });
    },
  });
}

export function useMealPlanItems(planId: string | null) {
  return useQuery({
    queryKey: ['meal_plan_items', planId],
    enabled: !!planId,
    queryFn: async () => {
      /*
        Every column a planned food carries, not just the two the old list
        showed.

        This select was written for a card that printed a name and a calorie
        count, and it stayed that way when "Log to today" started reading the
        same rows and writing them into the diary. `PlannedFood` had every field
        optional, so handing it these rows typechecked — and carbs and fat
        arrived as `undefined`, became 0, and were written as 0. The meal landed
        in the diary with its name and its calories and none of its macros, and
        the only visible symptom was two bars on the Nutrition tab that did not
        move.

        `serving_g` and `food_item_id` were missing for the same reason and cost
        the link back to the food they came from.
      */
      const { data, error } = await supabase
        .from('meal_plan_items')
        .select('id, day_index, meal_type, food_name, serving_g, kcal, protein_g, carbs_g, fat_g, food_item_id')
        .eq('meal_plan_id', planId!)
        .order('day_index')
        .order('meal_type');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface MealPlanItemInput {
  meal_plan_id: string;
  day_index: number;
  meal_type: string;
  food_name: string;
  serving_g: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  food_item_id?: string | null;
}

/** Add a food to a meal plan (port of the web useAddMealPlanItem) */
export function useAddMealPlanItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: MealPlanItemInput) => {
      const { error } = await supabase.from('meal_plan_items').insert(item);
      if (error) throw error;
    },
    /* Rung lúc chạm — `impact` là hai vật vừa va nhau, và cái va ấy là ngón
       tay, không phải gói tin trả về. Xem `tools/tap-feedback.mjs`. */
    onMutate: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onSuccess: (_data, item) => {
      queryClient.invalidateQueries({ queryKey: ['meal_plan_items', item.meal_plan_id] });
      /* `meal_plan_fill` cũng phải hết hiệu lực, không thì ô ngày trên danh
         sách thực đơn chỉ sáng lên sau khi tải lại trang — đã bị báo đúng như
         vậy. Không truyền id: khoá của nó chứa danh sách plan đang xem, mà chỗ
         này không biết danh sách đó. */
      queryClient.invalidateQueries({ queryKey: ['meal_plan_fill'] });
    },
  });
}

export function useDeleteMealPlanItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; planId: string }) => {
      await confirmWrite(
        supabase.from('meal_plan_items').delete().eq('id', id),
        'Không xoá được món trong thực đơn',
      );
    },
    onSuccess: (_data, { planId }) => {
      queryClient.invalidateQueries({ queryKey: ['meal_plan_items', planId] });
      /* `meal_plan_fill` cũng phải hết hiệu lực, không thì ô ngày trên danh
         sách thực đơn chỉ sáng lên sau khi tải lại trang — đã bị báo đúng như
         vậy. Không truyền id: khoá của nó chứa danh sách plan đang xem, mà chỗ
         này không biết danh sách đó. */
      queryClient.invalidateQueries({ queryKey: ['meal_plan_fill'] });
    },
  });
}
