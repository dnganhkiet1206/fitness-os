# Quy trình tích hợp — Native iOS Rewrite

Áp dụng từ 05/10/2026. Quyết định nền: [ADR-0001](adr/0001-native-ios-platform-strategy.md), [ADR-0002](adr/0002-integration-branch-and-baseline.md).

## Nhánh

| Nhánh | Vai trò | Ai ghi |
|---|---|---|
| `main` | App web Vite + Capacitor cũ. Chỉ nhận merge sau GO/NO-GO. | Kiệt |
| `claude/ios-fitness-rebuild-omgulr` | **Baseline đóng băng** @ `fac9ac2`, dùng làm tham chiếu/bằng chứng. | Không ai |
| `native/ios-rewrite` | Nhánh tích hợp. Mọi thay đổi vào đây qua PR. | Chỉ merge PR |
| `agent/<a\|b\|c\|d>/<slug>` | Nhánh làm việc của từng agent, mỗi việc một nhánh, tạo từ `native/ios-rewrite`. | Agent sở hữu |

Không ai push thẳng vào `native/ios-rewrite`. Nhánh làm việc đi sau nhánh tích hợp thì rebase hoặc merge `native/ios-rewrite` vào, không force-push lên nhánh của người khác.

## Vòng đời một việc

1. Issue có nhãn `agent:X` + `difficulty:*` + `ios-rewrite`.
2. Agent tạo `agent/x/<slug>` rồi mở PR vào `native/ios-rewrite` theo [template](../.github/pull_request_template.md). PR nhỏ, mỗi PR một ý.
3. CI phải xanh: `Cổng chất lượng` luôn chạy; `iOS` chạy khi chạm `apps/ios/**`; `SQL cộng đồng` chạy khi chạm `supabase/**`.
4. Review:

   | Tác giả | Reviewer |
   |---|---|
   | A | B |
   | B | A |
   | C | D (+ A/B nếu chạm kiến trúc) |
   | D | C (+ A/B nếu chạm kiến trúc) |

   Mọi agent dùng chung một tài khoản GitHub, nên không dùng được nút Approve. Review là một **comment** mở đầu bằng một trong ba dòng:
   - `REVIEW: APPROVE`
   - `REVIEW: CHANGES REQUESTED`: kèm danh sách cụ thể.
   - `BLOCK`: xem mục dưới.
5. **Reviewer merge**, tác giả không bao giờ tự merge PR của mình. Dùng squash merge, giữ tiêu đề PR làm commit message.

## Quyền BLOCK của D

D chặn merge khi có: regression, vi phạm spec, golden vector fail, test hỏng, regression accessibility rõ ràng, hoặc vi phạm kiến trúc rõ ràng. Comment BLOCK phải theo format:

```
BLOCK
Reason: …
Evidence: lệnh/ảnh/log tái hiện được
Owner: agent phải sửa
Required decision: (nếu cần Kiệt quyết)
```

PR đang có BLOCK chưa gỡ thì không ai được merge. Chỉ D gỡ, bằng comment `UNBLOCK` kèm bằng chứng đã sửa. Còn nếu hành vi đúng/sai chưa xác định được, D không BLOCK mà mở issue `needs-clarification`.

## Khi không chắc hành vi đúng là gì

Tra theo thứ tự:
1. `spec/`
2. Code cũ (baseline)
3. Backend (`supabase/`)
4. Golden vectors
5. Vẫn mơ hồ → mở issue `needs-clarification` và giao cho Kiệt.

**Không đoán.**

Thứ tự ưu tiên của nguồn sự thật:

| Vấn đề | Nguồn sự thật |
|---|---|
| Hành vi | Spec + golden vectors + backend |
| Dữ liệu | Backend |
| Trải nghiệm iOS | App iOS mới |
| Thương hiệu | `spec/design` |
| Bằng chứng tham chiếu | App cũ (không phải yêu cầu) |

## Phân việc theo độ khó

- **A** (`extreme`/`hard`): kiến trúc Swift, concurrency, lifecycle, navigation, networking, Supabase, auth/Keychain, persistence/outbox/sync/idempotency, hợp đồng backend, CI/CD, XcodeGen/SPM.
- **B** (`extreme`/`hard`): state machine buổi tập, ghi set, rest timer, Live Activity/Dynamic Island/Widgets/App Intents, HealthKit, gesture/animation, SwiftUI phức tạp.
- **C** (`medium`/`easy`): component, tokens, màn đơn giản, docs, fixtures. Việc khó hơn dự kiến → comment lại và chuyển cho A/B.
- **D** (`medium`/`easy`): QA automation, regression, golden vectors, behavior spec, forensic cũ↔mới.

## Cập nhật trên Issue/PR

Format `DONE / CHANGED / TESTED / NOT TESTED / RISKS / NEXT`. Khi bị chặn thì dùng format `BLOCKED` với các mục Reason / Evidence / Owner / Required decision.

**iPhone thật:** Kiệt tự test. Agent không chặn việc để chờ, không ghi "đã test trên máy" khi chưa có báo cáo của Kiệt. Kiệt báo cảm giác trên máy thì coi là bằng chứng thật.

## Vùng nhạy cảm

- `supabase/migrations/`: chỉ thêm migration mới, không sửa, không xoá migration đã có, không reset DB. PR chạm `supabase/` phải có A review.
- `spec/` và golden vectors: D sở hữu. Đổi hành vi cần Kiệt duyệt trên issue.
- Legacy ở gốc (Vite/Capacitor/`ios/`): không xoá cho tới khi có PR dọn riêng, sau khi đã xác minh mọi tham chiếu.
- Không đưa secret vào repo. Secret của CI đặt trong GitHub → Settings → Secrets.
