# Setup — chạy repo ascnd trên máy mới

Nhánh duy nhất làm việc: `claude/ios-fitness-rebuild-omgulr`.

## Yêu cầu

- **Node** (VM đang chạy v24.20.0) + npm
- **PostgreSQL 16** — chỉ cần nếu chạy suite SQL (xem dưới)
- **gh CLI** — để báo cáo lên issue #6 (handoff của team)

## Clone + cài đặt

```bash
git clone https://github.com/dnganhkiet1206/fitness-os.git
cd fitness-os
git checkout claude/ios-fitness-rebuild-omgulr
cd native && npm install
```

## Ba cổng chất lượng (phải xanh trước khi push)

Chạy từ thư mục **`native/`** (chạy từ gốc repo thì `check.mjs` exit 2 và
cố ý từ chối):

```bash
npx tsc --noEmit -p tsconfig.json   # TypeScript, exit 0, đầu ra rỗng
node tools/check.mjs                # 311 bước (đo bằng GATE_COUNT_ONLY=1 node tools/check.mjs)
```

## Suite SQL (backend community)

```bash
bash supabase/tests/community/run.sh
```

Chạy từ gốc repo. Cần PostgreSQL 16 local đang online.

## Luồng làm việc trên shared branch

```bash
git pull --rebase        # trước khi bắt đầu VÀ trước mỗi push
git push                 # sau mỗi batch commit
```

Quy tắc team: một issue một người, commit tham chiếu issue, không sửa file
của người khác (B: `post-art.tsx`, `query-client.ts`, `persist-paused.ts`,
`tools/live.mjs`, `use-nutrition.ts`, `read-all.ts/mjs` — community của A:
`community.tsx` và các màn community-*), i18n namespaced theo người
(A: `nPg…`, B: `nRc…`, C: `nCx…`).

## gh auth (báo cáo lên #6)

```bash
gh auth login --with-token < token.txt   # PAT đã lưu, không cần hỏi lại
gh auth setup-git
```

Xong một lần trên máy là git push/gh tự dùng, không cần nhập lại.

## Ghi chú: vụ VM bị replace

2026-10-01 VM bị replace → **PostgreSQL 16 cài ngày 30/09 mất hẳn**, suite
SQL không chạy được một thời gian. 2026-10-02 đã cài lại thành công
(`apt install postgresql-16`, cluster 16/main online) và suite SQL chạy xanh
trở lại. Nếu VM bị replace nữa, cài lại PostgreSQL là bước đầu tiên trước
khi chạy `run.sh`.

## Cái KHÔNG chạy được ở đây

- **Build iOS / compile Swift:** Linux không có Xcode. Kiệt rebuild trên máy
  thật của mình theo `native/docs/ios-rebuild-checklist.md`.
- **ESLint:** `eslint` không có trong `node_modules`; cổng thật là 311 bước
  `check.mjs`, không phải `expo lint`.
