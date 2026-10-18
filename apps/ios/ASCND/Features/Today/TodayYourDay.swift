import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Một việc ghi được từ Today — màn ghi nào mở (`todo-card.tsx` của RN).
enum TodayTodo: String, CaseIterable, Identifiable {
  case meal, workout, sleep, bio, weight
  var id: String { rawValue }
}

/// "Your day" (#527, bản thiết kế Today đã duyệt) — MỘT danh sách để ghi, thay
/// thẻ "Cần làm hôm nay" của RN (`todo-card.tsx`) và các thẻ nhóm.
///
/// Giữ của RN:
/// - cờ "đã ghi" từ cùng nguồn (`ReminderTodayBook` + tín hiệu ngày);
/// - chạm dòng ở trạng thái nào cũng mở màn ghi (ghi thêm bữa, sửa giấc ngủ…);
/// - cân nặng và sinh trắc vẫn là việc của ngày.
///
/// Thêm so với RN (bản thiết kế):
/// - năm tín hiệu năng lượng đứng trước, mỗi dòng ghi số xu của nhiệm vụ
///   (`MascotRules.dailyQuests`) — chính là năm ống của khối ngày;
/// - dòng chi tiết nói số đã đo ("7 h 40 min", "0.8 of 2.5 L"), "—" không bao
///   giờ thành "0" giả;
/// - nước "+250 ml" / "+8 oz" (theo đơn vị đã chọn) ghi ngay (như nút nhanh của thẻ Nước RN), bước chân "Auto"
///   (Apple Health ghi, chạm → màn Bước).
struct TodayYourDay: View {
  struct Row: Identifiable {
    enum Kind: String { case sleep, meal, water, workout, steps, weight, bio }
    let kind: Kind
    let detail: String
    let done: Bool
    var id: Kind { kind }
  }

  let rows: [Row]
  let onTap: (Row.Kind) -> Void
  /// "Như hôm qua" trên dòng Bữa ăn (17/10, chủ dự án: app bắt ghi quá nhiều):
  /// một chạm chép mọi bữa hôm qua; `nil` khi hôm qua không có bữa / hôm nay đã
  /// ghi. Chạm phần còn lại của dòng vẫn mở màn ghi bữa.
  var mealAgain: (() -> Void)?
  @Environment(AppServices.self) private var services: AppServices?

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(alignment: .firstTextBaseline) {
        Text(String(localized: "today.list.title"))
          .font(DS.TextStyle.title)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        Spacer()
        Text(String(localized: "today.list.hint"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(.horizontal, 4)
      VStack(spacing: 0) {
        ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
          if i > 0 {
            if row.kind == .weight {
              DS.Color.foreground.swiftUI.opacity(0.05).frame(height: 6)
            } else {
              Divider().padding(.leading, 60).opacity(0.6)
            }
          }
          rowView(row)
            .overlay(alignment: .trailing) {
              if row.kind == .meal, !row.done, let mealAgain {
                Button(action: mealAgain) { capsule(String(localized: "today.meal.yesterday")) }
                  .buttonStyle(TodayPressStyle())
                  .padding(.trailing, DS.Spacing.md)
                  .accessibilityLabel(Text("meal.yesterday.title"))
              }
            }
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
      .todayCard()
    }
  }

  private func rowView(_ row: Row) -> some View {
    let color = Self.color(row.kind)
    return Button { onTap(row.kind) } label: {
      HStack(spacing: 12) {
        Image(systemName: Self.glyph(row.kind))
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(color)
          .frame(width: 32, height: 32)
          .background(color.opacity(0.12), in: Circle())
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(verbatim: Self.name(row.kind))
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
            if let coins = Self.coins(row.kind) {
              Text(verbatim: "+\(coins)")
                .font(.system(size: 13, weight: .bold).monospacedDigit())
                .foregroundStyle(DS.Color.readinessYellow.swiftUI)
            }
          }
          Text(verbatim: row.detail)
            .font(.system(size: 13))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        trailing(row, color: color)
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.vertical, 10)
      .frame(minHeight: 64)
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle(scale: 0.98))
    .sensoryFeedback(.success, trigger: row.done) { old, new in !old && new }
    .animation(.spring(duration: 0.45, bounce: 0.3), value: row.done)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: Self.name(row.kind)))
    .accessibilityValue(Text(verbatim: [
      row.detail,
      row.done ? String(localized: "today.tube.done") : nil,
      Self.coins(row.kind).map { String(localized: "today.day.worth \($0)") },
    ].compactMap { $0 }.joined(separator: ", ")))
    .accessibilityHint(Text(verbatim: Self.action(row)))
    .accessibilityAddTraits(.isButton)
  }

  @ViewBuilder private func trailing(_ row: Row, color: Color) -> some View {
    if row.done {
      // Vừa xong: dấu tích nảy nhẹ thay chỗ nút "Ghi".
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: 24))
        .foregroundStyle(.white, color)
        .symbolEffect(.bounce, value: row.done)
        .frame(minWidth: 44, minHeight: 44)
        .transition(.scale(scale: 0.6).combined(with: .opacity))
    } else if row.kind == .steps {
      Text(String(localized: "today.auto"))
        .font(.system(size: 15))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(minHeight: 44)
    } else if row.kind == .meal, mealAgain != nil {
      // Chỗ của nút "Như hôm qua" (nút thật nằm trên dòng, xem `body`).
      capsule(String(localized: "today.meal.yesterday")).hidden()
    } else {
      capsule(row.kind == .water
        ? Water.stepLabel(services?.preferences.volumeUnit ?? .ml) : String(localized: "today.todo.log"))
        .transition(.scale(scale: 0.8).combined(with: .opacity))
    }
  }

  private func capsule(_ text: String) -> some View {
    Text(verbatim: text)
      .font(.system(size: 15, weight: .semibold))
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .padding(.horizontal, 14)
      .frame(minHeight: 36)
      .background(.thinMaterial, in: Capsule())
      .overlay(Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.12), lineWidth: 0.75))
      .frame(minHeight: 44)
  }

  // MARK: - Bảng

  static func name(_ k: Row.Kind) -> String {
    switch k {
    case .sleep: String(localized: "today.sig.sleep")
    case .meal: String(localized: "today.sig.meal")
    case .water: String(localized: "today.sig.water")
    case .workout: String(localized: "today.sig.workout")
    case .steps: String(localized: "today.sig.steps")
    case .weight: String(localized: "today.todo.weight")
    case .bio: String(localized: "today.todo.bio")
    }
  }

  static func quest(_ k: Row.Kind) -> MascotRules.Quest? {
    switch k {
    case .sleep: .sleep
    case .meal: .meal
    case .water: .water
    case .workout: .workout
    case .steps: .steps
    case .weight, .bio: nil
    }
  }

  static func coins(_ k: Row.Kind) -> Int? { quest(k).map(TodayDay.coins) }

  static func color(_ k: Row.Kind) -> Color {
    if let q = quest(k) { return MascotRoomView.signalColor(q) }
    // Cân nặng = xám thép (14/10, chủ dự án: xanh dương trùng với nước).
    return k == .weight ? DS.Color.metricSteel.swiftUI : DS.Color.readinessRed.swiftUI
  }

  static func glyph(_ k: Row.Kind) -> String {
    if let q = quest(k) { return TodayTube.glyph(q) }
    return k == .weight ? "scalemass.fill" : "waveform.path.ecg"
  }

  /// Gợi ý VoiceOver: chạm làm gì.
  static func action(_ row: Row) -> String {
    switch row.kind {
    case .water: String(localized: "today.do.water")
    case .steps: String(localized: "today.steps.open")
    default: String(localized: "today.todo.log")
    }
  }
}
