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
      VStack(spacing: DS.Spacing.sm) {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
          ForEach(tiles) { tile($0) }
        }
        if let weighIn {
          weightRow(weighIn)
        }
        if pending {
          Button(action: onLogAll) {
            Label(String(localized: "day.card.logAll"), systemImage: "checkmark")
              .font(DS.TextStyle.headline)
              .foregroundStyle(DS.Color.background.swiftUI)
              .frame(maxWidth: .infinity, minHeight: 50)
              .background(Capsule().fill(DS.Color.foreground.swiftUI))
          }
          .buttonStyle(TodayPressStyle())
          .accessibilityHint(Text("day.card.logAll.hint"))
          Text("day.card.logAll.hint")
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
            .accessibilityHidden(true)
        }
      }
      .padding(DS.Spacing.md)
      .todayCard()
    }
  }

  private func tile(_ t: Tile) -> some View {
    let color = Self.color(t.item)
    return Button { onTap(t.item) } label: {
      VStack(alignment: .leading, spacing: 6) {
        HStack(spacing: 6) {
          Image(systemName: Self.glyph(t.item))
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: 22, height: 22)
            .background(color, in: Circle())
          Text(verbatim: Self.name(t.item))
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Spacer(minLength: 0)
          badge(t)
        }
        Text(verbatim: t.detail.prefix(1).uppercased() + t.detail.dropFirst())
          .font(.system(size: 13, weight: t.state == .done ? .semibold : .regular))
          .foregroundStyle(t.state == .done ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
          .lineLimit(2, reservesSpace: true)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(10)
      .background(DS.Color.foreground.swiftUI.opacity(0.04), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle(scale: 0.97))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: Self.name(t.item)))
    .accessibilityValue(Text(verbatim: [Self.badgeText(t), t.detail].compactMap { $0 }.joined(separator: ", ")))
    .accessibilityAddTraits(.isButton)
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
