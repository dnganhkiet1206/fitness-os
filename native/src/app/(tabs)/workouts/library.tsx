import * as Haptics from 'expo-haptics';
import { Dumbbell } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { MuscleGrid } from '@/components/ascnd/muscle-grid';
import { Screen } from '@/components/ascnd/screen';
import { SessionRow, useSessionListStyles } from '@/components/ascnd/session-row';
import { EmptyState } from '@/components/ascnd/empty-state';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PAGE_TINT, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useDeleteWorkoutSession, useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useExercises } from '@/hooks/use-library';
import { useUnits } from '@/hooks/use-units';
import { nav } from '@/lib/nav';
import { toast } from '@/lib/toast';

/**
 * Thư viện & lịch sử — thứ bạn TRA CỨU, tách khỏi thứ bạn LÀM.
 *
 * ── vì sao nó là một trang chứ không phải hai mục nữa trên tab ──
 *
 * Tab Tập luyện từng xếp bốn mục xuống một cuộn — hôm nay, buổi tập của bạn,
 * lịch sử, thư viện bài tập — mỗi mục một tiêu đề giống hệt nhau kèm một "Xem
 * tất cả". Không có gì nói mục nào quan trọng hơn mục nào, nên trang đọc ra là
 * một danh sách bốn thứ ngang nhau thay vì một luồng.
 *
 * Ba vai trò khác nhau đang chen chúc ở đó:
 *
 *   LÀM      hôm nay tập gì, và cái nút bắt đầu       → gốc tab
 *   ĐỊNH     tuần này định tập gì                      → /workouts/plan
 *   TRA CỨU  mình có bài gì, mình đã tập những gì      → trang này
 *
 * Hai thứ trên trang này đi cùng nhau vì chúng trả lời cùng một loại câu hỏi —
 * "cái gì đã có sẵn" — và vì cả hai đều là thứ người ta mở thỉnh thoảng chứ
 * không mở hằng ngày. Đặt chúng sau một hàng cao 56 điểm là đúng tỉ lệ: diện
 * tích bằng tầm quan trọng.
 *
 * ── thứ tự bên trong ──
 *
 * Thư viện trước, lịch sử sau.
 *
 * Bản đầu xếp ngược lại, với lý do "lịch sử là dữ liệu của bạn và đổi mỗi buổi
 * tập, còn thư viện gần như không đổi". Lý do ấy nghe được nhưng nó trả lời sai
 * câu hỏi: thứ tự trên một trang không đo bằng cái gì THAY ĐỔI nhiều hơn, mà
 * bằng cái gì người ta MỞ TRANG NÀY ĐỂ LÀM.
 *
 * Thư viện là phần dùng được: chạm một nhóm cơ để tìm bài, và đó là lý do người
 * ta vào đây. Lịch sử là một bản ghi để liếc qua — nó không dẫn đi đâu ngoài
 * `/sessions`. Tiêu đề trang cũng đã đọc theo thứ tự ấy ("Thư viện & lịch sử"),
 * nên bản cũ bắt mắt đi ngược lại chính dòng chữ ngay phía trên nó.
 */
/**
 * Bao nhiêu buổi hiện ở đây trước khi `/sessions` nhận việc.
 *
 * Một hằng số có tên, không phải con số 10 gõ thẳng vào `.slice()`. Hai lý do,
 * và lý do thứ hai mới là lý do thật: `tools/day-window.mjs` bắt `.slice(0, 10)`
 * vì đó là cách người ta cắt ngày ra khỏi một chuỗi ISO — tức là lấy ngày theo
 * UTC — và luật ấy cố ý hẹp, nó khớp đúng chữ. Ở đây là cắt MẢNG, không phải
 * cắt chuỗi, nhưng viết bằng số trần thì hai thứ trông y hệt nhau. Đặt tên cho
 * nó vừa nói ra ý định vừa thôi giả dạng một lỗi thật.
 */
const HISTORY_PREVIEW = 10;

export default function WorkoutLibraryScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const sessionList = useSessionListStyles();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { weight: wUnit } = useUnits();
  const vi = lang === 'vi';
  const { data: sessions, isError: sessionsFailed, refetch, isRefetching } = useWorkoutSessions(14);
  const { data: exercises, isError: exercisesFailed } = useExercises();
  const delSession = useDeleteWorkoutSession();
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    setBusy(true);
    await refetch();
    setBusy(false);
  };

  /**
   * Name what goes. Two sessions in a week are often the same workout on
   * different days, so the name alone does not identify one — the date is what
   * makes a mistap catchable by reading the alert rather than by noticing the
   * chart afterwards.
   */
  const confirmDeleteSession = (id: string, date_time: string, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(i18n.nDeleteSession, i18n.nDeleteSessionMsg.replace('{x}', label), [
      { text: i18n.cancel, style: 'cancel' },
      {
        text: i18n.delete,
        style: 'destructive',
        onPress: () =>
          delSession.mutate(
            { id, date_time },
            {
              onSuccess: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                toast.success(i18n.deleted);
              },
              onError: (e: Error) => toast.fail(e),
            },
          ),
      },
    ]);
  };

  return (
    <Screen refreshable back title={i18n.nLibraryHistory} aura={PAGE_TINT.activity}>
      <MuscleGrid exercises={exercises ?? []} failed={exercisesFailed} vi={vi} />

      {/*
        Lịch sử: mười buổi gần nhất, phần còn lại ở `/sessions`.

        Đây không phải nơi đọc cả năm — `/sessions` gom theo tháng kèm tổng khối
        lượng, và đó mới là câu hỏi một nhật ký tập thật sự bị hỏi. Ở đây là
        "gần đây mình đã tập gì", và mười dòng trả lời xong câu đó.
      */}
      <View style={styles.section}>
        <View style={styles.head}>
          <Text style={styles.label}>
            {i18n.nHistory}
            {sessions && sessions.length > 0 ? ` (${sessions.length})` : ''}
          </Text>
          {sessions && sessions.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                Haptics.selectionAsync();
                nav.push('/sessions');
              }}>
              <Text style={styles.all}>{vi ? 'Xem tất cả' : 'See all'}</Text>
            </Pressable>
          ) : null}
        </View>

        {sessionsFailed ? (
          <LoadFailed i18n={i18n} onRetry={retry} busy={busy || isRefetching} />
        ) : sessions && sessions.length > 0 ? (
          <View style={sessionList.group}>
            {sessions.slice(0, HISTORY_PREVIEW).map((s, i) => (
              <View key={s.id}>
                {i > 0 ? <View style={sessionList.sep} /> : null}
                <SessionRow
                  session={s}
                  wUnit={wUnit}
                  lang={lang}
                  i18n={i18n}
                  onDelete={confirmDeleteSession}
                />
              </View>
            ))}
          </View>
        ) : (
          <EmptyState icon={Dumbbell} title={i18n.nNoWorkouts} />
        )}
      </View>
    </Screen>
  );
}

const stylesFor = makeStyles((c) => ({
  section: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 14, fontWeight: '600', color: c.foreground },
  all: { ...type.footnote, color: c.primary },
}));
