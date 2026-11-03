import ASCNDCore
import ASCNDLiveActivity
import AppIntents
import SwiftUI
import WidgetKit

/// Widget "Bữa quen" (Kiệt 01/11, duyệt "thông báo trước, widget sau"): bữa quen của
/// giờ này, chạm "Ghi như mọi khi" là vào sổ (`LogUsualMealIntent`, chạy trong app,
/// không mở app); vừa ghi thì "Đã ghi · Hoàn tác" 5 phút; nút camera mở chụp món.
///
/// Bổ trợ cách ghi đã có, không thay: chưa có bữa quen thì chỉ mở màn ghi bữa.
struct MealEntry: TimelineEntry {
  let date: Date
  let data: MealWidgetData?
}

struct MealProvider: TimelineProvider {
  static let sample = MealWidgetData(day: "", usual: [
    "breakfast": .init(names: "Phở bò", kcal: 520), "lunch": .init(names: "Cơm gà, canh rau", kcal: 780),
    "snack": .init(names: "Sữa chua Hy Lạp", kcal: 150), "dinner": .init(names: "Cá hồi, cơm gạo lứt", kcal: 640),
  ])

  func placeholder(in context: Context) -> MealEntry { MealEntry(date: .now, data: Self.sample) }

  func getSnapshot(in context: Context, completion: @escaping (MealEntry) -> Void) {
    completion(MealEntry(date: .now, data: WidgetDataStore().meal() ?? (context.isPreview ? Self.sample : nil)))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<MealEntry>) -> Void) {
    let data = WidgetDataStore().meal()
    let entries = [MealEntry(date: .now, data: data)]
      + MealWidget.refreshDates(data, now: .now).map { MealEntry(date: $0, data: data) }
    completion(Timeline(entries: entries, policy: .after(.now.addingTimeInterval(60 * 60))))
  }
}

struct MealQuickWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: MealWidget.kind, provider: MealProvider()) { entry in
      MealQuickWidgetView(entry: entry)
        .environment(\.locale, WidgetDataStore().locale)
    }
    .configurationDisplayName(Text("widget.meal.name"))
    .description(Text("widget.meal.description"))
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
  }
}

struct MealQuickWidgetView: View {
  let entry: MealEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme

  private var dark: Bool { scheme == .dark }
  private var state: MealWidget.State { MealWidget.state(entry.data, now: entry.date) }
  private var accent: Color { KoaWidgetInk.tube(1, dark) }

  var body: some View {
    Group {
      switch family {
      case .accessoryRectangular: rectangular
      case .systemMedium: medium
      default: small
      }
    }
    .containerBackground(for: .widget) {
      if family == .accessoryRectangular { AccessoryWidgetBackground() } else { paper }
    }
    .widgetURL(URL(string: "ascnd://log-meal"))
  }

  /// Giấy ấm của app với quầng cam rất nhẹ ở góc — màu của ống Bữa ăn.
  private var paper: some View {
    ZStack(alignment: .topTrailing) {
      KoaWidgetInk.paper(dark)
      RadialGradient(colors: [accent.opacity(dark ? 0.22 : 0.14), .clear], center: .topTrailing, startRadius: 0, endRadius: 150)
    }
  }

  // MARK: - Nhỏ

  private var small: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .center) {
        caption
        Spacer(minLength: 4)
        cameraButton(size: 28)
      }
      Spacer(minLength: 6)
      headline(size: 16, lines: 2)
      detail.padding(.top, 3)
      Spacer(minLength: 8)
      primary
    }
  }

  // MARK: - Vừa

  private var medium: some View {
    HStack(alignment: .center, spacing: 14) {
      VStack(alignment: .leading, spacing: 0) {
        caption
        Spacer(minLength: 6)
        headline(size: 18, lines: 2)
        detail.padding(.top, 4)
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      VStack(spacing: 8) {
        primary
        cameraWide
      }
      .frame(width: 132)
    }
  }

  // MARK: - Màn khoá (hệ thống tô một màu)

  private var rectangular: some View {
    HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 1) {
        HStack(spacing: 4) {
          Image(systemName: icon).font(.caption2.weight(.bold))
          Text(mealName).font(.headline).lineLimit(1)
        }
        Text(rectangularLine).font(.caption).lineLimit(2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if case .suggest(let type, _) = state {
        Button(intent: LogUsualMealIntent(mealType: type)) {
          Image(systemName: "plus").font(.system(size: 15, weight: .bold))
            .frame(width: 34, height: 34)
            .background(.fill.secondary, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("widget.meal.logUsual"))
      }
    }
  }

  // MARK: - Mảnh

  private var mealType: String {
    switch state {
    case .justLogged(let l): l.mealType
    case .done(let t), .empty(let t), .suggest(let t, _): t
    }
  }

  private var mealName: String {
    switch mealType {
    case "breakfast": widgetText("widget.meal.type.breakfast")
    case "snack": widgetText("widget.meal.type.snack")
    case "dinner": widgetText("widget.meal.type.dinner")
    default: widgetText("widget.meal.type.lunch")
    }
  }

  private var icon: String {
    switch state {
    case .justLogged, .done: "checkmark.circle.fill"
    default: "fork.knife"
    }
  }

  /// "BỮA TRƯA" chữ nhỏ màu cam, như nhãn ống ở Hôm nay.
  private var caption: some View {
    HStack(spacing: 4) {
      Image(systemName: icon).font(.system(size: 10, weight: .heavy))
      Text(mealName.uppercased()).font(.system(size: 11, weight: .heavy)).tracking(0.6).lineLimit(1)
    }
    .foregroundStyle(accent)
  }

  @ViewBuilder private func headline(size: CGFloat, lines: Int) -> some View {
    let text: String =
      switch state {
      case .suggest(_, let u): u.names
      case .justLogged(let l): l.undoFailed ? widgetText("widget.meal.undoFailed") : widgetText("widget.meal.logged")
      case .done: widgetText("widget.meal.done")
      case .empty: widgetText("widget.meal.empty")
      }
    Text(text)
      .font(.system(size: size, weight: .bold)).tracking(-0.3)
      .foregroundStyle(KoaWidgetInk.ink(dark))
      .lineLimit(lines)
      .minimumScaleFactor(0.8)
  }

  @ViewBuilder private var detail: some View {
    switch state {
    case .suggest(_, let u):
      Text(verbatim: "\(u.kcal) kcal").font(KoaWidgetInk.mono(12)).foregroundStyle(KoaWidgetInk.muted(dark))
    case .justLogged(let l):
      Text(verbatim: "\(l.names) · \(l.kcal) kcal").font(.system(size: 12, weight: .medium))
        .foregroundStyle(KoaWidgetInk.muted(dark)).lineLimit(1)
    case .done, .empty:
      Text("widget.meal.otherWays").font(.system(size: 12, weight: .medium))
        .foregroundStyle(KoaWidgetInk.muted(dark)).lineLimit(2)
    }
  }

  private var rectangularLine: String {
    switch state {
    case .suggest(_, let u): "\(u.names) · \(u.kcal) kcal"
    case .justLogged(let l): "\(widgetText("widget.meal.logged")) · \(l.names)"
    case .done: widgetText("widget.meal.done")
    case .empty: widgetText("widget.meal.empty")
    }
  }

  /// Nút chính: ghi bữa quen / hoàn tác / mở màn ghi — luôn rộng hết thẻ, cao 34.
  @ViewBuilder private var primary: some View {
    switch state {
    case .suggest(let type, _):
      Button(intent: LogUsualMealIntent(mealType: type)) {
        pill(widgetText("widget.meal.logUsual"), systemImage: "plus", filled: true)
      }
      .buttonStyle(.plain)
    case .justLogged(let l) where l.undoFailed:
      Link(destination: URL(string: "ascnd://diary")!) {
        pill(widgetText("widget.meal.openDiary"), systemImage: "list.bullet", filled: false)
      }
    case .justLogged(let l):
      Button(intent: UndoMealIntent(entryId: l.entryId)) {
        pill(widgetText("widget.meal.undo"), systemImage: "arrow.uturn.backward", filled: false)
      }
      .buttonStyle(.plain)
    case .done(let type), .empty(let type):
      Link(destination: URL(string: "ascnd://log-meal?meal=\(type)")!) {
        pill(widgetText("widget.meal.log"), systemImage: "plus", filled: state == .empty(mealType: type))
      }
    }
  }

  private func pill(_ text: String, systemImage: String, filled: Bool) -> some View {
    HStack(spacing: 5) {
      Image(systemName: systemImage).font(.system(size: 11, weight: .heavy))
      Text(text).font(.system(size: 13, weight: .bold)).lineLimit(1).minimumScaleFactor(0.8)
    }
    .foregroundStyle(filled ? .white : accent)
    .frame(maxWidth: .infinity)
    .frame(height: 34)
    .background(filled ? AnyShapeStyle(accent) : AnyShapeStyle(accent.opacity(dark ? 0.18 : 0.12)), in: Capsule())
  }

  private func cameraButton(size: CGFloat) -> some View {
    Link(destination: URL(string: "ascnd://scan-food")!) {
      Image(systemName: "camera.fill").font(.system(size: size * 0.42, weight: .semibold))
        .foregroundStyle(KoaWidgetInk.ink(dark))
        .frame(width: size, height: size)
        .background(KoaWidgetInk.track(dark), in: Circle())
    }
    .accessibilityLabel(Text("widget.meal.photo"))
  }

  private var cameraWide: some View {
    Link(destination: URL(string: "ascnd://scan-food")!) {
      HStack(spacing: 5) {
        Image(systemName: "camera.fill").font(.system(size: 11, weight: .semibold))
        Text("widget.meal.photo").font(.system(size: 13, weight: .bold)).lineLimit(1).minimumScaleFactor(0.8)
      }
      .foregroundStyle(KoaWidgetInk.ink(dark))
      .frame(maxWidth: .infinity)
      .frame(height: 34)
      .background(KoaWidgetInk.track(dark), in: Capsule())
    }
  }
}
