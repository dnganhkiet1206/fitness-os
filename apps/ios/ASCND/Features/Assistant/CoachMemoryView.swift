import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// "Coach nhớ gì" (#527 Phase 6) — `app/coach-memory.tsx` @ fac9ac2 trên
/// `CoachMemoryBook`.
///
/// Như RN: lời giới thiệu, nhóm Giới hạn · Mục tiêu · Thói quen · Hoàn cảnh
/// (chấm màu theo nhóm), mỗi điều kèm "Nhắc lần cuối <ngày theo giờ máy>";
/// "Quên" hỏi lại và trích nguyên điều sẽ quên; "Xoá toàn bộ trí nhớ" hỏi lại;
/// xoá không chạm hàng nào là lỗi có chữ. Kéo để đọc lại.
///
/// Khác RN: chữ có tiếng Tây Ban Nha (RN: vi / en); đọc hỏng có nút thử lại
/// (RN: "kéo xuống để thử lại"); ngày theo định dạng của ngôn ngữ app (RN:
/// `YYYY-MM-DD`).
struct CoachMemoryView: View {
  let book: CoachMemoryBook
  @State private var confirmForget: CoachMemory.Fact?
  @State private var confirmAll = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        Text("cm.intro")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        content
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text("cm.title"))
    .task { await book.load() }
    .refreshable { await book.load() }
    .sensoryFeedback(.error, trigger: book.forgetFailed) { _, failed in failed }
    .alert(
      Text("cm.forget.title"), isPresented: Binding(get: { confirmForget != nil }, set: { if !$0 { confirmForget = nil } }),
      presenting: confirmForget
    ) { fact in
      Button("common.cancel", role: .cancel) {}
      Button("cm.forget.confirm", role: .destructive) {
        Task { await book.forget(fact.id) }
      }
    } message: { fact in
      Text("cm.forget.message \(fact.fact)")
    }
    .alert(Text("cm.forgetAll.title"), isPresented: $confirmAll) {
      Button("common.cancel", role: .cancel) {}
      Button("cm.forgetAll.confirm", role: .destructive) {
        Task { await book.forgetAll() }
      }
    } message: {
      Text("cm.forgetAll.message")
    }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView()
    case .failed:
      DSErrorView(message: String(localized: "cm.loadFailed")) {
        Task { await book.load() }
      }
    case .ready(let facts) where facts.isEmpty:
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.xs) {
          Text("cm.empty.title").font(DS.TextStyle.headline)
          Text("cm.empty.message")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    case .ready:
      if book.forgetFailed {
        Text("cm.forgetFailed")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.destructive.swiftUI)
      }
      ForEach(book.groups) { group in
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          HStack(spacing: DS.Spacing.sm) {
            Circle().fill(Self.tint(group.kind)).frame(width: 8, height: 8).accessibilityHidden(true)
            Text(Self.title(group.kind))
              .font(DS.TextStyle.caption)
              .textCase(.uppercase)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .accessibilityAddTraits(.isHeader)
          }
          ForEach(group.facts) { fact in
            row(fact)
          }
        }
      }
      Button {
        confirmAll = true
      } label: {
        Text("cm.forgetAll")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.destructive.swiftUI)
          .frame(maxWidth: .infinity, minHeight: 44)
      }
      .buttonStyle(.plain)
      .disabled(book.isForgetting)
      .opacity(book.isForgetting ? 0.5 : 1)
    }
  }

  private func row(_ fact: CoachMemory.Fact) -> some View {
    HStack(spacing: DS.Spacing.md) {
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: fact.fact)
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        if let day = fact.lastConfirmed {
          Text("cm.lastMentioned \(day.calendarDate.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted).locale(.app)))")
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      Spacer(minLength: 0)
      Button {
        confirmForget = fact
      } label: {
        Image(systemName: "trash")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(book.isForgetting)
      .accessibilityLabel(Text("cm.forget.a11y \(fact.fact)"))
    }
    .padding(DS.Spacing.sm)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
  }

  private static func title(_ kind: CoachMemory.Kind) -> String {
    switch kind {
    case .constraint: String(localized: "cm.kind.constraint")
    case .goal: String(localized: "cm.kind.goal")
    case .preference: String(localized: "cm.kind.preference")
    case .context: String(localized: "cm.kind.context")
    }
  }

  /// `GROUPS[].tint`.
  private static func tint(_ kind: CoachMemory.Kind) -> Color {
    switch kind {
    case .constraint: DS.Color.readinessRed.swiftUI
    case .goal: DS.Color.readinessGreen.swiftUI
    case .preference: DS.Color.metricBlue.swiftUI
    case .context: DS.Color.metricPurple.swiftUI
    }
  }
}
