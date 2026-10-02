# ASCND — fitness app (React Native iOS rebuild)

ASCND là app fitness của Kiệt: theo dõi readiness, kế hoạch bữa ăn, kế hoạch
tập luyện, tính năng AI, và community. Repo này chứa **bản rebuild React
Native cho iOS** (thư mục `native/`) — dev web đã dừng, mọi phát triển đang
chạy trên nhánh `claude/ios-fitness-rebuild-omgulr`.

**Stack:** React Native (Expo) · Supabase (backend) · iOS (ActivityKit Live
Activity, WidgetKit).

## Bắt đầu ở đâu

- `native/docs/AUDIT_STATE.md` — **đọc trước**: hôm nay app đang đứng ở đâu
- `native/docs/SETUP.md` — cài đặt, ba cổng chất lượng, suite SQL, `gh auth`
- `native/docs/ios-rebuild-checklist.md` — checklist rebuild trên máy thật
  của Kiệt (Swift không compile được trên Linux)

## Cổng chất lượng

```bash
cd native
npx tsc --noEmit -p tsconfig.json
node tools/check.mjs   # 311 bước, phải xanh hết
```

## Team A · B · C

Ba người cùng làm trên một nhánh. Phối hợp duy nhất qua GitHub issue #6
("bảng phối hợp (A ↔ B)"): work queue, báo cáo đợt, handoff.

Quy tắc chia sẻ:

- Chỉ làm trên `claude/ios-fitness-rebuild-omgulr`; `git pull --rebase`
  trước khi bắt đầu và trước mỗi push
- Một issue một người; commit tham chiếu issue
- Không sửa file của người khác; không nới guard để xanh
- i18n namespaced theo người: A `nPg…`, B `nRc…`, C `nCx…`
- Cross-check sau mỗi commit: người kia pull và chạy
  `npx tsc --noEmit && node tools/check.mjs` + suite SQL, rồi comment
  xanh/đỏ trên issue

## Trạng thái

- **Community module (phase-1):** đang xây bởi A
  (`native/src/app/(tabs)/community.tsx` + các màn community-*)
- **Dynamic Island / Live Activity** (rest timer, display-only): #195–#217 —
  bridge TS→Swift gọn còn 7 param + promise; đang chờ Kiệt rebuild trên máy
  thật để kiểm tra quyết định
- **Widgets** ("Buổi tập hôm nay" + "Streak + Readiness"): mới ở mức spike UI,
  chưa nối dữ liệu thật
