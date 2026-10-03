import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { AdminShell, Empty, adminStyles } from '@/components/ascnd/admin-shell';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { Segmented } from '@/components/ascnd/segmented';
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { type AppealItem, type AppealStatus, useModAppeals } from '@/hooks/use-admin';
import { usePalette } from '@/hooks/use-palette';
import { fillCopy } from '@/lib/copy-fill';
import { timeAgo } from '@/lib/time-ago';

/** Kháng nghị, cũ nhất trước: người chờ lâu nhất được xem trước. Quyết định
 *  nằm ở trang của nội dung, nơi thấy được cả báo cáo lẫn lịch sử. */
export default function AdminAppeals() {
  const i18n = useI18n();
  return <AdminShell title={i18n.nPgAdNavAppeals}>{() => <Body />}</AdminShell>;
}

function Body() {
  const c = usePalette();
  const a = adminStyles(c);
  const i18n = useI18n();
  const [status, setStatus] = useState<AppealStatus>('open');
  const q = useModAppeals(status);

  return (
    <>
      <Segmented
        value={status}
        onChange={setStatus}
        options={[
          { key: 'open', label: i18n.nPgAdAppealOpen },
          { key: 'restored', label: i18n.nPgAdAppealRestored },
          { key: 'upheld', label: i18n.nPgAdAppealUpheld },
        ]}
      />
      {q.isError ? (
        <LoadFailed i18n={i18n} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <ActivityIndicator color={c.mutedForeground} style={a.loading} />
      ) : q.data.length === 0 ? (
        <Empty text={i18n.nPgAdEmptyAppeals} />
      ) : (
        <View style={a.panel}>
          {q.data.map((item, i) => (
            <AppealRow key={item.id} item={item} first={i === 0} />
          ))}
        </View>
      )}
    </>
  );
}

function AppealRow({ item, first }: { item: AppealItem; first: boolean }) {
  const c = usePalette();
  const a = adminStyles(c);
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const kind = item.target_type === 'post' ? i18n.nPgAdPost : i18n.nPgAdComment;
  const text = item.excerpt || i18n.nPgAdNoText;
  return (
    <PressScale
      style={[a.row, !first && a.rule]}
      accessibilityRole="link"
      accessibilityLabel={`${kind}: ${text}`}
      onPress={() => router.push(`/admin/target?type=${item.target_type}&id=${item.target_id}` as never)}
    >
      <View style={a.rowHead}>
        <Text style={styles.kind}>{kind}</Text>
        <Text style={a.meta}>{item.author ? `@${item.author.handle}` : ''}</Text>
        <Text style={styles.when}>{timeAgo(item.created_at, i18n, lang)}</Text>
      </View>
      <Text style={a.excerpt} numberOfLines={2}>
        {text}
      </Text>
      <Text style={styles.message} numberOfLines={3}>
        {item.message || i18n.nPgAdNoMessage}
      </Text>
      <Text style={a.meta}>{fillCopy(i18n.nPgAdReportsN, { n: item.reports })}</Text>
    </PressScale>
  );
}

const stylesFor = makeStyles((c) => ({
  kind: { ...type.caption, color: c.mutedForeground, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  when: { ...type.caption, color: c.mutedForeground, marginLeft: 'auto', paddingLeft: spacing.sm },
  message: { ...type.footnote, color: c.foreground, fontStyle: 'italic' },
}));
