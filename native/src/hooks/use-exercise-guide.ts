import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { exerciseKey } from '@/lib/exercise-key';
import { useAuth } from '@/hooks/use-auth';

/**
 * CÁCH LÀM một bài tập — tách hẳn khỏi việc bạn đã làm nó thế nào.
 *
 * ── bốn khái niệm, và đây là cái thứ tư ──
 *
 *     Exercise Definition   bài tập ấy LÀ gì          bảng `exercises`
 *     Workout Template      hôm nay tập bài nào       `workout_templates`
 *     Workout Session       bạn đã làm được gì        `workout_sessions`
 *     Exercise Guide        làm nó NHƯ THẾ NÀO        ← tệp này
 *     Exercise Insight      bạn đang tiến bộ ra sao   `/exercise-insight`
 *
 * Guide và Insight KHÔNG gộp. Một cái dạy, một cái chấm điểm; chúng trả lời hai
 * câu hỏi khác nhau ở hai thời điểm khác nhau của buổi tập, và gộp lại sẽ làm
 * cả hai dài ra mà không cái nào sắc hơn.
 *
 * ── không có bảng mới, và không có kho ảnh mới ──
 *
 * `exercises` đã mang sẵn `form_cues TEXT[]`, `common_mistakes TEXT[]` và
 * `video_url TEXT` từ migration ĐẦU TIÊN (`20260212040248`), và cả mười dòng
 * seed đã có `form_cues`. Nên không có gì để tạo: thứ cần là một truy vấn đọc
 * đúng mấy cột ấy.
 *
 * ── vì sao nó là truy vấn RIÊNG chứ không nối vào `useExercises()` ──
 *
 * Màn Plan đã chạy `useExercises()` sẵn (qua `useExerciseInsights`). Nới câu
 * select của nó là bắt MỌI lần mở Plan tải thêm hướng dẫn của mọi bài — kể cả
 * bài không ai mở. Đặt hàng nói thẳng: *"Do not fetch media for exercises that
 * were never opened."*
 *
 * Nên truy vấn này `enabled` theo chính cái sheet: nó chỉ chạy khi có người mở
 * hướng dẫn, và chỉ cho MỘT bài. Plan không nặng thêm một byte nào.
 *
 * ── tra theo ID trước, theo TÊN sau, và thứ tự ấy là bắt buộc ──
 *
 * `exerciseId` là khoá chính tắc kể từ lượt sửa ranh giới danh tính. Nhưng nó
 * TUỲ CHỌN và sẽ tuỳ chọn mãi: template tạo trước lượt ấy không có, bài thêm
 * tay giữa buổi không có, và `workout_templates.exercises` là JSONB không ràng
 * buộc nên không gì bắt nó phải tồn tại hay trỏ đúng.
 *
 * Nên: có id thì tra id. Không có — hoặc có mà trỏ hụt — thì lùi về
 * `exerciseKey(name)`, đúng đường mà toàn bộ lịch sử của app đang đi. Không
 * bao giờ ngược lại: tra theo tên khi đã có id là tự chuốc lấy đúng cái mơ hồ
 * mà id sinh ra để gỡ.
 */

/** Một dòng của thư viện, đúng những cột mà hướng dẫn cần. */
interface GuideRow {
  id: string;
  user_id: string | null;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
  form_cues: string[] | null;
  common_mistakes: string[] | null;
  video_url: string | null;
}

/**
 * Hướng dẫn đã giải xong, ở dạng màn hình dùng được.
 *
 * Mảng rỗng chứ không `null` cho ba danh sách: chỗ vẽ chỉ phải hỏi `.length`,
 * và một `?? []` quên ở đâu đó là một màn trắng không ai giải thích được.
 */
export interface ExerciseGuide {
  /** Dòng thư viện đã khớp, hoặc `null` khi không khớp được gì. */
  id: string | null;
  /** Luôn có: tên từ thư viện nếu khớp, không thì tên kế hoạch đang hiển thị. */
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
  formCues: string[];
  commonMistakes: string[];
  /** URL ảnh/ảnh động minh hoạ. `null` khi bài này chưa có gì. */
  mediaUrl: string | null;
  /** Cách dòng này được tìm ra — màn hình không cần, luật kiểm thì cần. */
  matchedBy: 'id' | 'name' | 'none';
}

const clean = (xs: string[] | null | undefined): string[] =>
  (xs ?? []).map((s) => (s ?? '').trim()).filter(Boolean);

const trimmed = (s: string | null | undefined): string | null => {
  const v = (s ?? '').trim();
  return v ? v : null;
};

/**
 * Chọn MỘT dòng trong số các dòng cùng tên.
 *
 * Thư viện có dòng seed (`user_id` là null, ai cũng thấy) và dòng người dùng tự
 * thêm. Trùng tên là chuyện bình thường: người ta sửa một bài seed bằng cách
 * tạo bản của mình. Bản của NGƯỜI DÙNG thắng — đó là bản họ đã sửa.
 *
 * Cùng tiebreak mà `use-exercise-insights.ts` đã dùng cho `declaredKinds`.
 * Viết lại ở đây thay vì gọi chung vì hai bên đọc hai hình dạng dữ liệu khác
 * nhau; cái phải giống là QUY TẮC, và nó được ghi ra ở cả hai chỗ.
 */
const pick = (rows: GuideRow[]): GuideRow | null => {
  if (!rows.length) return null;
  return rows.find((r) => r.user_id) ?? rows[0];
};

/**
 * Hướng dẫn cho một bài tập.
 *
 * @param exerciseId khoá chính tắc, khi kế hoạch có nó
 * @param name       tên đang hiển thị — vừa là đường lui, vừa là thứ hiện ra
 *                   khi không khớp được dòng nào
 * @param enabled    truy vấn chỉ chạy khi sheet đang mở
 */
export function useExerciseGuide(
  exerciseId: string | null | undefined,
  name: string,
  enabled = true,
) {
  const { user } = useAuth();
  const key = exerciseKey(name);

  return useQuery<ExerciseGuide>({
    /* Khoá cache mang CẢ hai đường tra: hai bài khác nhau cùng tên mà khác id
       phải là hai mục cache khác nhau. */
    queryKey: ['exercise-guide', user?.id, exerciseId ?? null, key],
    enabled: enabled && !!user && (!!exerciseId || !!key),
    /* Hướng dẫn gần như không đổi. Một buổi tập mở đi mở lại cùng một bài thì
       không có lý do gì gọi mạng lần thứ hai. */
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const COLS = 'id, user_id, name, muscle_group, equipment, form_cues, common_mistakes, video_url';
      const visible = `user_id.is.null,user_id.eq.${user!.id}`;

      /* ── 1. theo ID, đường chính tắc ── */
      if (exerciseId) {
        const { data, error } = await supabase
          .from('exercises')
          .select(COLS)
          .eq('id', exerciseId)
          .or(visible);
        if (error) throw error;
        const row = pick((data ?? []) as GuideRow[]);
        if (row) return shape(row, 'id', name);
        /* Id trỏ hụt — bài đã bị xoá khỏi thư viện, hoặc thuộc người khác.
           KHÔNG ném: rơi xuống đường tên ngay dưới, đúng như dữ liệu cũ. */
      }

      /* ── 2. theo TÊN, đường lui vĩnh viễn ── */
      if (key) {
        const { data, error } = await supabase
          .from('exercises')
          .select(COLS)
          .or(visible);
        if (error) throw error;
        const row = pick(((data ?? []) as GuideRow[]).filter((r) => exerciseKey(r.name) === key));
        if (row) return shape(row, 'name', name);
      }

      /* ── 3. không khớp gì ── */
      return {
        id: null,
        name,
        muscleGroup: null,
        equipment: null,
        formCues: [],
        commonMistakes: [],
        mediaUrl: null,
        matchedBy: 'none' as const,
      };
    },
  });
}

function shape(row: GuideRow, matchedBy: 'id' | 'name', fallbackName: string): ExerciseGuide {
  return {
    id: row.id,
    name: trimmed(row.name) ?? fallbackName,
    muscleGroup: trimmed(row.muscle_group),
    equipment: trimmed(row.equipment),
    formCues: clean(row.form_cues),
    commonMistakes: clean(row.common_mistakes),
    mediaUrl: trimmed(row.video_url),
    matchedBy,
  };
}
