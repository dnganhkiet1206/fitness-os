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
        .containerBackground(.fill.tertiary, for: .widget)
        .widgetURL(URL(string: "ascnd://today"))
    }
    .configurationDisplayName(Text("widget.koa.name"))
    .description(Text("widget.koa.description"))
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular])
  }
}

struct KoaWidgetView: View {
  let entry: KoaEntry
  /// Cỡ ép khi vẽ ngoài WidgetKit (ảnh soát); widget thật đọc `widgetFamily`.
  var familyOverride: WidgetFamily?
  @Environment(\.widgetFamily) private var widgetFamily
  private var family: WidgetFamily { familyOverride ?? widgetFamily }
  @Environment(\.colorScheme) private var scheme

  private var phase: KoaWidgetData.Phase {
    guard let d = entry.data else { return .stale }
    // Mẫu (placeholder / thư viện widget) không có ngày → coi như ban ngày.
    return d.day.isEmpty ? .day : d.phase(now: entry.date, calendar: .current)
  }

  private var line: String? {
    guard let d = entry.data else { return nil }
    switch phase {
    case .stale: return nil
    case .day: return d.line.isEmpty ? nil : d.line
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

  private var small: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(alignment: .top) {
        koa.frame(width: 64, height: 80)
        Spacer(minLength: 0)
        if let d = entry.data, phase != .stale { streakBadge(d.streak) }
      }
      Text(line ?? String(localized: "widget.koa.stale"))
        .font(.caption.weight(.semibold))
        .lineLimit(3)
        .minimumScaleFactor(0.85)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  private var medium: some View {
    HStack(spacing: 12) {
      koa.frame(width: 104, height: 130)
      VStack(alignment: .leading, spacing: 6) {
        Text(line ?? String(localized: "widget.koa.stale"))
          .font(.subheadline.weight(.semibold))
          .lineLimit(3)
          .minimumScaleFactor(0.85)
        if let d = entry.data, phase == .day, let next = d.next {
          Label { Text("widget.koa.next \(next)") } icon: { Image(systemName: "arrow.right.circle.fill") }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.tint)
            .lineLimit(1)
        }
        Spacer(minLength: 0)
        if let d = entry.data, phase != .stale {
          HStack(spacing: 10) {
            Text("widget.koa.done \(d.done) \(d.total)").font(.caption).foregroundStyle(.secondary)
            streakBadge(d.streak)
          }
        }
      }
      Spacer(minLength: 0)
    }
  }

  // MARK: - Màn khoá

  private var rectangular: some View {
    VStack(alignment: .leading, spacing: 1) {
      HStack(spacing: 4) {
        Text(verbatim: "Koa").font(.headline)
        if let d = entry.data, phase != .stale {
          Text(verbatim: "· \(d.done)/\(d.total)").font(.caption).monospacedDigit()
          if d.streak > 0 {
            Image(systemName: "flame.fill").font(.caption2)
            Text(verbatim: "\(d.streak)").font(.caption).monospacedDigit()
          }
        }
      }
      Text(line ?? String(localized: "widget.koa.stale"))
        .font(.caption)
        .lineLimit(2)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var circular: some View {
    let d = entry.data
    let total = Double(max(d?.total ?? 1, 1))
    return Gauge(value: Double(phase == .stale ? 0 : d?.done ?? 0), in: 0...total) {
      Image(systemName: "pawprint.fill")
    } currentValueLabel: {
      Text(verbatim: phase == .stale ? "–" : "\(d?.done ?? 0)/\(d?.total ?? 0)").monospacedDigit()
    }
    .gaugeStyle(.accessoryCircularCapacity)
  }

  // MARK: - Mảnh

  @ViewBuilder private var koa: some View {
    let name = WidgetDataStore.koaImageName(night: phase == .night, dark: scheme == .dark)
    if let dir = WidgetDataStore().containerURL,
      let image = UIImage(contentsOfFile: dir.appendingPathComponent(name).path)
    {
      Image(uiImage: image).resizable().scaledToFit()
    } else {
      Image(systemName: "pawprint.circle.fill").resizable().scaledToFit().foregroundStyle(.secondary).padding(12)
    }
  }

  private func streakBadge(_ n: Int) -> some View {
    HStack(spacing: 2) {
      Image(systemName: "flame.fill").foregroundStyle(.orange)
      Text(verbatim: "\(n)").monospacedDigit()
    }
    .font(.caption.weight(.bold))
    .opacity(n > 0 ? 1 : 0)
  }
}
