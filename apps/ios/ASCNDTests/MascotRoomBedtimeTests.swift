import ASCNDCore
import CoreGraphics
import Foundation
import SwiftUI
import Testing

@testable import ASCND

/// Phòng Koa dựng được cả trong test (#527: test cũ chỉ dựng `StudioLayers`,
/// lỗi phòng biến mất lúc đi ngủ của #777 nằm ở view cha nên không có test
/// tự động). Không cần sửa production để dựng `MascotRoomView`: controller
/// nhận nguồn / kinh tế giả, `AppServices()` dựng trực tiếp như
/// `KoaSessionResetTests`, hồ sơ giả đặt cửa sổ ngủ bao / tránh giờ hiện tại
/// để ép nét mặt ngủ / thức một cách xác định, không phụ thuộc giờ chạy test.
///
/// So hai bản dựng ngay trên máy đang chạy như `StudioLayersRenderTests` —
/// không ảnh mẫu, không lệch theo máy.
@MainActor
@Suite struct MascotRoomBedtimeTests {
  private static let size = CGSize(width: 390, height: 844)

  private func pixels(_ view: some View) throws -> [UInt8] {
    let renderer = ImageRenderer(content: view.frame(width: Self.size.width, height: Self.size.height))
    renderer.scale = 1
    // Lần dựng đầu chạy các `.onChange(initial:)` / `.onAppear` của phòng —
    // mở phòng giữa giờ ngủ thì Koa đã nằm sẵn (`place(door)` → phòng ngủ);
    // lần dựng sau mới là cảnh ổn định.
    _ = renderer.cgImage
    let image = try #require(renderer.cgImage)
    let w = image.width, h = image.height
    var out = [UInt8](repeating: 0, count: w * h * 4)
    let context = try #require(
      CGContext(
        data: &out, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
    context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    return out
  }

  /// Phần điểm ảnh lệch quá `limit` bậc ở một kênh màu.
  private func differing(_ a: [UInt8], _ b: [UInt8], limit: Int) -> Double {
    var off = 0
    for i in stride(from: 0, to: a.count, by: 4) {
      if (0..<3).contains(where: { abs(Int(a[i + $0]) - Int(b[i + $0])) > limit }) { off += 1 }
    }
    return Double(off) / Double(a.count / 4)
  }

  /// Phòng đã đọc xong (`.ready`) với sổ giả: một dòng xu, chưa làm gì hôm nay.
  private func readyRoom(userId: String) async -> MascotRoomController {
    let room = MascotRoomController(
      userId: userId, today: LocalDate(SystemWallClock().nowMillis(), in: .current),
      source: FakeMascotSource(), economy: FakeMascotEconomy())
    await room.load()
    return room
  }

  /// Hồ sơ giả: cửa sổ ngủ bao giờ hiện tại (`asleep`) hay tránh xa nó — nét
  /// mặt ngủ / thức theo đúng `KoaMood`, không cần chờ tới đêm.
  private func profileBook(userId: String, asleep: Bool) async -> ProfileBook {
    var profile = Profile(userId: userId)
    let now = Date.now
    let cal = Calendar.current
    func hm(_ date: Date) -> String {
      String(format: "%02d:%02d", cal.component(.hour, from: date), cal.component(.minute, from: date))
    }
    if asleep {
      profile.sleepTargetBedtime = hm(now.addingTimeInterval(-3600))
      profile.sleepTargetWaketime = hm(now.addingTimeInterval(3600))
    } else {
      profile.sleepTargetBedtime = hm(now.addingTimeInterval(6 * 3600))
      profile.sleepTargetWaketime = hm(now.addingTimeInterval(7 * 3600))
    }
    profile.sleepTargetBedtimeSet = true
    profile.sleepTargetWaketimeSet = true
    let book = ProfileBook(
      userId: userId, source: FakeProfileSource(), writer: FakeProfileWriter(),
      cache: FakeProfileCache(profile: profile))
    await book.loadCached()
    return book
  }

  private func render(userId: String, asleep: Bool) async throws -> [UInt8] {
    let room = await readyRoom(userId: userId)
    let profile = await profileBook(userId: userId, asleep: asleep)
    return try pixels(MascotRoomView(room: room).environment(AppServices()).environment(profile))
  }

  /// Spike: `MascotRoomView` dựng được với dịch vụ giả — bản thân việc test
  /// này biên dịch và chạy đã là bằng chứng, không cần sửa production.
  @Test func roomViewConstructsWithFixtureServices() async {
    let room = await readyRoom(userId: "spike-construct")
    #expect(room.phase == .ready)
    let profile = await profileBook(userId: "spike-construct", asleep: false)
    _ = MascotRoomView(room: room).environment(AppServices()).environment(profile)
  }

  /// #777: phòng không được biến mất lúc đi ngủ. Cùng một phòng, hai cửa sổ
  /// ngủ: lúc thức và lúc ngủ phải ra hai cảnh khác nhau, và cả hai đều phải
  /// có nội dung thật — không trống đen, không trống trắng.
  @Test func roomStaysVisibleAcrossTheBedtimeSwitch() async throws {
    let awake = try await render(userId: "spike-bedtime-awake", asleep: false)
    let asleep = try await render(userId: "spike-bedtime-asleep", asleep: true)
    // Cảnh đã chuyển thật: phòng ngủ gác mái khác phòng studio.
    #expect(differing(awake, asleep, limit: 8) > 0.02, "cảnh ngủ phải khác cảnh thức")
    let black = try pixels(Color.black)
    let white = try pixels(Color.white)
    for (name, shot) in [("thức", awake), ("ngủ", asleep)] {
      #expect(differing(shot, black, limit: 8) > 0.02, "cảnh \(name) không được trống đen")
      #expect(differing(shot, white, limit: 8) > 0.02, "cảnh \(name) không được trống trắng")
    }
  }
}

private struct FakeMascotSource: MascotSource {
  func ledger(userId: String) async throws -> [LedgerRow] {
    [LedgerRow(amount: 100, refKey: "d:2026-11-17:meal")]
  }

  func loggedDates(userId: String, limit: Int) async throws -> [LocalDate] { [] }
  func freezes(userId: String) async throws -> [FreezeRow] { [] }
  func weeklyChallenges(userId: String, weekStart: LocalDate) async throws -> [WeeklyChallenge] { [] }
  func awardCount(userId: String) async throws -> Int { 0 }
  func dailySignals(userId: String, date: LocalDate) async throws -> DailySignals { DailySignals() }
}

private struct FakeMascotEconomy: MascotEconomy {
  func claimReward(refKey: String, reason: String) async throws -> Int { 0 }
  func buyStreakFreeze(requestId: UUID) async throws -> Int { 0 }
}

private struct FakeProfileSource: ProfileSource {
  func profile(userId: String) async throws -> JSONValue? { nil }
}

private struct FakeProfileWriter: ProfileWriter {
  func update(userId: String, row: JSONValue) async throws {}
}

private struct FakeProfileCache: ProfileCache {
  var profile: Profile?
  func load(userId: String) async throws -> Profile? { profile }
  func save(userId: String, _ profile: Profile) async throws {}
}
