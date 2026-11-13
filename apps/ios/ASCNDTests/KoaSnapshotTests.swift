import ASCNDCore
import ASCNDDesignSystem
import SnapshotTesting
import SwiftUI
import Testing
import UIKit

@testable import ASCND

/// Ảnh chuẩn các màn Koa Ecosystem và thẻ "Hôm nay của bạn" (#795): mỗi màn ở ba kiểu — sáng, tối,
/// chữ lớn (Dynamic Type).
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

  /// Ảnh so với chính bản đã lưu (PNG) của nó thì không lệch, kể cả khi ảnh vẽ ở dải màu mở rộng như
  /// ảnh chụp của simulator (03/11: bộ so từng báo lệch cho ảnh giống hệt ảnh chuẩn).
  @Test func imageDiffComparesTheImageAsSaved() throws {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 2
    format.preferredRange = .extended
    let image = UIGraphicsImageRenderer(size: CGSize(width: 40, height: 20), format: format).image { ctx in
      UIColor(displayP3Red: 0.92, green: 0.31, blue: 0.18, alpha: 1).setFill()
      ctx.fill(CGRect(x: 0, y: 0, width: 40, height: 20))
      UIColor(white: 0.1, alpha: 0.6).setFill()
      ctx.fill(CGRect(x: 4, y: 4, width: 20, height: 8))
    }
    let data = try #require(image.pngData())
    let saved = try #require(UIImage(data: data, scale: 2))
    #expect(KoaImageDiff.message(saved, image) == nil)
  }

  @Test func rhythmCard() {
    let h = Self.history
    let pause = KoaPause(from: Self.today.adding(days: -4), days: 3)
    check(KoaRhythmCard(state: KoaRhythm.state(h.days, week: h.week, paused: { pause.contains($0) }, today: Self.today)))
  }

  @Test func journey() {
    check(KoaJourneyContent(history: Self.history, today: Self.today), height: 844, padded: false)
  }

  /// Người mới chỉ ghi bữa / nước / ngủ, chưa tập buổi nào (10/11): Hành trình đã có mốc ghi đều.
  /// Từ 12/11 có thêm Nhịp ghi 30 ngày dưới thẻ tháng.
  @Test func journeyLogDays() {
    let logged = Set((1...8).map { Self.today.adding(days: -$0) })
    let kinds = Dictionary(uniqueKeysWithValues: logged.map { ($0, Set<KoaLogDaysSync.Kind>([.meal])) })
    let h = AppServices.GainsHistory(days: [], week: Self.history.week, logged: logged, logKinds: kinds)
    check(KoaJourneyContent(history: h, today: Self.today), height: 600, padded: false)
  }

  /// Nhịp ghi 30 ngày (12/11): 22 ngày có ghi, tách bữa / nước / ngủ, hơn 30 ngày trước 6 ngày.
  @Test func logRhythmCard() {
    var kinds: [LocalDate: Set<KoaLogDaysSync.Kind>] = [:]
    let skip: Set<Int> = [2, 6, 11, 13, 18, 20, 23, 27]
    for i in 0..<30 where !skip.contains(i) {
      var k: Set<KoaLogDaysSync.Kind> = []
      if i % 3 != 2 { k.insert(.meal) }
      if i % 2 == 0 { k.insert(.water) }
      if i % 4 != 3 { k.insert(.sleep) }
      if k.isEmpty { k.insert(.meal) }
      kinds[Self.today.adding(days: -i)] = k
    }
    for i in 30..<46 { kinds[Self.today.adding(days: -i)] = [.meal] }
    check(KoaLogRhythmCard(state: KoaLogRhythm.state(kinds, today: Self.today)))
  }

  /// Trang "Tháng 10 của bạn" (13/11): buổi theo lịch T2 / T4 / T6 có đợt nghỉ, một kỷ lục, ghi
  /// cách ngày; dữ liệu cố định nên ảnh không đổi theo ngày chạy.
  @Test func monthRecap() {
    var kinds: [LocalDate: Set<KoaLogDaysSync.Kind>] = [:]
    for day in stride(from: 1, through: 31, by: 2) {
      kinds[LocalDate(String(format: "2026-10-%02d", day))!] = day % 3 == 0 ? [.meal, .water] : [.meal, .sleep]
    }
    let h = AppServices.GainsHistory(
      days: Self.history.days, week: Self.history.week, logged: Set(kinds.keys), logKinds: kinds)
    check(
      NavigationStack { KoaMonthView(history: h, key: .init(year: 2026, month: 10), today: Self.today) },
      height: 1300, padded: false)
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

  /// "Hôm nay của bạn" (#795 đợt 2c): thẻ Bữa đứng đầu để thấy ba nút nhanh và dòng kế hoạch ăn.
  @Test func todayDayCardMeal() {
    check(
      TodayDayCard(
        tiles: Self.dayTiles([.meal, .water, .sleep, .workout]), planNext: "Next: Dinner · Rice, salmon",
        quickWater: (label: "+ 8 oz", add: {}, custom: {}), mealQuick: { _ in }, onLogAll: {}, onTap: { _ in }))
  }

  /// Thẻ Nước đứng đầu (hai nút nhanh) và dòng cân nặng.
  @Test func todayDayCardWater() {
    check(
      TodayDayCard(
        tiles: Self.dayTiles([.water, .meal, .sleep, .workout]), quickWater: (label: "+ 8 oz", add: {}, custom: {}),
        weighIn: (detail: "Last weigh-in 3 weeks ago", done: false), onLogAll: {}, onTap: { _ in }))
  }

  /// Bốn ô mẫu của "Hôm nay của bạn", theo thứ tự cho trước.
  static func dayTiles(_ order: [DayCheckIn.Item]) -> [TodayDayCard.Tile] {
    order.map { item in
      switch item {
      case .sleep: TodayDayCard.Tile(item: .sleep, state: .done, detail: "7 h 20 min", auto: true)
      case .meal: TodayDayCard.Tile(item: .meal, state: .todo, detail: "Not logged yet")
      case .water: TodayDayCard.Tile(item: .water, state: .todo, detail: "8 / 65 oz")
      case .workout: TodayDayCard.Tile(item: .workout, state: .rest, detail: "Rest day")
      }
    }
  }

  /// Kệ cúp và khung mốc trong phòng Koa (#792): kệ gốc đủ ba cúp, ba khung trên tường.
  @Test func shelfRoom() {
    check(ShelfRoomPreview(shelf: nil), height: CGFloat(StudioScene.sceneBottom), padded: false)
  }

  /// Giá olympic (đồ phòng mua bằng xu) không có tầng: ba cúp đứng trên xà ngang trên cùng.
  @Test func shelfRoomOlympic() {
    check(ShelfRoomPreview(shelf: "olympic"), height: CGFloat(StudioScene.sceneBottom), padded: false)
  }

  /// Kệ Chrome (đồ phòng mua bằng xu) vẽ lại theo mock Kiệt duyệt 04/11 (#799): ba cúp ở ba chỗ của kệ gốc.
  @Test func shelfRoomChrome() {
    check(ShelfRoomPreview(shelf: "chrome"), height: CGFloat(StudioScene.sceneBottom), padded: false)
  }

  /// Koa chạy tới kéo thẻ mà đang mặc đồ (#799: "Koa mặc đồ khi chạy kéo thẻ chưa soi"). Hai bộ đồ đủ bảy chỗ,
  /// bốn dáng của `KoaPull`: lấy đà, bay khỏi bục, chạm đất, bay giữa hai bước. Vẽ đúng như `KoaPullScene.figure`.
  @Test func pullRunOutfits() {
    check(PullRunOutfitsPreview(), height: 300, padded: false)
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

  /// Buổi vừa xong làm Koa lên Gym Rat II (10/11): khoảnh khắc nhỏ, có số thật của chặng vừa qua.
  @Test func gainsCardTierUp() {
    var before = KoaGains.State.zero
    before.points = 100
    before.peak = 100
    var after = before
    after.points = 114
    after.peak = 114
    var g = WorkoutSummaryView.GainsGain(
      before: before, after: after, planned: true, pr: true, overload: false, fullWeek: false, streak: 1)
    g.tierUp = KoaJourney.Step(step: 2, rank: 1, tier: 2, date: Self.today, total: 114, sessions: 6, records: 2)
    check(KoaGainsCard(g: g))
  }
}

/// Căn phòng tĩnh có kệ đầy (#792): ba cúp, ba khung; ngày / đêm theo giao diện như phòng thật.
private struct ShelfRoomPreview: View {
  let shelf: String?
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    var o = StudioScene.Options()
    o.light = scheme == .light
    o.lamp = scheme == .dark
    o.label = "Koa"
    if let shelf { o.decor = ["shelf": shelf] }
    o.shelf = KoaShelf.Display(cups: KoaShelf.maxCups, frames: Set(KoaShelf.FrameKind.allCases))
    return StudioBackdrop(options: o).frame(width: 390, height: CGFloat(StudioScene.sceneBottom))
  }
}

/// Dáng chạy của cảnh kéo thẻ với đồ mặc (#799): mỗi hàng một bộ đồ, mỗi cột một khung của `KoaPull`.
private struct PullRunOutfitsPreview: View {
  @Environment(\.colorScheme) private var scheme

  static let outfits: [[String]] = [
    ["head_cap", "face_shades", "top_hoodie", "bottom_jogger", "shoes_sneaker", "back_backpack", "hand_bottle"],
    ["head_santa", "face_goggles", "top_jersey", "bottom_camo", "shoes_wing", "back_cape", "hand_dumbbell"],
  ]

  /// Lấy đà (gần hết), đỉnh cú bay khỏi bục, vừa chạm đất, giữa không trung của bước đầu.
  static let times: [Double] = {
    let landed = KoaPull.anticipate + KoaPull.hopOff
    return [KoaPull.anticipate * 0.9, KoaPull.anticipate + KoaPull.hopOff * 0.5, landed + KoaRun.step * 0.1, landed + KoaRun.step * 0.75]
  }()

  var body: some View {
    let light = scheme == .light
    VStack(spacing: 0) {
      ForEach(Self.outfits.indices, id: \.self) { row in
        HStack(spacing: 0) {
          ForEach(Self.times.indices, id: \.self) { col in
            cell(
              KoaPull.shot(
                at: Self.times[col], start: (x: 195, y: 300, scale: 0.6), width: 390, height: 844, panelHeight: 557),
              worn: KoaEmotion.worn(Self.outfits[row]), light: light)
          }
        }
      }
    }
    .frame(width: 390, height: 300)
  }

  private func cell(_ s: KoaPull.Shot, worn: KoaFlags.Worn, light: Bool) -> some View {
    Canvas { ctx, size in
      var c = ctx
      // hình rộng đúng 240 thì tai và tay vung chạm mép ô (lượt ghi đầu cắt tai ở cột 3, 4): chừa lề
      let k = size.width / 240 * 0.78
      c.translateBy(x: size.width / 2, y: size.height * 0.42)
      c.rotate(by: .degrees(s.angle))
      c.scaleBy(x: k * s.stretchX, y: k * s.stretchY)
      c.translateBy(x: -120, y: -110)
      var o = KoaRender.Options()
      o.expression = s.expression
      o.walk = s.walk
      o.size = 240
      o.paper = light
      o.flat = light
      o.worn = worn
      KoaCanvas.draw(KoaPaint.plan(KoaRender.figure(o)), in: &c)
    }
    .frame(width: 97.5, height: 150)
  }
}
