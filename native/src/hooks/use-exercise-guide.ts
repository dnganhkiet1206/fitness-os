import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { exerciseKey } from '@/lib/exercise-key';
import { useAuth } from '@/hooks/use-auth';
import { useAppSettings } from '@/hooks/use-app-settings';
import type { AppLang } from '@/lib/i18n';
import { pickContent, type GuideContentRow } from '@/lib/guide-content';
import { resolveExerciseMedia, type MediaRow, type MediaState } from '@/lib/exercise-media';
import { equipmentLabel, equipmentMatchKey } from '@/lib/equipment';
import { MUSCLE_LABEL, muscleArtKeysFor, muscleGroupLabel, type MuscleArtKey } from '@/lib/muscle-group';

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
 * ── hai bảng, và lý do có bảng thứ hai ──
 *
 * `exercises` mang danh tính và những thứ không đổi theo ngôn ngữ: tên, nhóm
 * cơ, dụng cụ, `video_url`. Nội dung ĐỌC ĐƯỢC — điểm kỹ thuật, lỗi thường gặp
 * — nằm ở `exercise_guide_content`, một dòng cho mỗi (bài tập, ngôn ngữ).
 *
 * Trước đó chúng là hai cột `TEXT[]` trên chính `exercises`. Một mảng giữ được
 * một ngôn ngữ, mà app chạy hai (`AppLang`), nên người dùng tiếng Anh đọc tiêu
 * đề "Form cues" bên trên "Vai ép xuống ghế". Thêm `form_cues_en` sẽ làm schema
 * mọc ngang thêm một cột mỗi lần thêm một tiếng; một dòng cho mỗi ngôn ngữ mọc
 * xuống, đúng việc của hàng.
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

/**
 * Một dòng của thư viện, đúng những cột mà hướng dẫn cần.
 *
 * `form_cues` và `common_mistakes` KHÔNG còn ở đây. Chúng vẫn tồn tại trên
 * bảng `exercises` — migration không xoá cột, vì xoá cột là việc không lùi
 * được — nhưng chúng là một mảng, tức một ngôn ngữ, và app chạy hai. Nội dung
 * nay đến từ `exercise_guide_content`, và việc màn này KHÔNG đọc được mảng cũ
 * là thứ khiến "không trộn hai ngôn ngữ" là một tính chất của cấu trúc chứ
 * không phải một lời hứa.
 */
interface GuideRow {
  id: string;
  user_id: string | null;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
  video_url: string | null;
}



/**
 * ════════════════ HỢP ĐỒNG DỮ LIỆU CỦA HƯỚNG DẪN ════════════════
 *
 * Đây là thứ DUY NHẤT màn hình được biết. Nó cố ý không mang theo:
 *
 *   · tên cột của cơ sở dữ liệu   (`muscle_group`, `video_url`, `form_cues`)
 *   · quy tắc lùi ngôn ngữ        (`pickContent` giải xong rồi mới tới đây)
 *   · quy tắc chuẩn hoá khoá      (`chest` → "Ngực" đã xong ở dưới này)
 *   · nội dung đến từ hạt giống hay từ người dùng
 *
 * Lý do không phải là gọn gàng. Bản trước, màn hình tự gọi `muscleGroupLabel`
 * và `equipmentLabel` — tức là NÓ biết cột lưu khoá chứ không lưu nhãn. Thế
 * thì mỗi chỗ in ra một giá trị lại phải nhớ luật ấy một lần, và chỗ nào quên
 * sẽ in `chest` ra cho người dùng đọc mà không gì bắt được. Một nơi dịch,
 * nhiều nơi vẽ.
 *
 * ── bắt buộc có ──
 *
 *     name            luôn có chữ: tên thư viện nếu khớp, không thì tên kế
 *                     hoạch đang hiển thị. Tiêu đề không bao giờ trống.
 *     formCues        mảng, có thể rỗng — không bao giờ `null`
 *     commonMistakes  như trên
 *     matchedBy       'id' | 'name' | 'none' — danh tính đã được giải thế nào
 *     hasContent      có gì để DẠY không
 *     hasMetadata     có gì để NÓI về bài tập không
 *
 * ── tuỳ chọn, và `null` là một câu trả lời thật ──
 *
 *     id              `null` khi không dòng thư viện nào khớp
 *     equipment       ĐÃ LÀ NHÃN. `null` khi không biết
 *     muscleGroup     ĐÃ LÀ NHÃN. `null` khi không biết
 *     media           bốn trạng thái; `none` khi bài này chưa có hình
 *     contentLocale   `null` khi không có nội dung nào
 *
 * ── ngôn ngữ ──
 *
 * `contentLocale` là ngôn ngữ mà CẢ HAI danh sách đến từ. Không bao giờ là
 * "một nửa tiếng này, một nửa tiếng kia": quy tắc là *tiếng đang bật → tiếng
 * Việt → rỗng*, và ngôn ngữ đã chọn sở hữu trọn gói — xem `lib/guide-content.ts`.
 *
 * Nhãn `equipment`/`muscleGroup` thì theo ngôn ngữ ĐANG BẬT, không theo
 * `contentLocale`: chúng là nhãn giao diện, không phải nội dung được viết.
 * Một người đọc tiếng Anh xem bài chưa dịch sẽ thấy "Equipment · Barbell" bên
 * trên các câu tiếng Việt, và đó là đúng — nhãn là của app, câu là của tác giả.
 *
 * ── ba trạng thái, và màn hình KHÔNG được gộp chúng ──
 *
 *     đang đọc     `isPending`  → vòng quay; chưa khẳng định gì về dữ liệu
 *     đọc hỏng     `isError`    → thẻ "không đọc được" + nút thử lại
 *     đọc xong     còn lại      → lúc này `hasContent`/`hasMetadata` mới có nghĩa
 *
 * Trạng thái của MEDIA nằm trong `GuideMedia` và độc lập với ba cái trên: một
 * URL đúng vẫn 404 được sau khi truy vấn đã thành công.
 */
export interface ExerciseGuide {
  /** Dòng thư viện đã khớp, hoặc `null` khi không khớp được gì. */
  id: string | null;
  /** Luôn có: tên từ thư viện nếu khớp, không thì tên kế hoạch đang hiển thị. */
  name: string;
  /** ĐÃ LÀ NHÃN theo ngôn ngữ đang bật — màn hình in thẳng. */
  muscleGroup: string | null;
  /** ĐÃ LÀ NHÃN theo ngôn ngữ đang bật — màn hình in thẳng. */
  equipment: string | null;
  /**
   * Từng nhóm cơ MỘT — khoá để tra hình, nhãn ĐÃ DỊCH để in.
   *
   * `muscleGroup` ở trên là một dòng đã nối (`Lưng / Chân`), đúng cho một câu
   * siêu dữ liệu và vô dụng cho một lưới hình: mỗi ô cần đúng một khoá và đúng
   * một nhãn của riêng nó. Tách chuỗi đã nối ra lại chính là phép tra ngược mà
   * hợp đồng này tồn tại để cấm.
   *
   * Cả hai vế đến từ đây, không từ màn hình: `tools/guide-content.mjs` luật 18
   * canh rằng màn hướng dẫn KHÔNG import hàm nhãn nào — một nơi dịch, nhiều
   * nơi vẽ.
   *
   * Rỗng = thư viện không nhận ra chuỗi đang lưu (hoặc cột trống). Đó là một
   * câu trả lời thật: `Forearms` không có hình nào, và bịa cho nó một hình là
   * xếp nó vào một nhóm cơ không ai chọn.
   */
  muscles: { key: MuscleArtKey; label: string }[];
  /**
   * Khoá để hỏi "bài nào cùng dụng cụ". `null` = cột dụng cụ TRỐNG, tức không
   * bài nào cùng dụng cụ với nó — xem `equipmentMatchKey`.
   */
  equipmentKey: string | null;
  /** các bước "cách thực hiện", theo thứ tự. Rỗng khi chưa ai viết. */
  instructions: string[];
  formCues: string[];
  commonMistakes: string[];
  /**
   * Bộ media ĐÃ PHÂN GIẢI — bốn trạng thái, xem `lib/exercise-media.ts`.
   *
   * Không phải một URL nữa. Màn hình đọc `media.type` để quyết định vẽ chấm
   * trang, thời lượng hay không gì cả; nó không bao giờ đoán từ đuôi tệp và
   * không bao giờ hỏi tên bài.
   */
  media: MediaState;
  /** Cách dòng này được tìm ra — màn hình không cần, luật kiểm thì cần. */
  matchedBy: 'id' | 'name' | 'none';
  /** Ngôn ngữ mà CẢ HAI danh sách đến từ, hoặc `null` khi không có gì. */
  contentLocale: AppLang | null;
  /**
   * Có gì để DẠY không — điểm kỹ thuật hoặc lỗi thường gặp.
   *
   * Tính ở đây chứ không ở màn hình, vì bản trước màn hình tự tính và tính
   * SAI: nó gộp cả `hasFacts` vào, nên một bài có dụng cụ và nhóm cơ nhưng
   * KHÔNG có câu hướng dẫn nào lại không được coi là rỗng — và màn hình hiện
   * hai dòng thông tin rồi im lặng, không nói gì về việc không có hướng dẫn.
   * Đó đúng là trường hợp của MỌI bài tập người dùng tự thêm.
   */
  hasContent: boolean;
  /** Có dụng cụ hoặc nhóm cơ để nói không. Hai câu hỏi khác nhau. */
  hasMetadata: boolean;
}

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
  const { lang } = useAppSettings();
  const key = exerciseKey(name);

  return useQuery<ExerciseGuide>({
    /* Khoá cache mang CẢ hai đường tra: hai bài khác nhau cùng tên mà khác id
       phải là hai mục cache khác nhau. Và mang cả NGÔN NGỮ: đổi tiếng giữa
       chừng phải ra nội dung khác, không ra bản đã nhớ của tiếng cũ. */
    queryKey: ['exercise-guide', user?.id, exerciseId ?? null, key, lang],
    enabled: enabled && !!user && (!!exerciseId || !!key),
    /* Hướng dẫn gần như không đổi. Một buổi tập mở đi mở lại cùng một bài thì
       không có lý do gì gọi mạng lần thứ hai. */
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const COLS = 'id, user_id, name, muscle_group, equipment, video_url';
      const visible = `user_id.is.null,user_id.eq.${user!.id}`;

      /*
        Nội dung được lấy ở lượt THỨ HAI, sau khi đã biết dòng nào.

        Không nhúng vào câu trên (`exercises(…, exercise_guide_content(…))`) vì
        đường tra theo TÊN kéo về MỌI bài đang thấy rồi mới lọc trong JS — nhúng
        ở đó là tải nội dung của cả thư viện để đọc một bài. Ở đây là một truy
        vấn nhỏ theo khoá chính, chạy đúng một lần mỗi lần mở sheet.
      */
      const withContent = async (row: GuideRow, matchedBy: 'id' | 'name') => {
        /*
          Hai truy vấn phụ chạy SONG SONG.

          Chúng độc lập — chữ ở một bảng, media ở một bảng khác — nên chạy nối
          tiếp là cộng thẳng một vòng mạng vào thời gian mở sheet mà không đổi
          lại gì. `Promise.all` giữ nguyên hành vi lỗi: một trong hai hỏng thì
          cả lượt đọc hỏng, và sheet vào trạng thái "không đọc được dữ liệu" —
          đúng như khi chỉ có một truy vấn.
        */
        const [content, media] = await Promise.all([
          supabase
            .from('exercise_guide_content')
            .select('locale, instructions, form_cues, common_mistakes')
            .eq('exercise_id', row.id),
          supabase
            .from('exercise_media')
            .select('kind, uri, position, duration_s, poster_uri, alt')
            .eq('exercise_id', row.id),
        ]);
        if (content.error) throw content.error;
        if (media.error) throw media.error;
        return shape(
          row,
          matchedBy,
          name,
          pickContent((content.data ?? []) as GuideContentRow[], lang),
          lang,
          (media.data ?? []) as MediaRow[],
        );
      };

      /* ── 1. theo ID, đường chính tắc ── */
      if (exerciseId) {
        const { data, error } = await supabase
          .from('exercises')
          .select(COLS)
          .eq('id', exerciseId)
          .or(visible);
        if (error) throw error;
        const row = pick((data ?? []) as GuideRow[]);
        if (row) return withContent(row, 'id');
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
        if (row) return withContent(row, 'name');
      }

      /* ── 3. không khớp gì ── */
      return {
        id: null,
        name,
        muscleGroup: null,
        equipment: null,
        muscles: [],
        equipmentKey: null,
        instructions: [],
        formCues: [],
        commonMistakes: [],
        media: { type: 'none', items: [] },
        matchedBy: 'none' as const,
        contentLocale: null,
        hasContent: false,
        hasMetadata: false,
      };
    },
  });
}

function shape(
  row: GuideRow,
  matchedBy: 'id' | 'name',
  fallbackName: string,
  content: { locale: AppLang; instructions: string[]; formCues: string[]; commonMistakes: string[] } | null,
  lang: AppLang,
  mediaRows: MediaRow[],
): ExerciseGuide {
  /* Khoá → nhãn NGAY TẠI ĐÂY, không để màn hình làm. Hai hàm này cũng là thứ
     trả lại nguyên văn một giá trị lịch sử mà bảng đồng nghĩa không nhận ra,
     nên `Kettlebell` của người dùng đi qua mà không bị đụng. */
  const equipment = trimmed(equipmentLabel(row.equipment, lang));
  const muscleGroup = trimmed(muscleGroupLabel(row.muscle_group, lang));
  /* Cả hai danh sách từ CÙNG một dòng, hoặc cả hai rỗng. Không có nhánh nào
     lấy một danh sách ở đây và một ở kia. */
  const instructions = content?.instructions ?? [];
  const formCues = content?.formCues ?? [];
  const commonMistakes = content?.commonMistakes ?? [];
  return {
    id: row.id,
    name: trimmed(row.name) ?? fallbackName,
    muscleGroup,
    equipment,
    /* Khoá được dẫn ra từ CỘT THÔ, không từ nhãn vừa tính ở trên. Nhãn đã đi
       qua một phép dịch; dịch xong rồi tra ngược là hỏi bảng đồng nghĩa một
       câu hỏi nó không được thiết kế để trả lời.

       Nhãn của từng ô đi kèm ngay tại đây vì cùng một lý do đã dựng nên
       `muscleGroup`: nếu màn hình tự tra `MUSCLE_LABEL` thì có HAI nơi dịch
       khoá thành nhãn, và hai nơi sẽ lệch. */
    muscles: muscleArtKeysFor(row.muscle_group).map((key) => ({ key, label: MUSCLE_LABEL[key][lang] })),
    equipmentKey: equipmentMatchKey(row.equipment),
    instructions,
    formCues,
    commonMistakes,
    /* `video_url` vào đây làm ĐƯỜNG LUI, không làm nguồn chính — xem
       `resolveExerciseMedia`. Bài chưa có hàng `exercise_media` nào thì cột cũ
       vẫn được đọc, nên không dòng dữ liệu nào đang chạy bị làm trắng. */
    media: resolveExerciseMedia(mediaRows, row.video_url),
    matchedBy,
    contentLocale: content?.locale ?? null,
    hasContent: instructions.length > 0 || formCues.length > 0 || commonMistakes.length > 0,
    hasMetadata: !!(equipment || muscleGroup),
  };
}
