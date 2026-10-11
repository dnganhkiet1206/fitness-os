import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Tìm người / công thức / bài viết (#527, lát 8) — `app/community-search.tsx`
/// @ fac9ac2 trên `CommunitySearchBook`.
///
/// Như RN: một ô (≤ 40 ký tự, tự lấy tiêu điểm, nút xoá), ba phân đoạn, chữ ở
/// lại khi đổi; trễ 250 ms; Người: gợi ý kèm lý do khi ô trống, kết quả khi
/// ≥ 2 ký tự, nút Theo dõi trên dòng, chạm phần còn lại mở hồ sơ; Công thức /
/// Bài viết: lời giới thiệu khi chưa gõ, thẻ như feed khi có kết quả. Lối vào:
/// kính lúp trên thanh công cụ Cộng đồng, "Tìm người để theo dõi" khi tab Đang
/// theo dõi trống (đã có hồ sơ), "Tìm công thức" ở Đã lưu.
struct CommunitySearchScreen: View {
  var mode: CommunitySearch.Mode = .people
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @State private var book: CommunitySearchBook?
  @State private var built = false

  var body: some View {
    Group {
      if let book {
        CommunitySearchView(book: book)
      } else if built {
        ContentUnavailableView {
          Label("community.search.people", systemImage: "magnifyingglass")
        } description: {
          Text("placeholder.building")
        }
      } else {
        DSLoadingView()
      }
    }
    .task {
      guard !built else { return }
      book = services.makeCommunitySearch(userId: flow.today.userId, mode: mode)
      built = true
    }
  }
}

struct CommunitySearchView: View {
  let book: CommunitySearchBook
  @Environment(\.weightUnit) private var unit
  @Environment(\.openCommunityUser) private var openUser
  @State private var q = ""
  @State private var message: String?
  @State private var taps = 0
  @FocusState private var focused: Bool

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: DS.Spacing.md) {
        Picker(selection: Binding(get: { book.mode }, set: { m in Task { await book.select(m) } })) {
          Text("community.search.people").tag(CommunitySearch.Mode.people)
          Text("community.search.recipes").tag(CommunitySearch.Mode.recipe)
          Text("community.search.posts").tag(CommunitySearch.Mode.posts)
        } label: {
          Text(title)
        }
        .pickerStyle(.segmented)
        field
        if CommunitySearch.showsMinHint(typed: q, searched: book.searched) {
          Text("community.search.min")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .padding(.horizontal, DS.Spacing.xs)
        }
        switch book.mode {
        case .people: peopleList
        case .recipe: hitList(recipes: true)
        case .posts: hitList(recipes: false)
        }
      }
      .padding(DS.Spacing.md)
    }
    .background(DS.Color.background.swiftUI)
    .navigationTitle(Text(title))
    .navigationBarTitleDisplayMode(.inline)
    .task { await book.loadSuggestions() }
    .task(id: q) {
      // Gõ tới đâu tìm tới đó, trễ 250 ms.
      try? await Task.sleep(for: CommunitySearch.debounce)
      guard !Task.isCancelled else { return }
      await book.search(q)
    }
    .refreshable { await book.retry() }
    .onAppear { focused = true }
    .sensoryFeedback(.selection, trigger: taps)
    .communityUserLinks()
    .communityPostActions(userId: book.userId, host: book)
    .alert(
      Text(verbatim: message ?? ""),
      isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })
    ) {
      Button(String(localized: "common.ok"), role: .cancel) {}
    }
  }

  private var title: String {
    switch book.mode {
    case .people: String(localized: "community.search.title")
    case .recipe: String(localized: "community.search.recipetitle")
    case .posts: String(localized: "community.search.posttitle")
    }
  }

  private var placeholder: String {
    switch book.mode {
    case .people: String(localized: "community.search.placeholder")
    case .recipe: String(localized: "community.search.recipeplaceholder")
    case .posts: String(localized: "community.search.postplaceholder")
    }
  }

  private var field: some View {
    HStack(spacing: DS.Spacing.sm) {
      Image(systemName: "magnifyingglass")
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
      TextField(text: $q, prompt: Text(verbatim: placeholder)) { Text(verbatim: placeholder) }
        .font(DS.TextStyle.body)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.search)
        .focused($focused)
        .onChange(of: q) { _, v in
          // `maxLength={40}` đếm UTF-16 như JS.
          if v.utf16.count > CommunitySearch.maxLength {
            q = String(v.utf16.prefix(CommunitySearch.maxLength)) ?? String(v.prefix(CommunitySearch.maxLength))
          }
        }
      if !q.isEmpty {
        Button {
          q = ""
        } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("community.search.clear"))
      }
    }
    .padding(.leading, DS.Spacing.md)
    .frame(minHeight: 48)
    .background(DS.Color.secondary.swiftUI, in: Capsule())
  }

  // MARK: - Người

  @ViewBuilder private var peopleList: some View {
    let searching = book.isSearching
    if !searching {
      Text("community.search.suggested")
        .font(DS.TextStyle.headline)
        .foregroundStyle(DS.Color.foreground.swiftUI)
    }
    let phase = searching ? book.peoplePhase : book.suggestionsPhase
    let rows = searching ? book.people : book.suggestions
    switch phase {
    case .failed:
      DSErrorView(message: String(localized: "community.loadfailed")) { Task { await book.retry() } }
    case .loading, .idle:
      ProgressView().frame(maxWidth: .infinity, minHeight: 120)
    case .ready where rows.isEmpty:
      if searching {
        DSEmptyState(
          systemImage: "magnifyingglass",
          title: String(localized: "community.search.none \(CommunitySearch.term(book.searched))"),
          message: String(localized: "community.search.nonehint"))
      } else {
        DSEmptyState(systemImage: "person.badge.plus", title: String(localized: "community.search.nosuggestions"))
      }
    case .ready:
      DSCard {
        VStack(spacing: 0) {
          ForEach(Array(rows.enumerated()), id: \.element.id) { i, p in
            if i > 0 { Divider() }
            personRow(p, searching: searching)
          }
        }
      }
    }
  }

  private func personRow(_ p: CommunitySearch.Person, searching: Bool) -> some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: DS.Spacing.sm) {
        who(p, searching: searching)
        followButton(p)
      }
      // Cột tên hẹp (320 pt, chữ lớn): nút Theo dõi xuống dòng, ở mép phải.
      VStack(alignment: .trailing, spacing: DS.Spacing.sm) {
        who(p, searching: searching)
        followButton(p)
      }
    }
    .padding(.vertical, DS.Spacing.sm)
  }

  private func who(_ p: CommunitySearch.Person, searching: Bool) -> some View {
    Button {
      openUser?(p.author.userId)
    } label: {
      HStack(spacing: DS.Spacing.sm + 4) {
        MascotAvatar(mascotId: p.author.mascotId, size: 44)
        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 4) {
            Text(verbatim: p.author.displayName)
              .font(DS.TextStyle.body.weight(.semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .lineLimit(1)
            if p.author.isOfficial {
              Image(systemName: "checkmark.seal.fill")
                .foregroundStyle(DS.Color.metricBlue.swiftUI)
                .accessibilityHidden(true)
            }
          }
          Text(verbatim: searching ? "@\(p.author.handle)" : Self.whyText(CommunitySearch.why(p)))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(searching ? 1 : 2)
        }
        .frame(minWidth: 150, maxWidth: .infinity, alignment: .leading)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(verbatim: "\(p.author.displayName), @\(p.author.handle)"))
  }

  private func followButton(_ p: CommunitySearch.Person) -> some View {
    let on = p.iFollow
    let label = on ? String(localized: "community.user.unfollowstate") : String(localized: "community.user.follow")
    return Button {
      taps += 1
      Task {
        if case .failed(let f) = await book.follow(p.author.userId, on: !on) {
          message = CommunityPostView.failureText(f)
        }
      }
    } label: {
      Text(verbatim: label)
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(on ? DS.Color.foreground.swiftUI : DS.Color.primaryForeground.swiftUI)
        .padding(.horizontal, DS.Spacing.md)
        .frame(height: 36)
        .background(on ? DS.Color.secondary.swiftUI : DS.Color.primary.swiftUI, in: Capsule())
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(book.following.contains(p.author.userId))
    .accessibilityLabel(Text(verbatim: "\(label) \(p.author.displayName)"))
    .accessibilityAddTraits(on ? .isSelected : [])
  }

  static func whyText(_ w: CommunitySearch.Why) -> String {
    switch w {
    case .official: String(localized: "community.search.whyofficial")
    case .active(let n):
      n == 1 ? String(localized: "community.search.whyactive.one \(n)") : String(localized: "community.search.whyactive.other \(n)")
    case .handle(let h): "@\(h)"
    }
  }

  // MARK: - Công thức / Bài viết

  @ViewBuilder private func hitList(recipes: Bool) -> some View {
    let term = CommunitySearch.trimmed(book.searched)
    if !book.isSearching {
      DSEmptyState(
        systemImage: recipes ? "frying.pan" : "doc.text",
        title: recipes
          ? String(localized: "community.search.recipeintro") : String(localized: "community.search.postintro"),
        message: recipes
          ? String(localized: "community.search.recipeintrohint") : String(localized: "community.search.postintrohint"))
    } else {
      switch book.hitsPhase {
      case .failed:
        DSErrorView(message: String(localized: "community.loadfailed")) { Task { await book.retry() } }
      case .loading, .idle:
        ProgressView().frame(maxWidth: .infinity, minHeight: 120)
      case .ready where book.hits.isEmpty:
        DSEmptyState(
          systemImage: "magnifyingglass",
          title: recipes
            ? String(localized: "community.search.recipenone \(term)") : String(localized: "community.search.postnone \(term)"),
          message: recipes
            ? String(localized: "community.search.recipenonehint") : String(localized: "community.search.postnonehint"))
      case .ready:
        ForEach(book.hits) { post in
          NavigationLink {
            CommunityPostScreen(postId: post.id)
          } label: {
            PostCardView(post: post, artURL: post.art.flatMap(book.artURL), unit: unit)
          }
          .buttonStyle(.plain)
        }
      }
    }
  }
}
