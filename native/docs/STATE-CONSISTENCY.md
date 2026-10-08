# State Consistency — Today/Workout/Summary

Tài liệu nhất quán state visuals (#388).

## Vocabulary dùng chung

| State | Component | Dùng ở |
|-------|-----------|--------|
| Loading | `DSLoadingView` | Today, Workout, History, Auth |
| Error + retry | `DSErrorView` | Today, Workout, History |
| Empty | `DSEmptyState` | Today (unplanned), History, Summary |
| Offline | `DSOfflineView` / banner | Today, History |
| Submitting | `DSSubmittingOverlay` | Auth, Workout (finish) |
| Sync status | `SyncStrip` | Workout |

## CTA placement

- **Primary action:** bottom, full-width `DSButton` (48pt)
- **Secondary:** text button below primary
- **Retry:** trong `DSErrorView`, style secondary

## Labels nhất quán

| Action | Label key |
|--------|-----------|
| Thử lại | `async.retry` / `sync.retry` |
| Xong | `workout.done` |
| Về Hôm nay | `summary.backToToday` |

## Không duplicate

- Không màn nào tự vẽ loading spinner riêng — dùng `DSLoadingView`
- Không màn nào tự vẽ error riêng — dùng `DSErrorView`
- Không hardcode "Thử lại" — dùng key `async.retry`
