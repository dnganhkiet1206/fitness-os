import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { AdminShell, Empty, StateTag, adminStyles, useReasonLabel } from '@/components/ascnd/admin-shell';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { Segmented } from '@/components/ascnd/segmented';
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { type QueueItem, type ReportStatus, useModReports } from '@/hooks/use-admin';
import { usePalette } from '@/hooks/use-palette';
import { fillCopy } from '@/lib/copy-fill';
import { timeAgo } from '@/lib/time-ago';

/**
 * Hàng đợi báo cáo, gom theo đích: một bài ba người báo là MỘT việc. Mỗi dòng
 * nói đủ để quyết định có mở hay không — loại, trích đoạn, tác giả, số báo cáo,
 * lý do nhiều nhất, trạng thái, và có kháng nghị đang chờ không.
 */
export default function AdminReports() {
  const i18n = useI18n();
  return <AdminShell title={i18n.nPgAdNavReports}>{() => <Body />}</AdminShell>;
}

function Body() {
  const c = usePalette();
  const a = adminStyles(c);
  const i18n = useI18n();
  const [status, setStatus] = useState<ReportStatus>('open');
  const q = useModReports(status);

  return (
    <>
      <Segmented
        value={status}
        onChange={setStatus}
        options={[
          { key: 'open', label: i18n.nPgAdStatusOpen },
          { key: 'actioned', label: i18n.nPgAdStatusActioned },
          { key: 'dismissed', label: i18n.nPgAdStatusDismissed },
        ]}
      />
      {q.isError ? (
        <LoadFailed i18n={i18n} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <ActivityIndicator color={c.mutedForeground} style={a.loading} />
      ) : q.data.length === 0 ? (
        <Empty text={i18n.nPgAdEmptyReports} />
      ) : (
        <View style={a.panel}>
          {q.data.map((item, i) => (
            <QueueRow key={item.target_id} item={item} first={i === 0} />
          ))}
        </View>
      )}
    </>
  );
}

function QueueRow({ item, first }: { item: QueueItem; first: boolean }) {
  const c = usePalette();
  const a = adminStyles(c);
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const reasonLabel = useReasonLabel();
  const t = item.target;
  const text = (item.target_type === 'post' ? t?.caption : t?.body) || i18n.nPgAdNoText;
  const top = Object.entries(item.reasons ?? {}).sort((x, y) => y[1] - x[1])[0];
  const kind = item.target_type === 'post' ? i18n.nPgAdPost : i18n.nPgAdComment;
  return (
    <PressScale
      style={[a.row, !first && a.rule]}
      accessibilityRole="link"
      accessibilityLabel={`${kind}: ${text}`}
      onPress={() => router.push(`/admin/target?type=${item.target_type}&id=${item.target_id}` as never)}
    >
      <View style={a.rowHead}>
        <Text style={styles.kind}>{kind}</Text>
        {t ? <StateTag hidden={t.hidden} removed={t.removed} /> : null}
        {item.appeal?.status === 'open' ? <Text style={styles.appeal}>{i18n.nPgAdHasAppeal}</Text> : null}
        <Text style={styles.when}>{timeAgo(item.last_at, i18n, lang)}</Text>
      </View>
      <Text style={a.excerpt} numberOfLines={2}>
        {text}
      </Text>
      <Text style={a.meta}>
        {item.author ? `@${item.author.handle} · ` : ''}
        {fillCopy(i18n.nPgAdReportsN, { n: item.report_count })}
        {top ? ` · ${reasonLabel(top[0])}` : ''}
      </Text>
    </PressScale>
  );
}

const stylesFor = makeStyles((c) => ({
  kind: { ...type.caption, color: c.mutedForeground, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  appeal: { ...type.caption, color: c.metricBlue, fontWeight: '700' },
  when: { ...type.caption, color: c.mutedForeground, marginLeft: 'auto', paddingLeft: spacing.sm },
}));
