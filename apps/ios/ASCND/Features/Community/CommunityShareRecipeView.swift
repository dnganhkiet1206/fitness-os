import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Chia sẻ một công thức (#527, lát 13) — `app/community-share-recipe.tsx` @
/// fac9ac2 trên `CommunityShareRecipeBook`.
///
/// Cùng khuôn với màn chia sẻ buổi tập: chọn bữa đã ghi (30 ngày; bữa đã chia
/// sẻ có dấu và không chọn được) → thẻ xem trước ĐẦY ĐỦ mọi nguyên liệu → tên
/// món (bắt buộc, ≤ 80, hỏi đầu tiên) → chú thích → ai thấy → Đăng. Lối vào:
/// "Bạn muốn chia sẻ gì?" → Một công thức.
struct CommunityShareRecipeScreen: View {
  var mealId: String?
  var onPosted: () -> Void = {}
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @State private var book: CommunityShareRecipeBook?
  @State private var built = false

  var body: some View {
    Group {
      if let book {
        CommunityShareRecipeView(book: book, onPosted: onPosted)
      } else if built {
        ContentUnavailableView {
          Label("community.sharerecipe.title", systemImage: "fork.knife")
        } description: {
          Text("placeholder.building")
        }
      } else {
        DSLoadingView()
      }
    }
    .task {
      guard !built else { return }
      book = services.makeCommunityShareRecipe(userId: flow.today.userId, mealId: mealId)
      built = true
    }
  }
}

struct CommunityShareRecipeView: View {
  @Bindable var book: CommunityShareRecipeBook
  var onPosted: () -> Void
  @Environment(\.weightUnit) private var unit
  @Environment(\.dismiss) private var dismiss
  @State private var message: String?
  @State private var posted = false
  @State private var openProfile = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        content
      }
      .padding(DS.Spacing.md)
    }
    .scrollDismissesKeyboard(.interactively)
    .background(DS.Color.background.swiftUI)
    .navigationTitle(Text("community.sharerecipe.title"))
    .navigationBarTitleDisplayMode(.inline)
    .task { if book.phase == .loading { await book.load() } }
    .sensoryFeedback(.success, trigger: posted)
    .navigationDestination(isPresented: $openProfile) {
      CommunityProfileScreen(userId: book.userId) { Task { await book.load() } }
    }
    .alert(
      Text(verbatim: message ?? ""),
      isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })
    ) {
      Button(String(localized: "common.ok"), role: .cancel) {}
    }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      ProgressView().frame(maxWidth: .infinity, minHeight: 120)
    case .failed:
      DSErrorView(message: String(localized: "community.loadfailed")) { Task { await book.load() } }
    case .noProfile:
      DSEmptyState(
        systemImage: "person.crop.circle", title: String(localized: "community.setup.title"),
        message: String(localized: "community.setup.hint"), actionTitle: String(localized: "community.setup.cta")
      ) { openProfile = true }
    case .ready:
      if book.meal == nil {
        picker
      } else {
        compose
      }
    }
  }

  // MARK: - Chọn bữa

  @ViewBuilder private var picker: some View {
    if book.meals.isEmpty {
      DSEmptyState(systemImage: "fork.knife", title: String(localized: "community.sharerecipe.nomeals"))
    } else {
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.xs) {
          Text("community.sharerecipe.pick")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          ForEach(Array(book.meals.enumerated()), id: \.element.id) { i, m in
            if i > 0 { Divider() }
            mealRow(m)
          }
        }
      }
    }
  }

  private func mealRow(_ m: CommunityShareRecipe.Meal) -> some View {
    let done = book.shared.contains(m.id)
    return Button {
      book.picked = m.id
    } label: {
      HStack(spacing: DS.Spacing.md) {
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: Self.mealLabel(m.mealType))
            .font(DS.TextStyle.headline)
            .foregroundStyle(done ? DS.Color.mutedForeground.swiftUI : DS.Color.foreground.swiftUI)
            .lineLimit(1)
          // Không giới hạn dòng: ở 320 pt hàng có dấu "Đã chia sẻ" không được cắt mất số kcal.
          Text(verbatim: meta(m))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if done {
          Label("community.share.shared", systemImage: "checkmark")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        } else {
          Image(systemName: "chevron.right")
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .accessibilityHidden(true)
        }
      }
      .frame(minHeight: 56)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(done)
  }

  private func meta(_ m: CommunityShareRecipe.Meal) -> String {
    let day: String =
      EpochMillis(iso8601: m.dateTime).map {
        Date(timeIntervalSince1970: TimeInterval($0.millis) / 1000)
          .formatted(Date.FormatStyle().weekday(.abbreviated).day().month(.abbreviated).locale(.app))
      } ?? ""
    let n = m.ingredientCount
    let items =
      n == 1
      ? String(localized: "community.sharerecipe.items.one \(n)") : String(localized: "community.sharerecipe.items.other \(n)")
    let kcal = Int((m.kcal + 0.5).rounded(.down)).formatted(.number.locale(.app))
    return "\(day) · \(items) · \(String(localized: "community.sharerecipe.kcal \(kcal)"))"
  }

  static func mealLabel(_ type: String) -> String {
    switch type {
    case "breakfast": String(localized: "diary.meal.breakfast")
    case "lunch": String(localized: "diary.meal.lunch")
    case "dinner": String(localized: "diary.meal.dinner")
    case "snack": String(localized: "diary.meal.snack")
    case "preworkout": String(localized: "diary.meal.preworkout")
    case "postworkout": String(localized: "diary.meal.postworkout")
    default: String(localized: "community.sharerecipe.recipe")
    }
  }

  // MARK: - Soạn

  @ViewBuilder private var compose: some View {
    if let preview = book.preview {
      // `full`: người đăng thấy MỌI dòng sẽ rời tài khoản.
      PostCardView(post: preview, artURL: preview.art.flatMap(book.artURL), unit: unit, full: true)
        .allowsHitTesting(false)
      ShareStylePicker(styles: book.styles, current: book.art?.style) { book.stylePick = $0 }
    }
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text("community.sharerecipe.name")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        TextField(text: $book.title, prompt: Text("community.sharerecipe.nameph")) {
          Text("community.sharerecipe.name")
        }
        .font(DS.TextStyle.body)
        .submitLabel(.next)
        .padding(DS.Spacing.sm)
        .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: 8))
        .onChange(of: book.title) { _, v in
          if v.utf16.count > CommunityShareRecipe.titleLimit {
            book.title = String(v.utf16.prefix(CommunityShareRecipe.titleLimit)) ?? String(v.prefix(CommunityShareRecipe.titleLimit))
          }
        }
      }
    }
    ShareCaptionCard(
      caption: $book.caption, placeholder: "community.sharerecipe.captionph",
      visibility: Binding(get: { book.visibility }, set: { book.visibilityPick = $0 }))
    SharePrivacyNote(text: "community.sharerecipe.privacynote")
    SharePostButton(posting: book.posting, enabled: true) { Task { await post() } }
  }

  private func post() async {
    switch await book.post() {
    case .posted:
      posted.toggle()
      onPosted()
      dismiss()
    case .failed(.profileRequired):
      openProfile = true
    case .failed(.alreadyShared):
      message = String(localized: "community.sharerecipe.alreadyshared")
    case .failed(let f):
      message = CommunityShareWorkoutView.failureText(f)
    case .ignored:
      break
    }
  }
}
