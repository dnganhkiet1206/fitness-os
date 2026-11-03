import ASCNDCore
import ASCNDDesignSystem
import SnapshotTesting
import SwiftUI
import Testing
import UIKit

@testable import ASCND

/// Ảnh chuẩn các màn Koa Ecosystem (#795): mỗi màn ở ba kiểu — sáng, tối, chữ lớn (Dynamic Type).
/// Ảnh nằm ở `__Snapshots__/KoaSnapshotTests/`. Đổi giao diện có chủ ý thì ghi lại ảnh: xem
/// `docs/AGENT_SESSION.md` §6c. Dữ liệu mẫu cố định (ngày, lịch, buổi tập) nên ảnh không đổi theo
/// ngày chạy.
@MainActor
@Suite struct KoaSnapshotTests {
  /// Thứ Ba 03/11/2026.
  static let today = LocalDate("2026-11-03")!

  /// Lịch T2 / T4 / T6, nghỉ T7 / CN; buổi tập 45 ngày trước hôm nay, nghỉ một đợt 12–20 ngày trước
  /// (có một lần quay lại), hai kỷ lục.
  static let history: AppServices.GainsHistory = {
    let week = KoaGains.Week(planned: [0, 2, 4], rest: [5, 6])
    var days: [KoaGains.Day] = []
    for back in stride(from: 45, through: 1, by: -1) {
      let d = today.adding(days: -back)
      guard week.planned.contains(WorkoutPlanning.routineIndex(d)), !(12...20).contains(back) else { continue }
      days.append(KoaGains.Day(date: d, personalRecord: back == 30 || back == 5))
    }
    return .init(days: days, week: week)
  }()

  enum Look: String, CaseIterable {
    case light, dark, largeType

    var traits: UITraitCollection {
      UITraitCollection(mutations: { t in
        t.userInterfaceStyle = self == .dark ? .dark : .light
        t.preferredContentSizeCategory = self == .largeType ? .accessibilityExtraLarge : .large
        // Cố định tỉ lệ điểm ảnh: ảnh không đổi theo đời simulator của máy CI.
        t.displayScale = 2
      })
    }

    var scheme: ColorScheme { self == .dark ? .dark : .light }
    var typeSize: DynamicTypeSize { self == .largeType ? .accessibility3 : .large }
  }

  /// Chụp `view` ở ba kiểu. `height == nil`: cao vừa nội dung (thẻ); có `height`: khung cố định
  /// (màn cuộn).
  private func check(
    _ view: some View, height: CGFloat? = nil, padded: Bool = true, testName: String = #function,
    fileID: StaticString = #fileID, filePath: StaticString = #filePath, line: UInt = #line, column: UInt = #column
  ) {
    let width: CGFloat = 390
    for look in Look.allCases {
      let framed = view
        .padding(padded ? DS.Spacing.md : 0)
        // Thẻ: cao vừa nội dung như khi nằm trong ScrollView của app. `.sizeThatFits` của thư viện
        // đề nghị cao 0, nên chữ không có `fixedSize` bị ép một dòng và cắt "…" — ảnh sai so với app.
        .fixedSize(horizontal: false, vertical: height == nil)
        .frame(width: width, height: height, alignment: .top)
        .background(DS.Color.background.swiftUI)
        .environment(\.colorScheme, look.scheme)
        .environment(\.dynamicTypeSize, look.typeSize)
        .environment(\.locale, Locale(identifier: "en_US"))
      let layout: SwiftUISnapshotLayout = height.map { .fixed(width: width, height: $0) } ?? .sizeThatFits
      assertSnapshot(
        of: framed, as: Self.strategy(for: framed, layout: layout, traits: look.traits),
        named: look.rawValue, fileID: fileID, file: filePath, testName: testName, line: line, column: column)
    }
  }

  /// Chụp như `.image` của thư viện, nhưng so bằng `KoaImageDiff` (CPU) thay cho phép so "cảm nhận"
  /// của thư viện: phép ấy chạy bằng Metal, và trên máy ảo CI nó báo lệch cả khi ảnh chỉ khác 1/255 ở
  /// 37 điểm ảnh (PR #810, run 41680003917, `rhythmCard.light`). Chính thư viện ghi chú máy ảo không
  /// có GPU có thể lỗi âm thầm.
  private static func strategy<V: View>(
    for _: V, layout: SwiftUISnapshotLayout, traits: UITraitCollection
  ) -> Snapshotting<V, UIImage> {
    var s = Snapshotting<V, UIImage>.image(drawHierarchyInKeyWindow: true, layout: layout, traits: traits)
    s.diffing = KoaImageDiff.diffing(scale: traits.displayScale)
    return s
  }

  /// Bộ so ảnh: nhiễu 1/255 không tính, một kênh lệch nhiều thì tính (#795).
  @Test func imageDiffIgnoresRenderNoiseButCatchesChanges() {
    let base = [UInt8](repeating: 128, count: 100 * 4)
    var noise = base
    noise[0] = 129
    noise[6] = 127
    var changed = base
    changed[8] = 200
    #expect(KoaImageDiff.differentPixels(base, base) == 0)
    #expect(KoaImageDiff.differentPixels(base, noise) == 0, "lệch 1/255 là nhiễu của bộ dựng hình")
    #expect(KoaImageDiff.differentPixels(base, changed) == 1)
  }

  @Test func rhythmCard() {
    let h = Self.history
    let pause = KoaPause(from: Self.today.adding(days: -4), days: 3)
    check(KoaRhythmCard(state: KoaRhythm.state(h.days, week: h.week, paused: { pause.contains($0) }, today: Self.today)))
  }

  @Test func journey() {
    check(KoaJourneyContent(history: Self.history, today: Self.today), height: 844, padded: false)
  }

  @Test func journeyEmpty() {
    let empty = AppServices.GainsHistory(days: [], week: Self.history.week)
    check(KoaJourneyContent(history: empty, today: Self.today), height: 600, padded: false)
  }

  @Test func pauseCard() {
    check(KoaPauseCard(pause: KoaPause(from: Self.today.adding(days: -1), days: 5), today: Self.today, build: 2) {})
  }

  @Test func pauseSheet() {
    check(KoaPauseSheet(today: Self.today) { _ in }, padded: false)
  }

  @Test func gainsCard() {
    let h = Self.history
    let past = h.days.filter { $0.date != Self.today }
    let todayDay = KoaGains.Day(date: Self.today, personalRecord: true)
    let b = KoaGains.breakdown(past + [todayDay], week: h.week, on: Self.today) ?? .init()
    let g = WorkoutSummaryView.GainsGain(
      before: KoaGains.compute(past, week: h.week, today: Self.today),
      after: KoaGains.compute(past + [todayDay], week: h.week, today: Self.today),
      planned: b.planned, pr: b.personalRecord, overload: b.overload, fullWeek: b.fullWeek, streak: b.streak)
    check(KoaGainsCard(g: g))
  }
}
