# AGENTS.md — đọc trước khi làm (mọi agent: Claude, Codex, Cursor, Copilot…)

Repo `fitness-os` của ASCND. Sản phẩm đang phát triển là **app iOS native** ở `apps/ios` (SwiftUI). `native/` là app React Native cũ — chỉ dùng làm tham chiếu hành vi và chứa bộ kiểm (`native/tools/check.mjs`).

> **Bỏ RN (Kiệt chốt 17/11/2026, xác nhận lại 28/11):** app React Native ở `native/` không còn là tham chiếu hành vi. Thư mục giữ nguyên trong repo (không xoá), và **bộ kiểm `native/tools/check.mjs` cùng các golden cũ vẫn là cổng CI — giữ, đừng gỡ**. Tính năng mới theo `apps/ios/docs/PRODUCT_DECISION_V1.md` và quyết định của Kiệt, không port hay đối chiếu với RN nữa. Câu "chỉ dùng làm tham chiếu hành vi" ở trên đã hết hiệu lực (giữ lại làm lịch sử).

## Bắt buộc đọc, theo thứ tự

1. `apps/ios/CLAUDE.md` — ba điều không được quên.
2. `apps/ios/docs/CONSTRAINTS_AND_DEFERRED.md` — hạn chế, việc hoãn, đầu tư, người dùng thật. **Mỗi PR chạm hạn chế / việc hoãn phải cập nhật sổ này.**
3. `apps/ios/docs/PRODUCT_DECISION_V1.md` — hướng sản phẩm (Kiệt chốt 21/10/2026).
4. `apps/ios/docs/AGENT_SESSION.md` — quy trình: nhánh, PR, CI, gộp, báo cáo; **§6b: đi nhanh (gộp PR nhỏ, E2E chỉ khi cần) và công cụ tìm lỗi.**
5. 20–30 comment cuối của issue **#527** (bảng điều phối, nơi báo cáo).

## Làm bài tập 3D (Motion Kit)

Mọi bài 3D đi theo **`docs/exercise-visual-system/EXERCISE_WORKFLOW.md`**: xem video YouTube người thật → tìm kiếm kiểm lại → mô phỏng → soi bằng mắt → simulator → Kiệt duyệt → mẹo → PR. Bài mẫu: Dumbbell Shoulder Press.

## Tóm tắt luật

- Kiệt (`dnganhkiet1206`) quyết định sản phẩm. Trả lời bằng **tiếng Việt**.
- Mọi thay đổi: nhánh `claude/<slug>` (hay tiền tố của agent) từ `origin/native/ios-rewrite` → PR vào `native/ios-rewrite` → CI xanh trên đúng head → **merge commit, không squash**. Không bao giờ force-push / gộp vào `main`.
- Việc nhỏ gộp thành một PR. E2E (nhãn `e2e`) chỉ khi đổi lớn bố cục / điều hướng.
- Không deploy production, không chạy migration, không tạo tài khoản khi Kiệt chưa duyệt từng việc trong chat.
- Dữ liệu trong app là dữ liệu test: được sửa khi kiểm, **không xoá vĩnh viễn**.
- Thiết kế lớn và art Koa: dựng mock cho Kiệt duyệt trước.
- Báo cáo trên #527: thấy gì / đổi gì / kiểm thế nào, và **NOT RUN** cho phần chưa kiểm được.

## Lệnh nhanh

```sh
git fetch origin native/ios-rewrite && git switch -c claude/<slug> origin/native/ios-rewrite
(cd apps/ios/Packages/ASCNDKit && swift test)
(cd native && node tools/check.mjs)          # cổng đầy đủ
(cd apps/ios && xcodegen generate)           # rồi build theo AGENT_SESSION.md §6
gh pr create --base native/ios-rewrite
```
