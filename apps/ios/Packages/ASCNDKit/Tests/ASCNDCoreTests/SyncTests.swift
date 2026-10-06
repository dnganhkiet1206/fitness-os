import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

private func at(_ ms: Int64) -> EpochMillis { EpochMillis(ms) }

struct RetryPolicyTests {
  @Test(arguments: ["42501", "42703", "23505", "23503", "23514", "23502", "22P02", "22007", "54000", "CR001", "PGRST116", "PGRST204"])
  func permanentCodes(code: String) {
    #expect(RetryPolicy.isPermanent(.server(code: code)), "\(code)")
  }

  @Test(arguments: [nil, "08006", "57014", "40001", "500"] as [String?])
  func transientCodes(code: String?) {
    #expect(!RetryPolicy.isPermanent(.server(code: code)), "\(code ?? "nil")")
  }

  @Test func accountAndUnusableArePermanentOfflineIsNot() {
    #expect(RetryPolicy.isPermanent(.wrongAccount))
    #expect(RetryPolicy.isPermanent(.unusable))
    #expect(!RetryPolicy.isPermanent(.offline))
  }

  /// TanStack `defaultRetryDelay(failureCount) = min(1000·2^failureCount, 30000)`,
  /// `failureCount` đếm từ 0 → sau lần lỗi thứ 1, 2, 3… chờ 1 s, 2 s, 4 s…
  @Test func delaysMatchTanStack() {
    let expected: [Int64] = [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]
    for (i, ms) in expected.enumerated() {
      #expect(RetryPolicy.delayMillis(afterFailures: i + 1) == ms, "lần lỗi \(i + 1)")
    }
    #expect(RetryPolicy.delayMillis(afterFailures: 10_000) == 30_000)
  }
}

struct FailureHistoryTests {
  /// Đối chiếu từng bước với baseline cho chuỗi chỉ gồm lỗi tạm thời:
  /// `retry: (failureCount) => failureCount < 3` (offline-write.ts:733).
  @Test func transientOnlyMatchesBaselineStepByStep() {
    var h = FailureHistory()
    for failureCount in 0..<6 {
      let baselineRetries = failureCount < 3
      let baselineDelay = min(Int64(1000) << Int64(failureCount), 30_000)
      switch h.record(.server(code: nil)) {
      case .retry(let delay, let needsNetwork):
        #expect(baselineRetries, "lần \(failureCount + 1): native gửi lại, baseline thì thôi")
        #expect(delay == baselineDelay)
        #expect(!needsNetwork)
      case .giveUp(let permanent):
        #expect(!baselineRetries, "lần \(failureCount + 1): native thôi, baseline gửi lại")
        #expect(!permanent)
      }
    }
  }

  @Test func offlineNeverExhausts() {
    var h = FailureHistory()
    for _ in 0..<50 {
      #expect(h.record(.offline) == .retry(delayMillis: h.failures >= 6 ? 30_000 : RetryPolicy.delayMillis(afterFailures: h.failures), needsNetwork: true))
    }
  }

  /// Chỗ lệch CÓ CHỦ ĐÍCH (ADR-0003): baseline đếm cả lần mất mạng vào
  /// `failureCount`, nên mất mạng ×3 rồi một lỗi 5xx là bỏ bản ghi — trái với
  /// OFFLINE-POLICY ("gửi khi có mạng"). Native vẫn còn đủ 3 lần cho lỗi tạm thời.
  @Test func offlineDoesNotSpendTransientBudget() {
    var h = FailureHistory()
    for _ in 0..<3 { _ = h.record(.offline) }
    for _ in 0..<3 {
      guard case .retry = h.record(.server(code: nil)) else {
        Issue.record("hết ngân sách sớm vì các lần mất mạng")
        return
      }
    }
    #expect(h.record(.server(code: nil)) == .giveUp(permanent: false))
  }

  @Test func permanentStopsImmediately() {
    var h = FailureHistory()
    #expect(h.record(.server(code: "23505")) == .giveUp(permanent: true))
  }
}

struct OutboxTests {
  private func entry(_ id: String, user: String = "u1", kind: String = "water") -> OutboxEntry {
    OutboxEntry(id: id, userId: user, kind: kind, payload: .object(["ml": .number(250)]), createdAt: at(0))
  }

  @Test func sendsInOrderOneAtATime() {
    var box = Outbox()
    box.enqueue(entry("a"))
    box.enqueue(entry("b"))
    #expect(box.next(now: at(0), online: true, signedInUser: "u1") == .send(entry("a")))
    #expect(box.next(now: at(0), online: true, signedInUser: "u1") == .busy)
    box.succeeded(id: "a")
    #expect(box.next(now: at(0), online: true, signedInUser: "u1") == .send(entry("b")))
  }

  @Test func enqueueIsIdempotentById() {
    var box = Outbox()
    box.enqueue(entry("a"))
    box.enqueue(entry("a"))
    #expect(box.pending.count == 1)
  }

  @Test func transientFailureKeepsHeadAndWaits() throws {
    var box = Outbox()
    box.enqueue(entry("a"))
    box.enqueue(entry("b"))
    _ = box.next(now: at(0), online: true, signedInUser: "u1")
    #expect(box.failed(id: "a", .server(code: nil), now: at(10)) == .willRetry(notBefore: at(1010), needsNetwork: false))
    // b KHÔNG được vượt lên: làn tuần tự.
    #expect(box.next(now: at(500), online: true, signedInUser: "u1") == .wait(until: at(1010)))
    guard case .send(let e) = box.next(now: at(1010), online: true, signedInUser: "u1") else {
      Issue.record("không gửi lại a")
      return
    }
    #expect(e.id == "a")
  }

  @Test func offlineFailureWaitsForNetworkThenDelay() {
    var box = Outbox()
    box.enqueue(entry("a"))
    _ = box.next(now: at(0), online: true, signedInUser: "u1")
    box.failed(id: "a", .offline, now: at(0))
    #expect(box.next(now: at(5000), online: false, signedInUser: "u1") == .waitForNetwork)
    #expect(box.next(now: at(500), online: true, signedInUser: "u1") == .wait(until: at(1000)))
    #expect(box.next(now: at(1000), online: true, signedInUser: "u1") == .send(box.pending[0]))
  }

  @Test func neverSendsWhileOfflineEvenFirstTime() {
    var box = Outbox()
    box.enqueue(entry("a"))
    #expect(box.next(now: at(0), online: false, signedInUser: "u1") == .waitForNetwork)
  }

  @Test func permanentFailureMovesToDeadAndUnblocksQueue() {
    var box = Outbox()
    box.enqueue(entry("a"))
    box.enqueue(entry("b"))
    _ = box.next(now: at(0), online: true, signedInUser: "u1")
    #expect(box.failed(id: "a", .server(code: "23514"), now: at(7)) == .dead(.refused))
    #expect(box.dead.map(\.entry.id) == ["a"])
    #expect(box.dead.first?.failure == .server(code: "23514"))
    #expect(box.next(now: at(7), online: true, signedInUser: "u1") == .send(entry("b")))
  }

  @Test func otherAccountsRecordsNeverSendAndDoNotBlock() {
    var box = Outbox()
    box.enqueue(entry("x", user: "u2"))
    box.enqueue(entry("a", user: "u1"))
    #expect(box.next(now: at(0), online: true, signedInUser: "u1") == .send(entry("a", user: "u1")))
    #expect(box.dead.map(\.entry.id) == ["x"])
    #expect(box.dead.first?.reason == .wrongAccount)
  }

  @Test func signedOutSendsNothing() {
    var box = Outbox()
    box.enqueue(entry("a"))
    #expect(box.next(now: at(0), online: true, signedInUser: nil) == .idle)
    #expect(box.pending.count == 1)
  }

  @Test func signOutDropsQueueLikeBaseline() {
    var box = Outbox()
    box.enqueue(entry("a"))
    box.enqueue(entry("b"))
    _ = box.next(now: at(0), online: true, signedInUser: "u1")
    #expect(box.dropAllOnSignOut() == 2)
    #expect(box.pending.isEmpty)
    #expect(box.inFlight == nil)
  }

  /// #335: `dead` cũng là buổi tập của người vừa rời đi — bỏ cùng hàng đợi.
  @Test func signOutDropsDeadToo() {
    var box = Outbox()
    box.enqueue(entry("x", user: "u9"))
    _ = box.next(now: at(0), online: true, signedInUser: "u1")
    #expect(box.dead.count == 1)
    box.dropAllOnSignOut()
    #expect(box.dead.isEmpty)
  }

  /// Lưu xuống đĩa rồi nạp lại: hàng đợi, lịch sử lỗi, hạn chờ còn nguyên;
  /// "đang gửi" thì không — app chết giữa lượt gửi thì lần sau gửi lại.
  @Test func persistsAcrossRelaunchWithoutInFlight() throws {
    var box = Outbox()
    box.enqueue(entry("a"))
    _ = box.next(now: at(0), online: true, signedInUser: "u1")
    box.failed(id: "a", .server(code: nil), now: at(0))
    _ = box.next(now: at(1000), online: true, signedInUser: "u1")
    #expect(box.inFlight == "a")
    let data = try JSONEncoder().encode(box)
    var reloaded = try JSONDecoder().decode(Outbox.self, from: data)
    #expect(reloaded.inFlight == nil)
    #expect(reloaded.pending == box.pending)
    #expect(reloaded.pending[0].history.transientFailures == 1)
    guard case .send = reloaded.next(now: at(1000), online: true, signedInUser: "u1") else {
      Issue.record("không gửi lại sau khi mở lại app")
      return
    }
  }

  /// Bất biến trên chuỗi ngẫu nhiên: thứ tự giữ nguyên, không bao giờ hai lượt
  /// gửi cùng lúc, mỗi bản ghi kết thúc ĐÚNG MỘT lần (tới server hoặc vào
  /// `dead`), và số lần gửi tối đa = 1 + 3 (tạm thời) + số lần mất mạng.
  @Test func randomSequencesKeepInvariants() {
    var rng = SplitMix64(seed: 0x0A7B_0225)
    for _ in 0..<300 {
      var box = Outbox()
      let n = 1 + Int(rng.next(below: 6))
      let ids = (0..<n).map { "e\($0)" }
      for id in ids { box.enqueue(entry(id)) }
      var now = at(0)
      var finished: [String] = []
      var sends: [String: Int] = [:]
      var offlineFails: [String: Int] = [:]
      var steps = 0
      while finished.count < n && steps < 500 {
        steps += 1
        let online = rng.next(below: 5) != 0
        switch box.next(now: now, online: online, signedInUser: "u1") {
        case .send(let e):
          #expect(box.inFlight == e.id)
          sends[e.id, default: 0] += 1
          // Thứ tự: bản ghi đang gửi là bản ghi sớm nhất chưa kết thúc.
          #expect(e.id == ids.first { !finished.contains($0) })
          switch rng.next(below: 4) {
          case 0:
            box.succeeded(id: e.id)
            finished.append(e.id)
          case 1:
            offlineFails[e.id, default: 0] += 1
            box.failed(id: e.id, .offline, now: now)
          case 2:
            if case .dead = box.failed(id: e.id, .server(code: nil), now: now) { finished.append(e.id) }
          default:
            if rng.next(below: 4) == 0 {
              box.failed(id: e.id, .server(code: "23514"), now: now)
              finished.append(e.id)
            } else {
              box.succeeded(id: e.id)
              finished.append(e.id)
            }
          }
        case .wait(let until):
          now = until
        case .waitForNetwork, .idle:
          now = now + 1000
        case .busy:
          Issue.record("busy khi không có lượt gửi nào đang chạy")
        }
      }
      #expect(finished == ids, "mỗi bản ghi kết thúc đúng một lần, đúng thứ tự")
      #expect(box.pending.isEmpty)
      for id in ids {
        #expect(sends[id, default: 0] <= 1 + RetryPolicy.maxTransientRetries + offlineFails[id, default: 0], "\(id)")
      }
    }
  }
}
