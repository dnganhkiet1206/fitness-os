import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Chia sẻ một buổi tập (#527, lát 11) — `app/community-share.tsx` @ fac9ac2
/// trên `CommunityShareWorkoutBook`.
///
/// Như RN: chọn buổi (30 ngày, mới trước; buổi đã chia sẻ có dấu "Đã chia sẻ"
/// và không chọn được) → xem trước ĐÚNG cái thẻ sẽ đăng (ảnh do app chọn theo
/// nhóm cơ, đổi phong cách khi thư viện có ≥ 2) → chú thích ≤ 500 → ai thấy
/// (mặc định theo Quyền riêng tư, đã chọn thì giữ) → dòng "chỉ những gì trên
/// thẻ" → Đăng. Chưa có hồ sơ: lời mời tạo hồ sơ. Lối vào: thẻ soạn bài đầu
/// feed.
struct CommunityShareWorkoutScreen: View {
  var sessionId: String?
  var onPosted: () -> Void = {}
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @State private var book: CommunityShareWorkoutBook?
  @State private var built = false

  var body: some View {
    Group {
      if let book {
        CommunityShareWorkoutView(book: book, onPosted: onPosted)
      } else if built {
        ContentUnavailableView {
          Label("community.share.title", systemImage: "square.and.arrow.up")
        } description: {
          Text("placeholder.building")
        }
      } else {
        DSLoadingView()
      }
    }
    .task {
      guard !built else { return }
      book = services.makeCommunityShareWorkout(userId: flow.today.userId, sessionId: sessionId)
      built = true
    }
  }
}

struct CommunityShareWorkoutView: View {
  @Bindable var book: CommunityShareWorkoutBook
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
    .navigationTitle(Text("community.share.title"))
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
      if book.session == nil {
        picker
      } else {
        compose
      }
    }
  }

  // MARK: - Chọn buổi

  @ViewBuilder private var picker: some View {
    if book.sessions.isEmpty {
      DSEmptyState(systemImage: "dumbbell", title: String(localized: "community.share.nosessions"))
    } else {
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.xs) {
          Text("community.share.pick")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          ForEach(Array(book.sessions.enumerated()), id: \.offset) { i, s in
            if i > 0 { Divider() }
            sessionRow(s)
          }
        }
      }
    }
  }

  private func sessionRow(_ s: JSONValue) -> some View {
    let id = s["id"]?.stringValue ?? ""
    let done = book.shared.contains(id)
    let name = CommunityShare.sessionTitle(s) ?? String(localized: "community.share.workout")
    return Button {
      book.picked = id
    } label: {
      HStack(spacing: DS.Spacing.md) {
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: name)
            .font(DS.TextStyle.headline)
            .foregroundStyle(done ? DS.Color.mutedForeground.swiftUI : DS.Color.foreground.swiftUI)
            .lineLimit(1)
          Text(verbatim: meta(s))
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

  /// Thứ · ngày · tháng, và khối lượng theo đơn vị của hồ sơ khi > 0.
  private func meta(_ s: JSONValue) -> String {
    let day: String =
      EpochMillis(iso8601: s["date_time"]?.stringValue ?? "").map {
        Date(timeIntervalSince1970: TimeInterval($0.millis) / 1000)
          .formatted(Date.FormatStyle().weekday(.abbreviated).day().month(.abbreviated).locale(.app))
      } ?? ""
    let volume = s["volume_load"]?.doubleValue ?? 0
    guard volume > 0 else { return day }
    return "\(day) · \(unit.volume(volume).formatted(.number.locale(.app))) \(unit.label)"
  }

  // MARK: - Soạn

  @ViewBuilder private var compose: some View {
    if let preview = book.preview {
      PostCardView(post: preview, artURL: preview.art.flatMap(book.artURL), unit: unit)
        .allowsHitTesting(false)
    }
    if book.styles.count >= 2, let current = book.art?.style {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text("community.share.artstyle")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Picker(selection: Binding(get: { current }, set: { book.stylePick = $0 })) {
          ForEach(book.styles, id: \.self) { s in
            Text(verbatim: Self.styleText(s)).tag(s)
          }
        } label: {
          Text("community.share.artstyle")
        }
        .pickerStyle(.segmented)
      }
    }
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text("community.share.caption")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        TextField(
          text: $book.caption, prompt: Text("community.share.captionph"), axis: .vertical
        ) { Text("community.share.caption") }
          .lineLimit(3...8)
          .font(DS.TextStyle.body)
          .padding(DS.Spacing.sm)
          .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: 8))
          .onChange(of: book.caption) { _, v in
            // `maxLength={500}` đếm UTF-16 như JS.
            if v.utf16.count > CommunityShare.captionLimit {
              book.caption = String(v.utf16.prefix(CommunityShare.captionLimit)) ?? String(v.prefix(CommunityShare.captionLimit))
            }
          }
        Text("community.share.visibility")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Picker(selection: Binding(get: { book.visibility }, set: { book.visibilityPick = $0 })) {
          Text("community.privacy.public").tag(CommunityShare.Visibility.public)
          Text("community.privacy.followers").tag(CommunityShare.Visibility.followers)
        } label: {
          Text("community.share.visibility")
        }
        .pickerStyle(.segmented)
      }
    }
    HStack(alignment: .top, spacing: DS.Spacing.sm) {
      Image(systemName: "lock.fill")
        .font(.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
      Text("community.share.privacynote")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(.horizontal, DS.Spacing.xs)
    Button {
      Task { await post() }
    } label: {
      Group {
        if book.posting {
          ProgressView().tint(DS.Color.primaryForeground.swiftUI)
        } else {
          Text("community.share.post").font(DS.TextStyle.headline)
        }
      }
      .foregroundStyle(DS.Color.primaryForeground.swiftUI)
      .frame(maxWidth: .infinity, minHeight: 50)
      .background(DS.Color.primary.swiftUI, in: Capsule())
      .opacity(book.posting ? 0.6 : 1)
    }
    .buttonStyle(.plain)
    .disabled(book.posting)
  }

  private func post() async {
    switch await book.post() {
    case .posted:
      posted.toggle()
      onPosted()
      dismiss()
    case .failed(.profileRequired):
      openProfile = true
    case .failed(let f):
      message = Self.failureText(f)
    case .ignored:
      break
    }
  }

  /// Tên phong cách ảnh; khoá lạ thì viết hoa chữ đầu.
  static func styleText(_ s: String) -> String {
    switch s {
    case "mono": String(localized: "community.art.mono")
    case "neon": String(localized: "community.art.neon")
    case "paper": String(localized: "community.art.paper")
    case "photo": String(localized: "community.art.photo")
    case "line": String(localized: "community.art.line")
    default: CommunityArtLibrary.styleLabel(s)
    }
  }

  static func failureText(_ f: CommunityShareFailure) -> String {
    switch f {
    case .alreadyShared: String(localized: "community.share.alreadyshared")
    case .postLimit: String(localized: "community.share.postlimit")
    case .restricted: String(localized: "community.post.restricted")
    case .offline: String(localized: "community.action.onlineonly")
    case .profileRequired, .server: String(localized: "community.action.server")
    }
  }
}
