#if DEBUG
  import ASCNDCore
  import Foundation

  /// Nhắn tin giả — CHỈ bản Debug, chỉ khi mở app với `ASCND_FAKE_DM=1` (xem
  /// `AppServices.makeDirectMessages`). Server chưa có nhắn tin
  /// (`docs/design/community/MESSAGING-PLAN.md`); nguồn này để thử giao diện.
  /// Một kho trong bộ nhớ cho cả phiên — hộp thư và trang cá nhân thấy cùng dữ liệu.
  actor FakeDMSource: DMSampleSource {
    static let shared = FakeDMSource()

    private var threadsById: [String: DirectMessages.Thread] = [:]
    private var messagesById: [String: [DirectMessages.Message]] = [:]
    private var seeded = false
    private var n = 0

    private static func author(_ id: String, _ handle: String, _ name: String, _ mascot: String) -> CommunityFeed.Author {
      CommunityFeed.Author(userId: id, handle: handle, displayName: name, mascotId: mascot)
    }

    private func seed(me: String) {
      guard !seeded else { return }
      seeded = true
      let now = Int64(Date().timeIntervalSince1970 * 1000)
      func ago(_ minutes: Int64) -> EpochMillis { EpochMillis(now - minutes * 60_000) }
      let minh = Self.author("demo-minh", "minhlifts", "Minh Trần", "titan")
      let lan = Self.author("demo-lan", "lanpham", "Lan Phạm", "swift")
      let hung = Self.author("demo-hung", "hungpt", "Hùng PT", "blaze")
      let vy = Self.author("demo-vy", "vyrun", "Vy Nguyễn", "nova")
      let threads = [
        DirectMessages.Thread(
          id: "t-minh", other: minh, lastText: "Ghê 🔥 mai tập cùng nhé", lastAt: ago(2), lastFromMe: false, unread: true,
          isRequest: false, training: "Chest day"),
        DirectMessages.Thread(
          id: "t-lan", other: lan, lastText: "Công thức yến mạch đó ngon thật", lastAt: ago(60), lastFromMe: false,
          unread: false, isRequest: false, training: nil),
        DirectMessages.Thread(
          id: "t-hung", other: hung, lastText: "Mai 6h nhé 💪", lastAt: ago(60 * 26), lastFromMe: true, unread: false,
          isRequest: false, training: nil),
        DirectMessages.Thread(
          id: "t-vy", other: vy, lastText: "Chào bạn, cho mình hỏi lịch tập chân với", lastAt: ago(30), lastFromMe: false,
          unread: true, isRequest: true, training: nil),
      ]
      for t in threads { threadsById[t.id] = t }
      messagesById["t-minh"] = [
        .init(id: "m1", senderId: minh.userId, body: .text("Bench hôm nay lên được 100 chưa 👀"), at: ago(15)),
        .init(id: "m2", senderId: me, body: .text("Lên rồi, vừa xong"), at: ago(10), readAt: ago(9)),
        .init(
          id: "m3", senderId: me,
          body: .workout(.init(title: "Push A", volumeKg: 4200, exerciseCount: 6, minutes: 52, pr: true)), at: ago(9),
          readAt: ago(8)),
        .init(id: "m4", senderId: minh.userId, body: .text("Ghê 🔥 mai tập cùng nhé"), at: ago(2)),
      ]
      messagesById["t-lan"] = [
        .init(id: "l1", senderId: me, body: .text("Mình thử món yến mạch qua đêm của bạn rồi"), at: ago(70), readAt: ago(65)),
        .init(id: "l2", senderId: lan.userId, body: .text("Công thức yến mạch đó ngon thật"), at: ago(60)),
      ]
      messagesById["t-hung"] = [
        .init(id: "h1", senderId: hung.userId, body: .text("Tuần này tập chân thêm 1 buổi nhé"), at: ago(60 * 27)),
        .init(id: "h2", senderId: me, body: .text("Mai 6h nhé 💪"), at: ago(60 * 26), readAt: ago(60 * 25)),
      ]
      messagesById["t-vy"] = [
        .init(id: "v1", senderId: vy.userId, body: .text("Chào bạn, cho mình hỏi lịch tập chân với"), at: ago(30))
      ]
    }

    func threads(userId: String) async throws -> [DirectMessages.Thread] {
      seed(me: userId)
      try? await Task.sleep(for: .milliseconds(250))
      return Array(threadsById.values)
    }

    func messages(threadId: String) async throws -> [DirectMessages.Message] {
      try? await Task.sleep(for: .milliseconds(200))
      return messagesById[threadId] ?? []
    }

    func send(threadId: String, from userId: String, body: DirectMessages.Body) async throws -> DirectMessages.Message {
      n += 1
      let m = DirectMessages.Message(id: "s\(n)", senderId: userId, body: body, at: EpochMillis(Date()))
      messagesById[threadId, default: []].append(m)
      if var t = threadsById[threadId] {
        t.lastAt = m.at
        t.lastFromMe = true
        t.isRequest = false
        if case .text(let s) = body { t.lastText = s }
        threadsById[threadId] = t
      }
      return m
    }

    func open(with other: CommunityFeed.Author, userId: String) async throws -> DirectMessages.Thread {
      seed(me: userId)
      if let t = threadsById.values.first(where: { $0.other.userId == other.userId }) { return t }
      let t = DirectMessages.Thread(
        id: "t-\(other.userId)", other: other, lastText: "", lastAt: EpochMillis(Date()), lastFromMe: true,
        unread: false, isRequest: false, training: nil)
      threadsById[t.id] = t
      return t
    }

    func markRead(threadId: String, userId: String) async throws {
      threadsById[threadId]?.unread = false
    }
  }
#endif
