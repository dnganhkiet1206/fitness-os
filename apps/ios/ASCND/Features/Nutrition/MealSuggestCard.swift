import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Gợi ý món bằng AI (#527, chủ dự án bật 13/10) — `AiMealSuggest`
/// (`components/ascnd/ai-meal-suggest.tsx`) @ fac9ac2 trên `ai-meal-suggest`:
/// ba món hợp với phần kcal / macro còn lại của ngày, theo bữa đang chọn.
///
/// Khác RN (tốt hơn, NATIVE_IMPROVEMENTS):
/// - nằm NGAY trong màn Ghi bữa, theo bữa đang ghi — RN là thẻ riêng ở tab;
/// - "+ Thêm" đưa món vào bữa đang ghi (một khẩu phần, chỉnh được như mọi
///   món) — RN chỉ cho xem;
/// - đổi bữa thì gợi ý cũ bị bỏ (gợi ý bữa sáng không hợp bữa tối).
struct MealSuggestCard: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let logger: MealLogger

  @Environment(AppServices.self) private var services
  @State private var state: Load = .idle
  @State private var added: Set<Int> = []
  @State private var open: Int?
  @State private var work: Task<Void, Never>?

  enum Load: Equatable {
    case idle, loading
    case loaded([AIFood.Suggestion])
    case failed(String)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      header
      switch state {
      case .idle: EmptyView()
      case .loading: loading
      case .loaded(let list): suggestions(list)
      case .failed(let message):
        // Lỗi AI (thường là quá tải) không phải lỗi của người dùng: chữ nhạt + thử
        // lại ngay tại chỗ, thay cho một dòng đỏ không làm được gì (16/10).
        HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
          Text(message)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(maxWidth: .infinity, alignment: .leading)
          Button("common.retry") { load() }
            .font(DS.TextStyle.footnote.weight(.semibold))
            .frame(minHeight: 44)
        }
      }
    }
    .padding(DS.Spacing.md)
    .todayCard()
    .onChange(of: logger.mealType) { _, _ in
      work?.cancel()
      state = .idle
      added = []
      open = nil
    }
    .onDisappear { work?.cancel() }
  }

  private var header: some View {
    HStack(spacing: DS.Spacing.sm) {
      IntelligenceMark(size: 18)
        .frame(width: 32, height: 32)
        .background(Intelligence.wash, in: Circle())
      VStack(alignment: .leading, spacing: 1) {
        Text(String(localized: "ms.title")).font(DS.TextStyle.headline)
        Text(String(localized: "ms.hint"))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .accessibilityElement(children: .combine)
      Spacer(minLength: DS.Spacing.sm)
      if state != .loading {
        Button { load() } label: {
          Text(state == .idle ? String(localized: "ms.cta") : String(localized: "ms.again"))
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(MascotRoomView.signalColor(.meal))
            .padding(.horizontal, DS.Spacing.md)
            .frame(minHeight: 36)
            .background(MascotRoomView.signalColor(.meal).opacity(0.12), in: Capsule())
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
      }
    }
  }

  private var loading: some View {
    HStack(spacing: DS.Spacing.sm) {
      IntelligenceOrb(size: 24)
      Text(String(localized: "ms.loading"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .frame(minHeight: 44)
    .accessibilityElement(children: .combine)
  }

  @ViewBuilder private func suggestions(_ list: [AIFood.Suggestion]) -> some View {
    if list.isEmpty {
      Text(String(localized: "ms.empty"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    } else {
      VStack(spacing: 0) {
        ForEach(list) { s in
          if s.id != list.first?.id { Divider().opacity(0.6) }
          row(s)
        }
      }
    }
  }

  private func row(_ s: AIFood.Suggestion) -> some View {
    let isOpen = open == s.id
    let isAdded = added.contains(s.id)
    return VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      HStack(alignment: .top, spacing: DS.Spacing.sm) {
        Button {
          withAnimation(DSMotion.animation(.snappy, reduceMotion: reduceMotion)) { open = isOpen ? nil : s.id }
        } label: {
          VStack(alignment: .leading, spacing: 3) {
            Text(verbatim: s.name)
              .font(DS.TextStyle.body.weight(.semibold))
              .multilineTextAlignment(.leading)
            HStack(spacing: 6) {
              (Text(verbatim: DiaryView.whole(s.kcal)).font(DS.TextStyle.number(14, .footnote).weight(.semibold))
                + Text(verbatim: " ") + Text(String(localized: "nc.kcal")))
              Text(verbatim: "· " + DiaryView.macros(s.protein, s.carbs, s.fat))
              if let m = s.prepMinutes {
                Text(verbatim: "·")
                Label(String(localized: "ms.prep \(m)"), systemImage: "clock")
                  .labelStyle(.titleAndIcon)
              }
            }
            .font(DS.TextStyle.caption.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(Text(String(localized: "ms.a11y.details")))
        Button {
          guard !isAdded else { return }
          logger.add(s.mealFood(id: UUID().uuidString.lowercased()))
          added.insert(s.id)
        } label: {
          Label(
            isAdded ? String(localized: "ms.added") : String(localized: "ms.add"),
            systemImage: isAdded ? "checkmark" : "plus"
          )
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(isAdded ? DS.Color.mutedForeground.swiftUI : .white)
          .padding(.horizontal, DS.Spacing.sm)
          .frame(minHeight: 34)
          .background(isAdded ? DS.Color.muted.swiftUI : MascotRoomView.signalColor(.meal), in: Capsule())
          .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .disabled(isAdded)
        .sensoryFeedback(.success, trigger: isAdded)
      }
      if isOpen {
        if !s.description.isEmpty {
          Text(verbatim: s.description)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        if !s.ingredients.isEmpty {
          Text(String(localized: "ms.ingredients"))
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Text(verbatim: s.ingredients.joined(separator: " · "))
            .font(DS.TextStyle.footnote)
        }
      }
    }
    .padding(.vertical, DS.Spacing.sm)
  }

  private func load() {
    work?.cancel()
    guard let edge = services.makeEdgeCaller() else {
      state = .failed(WeeklyReviewView.failureText(.notDeployed))
      return
    }
    state = .loading
    added = []
    open = nil
    let body = AIFood.suggestBody(
      mealType: logger.mealType, lang: AppServices.appLang, date: logger.date,
      tzOffsetMinutes: -TimeZone.current.secondsFromGMT() / 60)
    work = Task {
      do throws(EdgeFunction.Failure) {
        let reply = try await edge.call(.mealSuggest, body: body)
        guard !Task.isCancelled else { return }
        state = .loaded(AIFood.suggestions(reply))
      } catch {
        guard !Task.isCancelled else { return }
        state = .failed(WeeklyReviewView.failureText(error))
      }
    }
  }
}
