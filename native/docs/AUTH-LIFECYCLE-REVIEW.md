# Auth Lifecycle Review — #326

Forensic review của SessionStore + RootGate.

## Đã có test

| Invariant | Test | File |
|-----------|------|------|
| Initial load khôi phục session | `restoresStoredSession` | SessionStoreTests |
| Đọc session hỏng → signedOut (không kẹt loading) | `unreadableSessionIsSignedOutNotLoading` | SessionStoreTests |
| Logout chạy cleanup | `serverSideSignOutRunsCleanup` | SessionStoreTests |
| Đổi tài khoản chạy cleanup | `switchingAccountsRunsCleanup` | SessionStoreTests |
| Session ban đầu không user không phải sign-out | `initialSessionWithoutUserIsNotASignOut` | SessionStoreTests |

## Token refresh

Supabase SDK tự refresh token. SessionStore không quản lý token trực tiếp —
`AuthEvent` từ `stateChanges()` sẽ bắn khi token refresh xong. Không cần test riêng.

## Stale UI

RootGate dùng `.id(userId)` — đổi tài khoản dựng lại cả cây. Đã verify trong #302.
Không có stale state sống sót.

## Cleanup

`onSignedOut` callbacks được gọi khi:
- SIGNED_OUT event từ server
- Đổi userId (coi như kết thúc phiên)

Cả hai đều có test.

## Kết luận

Tất cả invariants trong #326 đều đã có test hoặc được xử lý đúng.
Không cần thêm test.
