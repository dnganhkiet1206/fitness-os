import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Một việc ghi được từ Today — màn ghi nào mở (`todo-card.tsx` của RN).
enum TodayTodo: String, CaseIterable, Identifiable {
  case meal, workout, sleep, bio, weight
  var id: String { rawValue }
}

/// "Hôm nay của bạn" (18/10, chủ dự án duyệt mock A `today-one-log.html`): Ngủ ·
/// Bữa · Nước · Tập trong MỘT thẻ, một nút "Ghi cả ngày" mở một form điền sẵn
/// (`DayLogSheet`). Thay danh sách "Ngày của bạn". Ô vẫn chạm được để ghi riêng
/// từng việc như trước. Luật ô: `DayCheckIn`.
struct TodayDayCard: View {
  struct Tile: Identifiable {
    let item: DayCheckIn.Item
    let state: DayCheckIn.State
    /// Dòng số: đã ghi gì, hoặc gợi ý nút sẽ ghi gì.
    let detail: String
    /// Apple Health điền (chỉ giấc ngủ).
    var auto = false
    var id: DayCheckIn.Item { item }
  }

  let tiles: [Tile]
  /// Dòng phụ của ô Bữa: bữa kế tiếp theo kế hoạch ăn ("Tiếp theo: Bữa tối · Cơm").
  var planNext: String?
  /// Đã tập xong mà muốn ghi buổi phát sinh.
  var onExtraWorkout: (() -> Void)?
  /// Thanh "Ghi hôm nay" luôn hiện; chạm (hoặc micro) mở màn với chữ / giọng nói.
  var onTell: (_ voice: Bool) -> Void = { _ in }
  /// `false` khi thanh ấy đã ở thẻ "Hỏi Koa" (Kiệt 21/10) — không hiện hai lần.
  var showsTell = true
  /// Dòng cân nặng khi đã lâu chưa cân (`TodayDay.showsWeighIn`); `nil` = ẩn.
  var weighIn: (detail: String, done: Bool)?
  let onLogAll: () -> Void
  let onTap: (DayCheckIn.Item) -> Void
  var onWeight: () -> Void = {}

  private var states: [DayCheckIn.Item: DayCheckIn.State] {
    Dictionary(uniqueKeysWithValues: tiles.map { ($0.item, $0.state) })
  }

  var body: some View {
    let progress = DayCheckIn.progress(states)
    let pending = !DayCheckIn.pending(states).isEmpty
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(alignment: .firstTextBaseline) {
        Text("day.card.title")
          .font(DS.TextStyle.title)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        Spacer()
        Text(verbatim: String(localized: "day.card.progress \("\(progress.done)/\(progress.total)")"))
          .font(.system(size: 13, weight: pending ? .regular : .bold))
          .foregroundStyle(pending ? DS.Color.mutedForeground.swiftUI : DS.Color.readinessGreen.swiftUI)
      }
      .padding(.horizontal, 4)
      VStack(alignment: .leading, spacing: 12) {
        // Grid (không LazyVGrid): hai ô một hàng luôn cao bằng nhau.
        Grid(horizontalSpacing: 10, verticalSpacing: 10) {
          ForEach(Array(stride(from: 0, to: tiles.count, by: 2)), id: \.self) { i in
            GridRow {
              tile(tiles[i])
              if i + 1 < tiles.count { tile(tiles[i + 1]) } else { Color.clear }
            }
          }
        }
        if let weighIn {
          weightRow(weighIn)
        }
        if showsTell { tellBar }
      }
      .padding(DS.Spacing.md)
      .todayCard()
    }
  }

  /// Thanh "Ghi hôm nay" (19/10): luôn hiện, cùng viên kính với mọi ô chat.
  private var tellBar: some View {
    HStack(spacing: 6) {
      Button { onTell(false) } label: {
        HStack(spacing: 8) {
          IntelligenceMark(size: 15)
          Text("day.tell.placeholder")
            .font(.system(size: 15))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
          Spacer(minLength: 0)
        }
        .padding(.leading, 14)
        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text("logday.title"))
      Button { onTell(true) } label: {
        Image(systemName: "mic.fill")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(DS.Color.background.swiftUI)
          .frame(width: 38, height: 38)
          .background(DS.Color.foreground.swiftUI, in: Circle())
      }
      .buttonStyle(TodayPressStyle())
      .accessibilityLabel(Text("tellkoa.mic.start"))
    }
    .padding(.trailing, 5)
    .glassComposer(radius: 24)
  }

  private func tile(_ t: Tile) -> some View {
    let color = Self.color(t.item)
    let detail = t.detail.prefix(1).uppercased() + t.detail.dropFirst()
    return VStack(alignment: .leading, spacing: 6) {
      Button { onTap(t.item) } label: {
        VStack(alignment: .leading, spacing: 6) {
          HStack(alignment: .top) {
            Image(systemName: Self.glyph(t.item))
              .font(.system(size: 12, weight: .bold))
              .foregroundStyle(.white)
              .frame(width: 28, height: 28)
              .background(color, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            Spacer(minLength: 0)
            badge(t)
          }
          Text(verbatim: t.state == .done ? detail : Self.name(t.item))
            .font(.system(size: 18, weight: .bold).monospacedDigit())
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(1).minimumScaleFactor(0.7)
          Text(verbatim: t.state == .done ? Self.name(t.item) : detail)
            .font(.system(size: 12))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(2, reservesSpace: true)
          if t.item == .meal, let planNext {
            Label(planNext, systemImage: "list.bullet.clipboard")
              .font(.system(size: 11, weight: .semibold))
              .foregroundStyle(DS.Color.metricOrangeGraphic.swiftUI)
              .lineLimit(1)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(TodayPressStyle(scale: 0.97))
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(verbatim: Self.name(t.item)))
      .accessibilityValue(Text(verbatim: [Self.badgeText(t), t.detail].compactMap { $0 }.joined(separator: ", ")))
      .accessibilityAddTraits(.isButton)
      // Đã tập xong: nút riêng ghi buổi phát sinh (19/10, chủ dự án).
      if t.item == .workout, t.state == .done, let onExtraWorkout {
        Button(action: onExtraWorkout) {
          Label(String(localized: "day.workout.extra"), systemImage: "plus")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 10).frame(minHeight: 28)
            .background(color.opacity(0.12), in: Capsule())
            .frame(minHeight: 44, alignment: .leading)
        }
        .buttonStyle(TodayPressStyle())
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .shadow(color: .black.opacity(0.05), radius: 6, y: 2)
  }

  @ViewBuilder private func badge(_ t: Tile) -> some View {
    switch t.state {
    case .done:
      if t.auto {
        Text("day.tile.auto")
          .font(.system(size: 10, weight: .bold))
          .foregroundStyle(DS.Color.readinessGreen.swiftUI)
          .padding(.horizontal, 6).padding(.vertical, 2)
          .background(DS.Color.readinessGreen.swiftUI.opacity(0.12), in: Capsule())
      } else {
        Image(systemName: "checkmark.circle.fill")
          .font(.system(size: 16))
          .foregroundStyle(.white, DS.Color.readinessGreen.swiftUI)
      }
    case .todo:
      EmptyView()
    case .rest:
      Text("day.tile.rest")
        .font(.system(size: 10, weight: .bold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .padding(.horizontal, 6).padding(.vertical, 2)
        .background(DS.Color.foreground.swiftUI.opacity(0.06), in: Capsule())
    }
  }

  private func weightRow(_ w: (detail: String, done: Bool)) -> some View {
    Button(action: onWeight) {
      HStack(spacing: 10) {
        Image(systemName: "scalemass.fill")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(width: 26, height: 26)
          .background(DS.Color.foreground.swiftUI.opacity(0.08), in: Circle())
        Text("today.todo.weight").font(.system(size: 14, weight: .semibold))
        Text(verbatim: w.detail).font(.system(size: 13)).foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Spacer(minLength: 0)
        if w.done {
          Image(systemName: "checkmark.circle.fill").foregroundStyle(.white, DS.Color.readinessGreen.swiftUI)
        } else {
          Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      .padding(.horizontal, 10)
      .frame(minHeight: 44)
      .background(DS.Color.foreground.swiftUI.opacity(0.04), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle(scale: 0.98))
    .accessibilityElement(children: .combine)
  }

  // MARK: - Bảng

  static func name(_ i: DayCheckIn.Item) -> String {
    switch i {
    case .sleep: String(localized: "today.sig.sleep")
    case .meal: String(localized: "today.sig.meal")
    case .water: String(localized: "today.sig.water")
    case .workout: String(localized: "today.sig.workout")
    }
  }

  static func glyph(_ i: DayCheckIn.Item) -> String {
    switch i {
    case .sleep: "moon.fill"
    case .meal: "fork.knife"
    case .water: "drop.fill"
    case .workout: "dumbbell.fill"
    }
  }

  static func color(_ i: DayCheckIn.Item) -> Color {
    switch i {
    case .sleep: DS.Color.metricPurple.swiftUI
    case .meal: DS.Color.metricOrangeGraphic.swiftUI
    case .water: DS.Color.metricCyan.swiftUI
    case .workout: DS.Color.metricRose.swiftUI
    }
  }

  static func badgeText(_ t: Tile) -> String? {
    switch t.state {
    case .done: t.auto ? String(localized: "day.tile.auto") : String(localized: "today.tube.done")
    case .todo: String(localized: "day.tile.todo")
    case .rest: String(localized: "day.tile.rest")
    }
  }
}
