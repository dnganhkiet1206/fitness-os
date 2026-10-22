import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Một việc ghi được từ Today — màn ghi nào mở (`todo-card.tsx` của RN).
enum TodayTodo: String, CaseIterable, Identifiable {
  case meal, workout, sleep, bio, weight, water, mealPhoto, mealScan, mealManual
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
  /// Nút ghi nhanh trên thẻ Nước, ghi rõ lượng ("+ 8 oz") — chạm thẻ thì mở màn Nước
  /// để chọn lượng (Kiệt 22/10: chạm thẻ tự ghi mà không biết ghi bao nhiêu).
  /// "Lượng khác" bên cạnh: nhập đúng lượng đã uống (Kiệt 22/10).
  var quickWater: (label: String, add: () -> Void, custom: () -> Void)?
  /// "Ghi 23:00–7:00" trên thẻ Giấc ngủ: ghi đêm qua theo giờ quen, một chạm (Kiệt 22/10).
  var quickSleep: (label: String, log: () -> Void)?
  /// Lối nhanh trên thẻ Bữa (Kiệt 22/10): chụp món, quét mã vạch, nhập tay — mở
  /// thẳng bước ấy của màn ghi bữa.
  var mealQuick: ((TodayTodo) -> Void)?
  /// Thanh "Ghi hôm nay" luôn hiện; chạm (hoặc micro) mở màn với chữ / giọng nói.
  var onTell: (_ voice: Bool) -> Void = { _ in }
  /// Dòng cân nặng khi đã lâu chưa cân (`TodayDay.showsWeighIn`); `nil` = ẩn.
  var weighIn: (detail: String, done: Bool)?
  let onLogAll: () -> Void
  let onTap: (DayCheckIn.Item) -> Void
  var onWeight: () -> Void = {}

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
          .contentTransition(.numericText(value: Double(progress.done)))
          .animation(reduceMotion ? nil : .easeOut(duration: 0.6), value: progress.done)
          .foregroundStyle(pending ? DS.Color.mutedForeground.swiftUI : DS.Color.readinessGreen.swiftUI)
      }
      .padding(.horizontal, 4)
      // Dải thẻ vuốt ngang như "Đánh giá" của Apple Health (Kiệt 22/10): mỗi việc một
      // thẻ lớn, thẻ sau ló ở mép phải; không gộp trong một khung.
      ScrollView(.horizontal) {
        // HStack (bốn thẻ) + fixedSize dọc: mọi thẻ cao bằng thẻ cao nhất.
        HStack(alignment: .top, spacing: 12) {
          ForEach(tiles) { t in
            tile(t)
              .containerRelativeFrame(.horizontal) { w, _ in w * 0.86 }
          }
        }
        .fixedSize(horizontal: false, vertical: true)
        .scrollTargetLayout()
      }
      .scrollTargetBehavior(.viewAligned)
      .scrollIndicators(.hidden)
      .scrollClipDisabled()
      if let weighIn {
        weightRow(weighIn)
      }
      tellBar
    }
  }

  /// Thanh "Ghi hôm nay" (19/10): luôn hiện, cùng viên kính với mọi ô chat. Không có
  /// micro ở ngoài (Kiệt 22/10): chạm thanh mở màn "Ghi hôm nay", micro nằm trong đó.
  private var tellBar: some View {
    Button { onTell(false) } label: {
      HStack(spacing: 8) {
        IntelligenceMark(size: 15)
        Text("day.tell.placeholder")
          .font(.system(size: 15))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 14)
      .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text("logday.title"))
    .glassComposer(radius: 24)
  }

  /// Ô kiểu thẻ đánh giá của Apple Health (Kiệt 22/10): cảnh Koa ở trên, dải màu
  /// của mục bên dưới — "Giấc ngủ ›", số đã ghi (hay gợi ý), dòng trạng thái.
  private func tile(_ t: Tile) -> some View {
    let color = Self.color(t.item)
    let detail = t.detail.prefix(1).uppercased() + t.detail.dropFirst()
    return VStack(alignment: .leading, spacing: 0) {
      Button { onTap(t.item) } label: {
        VStack(alignment: .leading, spacing: 0) {
          // Khung cố định, ảnh `.fill` phủ lên — ảnh không đẩy giãn ô.
          Color.clear
            .aspectRatio(638 / 384, contentMode: .fit)
            .overlay {
              Image(Self.scene(t.item))
                .resizable()
                .scaledToFill()
                .accessibilityHidden(true)
            }
            .clipped()
          VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 3) {
              Text(verbatim: Self.name(t.item))
                .font(.system(size: 15, weight: .semibold))
              Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .bold))
            }
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Text(verbatim: detail)
              .font(.system(size: 22, weight: .bold).monospacedDigit())
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .lineLimit(1).minimumScaleFactor(0.7)
              // Số lăn như ở Dinh dưỡng khi vừa ghi ("8 / 65 oz" → "16 / 65 oz") — Kiệt 22/10.
              .contentTransition(.numericText())
              .animation(reduceMotion ? nil : .easeOut(duration: 0.6), value: t.detail)
            // Không lặp: số liệu đã là "Chưa ghi" thì bỏ dòng trạng thái.
            if Self.badgeText(t)?.lowercased() != t.detail.lowercased() { status(t) }
            if t.item == .meal, let planNext {
              Label(planNext, systemImage: "list.bullet.clipboard")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(DS.Color.metricOrangeGraphic.swiftUI)
                .lineLimit(1)
            }
          }
          .padding(.horizontal, 16)
          .padding(.top, 12)
          .padding(.bottom, hasChip(t) ? 4 : 16)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(TodayPressStyle(scale: 0.97))
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(verbatim: Self.name(t.item)))
      .accessibilityValue(Text(verbatim: [Self.badgeText(t), t.detail].compactMap { $0 }.joined(separator: ", ")))
      .accessibilityAddTraits(.isButton)
      // Hàng nút nhanh dính đáy thẻ — thẻ Nước và thẻ Bữa thẳng hàng (Kiệt 22/10).
      Spacer(minLength: 0)
      if t.item == .sleep, t.state != .done, let quickSleep {
        chip(quickSleep.label, systemImage: "moon.zzz.fill", color: color, action: quickSleep.log)
          .padding(.horizontal, 16)
          .padding(.bottom, 8)
      }
      if t.item == .water, let quickWater {
        HStack(spacing: 8) {
          chip(quickWater.label, color: color, action: quickWater.add)
          chip(String(localized: "water.custom"), systemImage: "pencil", color: color, action: quickWater.custom)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
      }
      if t.item == .meal, let mealQuick {
        HStack(spacing: 8) {
          chip(String(localized: "day.meal.photo"), systemImage: "camera.fill", color: color) { mealQuick(.mealPhoto) }
          chip(String(localized: "day.meal.scan"), systemImage: "barcode.viewfinder", color: color) { mealQuick(.mealScan) }
          chip(String(localized: "day.meal.manual"), systemImage: "square.and.pencil", color: color) { mealQuick(.mealManual) }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
      }
      // Đã tập xong: nút riêng ghi buổi phát sinh (19/10, chủ dự án).
      if t.item == .workout, t.state == .done, let onExtraWorkout {
        chip(String(localized: "day.workout.extra"), color: color, action: onExtraWorkout)
          .padding(.horizontal, 16)
          .padding(.bottom, 8)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    // Dải dưới ngả màu của mục, như dải tím dưới hình của Apple Health.
    .background(color.opacity(0.14))
    .background(DS.Color.card.swiftUI)
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
    .shadow(color: .black.opacity(0.05), radius: 6, y: 2)
  }

  private func hasChip(_ t: Tile) -> Bool {
    (t.item == .water && quickWater != nil) || (t.item == .meal && mealQuick != nil) || (t.item == .sleep && t.state != .done && quickSleep != nil) || (t.item == .workout && t.state == .done && onExtraWorkout != nil)
  }

  /// Nút phụ trên thẻ: "+ Buổi phát sinh", "+ 8 oz".
  private func chip(
    _ text: String, systemImage: String = "plus", color: Color, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Label(text, systemImage: systemImage)
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(color)
        .lineLimit(1).minimumScaleFactor(0.8)
        .padding(.horizontal, 12).frame(minHeight: 30)
        .background(color.opacity(0.16), in: Capsule())
        .frame(minHeight: 44, alignment: .leading)
    }
    .buttonStyle(TodayPressStyle())
  }

  /// "✓ Đã xong" · "◌ Chưa ghi" · "Nghỉ" · "Apple Health".
  private func status(_ t: Tile) -> some View {
    HStack(spacing: 5) {
      switch t.state {
      case .done:
        Image(systemName: "checkmark.circle.fill")
          .foregroundStyle(.white, DS.Color.readinessGreen.swiftUI)
      case .todo:
        Image(systemName: "circle.dashed").foregroundStyle(DS.Color.mutedForeground.swiftUI)
      case .rest:
        Image(systemName: "moon.zzz.fill").foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      Text(verbatim: (Self.badgeText(t) ?? "").prefix(1).uppercased() + (Self.badgeText(t) ?? "").dropFirst())
        .foregroundStyle(t.state == .done ? DS.Color.readinessGreen.swiftUI : DS.Color.mutedForeground.swiftUI)
    }
    .font(.system(size: 14, weight: .semibold))
    .accessibilityHidden(true)
  }

  static func scene(_ i: DayCheckIn.Item) -> String {
    switch i {
    case .sleep: "DaySleepScene"
    case .meal: "DayMealScene"
    case .water: "DayWaterScene"
    case .workout: "DayWorkoutScene"
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

