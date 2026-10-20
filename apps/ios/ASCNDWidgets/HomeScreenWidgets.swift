import ASCNDCore
import SwiftUI
import WidgetKit

/// Hai widget màn hình chính của RN (`TodayWorkoutWidget`,
/// `StreakReadinessWidget`): cùng kind, cùng cỡ, cùng bố cục, cùng nguồn
/// (App Group, `WidgetDataStore`).
///
/// Khác RN có chủ đích: khi App Group chưa có dữ liệu, RN hiện SỐ GIẢ của
/// spike (#195: "Upper Body Strength", chuỗi 12 ngày, sẵn sàng 86) như số
/// thật. Ở đây: chưa có dữ liệu thì nói thế ("mở ASCND để cập nhật"); số mẫu
/// chỉ dùng cho `placeholder`, và hệ thống vẽ nó dạng che (redacted).
/// Chữ của widget theo ngôn ngữ chọn TRONG APP (App Group,
/// `WidgetDataStore.locale`; "Theo máy" thì ngôn ngữ máy). RN cứng tiếng Anh.

struct TodayWorkoutEntry: TimelineEntry {
  let date: Date
  let data: TodayWorkoutWidgetData?
}

struct TodayWorkoutProvider: TimelineProvider {
  static let sample = TodayWorkoutWidgetData(
    workoutName: "Upper Body Strength", statusText: "—", completedExercises: 2, totalExercises: 6)

  func placeholder(in context: Context) -> TodayWorkoutEntry {
    TodayWorkoutEntry(date: .now, data: Self.sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (TodayWorkoutEntry) -> Void) {
    completion(TodayWorkoutEntry(date: .now, data: WidgetDataStore().todayWorkout() ?? (context.isPreview ? Self.sample : nil)))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayWorkoutEntry>) -> Void) {
    // App đẩy cập nhật qua `WidgetCenter`; 30 phút là lưới an toàn (như RN).
    let entry = TodayWorkoutEntry(date: .now, data: WidgetDataStore().todayWorkout())
    completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(30 * 60))))
  }
}

struct TodayWorkoutWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "com.ascnd.fitnessos.widgets.today-workout", provider: TodayWorkoutProvider()) { entry in
      TodayWorkoutView(data: entry.data)
        .environment(\.locale, WidgetDataStore().locale)
        .environment(\.colorScheme, .dark)
        .containerBackground(for: .widget) { KoaPassMetal() }
    }
    .configurationDisplayName(Text("widget.today.name"))
    .description(Text("widget.today.description"))
    .supportedFamilies([.systemSmall, .systemMedium])
    .contentMarginsDisabled()
  }
}

/// "Buổi tập hôm nay" trên lớp titan của widget Koa (20/10, Kiệt duyệt mock): nhãn
/// in hoa + dấu ASCND, biểu tượng màu hồng của mục Tập, tên buổi, thanh đốt theo
/// số bài, ô số khổ hẹp như thẻ vận động viên.
struct TodayWorkoutView: View {
  let data: TodayWorkoutWidgetData?
  var familyOverride: WidgetFamily?
  @Environment(\.widgetFamily) private var widgetFamily
  private var family: WidgetFamily { familyOverride ?? widgetFamily }

  private var rest: Bool { (data?.totalExercises ?? 0) == 0 }
  private var finished: Bool { !rest && (data?.completedExercises ?? 0) >= (data?.totalExercises ?? 0) }

  var body: some View {
    Group {
      if let data {
        if family == .systemMedium { medium(data) } else { small(data) }
      } else {
        WidgetCard.empty(caption: String(localized: "widget.card.workout"))
      }
    }
    .padding(14)
  }

  private func small(_ d: TodayWorkoutWidgetData) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      WidgetCard.caption(String(localized: "widget.card.workout"))
      Spacer(minLength: 0)
      Image(systemName: rest ? "leaf.fill" : "dumbbell.fill")
        .font(.system(size: 15, weight: .bold)).foregroundStyle(WidgetCard.rose).padding(.bottom, 4)
      Text(d.workoutName).font(.system(size: 18, weight: .bold)).tracking(-0.3)
        .foregroundStyle(.white).lineLimit(2).minimumScaleFactor(0.8)
      Text(d.statusText).font(.system(size: 11, weight: .semibold)).foregroundStyle(.white.opacity(0.6))
        .lineLimit(1).padding(.top, 2)
      Spacer(minLength: 0)
      segments(d).padding(.bottom, 6)
      WidgetCard.stat(
        rest ? "–" : "\(d.completedExercises)/\(d.totalExercises)", label: String(localized: "widget.card.exercises"),
        size: 17)
    }
  }

  private func medium(_ d: TodayWorkoutWidgetData) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      WidgetCard.caption(String(localized: "widget.card.workoutToday"))
      HStack(alignment: .center, spacing: 10) {
        Image(systemName: rest ? "leaf.fill" : "dumbbell.fill")
          .font(.system(size: 18, weight: .bold)).foregroundStyle(WidgetCard.rose)
          .frame(width: 40, height: 40).background(WidgetCard.rose.opacity(0.16), in: RoundedRectangle(cornerRadius: 11))
        VStack(alignment: .leading, spacing: 1) {
          Text(d.workoutName).font(.system(size: 19, weight: .bold)).tracking(-0.3).foregroundStyle(.white)
            .lineLimit(1).minimumScaleFactor(0.8)
          Group {
            if let next = d.nextExerciseName { Text("widget.next \(next)") } else { Text(d.statusText) }
          }
          .font(.system(size: 12, weight: .semibold)).foregroundStyle(.white.opacity(0.65)).lineLimit(1)
        }
      }
      .padding(.top, 10)
      Spacer(minLength: 0)
      segments(d).padding(.bottom, 7)
      HStack(spacing: 0) {
        WidgetCard.stat(rest ? "–" : "\(d.completedExercises)", label: String(localized: "widget.card.done"))
        WidgetCard.hairline
        WidgetCard.stat(rest ? "–" : "\(d.totalExercises)", label: String(localized: "widget.card.exercises"))
        WidgetCard.hairline
        WidgetCard.stat(
          (rest
            ? String(localized: "widget.card.state.rest")
            : finished ? String(localized: "widget.card.state.done") : String(localized: "widget.card.state.going"))
            .uppercased(),
          label: String(localized: "widget.card.state"), tint: finished ? WidgetCard.green : .white)
      }
    }
  }

  /// Thanh đốt theo số bài (tối đa 12 đốt): đốt xong màu hồng của mục Tập.
  private func segments(_ d: TodayWorkoutWidgetData) -> some View {
    let total = min(d.totalExercises, 12)
    let done = min(d.completedExercises, total)
    return HStack(spacing: 3) {
      if total == 0 {
        Capsule().fill(.white.opacity(0.10)).frame(height: 4)
      } else {
        ForEach(0..<total, id: \.self) { i in
          Capsule().fill(i < done ? WidgetCard.rose : .white.opacity(0.16)).frame(height: 4)
        }
      }
    }
    .accessibilityHidden(true)
  }
}

struct StreakReadinessEntry: TimelineEntry {
  let date: Date
  let data: StreakReadinessWidgetData?
}

struct StreakReadinessProvider: TimelineProvider {
  static let sample = StreakReadinessWidgetData(streakDays: 12, readinessScore: 86, statusText: "86/100")

  func placeholder(in context: Context) -> StreakReadinessEntry {
    StreakReadinessEntry(date: .now, data: Self.sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (StreakReadinessEntry) -> Void) {
    completion(
      StreakReadinessEntry(date: .now, data: WidgetDataStore().streakReadiness() ?? (context.isPreview ? Self.sample : nil)))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<StreakReadinessEntry>) -> Void) {
    let entry = StreakReadinessEntry(date: .now, data: WidgetDataStore().streakReadiness())
    completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(30 * 60))))
  }
}

struct StreakReadinessWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "com.ascnd.fitnessos.widgets.streak-readiness", provider: StreakReadinessProvider()) {
      entry in
      StreakReadinessView(data: entry.data)
        .environment(\.locale, WidgetDataStore().locale)
        .environment(\.colorScheme, .dark)
        .containerBackground(for: .widget) { KoaPassMetal() }
    }
    .configurationDisplayName(Text("widget.streak.name"))
    .description(Text("widget.streak.description"))
    .supportedFamilies([.systemSmall, .systemMedium])
    .contentMarginsDisabled()
  }
}

/// "Phong độ" (chuỗi ngày + sẵn sàng) trên lớp titan (20/10, Kiệt duyệt mock): lửa
/// và số chuỗi khổ hẹp, vòng điểm sẵn sàng màu theo vùng của app (≥75 xanh, ≥50
/// vàng, dưới đỏ — `ReadinessTrend.zone`), ô số như thẻ vận động viên.
struct StreakReadinessView: View {
  let data: StreakReadinessWidgetData?
  var familyOverride: WidgetFamily?
  @Environment(\.widgetFamily) private var widgetFamily
  private var family: WidgetFamily { familyOverride ?? widgetFamily }

  var body: some View {
    Group {
      if let data {
        if family == .systemMedium { medium(data) } else { small(data) }
      } else {
        WidgetCard.empty(caption: String(localized: "widget.card.form"))
      }
    }
    .padding(14)
  }

  private func small(_ d: StreakReadinessWidgetData) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      WidgetCard.caption(String(localized: "widget.card.form"))
      Spacer(minLength: 0)
      HStack(alignment: .center) {
        VStack(alignment: .leading, spacing: 0) {
          flame(d.streakDays, size: 32)
          Text("widget.card.streakDays").font(.system(size: 8.5, weight: .bold)).tracking(1.1).textCase(.uppercase)
            .foregroundStyle(.white.opacity(0.6))
        }
        Spacer(minLength: 0)
        ring(d.readinessScore, size: 62)
      }
      Spacer(minLength: 0)
      Text(d.statusText).font(.system(size: 11, weight: .semibold)).foregroundStyle(.white.opacity(0.7)).lineLimit(2)
    }
  }

  private func medium(_ d: StreakReadinessWidgetData) -> some View {
    HStack(spacing: 16) {
      ring(d.readinessScore, size: 116)
      VStack(alignment: .leading, spacing: 0) {
        WidgetCard.caption(String(localized: "widget.card.form"))
        Text(headline(d.readinessScore))
          .font(.system(size: 17, weight: .bold)).tracking(-0.3).foregroundStyle(.white).padding(.top, 8)
          .lineLimit(2).minimumScaleFactor(0.85)
        if d.readinessScore == nil {
          Text(d.statusText).font(.system(size: 11.5, weight: .semibold)).foregroundStyle(.white.opacity(0.6))
            .lineLimit(2).padding(.top, 2)
        }
        Spacer(minLength: 0)
        HStack(spacing: 0) {
          WidgetCard.stat("\(d.streakDays)", label: String(localized: "widget.card.streakDays"))
          WidgetCard.hairline
          WidgetCard.stat(
            d.readinessScore.map(String.init) ?? "–", label: String(localized: "widget.card.readiness"),
            tint: d.readinessScore.map(WidgetCard.zone) ?? .white)
        }
      }
    }
  }

  private func headline(_ score: Int?) -> String {
    guard let s = score else { return String(localized: "widget.card.zone.none") }
    return s >= 75
      ? String(localized: "widget.card.zone.train")
      : s >= 50 ? String(localized: "widget.card.zone.moderate") : String(localized: "widget.card.zone.recover")
  }

  private func flame(_ days: Int, size: CGFloat) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 4) {
      Image(systemName: "flame.fill").font(.system(size: size * 0.55, weight: .bold)).foregroundStyle(KoaWidgetInk.tube(1, true))
      Text(verbatim: "\(days)").font(.system(size: size, weight: .heavy).monospacedDigit()).fontWidth(.condensed)
        .foregroundStyle(.white)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(days == 1 ? "widget.streak.day" : "widget.streak.days"))
    .accessibilityValue(Text(verbatim: "\(days)"))
  }

  /// Vòng điểm sẵn sàng; chưa có điểm → vòng trống, "–".
  private func ring(_ score: Int?, size: CGFloat) -> some View {
    ZStack {
      Circle().stroke(.white.opacity(0.12), lineWidth: size * 0.09)
      if let s = score {
        Circle().trim(from: 0, to: CGFloat(max(0, min(s, 100))) / 100)
          .stroke(WidgetCard.zone(s), style: StrokeStyle(lineWidth: size * 0.09, lineCap: .round))
          .rotationEffect(.degrees(-90))
      }
      VStack(spacing: -2) {
        Text(verbatim: score.map(String.init) ?? "–").font(.system(size: size * 0.34, weight: .heavy).monospacedDigit())
          .fontWidth(.condensed).foregroundStyle(.white)
        Text("widget.card.readiness").font(.system(size: size * 0.075, weight: .bold)).tracking(0.8)
          .textCase(.uppercase).foregroundStyle(.white.opacity(0.6))
      }
    }
    .frame(width: size, height: size)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("widget.card.readiness"))
    .accessibilityValue(Text(verbatim: score.map { "\($0)/100" } ?? "–"))
  }
}

/// Mảnh chung của các widget trên lớp titan: nhãn + dấu ASCND, ô số khổ hẹp, vạch
/// mảnh, màu theo vùng sẵn sàng.
enum WidgetCard {
  static let rose = KoaWidgetInk.tube(3, true)
  static let green = KoaWidgetInk.rgb(0, 199, 133)
  static func zone(_ v: Int) -> Color {
    v >= 75 ? green : v >= 50 ? KoaWidgetInk.rgb(205, 172, 0) : KoaWidgetInk.rgb(255, 141, 146)
  }

  static func caption(_ text: String) -> some View {
    HStack {
      Text(text).font(.system(size: 9.5, weight: .bold)).tracking(1.4).textCase(.uppercase)
        .foregroundStyle(.white.opacity(0.6)).lineLimit(1)
      Spacer(minLength: 0)
      Image("BrandMark").resizable().interpolation(.high).frame(width: 16, height: 16).accessibilityHidden(true)
    }
  }

  static func stat(_ value: String, label: String, size: CGFloat = 20, tint: Color = .white) -> some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(verbatim: value).font(.system(size: size, weight: .heavy).monospacedDigit()).fontWidth(.condensed)
        .foregroundStyle(tint).lineLimit(1).minimumScaleFactor(0.7)
      Text(label).font(.system(size: 8.5, weight: .bold)).tracking(1.1).textCase(.uppercase)
        .foregroundStyle(.white.opacity(0.6)).lineLimit(1).minimumScaleFactor(0.7)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }

  static var hairline: some View {
    Rectangle().fill(.white.opacity(0.14)).frame(width: 0.5, height: 26).padding(.trailing, 8)
  }

  static func empty(caption text: String) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      caption(text)
      Spacer(minLength: 0)
      Text("widget.empty").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white.opacity(0.7))
    }
  }
}
