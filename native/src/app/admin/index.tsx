import { ActivityIndicator, Text, View } from 'react-native';

import { AdminShell, AuditLine, Empty, adminStyles } from '@/components/ascnd/admin-shell';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { useModDashboard } from '@/hooks/use-admin';
import { usePalette } from '@/hooks/use-palette';
import { nav } from '@/lib/nav';
import { fillCopy } from '@/lib/copy-fill';

/**
 * Tổng quan: việc đang chờ trước, rồi trạng thái nội dung, rồi các quyết định
 * gần nhất. Không biểu đồ, không phân tích — bảng này để làm việc, và câu hỏi
 * đầu tiên của người mở nó là "có gì cần mình không".
 */
export default function AdminDashboard() {
  const i18n = useI18n();
  return <AdminShell title={i18n.nPgAdTitle}>{() => <Body />}</AdminShell>;
}

function Body() {
  const c = usePalette();
  const a = adminStyles(c);
  const styles = stylesFor(c);
  const i18n = useI18n();
  const d = useModDashboard();

  if (d.isError) return <LoadFailed i18n={i18n} onRetry={() => d.refetch()} />;
  if (d.isPending) return <ActivityIndicator color={c.mutedForeground} style={a.loading} />;
  const v = d.data;
  const waiting = v.pending_reports + v.pending_appeals;

  return (
    <>
      <View style={a.section}>
        <Text style={a.heading} accessibilityRole="header">
          {i18n.nPgAdNeedsYou}
        </Text>
        {waiting === 0 ? (
          <Empty text={i18n.nPgAdAllClear} />
        ) : (
          <View style={a.panel}>
            {v.pending_reports > 0 ? (
              <PressScale style={styles.queueRow} accessibilityRole="link" onPress={() => nav.replace('/admin/reports' as never)}>
                <Text style={styles.queueLabel}>{fillCopy(i18n.nPgAdPendingReports, { n: v.pending_reports })}</Text>
                <Text style={a.meta}>{i18n.nPgAdOpenItem}</Text>
              </PressScale>
            ) : null}
            {v.pending_appeals > 0 ? (
              <PressScale
                style={[styles.queueRow, v.pending_reports > 0 && a.rule]}
                accessibilityRole="link"
                onPress={() => nav.replace('/admin/appeals' as never)}
              >
                <Text style={styles.queueLabel}>{fillCopy(i18n.nPgAdPendingAppeals, { n: v.pending_appeals })}</Text>
                <Text style={a.meta}>{i18n.nPgAdOpenItem}</Text>
              </PressScale>
            ) : null}
          </View>
        )}
      </View>

      <View style={a.section}>
        <Text style={a.heading} accessibilityRole="header">
          {i18n.nPgAdContentNow}
        </Text>
        <View style={styles.facts}>
          <Fact label={i18n.nPgAdHiddenPosts} n={v.hidden_posts} />
          <Fact label={i18n.nPgAdHiddenComments} n={v.hidden_comments} />
          <Fact label={i18n.nPgAdRemovedPosts} n={v.removed_posts} />
          <Fact label={i18n.nPgAdReportsToday} n={v.reports_today} />
        </View>
      </View>

      <View style={a.section}>
        <Text style={a.heading} accessibilityRole="header">
          {i18n.nPgAdRecent}
        </Text>
        {v.recent.length === 0 ? (
          <Empty text={i18n.nPgAdNoRecent} />
        ) : (
          <View style={a.panel}>
            {v.recent.map((r, i) => (
              <AuditLine key={r.id} row={r} first={i === 0} />
            ))}
          </View>
        )}
      </View>
    </>
  );
}

/** Một con số và tên của nó, cùng một dòng chữ — không phải thẻ số to. */
function Fact({ label, n }: { label: string; n: number }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.fact}>
      <Text style={styles.factN}>{n}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  queueLabel: { ...type.headline, color: c.foreground, flex: 1 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.xl, rowGap: spacing.sm },
  fact: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  factN: { ...type.headline, ...type.mono, color: c.foreground },
  factLabel: { ...type.footnote, color: c.mutedForeground },
}));
