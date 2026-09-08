import { Component, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { spacing, radius, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { usePalette } from '@/hooks/use-palette';
import { recordCrash } from '@/lib/crash-log';

/**
 * Một lỗi lúc dựng cây không được phép lấy đi cả app.
 *
 * ── chỗ trống này là chỗ trống gì ──
 *
 * `src/` chưa từng có error boundary nào; `crash-log.ts` đã ghi ra điều đó
 * trong chú thích của chính nó. Hệ quả không phải "một lỗi khó chẩn đoán" mà là
 * một hành vi: React tháo TOÀN BỘ cây khi một component ném lúc render và không
 * có ai bắt. Ở bản dev, hộp đỏ; ở bản phát hành, **màn trắng, vĩnh viễn** —
 * không nút nào, không chữ nào, và mở lại app thì nó lặp lại.
 *
 * Một màn hỏng không nên là cả app hỏng. Đó là toàn bộ việc của tệp này.
 *
 * ── và điều PHẢI nói ra: nó lấy đi một thứ ──
 *
 * `ErrorUtils` không thấy một lỗi đã bị boundary bắt. Nên thêm boundary vào một
 * app đang ghi nhật ký sự cố là lặng lẽ làm nhật ký ấy thôi ghi đúng loại lỗi
 * nó sinh ra để bắt — đổi khả năng NHÌN THẤY lấy khả năng HỒI PHỤC.
 *
 * Không đổi. `componentDidCatch` gọi thẳng `recordCrash`, và nó gửi kèm
 * `componentStack` — cây React dẫn tới chỗ ném, thứ duy nhất nói được MÀN NÀO
 * hỏng khi stack của bundle đã minify thì không.
 *
 * ── vì sao fallback KHÔNG dùng `LoadFailed` ──
 *
 * `LoadFailed` là card lỗi sẵn có và về ngôn ngữ thiết kế thì nó đúng. Nhưng nó
 * dựng trên `GlassCard` và `MascotFigure`, tức trên lớp kính và trên rig nhân
 * vật — hai thứ nặng nhất trong app, và lớp kính là đúng chỗ A9 nổ
 * (`glass-card.tsx:154` còn nằm trong danh sách nhánh theo theme mà
 * `tools/theme-shape.mjs` đóng băng).
 *
 * Một màn hình dựng ra VÌ có thứ vừa hỏng không được chia phụ thuộc với chỗ hay
 * hỏng nhất. Nếu fallback cũng ném, React tháo luôn cả boundary và ta quay lại
 * đúng màn trắng — chỉ là sau hai lần thử.
 *
 * Nên nó dựng bằng TOKEN chứ không bằng component: `usePalette`, `spacing`,
 * `type`, `radius`. Cùng ngôn ngữ thiết kế, cùng theme, không kính, không SVG,
 * không Reanimated. `Pressable` trần thay cho `PressScale` vì cùng lý do — cái
 * nhún khi bấm không đáng đổi lấy một phụ thuộc vào lớp hoạt hoạ.
 *
 * ── và fallback KHÔNG nói lỗi là gì ──
 *
 * Không thông điệp, không stack, không mã. Thông điệp của một lỗi thật mang
 * theo thứ nó chạm vào — một URL có `user_id=eq.<uuid>`, một câu 401 kèm token,
 * một mảnh `image_base64`. Chỗ để đọc nó là nhật ký sự cố, nơi nó đã được lọc.
 * Trên màn hình, nó chỉ làm người dùng sợ và không giúp họ làm gì.
 */

/** Bao lâu thì hai lần hỏng liên tiếp được coi là một VÒNG LẶP, không phải hai sự cố. */
const LOOP_MS = 3000;
/** Số lần thử lại trước khi ngừng mời thử lại. */
const MAX_LOOPS = 2;

interface Props {
  children: ReactNode;
  /** Chỉ cho bước kiểm: nơi lỗi được ghi. Mặc định là nhật ký thật. */
  record?: (e: unknown, fatal: boolean, componentStack?: string) => void;
}

interface State {
  failed: boolean;
  /** Số lần hỏng LIÊN TIẾP ngay sau một lần thử lại. */
  loops: number;
}

/**
 * Phần class — `getDerivedStateFromError` chỉ có ở class component, và đó là
 * lý do duy nhất tệp này không phải một hàm.
 *
 * Nó nhận `palette` và `i18n` qua props chứ không đọc hook: một class không gọi
 * được hook, và cái vỏ hàm bên dưới đọc hộ. Vỏ ấy nằm NGOÀI boundary, nên một
 * lỗi trong `usePalette` không được bắt ở đây — đúng, vì lúc ấy fallback cũng
 * không có bảng màu để vẽ.
 */
class Boundary extends Component<Props & { ui: Ui }, State> {
  state: State = { failed: false, loops: 0 };

  /** Lúc người dùng bấm "thử lại". `0` nghĩa là chưa từng. */
  private retriedAt = 0;

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }): void {
    /*
      Vòng lặp được định nghĩa bằng THỜI GIAN, không bằng số lần.

      Một bộ đếm trần thì sai theo cả hai chiều: nó coi hai sự cố cách nhau nửa
      tiếng là một vòng lặp, và nó không bao giờ mời thử lại nữa sau đó. Còn cái
      thật sự cần phân biệt là "bấm thử lại rồi hỏng NGAY" (thử nữa cũng thế)
      với "app chạy được một lúc rồi một màn khác hỏng" (rất đáng thử lại).

      Khoảng cách tới lần bấm thử lại gần nhất trả lời đúng câu ấy.
    */
    const inLoop = this.retriedAt > 0 && Date.now() - this.retriedAt < LOOP_MS;
    this.setState((s) => ({ loops: inLoop ? s.loops + 1 : 0 }));
    /* `fatal: false` — app còn sống, người dùng còn thấy một màn hình. Đó là
       khác biệt duy nhất so với một lỗi đi qua `ErrorUtils`, và nó đáng ghi. */
    (this.props.record ?? recordCrash)(error, false, info?.componentStack ?? undefined);
  }

  private retry = (): void => {
    this.retriedAt = Date.now();
    this.setState({ failed: false });
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <Fallback
        ui={this.props.ui}
        canRetry={this.state.loops < MAX_LOOPS}
        onRetry={this.retry}
      />
    );
  }
}

interface Ui {
  c: ReturnType<typeof usePalette>;
  i18n: ReturnType<typeof useI18n>;
}

/**
 * Màn thay thế. Tách khỏi class để bước kiểm gọi được nó một mình, và để phần
 * duy nhất người dùng nhìn thấy không lẫn với phần máy trạng thái.
 */
export function Fallback({
  ui: { c, i18n },
  canRetry,
  onRetry,
}: {
  ui: Ui;
  canRetry: boolean;
  onRetry: () => void;
}) {
  const styles = stylesFor(c);
  return (
    <View style={styles.page}>
      <Text style={styles.title}>{i18n.nCrashTitle}</Text>
      <Text style={styles.hint}>{canRetry ? i18n.nCrashHint : i18n.nCrashStuck}</Text>
      {canRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n.nRetry}
          onPress={onRetry}
          style={styles.retry}>
          <Text style={styles.retryText}>{i18n.nRetry}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Vỏ đọc hook hộ class.
 *
 * Đặt quanh `<Gate />` trong `_layout.tsx` — xem ghi chú ở đó về vì sao đúng
 * chỗ ấy và về cái gì nằm NGOÀI.
 */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const c = usePalette();
  const i18n = useI18n();
  return <Boundary ui={{ c, i18n }}>{children}</Boundary>;
}

const stylesFor = makeStyles((c, m) => ({
  /* Cả màn, không phải một card trong một trang — trang là thứ vừa hỏng. Cùng
     hình dạng với `gateFail` ở `_layout.tsx`, chỗ duy nhất trong app cũng thay
     nguyên một màn bằng một lời giải thích. */
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
    backgroundColor: c.background,
  },
  title: { ...type.headline, color: c.foreground, textAlign: 'center' },
  hint: { ...type.footnote, color: c.mutedForeground, textAlign: 'center' },
  retry: {
    /* 44 là sàn vùng chạm của iOS, và ở đây nó là nút DUY NHẤT trên màn. */
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: alpha(m.ink, 0.07),
    marginTop: spacing.sm,
  },
  retryText: { ...type.footnote, fontWeight: '600', color: c.foreground },
}));
