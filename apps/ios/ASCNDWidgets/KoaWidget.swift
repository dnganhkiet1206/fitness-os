import ASCNDCore
import ASCNDLiveActivity
import AppIntents
import SwiftUI
import UIKit
import WidgetKit

/// Widget Koa (#527, đợt 2C — chiến lược Kiệt duyệt 19/10): Koa của Hôm nay trên
/// màn hình chính và màn khoá — nét mặt, câu nói, việc kế tiếp, "X/Y xong", chuỗi.
///
/// App vẽ sẵn ảnh Koa và ghi chữ vào App Group (`KoaWidgetPublisher`); widget chỉ
/// đọc. Từ 22:00 Koa đi ngủ (dòng thời gian có sẵn mục 22:00); dữ liệu của hôm
/// trước thì không nói tâm trạng cũ — mời mở app.
struct KoaEntry: TimelineEntry {
  let date: Date
  let data: KoaWidgetData?
}

struct KoaProvider: TimelineProvider {
  static let sample = KoaWidgetData(
    day: "", line: "Ngủ 7 giờ 40 phút — Koa tỉnh như sáo.", next: "Ghi bữa ăn", done: 2, total: 4, streak: 0,
    nightLine: "", imageVersion: 0)

  func placeholder(in context: Context) -> KoaEntry { KoaEntry(date: .now, data: Self.sample) }

  func getSnapshot(in context: Context, completion: @escaping (KoaEntry) -> Void) {
    completion(KoaEntry(date: .now, data: WidgetDataStore().koa() ?? (context.isPreview ? Self.sample : nil)))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<KoaEntry>) -> Void) {
    let data = WidgetDataStore().koa()
    var entries = [KoaEntry(date: .now, data: data)]
    // Koa đi ngủ đúng 22:00 dù app không mở.
    let cal = Calendar.current
    if let night = cal.date(bySettingHour: KoaWidgetData.nightHour, minute: 0, second: 0, of: .now), night > .now {
      entries.append(KoaEntry(date: night, data: data))
    }
    completion(Timeline(entries: entries, policy: .after(.now.addingTimeInterval(30 * 60))))
  }
}

struct KoaWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "com.ascnd.fitnessos.widgets.koa", provider: KoaProvider()) { entry in
      KoaWidgetView(entry: entry)
        .environment(\.locale, WidgetDataStore().locale)
        .environment(\.colorScheme, .dark)
        .containerBackground(for: .widget) { KoaPassMetal() }
        .widgetURL(URL(string: "ascnd://today"))
    }
    .configurationDisplayName(Text("widget.koa.name"))
    .description(Text("widget.koa.description"))
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular])
    .contentMarginsDisabled()
  }
}

// MARK: - Chất liệu của app (19/10, Kiệt: "premium theo tinh thần của app")
//
// Cùng bảng màu với app (`DSColor`, chép giá trị — widget không kéo cả gói
// DesignSystem): giấy ấm `WarmPaper` với quầng cam, màu năm ống của Hôm nay, số
// Menlo như dưới ống, bong bóng xám kiểu iMessage của Koa.
enum KoaWidgetInk {
  static func rgb(_ r: Double, _ g: Double, _ b: Double) -> Color { Color(red: r / 255, green: g / 255, blue: b / 255) }
  static func paper(_ dark: Bool) -> Color { dark ? rgb(7, 7, 8) : rgb(247, 244, 239) }
  static func halo(_ dark: Bool) -> Color { rgb(dark ? 255 : 216, dark ? 145 : 115, dark ? 48 : 0) }
  static func ink(_ dark: Bool) -> Color { dark ? rgb(245, 243, 240) : rgb(28, 27, 26) }
  static func muted(_ dark: Bool) -> Color { dark ? rgb(160, 156, 150) : rgb(118, 112, 104) }
  static func track(_ dark: Bool) -> Color { dark ? Color.white.opacity(0.10) : Color.black.opacity(0.07) }
  /// Ngủ · bữa · nước · tập — `MascotRoomView.signalColor`.
  static func tube(_ i: Int, _ dark: Bool) -> Color {
    switch i {
    case 0: dark ? rgb(180, 92, 255) : rgb(140, 53, 208)
    case 1: dark ? rgb(255, 145, 48) : rgb(216, 115, 0)
    case 2: dark ? rgb(34, 227, 255) : rgb(7, 123, 139)
    default: dark ? rgb(230, 72, 92) : rgb(184, 48, 68)
    }
  }
  static func quest(_ raw: String?, _ dark: Bool) -> Color {
    switch raw {
    case "sleep": tube(0, dark)
    case "meal": tube(1, dark)
    case "water": tube(2, dark)
    case "workout": tube(3, dark)
    default: dark ? rgb(0, 199, 133) : rgb(7, 128, 85)
    }
  }
  static let glyphs = ["moon.fill", "fork.knife", "drop.fill", "dumbbell.fill"]
  static func mono(_ size: CGFloat) -> Font { .system(size: size * 1.08, weight: .bold, design: .rounded).monospacedDigit() }
}

/// Titan đen của widget — họ hàng với kim loại thẻ hồ sơ (`PassMaterial`) nhưng
/// khác (20/10, Kiệt: "biến tấu cho khác thẻ hồ sơ một xíu"): vân xước NGANG kiểu
/// titan chải, vệt sáng ở mép trên thay vì chéo, quầng cam ấm của app sau Koa ở
/// góc dưới trái, không có dấu chìm (logo đã ở góc), viền ánh bạc giữ nguyên.
struct KoaPassMetal: View {
  var body: some View {
    ZStack {
      LinearGradient(
        colors: [Color(white: 0.15), Color(white: 0.08), Color(white: 0.06)], startPoint: .top, endPoint: .bottom)
      RadialGradient(
        colors: [KoaWidgetInk.halo(true).opacity(0.20), .clear], center: UnitPoint(x: 0.12, y: 0.95),
        startRadius: 0, endRadius: 150)
      Canvas { ctx, size in
        var y: CGFloat = 0
        var i = 0
        while y < size.height {
          var p = Path()
          p.move(to: CGPoint(x: 0, y: y))
          p.addLine(to: CGPoint(x: size.width, y: y))
          ctx.stroke(p, with: .color(.white.opacity(i % 3 == 0 ? 0.045 : 0.022)), lineWidth: 0.5)
          y += 2
          i += 1
        }
      }
      LinearGradient(
        stops: [.init(color: .white.opacity(0.12), location: 0), .init(color: .clear, location: 0.22)],
        startPoint: .top, endPoint: .bottom)
      ContainerRelativeShape().strokeBorder(
        LinearGradient(
          colors: [.white.opacity(0.40), .white.opacity(0.08), .white.opacity(0.16)], startPoint: .top,
          endPoint: .bottom),
        lineWidth: 0.8)
    }
    .clipped()
  }
}

/// Giấy ấm của app: nền + quầng cam nhạt ở góc trên.
struct KoaWidgetPaper: View {
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    let dark = scheme == .dark
    ZStack {
      KoaWidgetInk.paper(dark)
      RadialGradient(
        colors: [KoaWidgetInk.halo(dark).opacity(dark ? 0.22 : 0.20), .clear],
        center: UnitPoint(x: 0.85, y: -0.1), startRadius: 0, endRadius: 220)
    }
  }
}

struct KoaWidgetView: View {
  let entry: KoaEntry
  /// Cỡ ép khi vẽ ngoài WidgetKit (ảnh soát); widget thật đọc `widgetFamily`.
  var familyOverride: WidgetFamily?
  @Environment(\.widgetFamily) private var widgetFamily
  @Environment(\.colorScheme) private var scheme
  @Environment(\.widgetRenderingMode) private var renderingMode
  private var family: WidgetFamily { familyOverride ?? widgetFamily }
  private var dark: Bool { scheme == .dark }

  private var phase: KoaWidgetData.Phase {
    guard let d = entry.data else { return .stale }
    // Mẫu (placeholder / thư viện widget) không có ngày → coi như ban ngày.
    return d.day.isEmpty ? .day : d.phase(now: entry.date, calendar: .current)
  }

  private var line: String {
    guard let d = entry.data else { return widgetText("widget.koa.stale") }
    switch phase {
    case .stale: return widgetText("widget.koa.stale")
    case .day: return d.line.isEmpty ? widgetText("widget.koa.stale") : d.line
    case .night: return d.nightLine
    }
  }

  var body: some View {
    switch family {
    case .accessoryRectangular: rectangular
    case .accessoryCircular: circular
    case .systemMedium: medium
    default: small
    }
  }

  // MARK: - Màn hình chính

  /// Nhỏ (20/10, Kiệt chọn mock A — "thẻ vận động viên" của Koa): dòng đầu
  /// "ASCND · KOA" + dấu; Koa làm avatar với giọt nước và câu rất ngắn; bốn vạch
  /// việc; hai ô số HÔM NAY · CHUỖI.
  private var small: some View {
    VStack(alignment: .leading, spacing: 0) {
      caption
      HStack(alignment: .bottom, spacing: 8) {
        avatar(height: 80)
        VStack(alignment: .leading, spacing: 6) {
          if phase == .day { waterButton(compact: true) }
          Text(phase == .stale ? widgetText("widget.koa.stale") : shortLine)
            .font(.system(size: 14, weight: .bold)).tracking(-0.2)
            .foregroundStyle(.white)
            .lineLimit(2)
            .minimumScaleFactor(0.8)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.bottom, 4)
      }
      .padding(.top, 6)
      Spacer(minLength: 0)
      dayBar.padding(.bottom, 6)
      HStack(spacing: 0) {
        stat(todayValue, label: widgetText("widget.koa.stat.today"), size: 17)
        statDivider
        stat(weekValue, label: widgetText("widget.koa.stat.week"), size: 17)
      }
    }
    .padding(12)
  }

  private var todayValue: String {
    guard let d = entry.data, phase != .stale else { return "–" }
    return "\(d.done)/\(d.total)"
  }
  /// Tuần của Koa "3/6" — thay ô "Chuỗi" (Kiệt 27/10: GĐ1 đã bỏ chuỗi khỏi Hôm nay).
  private var weekValue: String {
    guard let d = entry.data, phase != .stale else { return "–" }
    return d.weekText ?? "–"
  }

  /// Đầu thẻ: chỉ dấu ASCND ở góc (20/10, Kiệt: bỏ chữ "ASCND · KOA" — trùng với
  /// logo và hình Koa).
  private var caption: some View {
    HStack {
      Spacer(minLength: 0)
      Image("BrandMark").resizable().interpolation(.high).frame(width: 16, height: 16)
        .accessibilityHidden(true)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: "ASCND"))
  }

  /// Ô số của thẻ: số khổ hẹp đậm, nhãn in hoa giãn chữ.
  private func stat(_ value: String, label: String, size: CGFloat = 20) -> some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(verbatim: value).font(.system(size: size, weight: .heavy).monospacedDigit()).fontWidth(.condensed)
        .foregroundStyle(.white)
      Text(label).font(.system(size: 8.5, weight: .bold)).tracking(1.1).textCase(.uppercase)
        .foregroundStyle(.white.opacity(0.6)).lineLimit(1).minimumScaleFactor(0.7)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }

  private var statDivider: some View {
    Rectangle().fill(.white.opacity(0.14)).frame(width: 0.5, height: 26).padding(.trailing, 8)
  }

  /// Bốn vạch mảnh màu việc (ngủ · bữa · nước · tập): sáng = xong, mờ = chưa, nét đứt = nghỉ.
  private var dayBar: some View {
    let checks = entry.data?.checks ?? []
    return HStack(spacing: 3) {
      ForEach(0..<4, id: \.self) { i in
        let state = phase == .stale ? "todo" : (i < checks.count ? checks[i] : "todo")
        Capsule()
          .fill(state == "done" ? KoaWidgetInk.tube(i, true) : .white.opacity(state == "rest" ? 0.06 : 0.16))
          .overlay {
            if state == "rest" {
              Capsule().strokeBorder(.white.opacity(0.3), style: StrokeStyle(lineWidth: 0.6, dash: [2, 2]))
            }
          }
          .frame(height: 4)
      }
    }
    .accessibilityHidden(true)
  }

  /// Koa đứng tự do làm avatar (ảnh app vẽ sẵn), bóng mềm dưới chân.
  @ViewBuilder private func avatar(height: CGFloat) -> some View {
    let name = WidgetDataStore.koaImageName(night: phase == .night, dark: true)
    ZStack(alignment: .bottom) {
      Ellipse().fill(.white.opacity(0.10)).frame(width: height * 0.55, height: height * 0.08).blur(radius: 3)
      if let dir = WidgetDataStore().containerURL,
        let image = UIImage(contentsOfFile: dir.appendingPathComponent(name).path)
      {
        Image(uiImage: image).resizable().widgetAccentedRenderingMode(.fullColor).scaledToFit()
      } else {
        Image(systemName: "pawprint.fill").resizable().scaledToFit().foregroundStyle(.white.opacity(0.3))
          .padding(height * 0.25)
      }
    }
    .frame(width: height * 0.8, height: height)
  }

  private var shortLine: String {
    guard let d = entry.data else { return "" }
    if phase == .night { return widgetText("widget.koa.nightShort") }
    if d.waterTaps > 0 { return widgetText("widget.koa.waterAdded \(d.waterTaps)") }
    return d.short.isEmpty ? d.line : d.short
  }

  /// Giọt nước bấm được: ghi một ly qua app (`AddWaterIntent`), không mở app.
  private func waterButton(compact: Bool) -> some View {
    Button(intent: AddWaterIntent()) {
      HStack(spacing: 3) {
        Image(systemName: "drop.fill").font(.system(size: compact ? 12 : 11, weight: .bold))
        if !compact { Text(verbatim: "+1").font(KoaWidgetInk.mono(12)) }
      }
      .foregroundStyle(.white)
      .frame(width: compact ? 30 : nil, height: compact ? 30 : 26)
      .padding(.horizontal, compact ? 0 : 10)
      .background(KoaWidgetInk.tube(2, dark), in: Capsule())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text("widget.koa.water"))
  }

  /// Vừa: Koa avatar lớn bên trái; bên phải dòng đầu, câu của Koa, việc kế tiếp +
  /// "+1 ly", bốn vạch việc, ba ô số HÔM NAY · CHUỖI · CẤP.
  private var medium: some View {
    HStack(alignment: .bottom, spacing: 12) {
      avatar(height: 140)
      VStack(alignment: .leading, spacing: 0) {
        caption
        Text(line)
          .font(.system(size: 15, weight: .bold)).tracking(-0.3)
          .foregroundStyle(.white)
          .lineLimit(2)
          .minimumScaleFactor(0.85)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, 6)
        if phase == .day, let d = entry.data {
          HStack(spacing: 6) {
            if let next = d.next, d.nextQuest != "water" { nextChip(next, quest: d.nextQuest) }
            waterButton(compact: false)
          }
          .padding(.top, 6)
        }
        Spacer(minLength: 6)
        dayBar.padding(.bottom, 7)
        HStack(spacing: 0) {
          stat(todayValue, label: widgetText("widget.koa.stat.today"))
          statDivider
          stat(weekValue, label: widgetText("widget.koa.stat.week"))
          statDivider
          stat(entry.data?.gains.map { "\($0)" } ?? "–", label: widgetText("widget.koa.stat.gains"))
        }
      }
    }
    .padding(14)
  }

  // MARK: - Màn khoá (hệ thống tô một màu — chỉ dáng chữ và số)

  private var rectangular: some View {
    VStack(alignment: .leading, spacing: 1) {
      HStack(spacing: 5) {
        Image(systemName: "pawprint.fill").font(.caption2)
        Text(verbatim: "Koa").font(.headline)
        if let d = entry.data, phase != .stale {
          Text(verbatim: "\(d.done)/\(d.total)").font(KoaWidgetInk.mono(12))
          if let week = d.weekText {
            Image(systemName: "calendar").font(.caption2)
            Text(verbatim: week).font(KoaWidgetInk.mono(12))
          }
        }
      }
      Text(line).font(.caption).lineLimit(2)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var circular: some View {
    let d = entry.data
    let total = Double(max(d?.total ?? 1, 1))
    return Gauge(value: Double(phase == .stale ? 0 : d?.done ?? 0), in: 0...total) {
      Image(systemName: "pawprint.fill")
    } currentValueLabel: {
      Text(verbatim: phase == .stale ? "–" : "\(d?.done ?? 0)/\(d?.total ?? 0)").font(KoaWidgetInk.mono(13))
    }
    .gaugeStyle(.accessoryCircularCapacity)
  }

  // MARK: - Mảnh

  private func nextChip(_ text: String, quest: String?) -> some View {
    HStack(spacing: 4) {
      Image(systemName: "plus").font(.system(size: 10, weight: .heavy))
      Text(text).font(.system(size: 12, weight: .bold)).lineLimit(1)
    }
    .foregroundStyle(.white)
    .padding(.horizontal, 10)
    .frame(height: 24)
    .background(KoaWidgetInk.quest(quest, dark), in: Capsule())
  }


}
