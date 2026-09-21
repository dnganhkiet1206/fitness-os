import { useCallback, useEffect, useRef, useState } from 'react';
import type Animated from 'react-native-reanimated';

import { TICK_W } from '@/constants/ruler';

/**
 * Cái kim của một chiếc thước: nó đang chỉ vạch nào, và ai được phép dời nó.
 *
 * ── vì sao nó ra đời ──
 *
 * `Ruler` là một thành phần dùng chung, nhưng thứ NỐI nó vào một màn thì chưa:
 * mỗi chỗ dùng tự dựng lại cùng một bộ ba `index` / `placed` / `onIndex`, và
 * bộ ba ấy có đúng một chỗ dễ sai mà không ai thấy. Luồng onboarding thêm HAI
 * chỗ dùng nữa (chiều cao và cân nặng), nên đây là lúc nó thành một bản.
 *
 * ── chỗ dễ sai ấy ──
 *
 * `placed` là một ref chứ không phải state, và nó chặn MỌI lượt báo của thước
 * cho tới khi thước đã được đặt đúng chỗ. Không có nó thì cú `scrollTo` mở màn
 * tự nó phát ra một lượt `onIndex`, và app ghi nhận rằng người dùng vừa chọn
 * một con số — trong khi người dùng chưa chạm vào gì cả. Ở màn cân nặng thì
 * chiếc cân "thức dậy" ngay lúc mở, tức hiệu ứng mất hẳn nghĩa.
 *
 * Nó là ref chứ không phải state vì lật nó KHÔNG được tự gây một lượt render
 * giữa một cú kéo. Cùng hình dạng với `weight-goal-dialog`, và vì cùng lý do
 * đã ghi ở đó.
 *
 * ── hook này KHÔNG biết gì về đơn vị ──
 *
 * Nó nhận `min10` (giá trị của vạch 0, tính bằng phần mười) và trả `value` đã
 * chia về số thật. Kilôgam, pound, xentimét hay inch đều là cùng một phép tính
 * ở đây; chỗ dùng mới là chỗ biết mình đang đo gì.
 */
export function useRulerIndex({
  seedIndex,
  min10,
  onPick,
}: {
  /** Vạch mà thước mở ra ở đó. Được phép về muộn — kim sẽ đi theo. */
  seedIndex: number;
  /** Giá trị của vạch 0, tính bằng PHẦN MƯỜI của đơn vị đang hiển thị. */
  min10: number;
  /** Gọi mỗi khi NGƯỜI DÙNG dời kim. Không gọi lúc đặt thước. */
  onPick?: () => void;
}) {
  const listRef = useRef<Animated.ScrollView>(null);
  const [index, setIndex] = useState(seedIndex);

  /* Thước đã được đặt đúng chỗ cho lần mở này chưa. */
  const placed = useRef(false);

  /*
    Vạch mà thước đang thật sự đứng, giữ trong một ref song song với state.

    `placed` một mình KHÔNG đủ, và chỗ hở ấy đo được: `onContentSizeChange` gọi
    `scrollTo` rồi lật `placed` ngay, nhưng sự kiện cuộn do CHÍNH cú `scrollTo`
    sinh ra thì tới SAU đó — lúc `placed` đã true. Thước báo về đúng vạch nó
    vừa được đặt vào, và chỗ dùng ghi nhận rằng người dùng vừa chọn một con số.

    Ở màn cân nặng hậu quả nhìn thấy được: chụp màn 08 lúc +500ms và +4500ms,
    21,08% điểm ảnh khác nhau ở CẢ HAI diện mạo — chiếc cân sáng lên ngay khi
    màn mở ra rồi ba giây sau tự ngủ, trong khi đặt hàng nói rõ *"khi bắt đầu
    kéo ruler → scale awake"*. Hiệu ứng mất hẳn nghĩa: nó không còn là phản ứng
    với một hành động nào cả.

    Nên một lượt báo chỉ là TƯƠNG TÁC khi vạch thật sự ĐỔI. Ref chứ không phải
    state, vì phép so này xảy ra trong một callback của cử chỉ và không được
    chờ một vòng render mới đúng.
  */
  const shown = useRef(seedIndex);

  /* Dữ liệu về muộn hơn lần render đầu, nên kim phải đi theo — nhưng chỉ tới
     khi người dùng đã chạm vào thước. */
  useEffect(() => {
    if (placed.current) return;
    shown.current = seedIndex;
    setIndex(seedIndex);
  }, [seedIndex]);

  const onContentSizeChange = useCallback(() => {
    if (placed.current) return;
    listRef.current?.scrollTo({ x: seedIndex * TICK_W, animated: false });
    shown.current = seedIndex;
    placed.current = true;
  }, [seedIndex]);

  /* Bố cục đang ổn định KHÔNG phải người dùng đang chọn một con số. */
  const onIndex = useCallback(
    (next: number) => {
      if (!placed.current) return;
      /* Thước báo lại đúng vạch nó đang đứng thì không ai vừa chọn gì — xem
         chú thích ở `shown`. */
      if (shown.current === next) return;
      shown.current = next;
      setIndex(next);
      onPick?.();
    },
    [onPick],
  );

  return { index, value: (min10 + index) / 10, listRef, onIndex, onContentSizeChange };
}
