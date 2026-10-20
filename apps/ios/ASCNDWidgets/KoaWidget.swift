import ASCNDCore
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
    day: "", line: "Ngủ 7 giờ 40 phút — Koa tỉnh như sáo.", next: "Ghi bữa ăn", done: 2, total: 4, streak: 12,
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
        .containerBackground(for: .widget) { KoaWidgetPaper() }
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
  static func bubble(_ dark: Bool) -> Color { dark ? rgb(44, 44, 48) : rgb(229, 229, 234) }
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
  static func mono(_ size: CGFloat) -> Font { .custom("Menlo", size: size).weight(.bold) }
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
    guard let d = entry.data else { return String(localized: "widget.koa.stale") }
    switch phase {
    case .stale: return String(localized: "widget.koa.stale")
    case .day: return d.line.isEmpty ? String(localized: "widget.koa.stale") : d.line
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

  /// Nhỏ: bong bóng câu của Koa ở trên; dưới là Koa (chạm mép đáy) và bốn ống.
  private var small: some View {
    VStack(alignment: .leading, spacing: 0) {
      bubble(lines: 3, size: 12.5)
      Spacer(minLength: 0)
      HStack(alignment: .bottom, spacing: 0) {
        koa(height: 78)
        Spacer(minLength: 4)
        VStack(alignment: .trailing, spacing: 7) {
          streakChip
          tubes(height: 30, width: 9, spacing: 5)
        }
        .padding(.bottom, 12)
      }
    }
    .padding(.top, 14)
    .padding(.horizontal, 14)
  }

  /// Vừa: Koa lớn bên trái; bên phải bong bóng, nút việc kế tiếp, hàng ống + số.
  private var medium: some View {
    HStack(alignment: .bottom, spacing: 10) {
      koa(height: 132)
      VStack(alignment: .leading, spacing: 8) {
        bubble(lines: 3, size: 14)
        if phase == .day, let d = entry.data, let next = d.next {
          nextChip(next, quest: d.nextQuest)
        }
        Spacer(minLength: 0)
        HStack(alignment: .bottom, spacing: 10) {
          tubes(height: 26, width: 10, spacing: 6, glyphs: true)
          Spacer(minLength: 0)
          VStack(alignment: .trailing, spacing: 2) {
            streakChip
            if let d = entry.data, phase != .stale {
              Text("widget.koa.done \(d.done) \(d.total)")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(KoaWidgetInk.muted(dark))
            }
          }
        }
      }
      .padding(.vertical, 14)
    }
    .padding(.leading, 6)
    .padding(.trailing, 16)
  }

  // MARK: - Màn khoá (hệ thống tô một màu — chỉ dáng chữ và số)

  private var rectangular: some View {
    VStack(alignment: .leading, spacing: 1) {
      HStack(spacing: 5) {
        Image(systemName: "pawprint.fill").font(.caption2)
        Text(verbatim: "Koa").font(.headline)
        if let d = entry.data, phase != .stale {
          Text(verbatim: "\(d.done)/\(d.total)").font(KoaWidgetInk.mono(12))
          if d.streak > 0 {
            Image(systemName: "flame.fill").font(.caption2)
            Text(verbatim: "\(d.streak)").font(KoaWidgetInk.mono(12))
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

  /// Bong bóng xám kiểu iMessage với đuôi chỉ xuống Koa (như Hôm nay).
  private func bubble(lines: Int, size: CGFloat) -> some View {
    Text(line)
      .font(.system(size: size, weight: .semibold))
      .foregroundStyle(KoaWidgetInk.ink(dark))
      .lineLimit(lines)
      .minimumScaleFactor(0.8)
      .fixedSize(horizontal: false, vertical: true)
      .padding(.horizontal, 10)
      .padding(.vertical, 7)
      .background(alignment: .bottomLeading) {
        ZStack(alignment: .bottomLeading) {
          RoundedRectangle(cornerRadius: 14, style: .continuous).fill(KoaWidgetInk.bubble(dark))
          BubbleTail().fill(KoaWidgetInk.bubble(dark)).frame(width: 12, height: 9).offset(x: 10, y: 7)
        }
      }
      .widgetAccentable(false)
  }

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

  /// Bốn ống mảnh như khối ngày của Hôm nay: đầy màu = xong, mờ = chưa, chấm = nghỉ.
  private func tubes(height: CGFloat, width: CGFloat, spacing: CGFloat, glyphs: Bool = false) -> some View {
    let checks = entry.data?.checks ?? []
    return HStack(alignment: .bottom, spacing: spacing) {
      ForEach(0..<4, id: \.self) { i in
        let state = phase == .stale ? "todo" : (i < checks.count ? checks[i] : "todo")
        VStack(spacing: 4) {
          ZStack(alignment: .bottom) {
            Capsule().fill(KoaWidgetInk.track(dark))
            if state == "done" {
              Capsule().fill(
                LinearGradient(
                  colors: [KoaWidgetInk.tube(i, dark).opacity(0.75), KoaWidgetInk.tube(i, dark)], startPoint: .top,
                  endPoint: .bottom))
            } else if state == "rest" {
              Circle().fill(KoaWidgetInk.muted(dark).opacity(0.6)).frame(width: width * 0.45).padding(.bottom, width * 0.4)
            }
          }
          .frame(width: width, height: height)
          if glyphs {
            Image(systemName: KoaWidgetInk.glyphs[i])
              .font(.system(size: 9, weight: .bold))
              .foregroundStyle(state == "done" ? KoaWidgetInk.tube(i, dark) : KoaWidgetInk.muted(dark))
              .frame(width: 14)
          }
        }
      }
    }
  }

  @ViewBuilder private var streakChip: some View {
    if let d = entry.data, phase != .stale, d.streak > 0 {
      HStack(spacing: 3) {
        Image(systemName: "flame.fill").font(.system(size: 11, weight: .bold))
          .foregroundStyle(KoaWidgetInk.quest("meal", dark))
        Text(verbatim: "\(d.streak)").font(KoaWidgetInk.mono(13)).foregroundStyle(KoaWidgetInk.ink(dark))
      }
    }
  }

  /// Koa vẽ sẵn (app ghi vào App Group), chạm mép đáy, bóng đổ mềm dưới chân.
  @ViewBuilder private func koa(height: CGFloat) -> some View {
    let name = WidgetDataStore.koaImageName(night: phase == .night, dark: dark)
    ZStack(alignment: .bottom) {
      Ellipse()
        .fill(Color.black.opacity(dark ? 0.35 : 0.10))
        .frame(width: height * 0.5, height: height * 0.07)
        .blur(radius: 2)
        .padding(.bottom, height * 0.03)
      if let dir = WidgetDataStore().containerURL,
        let image = UIImage(contentsOfFile: dir.appendingPathComponent(name).path)
      {
        Image(uiImage: image).resizable().widgetAccentedRenderingMode(.fullColor).scaledToFit()
      } else {
        Image(systemName: "pawprint.fill").resizable().scaledToFit()
          .foregroundStyle(KoaWidgetInk.muted(dark)).padding(height * 0.25)
      }
    }
    .frame(width: height * 0.8, height: height)
  }
}

/// Đuôi bong bóng: tam giác cong chỉ xuống trái.
struct BubbleTail: Shape {
  func path(in r: CGRect) -> Path {
    var p = Path()
    p.move(to: CGPoint(x: 0, y: 0))
    p.addLine(to: CGPoint(x: r.width, y: 0))
    p.addQuadCurve(to: CGPoint(x: 0, y: r.height), control: CGPoint(x: r.width * 0.35, y: r.height * 0.2))
    p.closeSubpath()
    return p
  }
}
