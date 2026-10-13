import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Ba vòng hoạt động (#527 N4) — `ActivityRingsCard` của `activity-rings.tsx`
/// @ fac9ac2 trên `ActivityRingsBook`, mở từ hàng "Hoạt động" của Hôm nay (bản
/// thiết kế Today bỏ bộ trang hero, nên thẻ là một màn riêng như thẻ tập luyện).
///
/// Như RN: ba vòng đồng tâm Move / Exercise / Steps, cùng cặp màu gradient,
/// rãnh `ringTrack`, đầu bo tròn, bắt đầu ở 12 giờ; ba vòng ở 0 vẫn vẽ (hình
/// dạng thật của "hôm nay chưa vận động") và câu giải thích đi kèm; số ước
/// lượng có `~` và một dòng nói nó từ đâu; "?" mở tấm giải thích.
///
/// Khác RN: vòng hiện ngay khi bật Reduce Motion (RN luôn chạy hiệu ứng); chữ
/// đủ vi / en / es; con số nhóm nghìn theo ngôn ngữ của app.
struct ActivityRingsView: View {
  let book: ActivityRingsBook
  /// Mục tiêu bước của người dùng (`MascotRoomController.stepsGoal`).
  let stepsTarget: Int

  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var showsHelp = false
  @State private var drawn = false

  var body: some View {
    ScrollView {
      Group {
        switch book.phase {
        case .loading:
          DSLoadingView().frame(maxWidth: .infinity, minHeight: 240)
        case .failed:
          DSErrorView(message: String(localized: "async.error.generic")) { Task { await book.load() } }
        case .ready:
          if let model = book.model(body: energyBody, stepsTarget: stepsTarget) { card(model) }
        }
      }
      .padding(DS.Spacing.md)
    }
    .ascndPage()
    .navigationTitle(Text(String(localized: "ar.title")))
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button { showsHelp = true } label: {
          Image(systemName: "questionmark.circle").frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel(Text(String(localized: "ar.help.a11y")))
      }
    }
    .refreshable { await book.load() }
    .sheet(isPresented: $showsHelp) { ActivityExplainerSheet(stepsTarget: stepsTarget) }
    .task { if case .loading = book.phase { await book.load() } }
  }

  /// `energyProfileFrom` trên hồ sơ đã nạp — cho kcal ước lượng của Move.
  private var energyBody: SessionEnergy.Body? {
    SessionEnergy.body(profile: profile?.profile, today: LocalDate(EpochMillis(Date()), in: .current))
  }

  private func card(_ model: ActivityRings.Model) -> some View {
    DSCard {
      VStack(spacing: DS.Spacing.lg) {
        rings(model)
          .frame(width: 180, height: 180)
          .frame(maxWidth: .infinity)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(String(localized: "ar.title")))
          .accessibilityValue(Text(verbatim: model.rings.map { "\(Self.label($0.key)) \(text($0))" }.joined(separator: ", ")))
        HStack(alignment: .top, spacing: DS.Spacing.sm) {
          ForEach(model.rings, id: \.key) { r in tile(r) }
        }
        if !model.hasAny || model.estimated {
          VStack(alignment: .leading, spacing: 4) {
            if !model.hasAny { note(String(localized: "ar.empty")) }
            if model.estimated { note(String(localized: "ar.estimated")) }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    }
    .onAppear {
      guard !drawn else { return }
      if reduceMotion {
        drawn = true
      } else {
        withAnimation(.timingCurve(0.16, 1, 0.3, 1, duration: 1.4).delay(0.3)) { drawn = true }
      }
    }
  }

  /// Vòng ngoài là Move; mỗi vòng trong lùi 1,5 bề dày nét (`activity-rings.tsx`).
  private func rings(_ model: ActivityRings.Model) -> some View {
    GeometryReader { geo in
      let size = min(geo.size.width, geo.size.height)
      let stroke = size * 0.088
      let gap = stroke * 1.5
      ZStack {
        ForEach(Array(model.rings.enumerated()), id: \.element.key) { i, r in
          let inset = stroke / 2 + 1 + Double(i) * gap
          let colors = Self.colors(r.key)
          Circle()
            .inset(by: inset)
            .stroke(DS.Color.ringTrack.swiftUI, lineWidth: stroke)
          Circle()
            .inset(by: inset)
            .trim(from: 0, to: drawn ? Swift.min(Swift.max(r.pct.isFinite ? r.pct : 0, 0), 1) : 0)
            .stroke(
              LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing),
              style: StrokeStyle(lineWidth: stroke, lineCap: .round))
            .rotationEffect(.degrees(-90))
        }
      }
      .frame(width: size, height: size)
    }
  }

  private func tile(_ r: ActivityRings.Ring) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(Self.label(r.key))
        .font(DS.TextStyle.caption.weight(.semibold))
        .foregroundStyle(Self.colors(r.key)[0])
        .textCase(.uppercase)
      Text(verbatim: ActivityRings.valueText(r, locale: .app))
        .font(.custom("Menlo", size: 20, relativeTo: .title3).weight(.semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      Text(verbatim: ActivityRings.targetText(r, unit: Self.unit(r.key), locale: .app))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }

  private func note(_ s: String) -> some View {
    Text(verbatim: s)
      .font(DS.TextStyle.caption)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }

  private func text(_ r: ActivityRings.Ring) -> String {
    "\(ActivityRings.valueText(r, locale: .app)) \(ActivityRings.targetText(r, unit: Self.unit(r.key), locale: .app))"
  }

  /// `RING_COLORS` của RN.
  static func colors(_ key: ActivityRings.Key) -> [Color] {
    switch key {
    case .move: [Color(red: 1, green: 0xC5 / 255, blue: 0x3D / 255), Color(red: 1, green: 0x91 / 255, blue: 0x30 / 255)]
    case .exercise:
      [Color(red: 0x2B / 255, green: 0xF5 / 255, blue: 0xA8 / 255), Color(red: 0x3D / 255, green: 1, blue: 0x7A / 255)]
    case .steps: [Color(red: 0x3B / 255, green: 0xA6 / 255, blue: 1), Color(red: 0x22 / 255, green: 0xE3 / 255, blue: 1)]
    }
  }

  static func label(_ key: ActivityRings.Key) -> String {
    switch key {
    case .move: String(localized: "ar.move")
    case .exercise: String(localized: "ar.exercise")
    case .steps: String(localized: "ar.steps")
    }
  }

  static func unit(_ key: ActivityRings.Key) -> String {
    switch key {
    case .move: String(localized: "ar.unit.kcal")
    case .exercise: String(localized: "ar.unit.min")
    case .steps: String(localized: "ar.unit.steps")
    }
  }
}

/// Ba vòng nói gì (#527 N4) — `activity-explainer.tsx` @ fac9ac2. Mục tiêu
/// bước là của người dùng, cùng phép rơi về 10.000 với `ActivityRings.model`.
struct ActivityExplainerSheet: View {
  let stepsTarget: Int
  @Environment(\.dismiss) private var dismiss

  private struct Row: Identifiable {
    let term: String
    let body: String
    var id: String { term }
  }

  private var rows: [Row] {
    let move = Int(ActivityRings.moveTargetKcal)
    let exercise = Int(ActivityRings.exerciseTargetMin)
    let steps = (stepsTarget > 0 ? stepsTarget : Int(ActivityRings.defaultStepsTarget)).formatted(.number.locale(.app))
    return [
      Row(term: String(localized: "ax.move.term"), body: String(localized: "ax.move.body \(move)")),
      Row(term: String(localized: "ax.exercise.term"), body: String(localized: "ax.exercise.body \(exercise)")),
      Row(term: String(localized: "ax.steps.term"), body: String(localized: "ax.steps.body \(steps)")),
      Row(term: String(localized: "ax.zero.term"), body: String(localized: "ax.zero.body")),
      Row(term: String(localized: "ax.readiness.term"), body: String(localized: "ax.readiness.body")),
    ]
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          Text(String(localized: "ax.lede")).font(DS.TextStyle.body)
          ForEach(rows) { r in
            VStack(alignment: .leading, spacing: 3) {
              Text(verbatim: r.term).font(DS.TextStyle.footnote.weight(.bold))
              Text(verbatim: r.body)
                .font(DS.TextStyle.footnote)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
            .accessibilityElement(children: .combine)
          }
        }
        .padding(DS.Spacing.md)
      }
      .ascndPage()
      .navigationTitle(Text(String(localized: "ar.title")))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(String(localized: "common.close")) { dismiss() }
        }
      }
    }
    .presentationDetents([.large])
  }
}
