-- Hạn mức đếm LƯỢT GỌI, còn tiền thì tính theo TOKEN.
--
-- ── vì sao con số cũ không dùng để tính tiền được ──
--
-- `ai_usage.calls` đếm số lần gọi mỗi ngày mỗi loại. Nó đúng cho việc nó sinh
-- ra: chặn lạm dụng. Nó không đúng cho việc tính tiền, vì hai lượt gọi cùng
-- loại có thể chênh nhau hai bậc — một câu "hôm nay tập gì" và một câu kèm bảy
-- ngày dữ liệu cùng tính là `calls = 1`.
--
-- "Dùng bao nhiêu trả bấy nhiêu" cần một con số tỉ lệ với cái đã tiêu, và đó là
-- token. Nhà cung cấp trả nó trong `usage.total_tokens` của mỗi response; trước
-- migration này không chỗ nào ghi lại.
--
-- ── hai cột, không phải một bảng mới ──
--
-- `tokens` và `overage_tokens` nằm ngay trên `ai_usage`: cùng khoá chính, cùng
-- vòng đời, cùng một hàng được cập nhật trong cùng một giao dịch. Một bảng riêng
-- sẽ là hai chỗ ghi cho một sự kiện, và hai chỗ ghi thì có ngày lệch nhau.
--
-- `overage_tokens` tách khỏi `tokens` vì chúng trả lời hai câu: tổng đã tiêu, và
-- phần vượt hạn mức — phần duy nhất phải trả tiền.

ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS tokens BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overage_tokens BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ai_usage.tokens IS
  'Tổng token đã tiêu trong ngày cho loại này, lấy từ usage.total_tokens của nhà cung cấp.';
COMMENT ON COLUMN public.ai_usage.overage_tokens IS
  'Phần token tiêu SAU khi đã vượt hạn mức lượt gọi — phần duy nhất tính tiền.';

-- Ví token trả trước, tính bằng token.
--
-- ── vì sao là token chứ không phải tiền ──
--
-- Giá mỗi token đổi theo nhà cung cấp, và app này vừa dựng lớp dự phòng để đổi
-- nhà cung cấp được. Một số dư ghi bằng tiền sẽ phải quy đổi lại mỗi lần đổi
-- bên, và lần quy đổi nào cũng là một lần có thể sai theo hướng bất lợi cho
-- người đã trả tiền.
--
-- Token thì không đổi nghĩa: một token là một token, ở bên nào cũng vậy.
--
-- ── và vì sao KHÔNG dùng mascot_transactions ──
--
-- App đã có một nền kinh tế xu cho phần trò chơi. Trộn hai thứ nghĩa là một
-- người tiêu xu mua mũ cho Koa thì mất luôn khả năng hỏi coach, và không có câu
-- nào giải thích được chuyện đó cho họ.
CREATE TABLE IF NOT EXISTS public.ai_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tokens_remaining BIGINT NOT NULL DEFAULT 0 CHECK (tokens_remaining >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_credits ENABLE ROW LEVEL SECURITY;

-- Chỉ đọc, như `ai_usage`. Một client ghi được bảng này là một client tự nạp
-- được số dư của chính mình.
CREATE POLICY "Users can view own ai credits"
  ON public.ai_credits FOR SELECT
  USING (auth.uid() = user_id);

-- Cổng: một lượt gọi được phép, được phép TÍNH TIỀN, hay bị từ chối.
--
-- ── vì sao thay `claim_ai_call` chứ không thêm cạnh nó ──
--
-- `claim_ai_call` trả BOOLEAN, và boolean không diễn tả được ba trạng thái. Thêm
-- một hàm thứ hai cũng đếm lượt gọi thì có HAI bộ đếm cho một sự kiện, và hai bộ
-- đếm thì có ngày lệch nhau — đúng loại lỗi repo này đã bắt sáu lần.
--
-- Nên `ai_gate` là bản cài duy nhất, còn `claim_ai_call` trở thành một lớp mỏng
-- gọi nó. Chỗ gọi cũ không phải sửa, và không có lượt nào bị đếm hai lần.
--
-- ── 'overage' KHÔNG trừ tiền ở đây ──
--
-- Lúc này chưa ai biết lượt gọi tốn bao nhiêu token: con số đó nằm trong response
-- của nhà cung cấp, tức là ở tương lai. Cổng chỉ kiểm còn số dư hay không; trừ
-- thật xảy ra ở `spend_ai_tokens` khi đã biết con số.
CREATE OR REPLACE FUNCTION public.ai_gate(p_kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_limit INTEGER;
  v_calls INTEGER;
  v_credit BIGINT;
BEGIN
  IF v_uid IS NULL THEN RETURN 'denied'; END IF;
  IF p_kind IS NULL OR p_kind !~ '^[a-z0-9-]{1,40}$' THEN RETURN 'denied'; END IF;

  v_limit := CASE p_kind
    WHEN 'ai-coach'         THEN 60
    WHEN 'scan-food'        THEN 40
    WHEN 'ai-meal-suggest'  THEN 30
    WHEN 'ai-smart-nudges'  THEN 30
    WHEN 'ai-weekly-review' THEN 10
    WHEN 'ai-coach-memory'  THEN 20
    ELSE 20
  END;

  INSERT INTO public.ai_usage (user_id, day, kind, calls)
  VALUES (v_uid, (now() AT TIME ZONE 'utc')::date, p_kind, 1)
  ON CONFLICT (user_id, day, kind)
  DO UPDATE SET calls = public.ai_usage.calls + 1
  RETURNING calls INTO v_calls;

  IF v_calls <= v_limit THEN
    RETURN 'ok';
  END IF;

  SELECT tokens_remaining INTO v_credit FROM public.ai_credits WHERE user_id = v_uid;
  IF COALESCE(v_credit, 0) > 0 THEN
    RETURN 'overage';
  END IF;

  RETURN 'denied';
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_ai_call(p_kind TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.ai_gate(p_kind) IN ('ok', 'overage');
$$;

-- Ghi lại token đã tiêu, và trừ ví nếu lượt đó là phần vượt hạn mức.
--
-- ── vì sao trừ tối đa bằng số dư ──
--
-- `tokens_remaining` có CHECK >= 0, nên một lượt tốn hơn số dư sẽ làm giao dịch
-- HỎNG nếu trừ thẳng — và hỏng ở đây nghĩa là mất luôn bản ghi token đã tiêu,
-- tức là người dùng nhận một câu trả lời mà hệ thống không ghi được là đã tiêu
-- gì. Ghi sót về phía bất lợi cho mình còn hơn không ghi.
--
-- Nên trừ `LEAST(số dư, chi phí)`: ví về 0, phần thiếu không đòi, và cổng từ
-- chối lượt sau vì số dư đã hết. Người dùng không bao giờ nợ, và hệ thống không
-- bao giờ mất bản ghi.
CREATE OR REPLACE FUNCTION public.spend_ai_tokens(p_kind TEXT, p_tokens BIGINT, p_overage BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  IF p_kind IS NULL OR p_kind !~ '^[a-z0-9-]{1,40}$' THEN RETURN; END IF;
  -- Một con số vô lý không được phép thành một con số đang chạy: cùng luật mà
  -- `personal-model` và ngân sách xuất hiện đã ghi.
  IF p_tokens IS NULL OR p_tokens <= 0 OR p_tokens > 10000000 THEN RETURN; END IF;

  UPDATE public.ai_usage
     SET tokens = tokens + p_tokens,
         overage_tokens = overage_tokens + CASE WHEN p_overage THEN p_tokens ELSE 0 END
   WHERE user_id = v_uid AND day = (now() AT TIME ZONE 'utc')::date AND kind = p_kind;

  IF p_overage THEN
    UPDATE public.ai_credits
       SET tokens_remaining = tokens_remaining - LEAST(tokens_remaining, p_tokens),
           updated_at = now()
     WHERE user_id = v_uid;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_gate(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spend_ai_tokens(TEXT, BIGINT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_gate(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spend_ai_tokens(TEXT, BIGINT, BOOLEAN) TO authenticated;
