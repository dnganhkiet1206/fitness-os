import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Quyền riêng tư Cộng đồng (#527, lát 10) — `app/community-privacy.tsx` @
/// fac9ac2 trên `CommunityPrivacyBook`.
///
/// Như RN, theo thứ tự: mặc định khi đăng, huy hiệu thử thách (tắt sẵn), loại
/// bài ở Khám phá (công tắc cuối không tắt được), thông báo (lọc ở server),
/// Đã chặn (bỏ chặn hỏi lại), Đã tắt tiếng (chỉ khi có ai), Xoá mọi bài (hỏi
/// hai lần). Cài đặt đọc hỏng thì các mục cài đặt ẩn, chỉ còn thẻ thử lại.
/// Lối vào: "Quyền riêng tư" trên hồ sơ của chính mình.
struct CommunityPrivacyScreen: View {
  let userId: String
  @Environment(AppServices.self) private var services
  @State private var book: CommunityPrivacyBook?
  @State private var built = false

  var body: some View {
    Group {
      if let book {
        CommunityPrivacyView(book: book)
      } else if built {
        ContentUnavailableView {
          Label("community.privacy.title", systemImage: "lock")
        } description: {
          Text("placeholder.building")
        }
      } else {
        DSLoadingView()
      }
    }
    .task {
      guard !built else { return }
      book = services.makeCommunityPrivacy(userId: userId)
      built = true
    }
  }
}

struct CommunityPrivacyView: View {
  let book: CommunityPrivacyBook
  @State private var message: String?
  @State private var unblockFor: CommunityPrivacy.Person?
  @State private var wipeAsk = false
  @State private var wipeSure = false
  @State private var taps = 0

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.lg) {
        defaultSection
        if book.settingsPhase != .failed {
          badgesSection
          kindsSection
          notifySection
        }
        blockedSection
        mutedSection
        postsSection
      }
      .padding(DS.Spacing.md)
    }
    .background(DS.Color.background.swiftUI)
    .navigationTitle(Text("community.privacy.title"))
    .navigationBarTitleDisplayMode(.inline)
    .task { await book.load() }
    .refreshable { await book.load() }
    .sensoryFeedback(.selection, trigger: taps)
    .alert(
      Text(verbatim: String(localized: "community.privacy.unblocktitle \(Self.name(unblockFor))")),
      isPresented: Binding(get: { unblockFor != nil }, set: { if !$0 { unblockFor = nil } }),
      presenting: unblockFor
    ) { p in
      Button(String(localized: "common.cancel"), role: .cancel) {}
      Button(String(localized: "community.privacy.unblock")) {
        Task { say(await book.unblock(p.userId), done: nil) }
      }
    } message: { _ in
      Text("community.privacy.unblockbody")
    }
    .alert(Text("community.privacy.deletealltitle"), isPresented: $wipeAsk) {
      Button(String(localized: "common.cancel"), role: .cancel) {}
      Button(String(localized: "community.privacy.continue"), role: .destructive) { wipeSure = true }
    } message: {
      Text("community.privacy.deleteallbody")
    }
    .alert(Text("community.privacy.deleteallsure"), isPresented: $wipeSure) {
      Button(String(localized: "common.cancel"), role: .cancel) {}
      Button(String(localized: "community.privacy.deleteforgood"), role: .destructive) { Task { await wipe() } }
    } message: {
      Text("community.privacy.deleteallsurebody")
    }
    .alert(
      Text(verbatim: message ?? ""),
      isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })
    ) {
      Button(String(localized: "common.ok"), role: .cancel) {}
    }
  }

  // MARK: - Mục

  private func heading(_ key: LocalizedStringKey) -> some View {
    Text(key).font(DS.TextStyle.headline).foregroundStyle(DS.Color.foreground.swiftUI)
  }

  private func sub(_ key: LocalizedStringKey) -> some View {
    Text(key).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .fixedSize(horizontal: false, vertical: true)
  }

  @ViewBuilder private var defaultSection: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      heading("community.privacy.default")
      if book.settingsPhase == .failed {
        DSErrorView(message: String(localized: "community.loadfailed")) { Task { await book.loadSettings() } }
      } else {
        Picker(
          selection: Binding(
            get: { book.visibility },
            set: { v in
              taps += 1
              Task { say(await book.setVisibility(v), done: nil) }
            })
        ) {
          Text("community.privacy.public").tag(CommunityPrivacy.Visibility.public)
          Text("community.privacy.followers").tag(CommunityPrivacy.Visibility.followers)
        } label: {
          Text("community.privacy.default")
        }
        .pickerStyle(.segmented)
        .disabled(book.settingsPhase == .loading)
        sub("community.privacy.defaulthint")
      }
    }
  }

  private var badgesSection: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      heading("community.privacy.badges")
      Picker(
        selection: Binding(
          get: { book.badgesOn },
          set: { on in
            taps += 1
            Task { say(await book.setBadges(on), done: nil) }
          })
      ) {
        Text("community.privacy.badgeshide").tag(false)
        Text("community.privacy.badgesshow").tag(true)
      } label: {
        Text("community.privacy.badges")
      }
      .pickerStyle(.segmented)
      .disabled(book.settingsPhase == .loading)
      sub("community.privacy.badgeshint")
    }
  }

  private var kindsSection: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      heading("community.privacy.discover")
      DSCard {
        VStack(spacing: 0) {
          ForEach(Array(CommunityPayloads.discoverKinds.enumerated()), id: \.element) { i, k in
            if i > 0 { Divider() }
            let on = book.kinds.contains(k)
            Toggle(
              isOn: Binding(
                get: { on },
                set: { v in
                  taps += 1
                  Task { say(await book.setKind(k, on: v), done: nil) }
                })
            ) {
              Text(Self.kindLabel(k)).font(DS.TextStyle.body).foregroundStyle(DS.Color.foreground.swiftUI)
            }
            .tint(DS.Color.readinessGreen.swiftUI)
            .disabled(book.settingsPhase == .loading || CommunityPrivacy.isLastOn(book.kinds, k))
            .frame(minHeight: 44)
          }
        }
      }
      sub("community.privacy.discoverhint")
    }
  }

  private var notifySection: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      heading("community.privacy.notify")
      DSCard {
        VStack(spacing: 0) {
          ForEach(Array(CommunityPrivacy.NotifyKey.allCases.enumerated()), id: \.element) { i, k in
            if i > 0 { Divider() }
            Toggle(
              isOn: Binding(
                get: { book.notifyOn(k) },
                set: { v in
                  taps += 1
                  Task { say(await book.setNotify(k, on: v), done: nil) }
                })
            ) {
              Text(Self.notifyLabel(k)).font(DS.TextStyle.body).foregroundStyle(DS.Color.foreground.swiftUI)
            }
            .tint(DS.Color.readinessGreen.swiftUI)
            .disabled(book.settingsPhase == .loading)
            .frame(minHeight: 44)
          }
        }
      }
      sub("community.privacy.notifyhint")
    }
  }

  private var blockedSection: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      heading("community.privacy.blocked")
      sub("community.privacy.blockedhint")
      switch book.blockedPhase {
      case .failed:
        DSErrorView(message: String(localized: "community.loadfailed")) { Task { await book.loadBlocked() } }
      case .loading:
        ProgressView().frame(maxWidth: .infinity, minHeight: 44)
      case .ready where book.blocked.isEmpty:
        DSCard {
          Text("community.privacy.blockednone")
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      case .ready:
        people(book.blocked, line: { String(localized: "community.privacy.since \(CommunityUserView.dayText($0.at))") }) { p in
          pill(String(localized: "community.privacy.unblock"), p) { unblockFor = p }
        }
      }
    }
  }

  @ViewBuilder private var mutedSection: some View {
    if book.mutedPhase == .failed {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        heading("community.privacy.muted")
        DSErrorView(message: String(localized: "community.loadfailed")) { Task { await book.loadMuted() } }
      }
    } else if !book.muted.isEmpty {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        heading("community.privacy.muted")
        sub("community.privacy.mutedhint")
        people(book.muted, line: { String(localized: "community.privacy.until \(CommunityUserView.dayText($0.at))") }) { p in
          pill(String(localized: "community.user.unmute"), p) {
            Task { say(await book.unmute(p.userId), done: String(localized: "community.privacy.unmuted")) }
          }
        }
      }
    }
  }

  private var postsSection: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      heading("community.privacy.posts")
      Button {
        wipeAsk = true
      } label: {
        Group {
          if book.wiping {
            ProgressView()
          } else {
            Text("community.privacy.deleteall").font(DS.TextStyle.headline)
          }
        }
        .foregroundStyle(DS.Color.readinessRed.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 50)
        .background(DS.Color.secondary.swiftUI, in: Capsule())
      }
      .buttonStyle(.plain)
      .disabled(book.wiping)
      sub("community.privacy.deleteallhint")
    }
  }

  // MARK: - Dòng người

  private func people<Action: View>(
    _ list: [CommunityPrivacy.Person], line: @escaping (CommunityPrivacy.Person) -> String,
    @ViewBuilder action: @escaping (CommunityPrivacy.Person) -> Action
  ) -> some View {
    DSCard {
      VStack(spacing: 0) {
        ForEach(Array(list.enumerated()), id: \.element.id) { i, p in
          if i > 0 { Divider() }
          HStack(spacing: DS.Spacing.sm) {
            MascotAvatar(mascotId: p.profile?.mascotId, size: 40)
            VStack(alignment: .leading, spacing: 2) {
              Text(verbatim: Self.name(p))
                .font(DS.TextStyle.body.weight(.semibold))
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .lineLimit(2)
              if let h = p.profile?.handle {
                Text(verbatim: "@\(h)")
                  .font(DS.TextStyle.footnote)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                  .lineLimit(1)
              }
              Text(verbatim: line(p))
                .font(DS.TextStyle.footnote)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            action(p)
          }
          .padding(.vertical, DS.Spacing.sm)
        }
      }
    }
  }

  private func pill(_ label: String, _ p: CommunityPrivacy.Person, _ run: @escaping () -> Void) -> some View {
    Button(action: run) {
      Text(verbatim: label)
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .padding(.horizontal, DS.Spacing.md)
        .frame(height: 36)
        .background(DS.Color.secondary.swiftUI, in: Capsule())
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(book.working.contains(p.userId))
    .accessibilityLabel(Text(verbatim: "\(label) \(p.profile?.displayName ?? "")"))
  }

  // MARK: - Chữ

  private func say(_ out: CommunityPostActions.Outcome, done: String?) {
    switch out {
    case .done: if let done { message = done }
    case .failed(let f): message = CommunityPostView.failureText(f)
    case .ignored: break
    }
  }

  private func wipe() async {
    switch await book.deleteAllPosts() {
    case .deleted(let n):
      message =
        n == 0
        ? String(localized: "community.privacy.nothing")
        : n == 1
          ? String(localized: "community.privacy.deleted.one \(n)") : String(localized: "community.privacy.deleted.other \(n)")
    case .failed(let f): message = CommunityPostView.failureText(f)
    case .ignored: break
    }
  }

  static func name(_ p: CommunityPrivacy.Person?) -> String {
    p?.profile?.displayName ?? String(localized: "community.privacy.noprofile")
  }

  static func kindLabel(_ k: String) -> String {
    switch k {
    case "workout": String(localized: "community.privacy.kind.workout")
    case "progress": String(localized: "community.privacy.kind.progress")
    default: String(localized: "community.privacy.kind.recipe")
    }
  }

  static func notifyLabel(_ k: CommunityPrivacy.NotifyKey) -> String {
    switch k {
    case .likes: String(localized: "community.privacy.notify.likes")
    case .comments: String(localized: "community.privacy.notify.comments")
    case .mentions: String(localized: "community.privacy.notify.mentions")
    case .follows: String(localized: "community.privacy.notify.follows")
    case .saves: String(localized: "community.privacy.notify.saves")
    case .tries: String(localized: "community.privacy.notify.tries")
    case .challenges: String(localized: "community.privacy.notify.challenges")
    }
  }
}
