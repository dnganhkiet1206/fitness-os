import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thư viện Đã lưu (#527, lát 7) — `app/community-saved.tsx` @ fac9ac2 trên
/// `CommunitySavedBook`.
///
/// Như RN: mỗi mục là ĐÚNG thẻ của feed (thích / lưu / menu như feed); bộ lọc
/// Buổi tập | Công thức | Tất cả, mở ở Tất cả; luôn đọc lại khi mở; lọc rỗng
/// mà còn trang cũ hơn thì đọc tiếp; chưa lưu gì thì dạy cách lưu, lọc rỗng
/// thì chỉ nói loại ấy chưa có. Lối vào: "Đã lưu" trên hồ sơ của chính mình.
///
/// Lọc Công thức mà chưa lưu công thức nào: "Tìm công thức" mở thẳng phân
/// đoạn Công thức của màn Tìm (lát 8).
struct CommunitySavedScreen: View {
  let userId: String
  @Environment(AppServices.self) private var services
  @State private var book: CommunitySavedBook?
  @State private var built = false

  var body: some View {
    Group {
      if let book {
        CommunitySavedView(book: book)
      } else if built {
        ContentUnavailableView {
          Label("community.saved.title", systemImage: "bookmark")
        } description: {
          Text("placeholder.building")
        }
      } else {
        DSLoadingView()
      }
    }
    .task {
      guard !built else { return }
      book = services.makeCommunitySaved(userId: userId)
      built = true
    }
  }
}

struct CommunitySavedView: View {
  @Bindable var book: CommunitySavedBook
  @Environment(\.weightUnit) private var unit
  /// Đọc một lần mỗi lần MỞ màn (quay lại từ một bài không đọc lại — mục vừa
  /// bỏ lưu ở lại tới lần mở sau, như RN).
  @State private var opened = false
  @State private var findRecipes = false

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: DS.Spacing.md) {
        Picker(selection: $book.filter) {
          Text("community.saved.workouts").tag(CommunitySaved.Filter.workout)
          Text("community.saved.recipes").tag(CommunitySaved.Filter.recipe)
          Text("community.saved.all").tag(CommunitySaved.Filter.all)
        } label: {
          Text("community.saved.title")
        }
        .pickerStyle(.segmented)
        list
      }
      .padding(DS.Spacing.md)
    }
    .background(DS.Color.background.swiftUI)
    .navigationTitle(Text("community.saved.title"))
    .navigationBarTitleDisplayMode(.inline)
    // `refetchOnMount: 'always'`: mỗi lần mở đọc lại.
    .task {
      guard !opened else { return }
      opened = true
      await book.load()
    }
    .task(id: HuntKey(filter: book.filter, count: book.posts.count, hunting: book.hunting)) {
      if book.hunting { await book.hunt() }
    }
    .refreshable { await book.load() }
    .communityUserLinks()
    .communityPostActions(userId: book.userId, host: book)
    .navigationDestination(isPresented: $findRecipes) { CommunitySearchScreen(mode: .recipe) }
  }

  private struct HuntKey: Hashable {
    let filter: CommunitySaved.Filter
    let count: Int
    let hunting: Bool
  }

  @ViewBuilder private var list: some View {
    let visible = book.visible
    switch book.phase {
    case .loading:
      ProgressView().frame(maxWidth: .infinity, minHeight: 88)
    case .failed:
      DSErrorView(message: String(localized: "community.loadfailed")) { Task { await book.load() } }
    case .ready where visible.isEmpty && book.canLoadMore:
      more
    case .ready where visible.isEmpty:
      empty
    case .ready:
      ForEach(visible) { post in
        NavigationLink {
          CommunityPostScreen(postId: post.id)
        } label: {
          PostCardView(post: post, artURL: post.art.flatMap(book.artURL), unit: unit)
        }
        .buttonStyle(.plain)
        .onAppear { if post.id == visible.last?.id { Task { await book.loadMore() } } }
      }
      more
    }
  }

  /// Đuôi danh sách: đang đọc / hỏng thử lại.
  @ViewBuilder private var more: some View {
    if book.loadingMore || book.hunting {
      ProgressView().frame(maxWidth: .infinity, minHeight: 44)
    } else if book.moreFailed {
      Button(String(localized: "async.retry")) { Task { await book.loadMore() } }
        .frame(maxWidth: .infinity, minHeight: 44)
    }
  }

  /// Chưa lưu gì: dạy cách lưu. Đã lưu mà lọc rỗng: chỉ nói loại ấy chưa có.
  private var empty: some View {
    DSCard {
      VStack(spacing: DS.Spacing.sm) {
        Image(systemName: "bookmark")
          .font(.title2)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
        Text(emptyTitle)
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .multilineTextAlignment(.center)
        if book.posts.isEmpty {
          Text("community.saved.emptyhint")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .multilineTextAlignment(.center)
        }
        if book.filter == .recipe {
          DSButton(String(localized: "community.saved.findrecipes"), style: .secondary) { findRecipes = true }
        }
      }
      .frame(maxWidth: .infinity)
    }
  }

  private var emptyTitle: String {
    if book.posts.isEmpty { return String(localized: "community.saved.empty") }
    return book.filter == .workout
      ? String(localized: "community.saved.emptyworkouts") : String(localized: "community.saved.emptyrecipes")
  }
}
