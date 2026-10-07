# QA Matrix — A6 → A12

Ma trận kiểm thử cho các PR A6-A12. iPhone cells để trống cho tới khi Kiệt test máy thật.

## A6 (#285) — Template read model

| Test | Vectors | Owner | iPhone |
|------|---------|-------|--------|
| Template read từ server | — | A | ⬜ |
| Cache offline | — | A | ⬜ |

## A7 (#290) — TodayController

| Test | Vectors | Owner | iPhone |
|------|---------|-------|--------|
| Ngày thật theo múi giờ | — | A | ⬜ |
| Khoá chốt khi server đã có buổi | — | A | ⬜ |
| Offline dùng cache | — | A | ⬜ |

## A9 (#293) — Session lifecycle

| Test | Vectors | Owner | iPhone |
|------|---------|-------|--------|
| Dọn workout_day khi logout | — | A | ⬜ |
| Dọn Live Activity | — | A | ⬜ |
| Đổi tài khoản dọn sạch | — | A | ⬜ |

## A11 (#298) — Personal Record

| Test | Vectors | Owner | iPhone |
|------|---------|-------|--------|
| new weight PR | personal-record.json | C | ⬜ |
| new reps PR | personal-record.json | C | ⬜ |
| warmup excluded | personal-record.json | C | ⬜ |
| 0.05kg epsilon | personal-record.json | C | ⬜ |

**Intentional difference:** warmup không tính PR (theo `counts()`).

## A12 (#307) — Append set

| Test | Vectors | Owner | iPhone |
|------|---------|-------|--------|
| append cơ bản | append-set.json | C | ⬜ |
| idempotency | append-set.json | C | ⬜ |
| warmup excluded khỏi volume | append-set.json | C | ⬜ |

**Intentional difference:** retry không tạo duplicate (idempotent).

## Native differences (có evidence)

| Khác biệt | Evidence |
|-----------|----------|
| PR detection: native dùng cùng logic RN | spec/vectors/personal-record.json |
| Append: native idempotent | spec/vectors/append-set.json |
