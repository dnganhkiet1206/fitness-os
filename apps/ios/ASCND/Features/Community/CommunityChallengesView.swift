import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thử thách cộng đồng (#527, lát 14) — `community-challenges.tsx`,
/// `community-challenge.tsx`, `challenge-hero.tsx` @ fac9ac2 trên
/// `CommunityChallengesBook` (một sổ cho cả tab Cộng đồng: thẻ Khám phá, trang
/// thử thách, màn một thử thách, thẻ nhắc trong hộp thư).

// MARK: - Chữ dùng chung

enum CommunityChallengeText {
  static func days(_ a: Int, _ b: Int) -> String {
    b == 1
      ? String(localized: "community.challenge.days.one \(a) \(b)")
      : String(localized: "community.challenge.days.other \(a) \(b)")
  }

  static func endsIn(_ n: Int) -> String {
    n == 1
      ? String(localized: "community.challenge.endsin.one \(n)") : String(localized: "community.challenge.endsin.other \(n)")
  }

  static func startsIn(_ n: Int) -> String {
    n == 1
      ? String(localized: "community.challenge.startsin.one \(n)")
      : String(localized: "community.challenge.startsin.other \(n)")
  }

  static func claim(_ n: Int) -> String {
    n == 1
      ? String(localized: "community.challenge.claim.one \(n)") : String(localized: "community.challenge.claim.other \(n)")
  }

  static func coins(_ n: Int) -> String {
    n == 1
      ? String(localized: "community.challenge.coins.one \(n)") : String(localized: "community.challenge.coins.other \(n)")
  }

  static func got(_ n: Int) -> String {
    n == 1 ? String(localized: "community.challenge.got.one \(n)") : String(localized: "community.challenge.got.other \(n)")
  }

  static func people(_ n: Int) -> String {
    String(localized: "community.challenge.people \(n.formatted(.number.locale(.app)))")
  }

  /// `claimLine`: "Nhận 100 xu · còn 4 ngày" / "… hôm nay là ngày cuối";
  /// thử thách không thưởng thì không nhắc tới xu.
  static func claimLine(_ p: CommunityChallenges.Pending) -> String {
    let coins = p.challenge.rewardCoins, n = p.daysLeft
    if coins > 0 {
      let left =
        n == 0
        ? String(localized: "community.challenge.duelast")
        : n == 1
          ? String(localized: "community.challenge.dueleft.one \(n)")
          : String(localized: "community.challenge.dueleft.other \(n)")
      let claim =
        coins == 1
        ? String(localized: "community.challenge.dueclaim.one \(coins)")
        : String(localized: "community.challenge.dueclaim.other \(coins)")
      return "\(claim) · \(left)"
    }
    if n == 0 { return String(localized: "community.challenge.dueplainlast") }
    return n == 1
      ? String(localized: "community.challenge.dueplainleft.one \(n)")
      : String(localized: "community.challenge.dueplainleft.other \(n)")
  }

  /// "Hoàn thành 12 thg 8 · +150 xu"; năm chỉ khi khác năm nay.
  static func doneMeta(_ x: CommunityChallenges.HistoryItem) -> String {
    guard let t = EpochMillis(iso8601: x.claimedAt) else { return "" }
    let at = Date(timeIntervalSince1970: TimeInterval(t.millis) / 1000)
    let sameYear = Calendar.current.component(.year, from: at) == Calendar.current.component(.year, from: Date())
    let style = sameYear
      ? Date.FormatStyle().day().month(.abbreviated).locale(.app)
      : Date.FormatStyle().day().month(.abbreviated).year().locale(.app)
    let when = String(localized: "community.challenges.claimedon \(at.formatted(style))")
    return x.coins > 0 ? "\(when) · \(got(x.coins))" : when
  }
}

/// Mở một thử thách / trang thử thách từ bất kỳ đâu trong tab.
struct ChallengeRoute: Hashable, Identifiable {
  let id: String
  /// Mở từ trang thử thách: không mời quay lại trang ấy nữa.
  var fromAll = false
}

// MARK: - Trang thử thách

struct CommunityChallengesView: View {
  let book: CommunityChallengesBook
  @State private var route: ChallengeRoute?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.lg) {
        content
      }
      .padding(DS.Spacing.md)
    }
    .background(DS.Color.background.swiftUI)
    .navigationTitle(Text("community.challenges.title"))
    .navigationBarTitleDisplayMode(.inline)
    .task { await reload() }
    .refreshable { await reload() }
    .navigationDestination(item: $route) { CommunityChallengeView(book: book, id: $0.id, fromAll: true) }
  }

  private func reload() async {
    await book.load(lang: AppServices.appLang)
    await book.loadHistory(lang: AppServices.appLang)
  }

  @ViewBuilder private var content: some View {
    let g = book.groups
    let done = book.history
    let due = Dictionary(book.pending.map { ($0.id, $0) }) { a, _ in a }
    if book.phase == .failed || book.historyPhase == .failed {
      DSErrorView(message: String(localized: "community.loadfailed")) { Task { await reload() } }
    } else if book.phase == .loading || book.historyPhase == .loading {
      ProgressView().frame(maxWidth: .infinity, minHeight: 120)
    } else if g.joined.isEmpty && g.open.isEmpty && g.soon.isEmpty && done.isEmpty {
      DSEmptyState(
        systemImage: "trophy", title: String(localized: "community.challenges.none"),
        message: String(localized: "community.challenges.nonehint"))
    } else {
      if !g.joined.isEmpty {
        section("community.challenges.joined", count: nil) {
          ForEach(Array(g.joined.enumerated()), id: \.element.id) { i, x in
            if i > 0 { Divider() }
            row(x, meta: joinedMeta(x, due: due[x.id]), lead: x.reached ? .reached : nil, pct: x.reached ? nil : x.percent)
          }
        }
      }
      if !g.open.isEmpty {
        section("community.challenges.open", count: nil) {
          ForEach(Array(g.open.enumerated()), id: \.element.id) { i, x in
            if i > 0 { Divider() }
            row(
              x, meta: "\(CommunityChallengeText.people(x.participants)) · \(CommunityChallengeText.endsIn(Self.gap(book.today, x.endsOn)))",
              lead: nil, pct: nil)
          }
        }
      }
      if !g.soon.isEmpty {
        section("community.challenges.soon", count: nil) {
          ForEach(Array(g.soon.enumerated()), id: \.element.id) { i, x in
            if i > 0 { Divider() }
            row(x, meta: CommunityChallengeText.startsIn(Self.gap(book.today, x.startsOn)), lead: nil, pct: nil)
          }
        }
      }
      if !done.isEmpty {
        section("community.challenges.done", count: done.count) {
          ForEach(Array(done.enumerated()), id: \.element.id) { i, x in
            if i > 0 { Divider() }
            row(CommunityChallenges.fromHistory(x), meta: CommunityChallengeText.doneMeta(x), lead: .claimed, pct: nil)
          }
        }
      }
    }
  }

  static func gap(_ from: String, _ to: String) -> Int { CommunityChallenges.dayGap(from, to) ?? 0 }

  private func joinedMeta(_ x: CommunityChallenges.Challenge, due: CommunityChallenges.Pending?) -> String {
    if let due { return CommunityChallengeText.claimLine(due) }
    if x.reached { return String(localized: "community.challenges.ready") }
    let days = CommunityChallengeText.days(min(x.progress, x.target), x.target)
    let left = CommunityChallenges.dayGap(book.today, x.endsOn) ?? 0
    return "\(days) · \(left < 0 ? String(localized: "community.challenge.ended") : CommunityChallengeText.endsIn(left))"
  }

  private enum Lead { case reached, claimed }

  private func section<Content: View>(
    _ title: LocalizedStringKey, count: Int?, @ViewBuilder content: () -> Content
  ) -> some View {
    let inner = content()
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack {
        Text(title)
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        Spacer()
        if let count {
          Text(verbatim: "\(count)")
            .font(DS.TextStyle.footnote.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      DSCard { VStack(spacing: 0) { inner } }
    }
  }

  private func row(_ x: CommunityChallenges.Challenge, meta: String, lead: Lead?, pct: Double?) -> some View {
    Button {
      route = ChallengeRoute(id: x.id, fromAll: true)
    } label: {
      HStack(spacing: DS.Spacing.sm) {
        if let lead {
          Image(systemName: lead == .claimed ? "checkmark.circle.fill" : "trophy.fill")
            .foregroundStyle(lead == .claimed ? DS.Color.readinessGreen.swiftUI : DS.Color.readinessYellow.swiftUI)
            .accessibilityHidden(true)
        }
        VStack(alignment: .leading, spacing: 4) {
          Text(verbatim: x.title)
            .font(DS.TextStyle.body.weight(.semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(2)
          Text(verbatim: meta)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          if let pct {
            ProgressView(value: pct, total: 100).tint(DS.Color.foreground.swiftUI)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Image(systemName: "chevron.right")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
      .padding(.vertical, DS.Spacing.sm)
      .frame(minHeight: 56)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

// MARK: - Một thử thách

struct CommunityChallengeView: View {
  let book: CommunityChallengesBook
  let id: String
  var fromAll = false
  @Environment(AppServices.self) private var services
  @State private var askLeave = false
  @State private var message: String?
  @State private var taps = 0
  @State private var claimed = false
  @State private var openAll = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        content
        if book.phase != .loading && !fromAll {
          SeeAllChallengesLink { openAll = true }
        }
      }
      .padding(DS.Spacing.md)
    }
    .background(DS.Color.background.swiftUI)
    .navigationTitle(Text("community.challenge.title"))
    .navigationBarTitleDisplayMode(.inline)
    .task {
      if book.phase != .ready { await book.load(lang: AppServices.appLang) }
      // Hết hạn quá 7 ngày: dựng lại từ lịch sử.
      if book.phase == .ready, !book.items.contains(where: { $0.id == id }), book.historyPhase != .ready {
        await book.loadHistory(lang: AppServices.appLang)
      }
    }
    .refreshable { await book.load(lang: AppServices.appLang) }
    .sensoryFeedback(.selection, trigger: taps)
    .sensoryFeedback(.success, trigger: claimed)
    .navigationDestination(isPresented: $openAll) { CommunityChallengesView(book: book) }
    .alert(Text("community.challenge.leave"), isPresented: $askLeave) {
      Button(String(localized: "common.cancel"), role: .cancel) {}
      Button(String(localized: "community.challenge.leave"), role: .destructive) {
        Task { await setJoined(false) }
      }
    } message: {
      Text("community.challenge.leavebody")
    }
    .alert(
      Text(verbatim: message ?? ""),
      isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })
    ) {
      Button(String(localized: "common.ok"), role: .cancel) {}
    }
  }

  @ViewBuilder private var content: some View {
    let live = book.items.contains { $0.id == id }
    if book.phase == .failed || (!live && book.historyPhase == .failed) {
      // Lịch sử đọc hỏng mà nói "không còn nữa" là nói sai.
      DSErrorView(message: String(localized: "community.loadfailed")) {
        Task {
          await book.load(lang: AppServices.appLang)
          await book.loadHistory(lang: AppServices.appLang)
        }
      }
    } else if book.phase == .loading || (!live && book.historyPhase == .loading) {
      ProgressView().frame(maxWidth: .infinity, minHeight: 120)
    } else if let ch = book.challenge(id) {
      detail(ch)
    } else {
      DSEmptyState(systemImage: "trophy", title: String(localized: "community.challenge.gone"))
    }
  }

  @ViewBuilder private func detail(_ ch: CommunityChallenges.Challenge) -> some View {
    let done = ch.joined && ch.reached
    let left = CommunityChallenges.dayGap(book.today, ch.endsOn)
    let open = (left ?? -1) >= 0
    VStack(spacing: DS.Spacing.sm) {
      Image(systemName: done || ch.claimed ? "trophy.fill" : "trophy")
        .font(.system(size: 56))
        .foregroundStyle(DS.Color.readinessYellow.swiftUI)
        .accessibilityHidden(true)
      Text(verbatim: ch.title)
        .font(DS.TextStyle.title)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .multilineTextAlignment(.center)
      if !ch.description.isEmpty {
        Text(verbatim: ch.description)
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .multilineTextAlignment(.center)
      }
    }
    .frame(maxWidth: .infinity)
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        if ch.joined {
          Text(verbatim: CommunityChallengeText.days(min(ch.progress, ch.target), ch.target))
            .font(DS.TextStyle.title2.monospacedDigit())
            .foregroundStyle(DS.Color.foreground.swiftUI)
          ProgressView(value: ch.percent, total: 100)
            .tint(done ? DS.Color.readinessGreen.swiftUI : DS.Color.foreground.swiftUI)
        }
        Text("community.challenge.how")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
        infoRow(
          "\(Self.day(ch.startsOn)) → \(Self.day(ch.endsOn))",
          open ? CommunityChallengeText.endsIn(left ?? 0) : String(localized: "community.challenge.ended"))
        if ch.rewardCoins > 0 {
          infoRow(String(localized: "community.challenge.reward"), CommunityChallengeText.coins(ch.rewardCoins))
        }
        if !ch.fromHistory {
          infoRow(CommunityChallengeText.people(ch.participants), "")
        }
      }
    }
    action(ch, done: done, open: open)
  }

  @ViewBuilder private func action(_ ch: CommunityChallenges.Challenge, done: Bool, open: Bool) -> some View {
    let busy = book.working.contains(ch.id)
    if !ch.joined {
      if open {
        solid(String(localized: "community.challenge.join"), busy: busy) { Task { await setJoined(true) } }
      }
    } else if ch.claimed {
      Label("community.challenge.claimed", systemImage: "checkmark")
        .font(DS.TextStyle.headline)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 44)
    } else if done {
      solid(CommunityChallengeText.claim(ch.rewardCoins), busy: busy) { Task { await claim(ch) } }
    } else {
      Button {
        askLeave = true
      } label: {
        Text("community.challenge.leave")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(maxWidth: .infinity, minHeight: 44)
          .background(DS.Color.secondary.swiftUI, in: Capsule())
      }
      .buttonStyle(.plain)
      .disabled(busy)
    }
  }

  private func solid(_ label: String, busy: Bool, _ run: @escaping () -> Void) -> some View {
    Button(action: run) {
      Group {
        if busy { ProgressView().tint(DS.Color.primaryForeground.swiftUI) } else { Text(verbatim: label) }
      }
      .font(DS.TextStyle.headline)
      .foregroundStyle(DS.Color.primaryForeground.swiftUI)
      .frame(maxWidth: .infinity, minHeight: 50)
      .background(DS.Color.primary.swiftUI, in: Capsule())
    }
    .buttonStyle(.plain)
    .disabled(busy)
  }

  private func infoRow(_ label: String, _ value: String) -> some View {
    HStack {
      Text(verbatim: label).font(DS.TextStyle.body).foregroundStyle(DS.Color.foreground.swiftUI)
      Spacer()
      if !value.isEmpty {
        Text(verbatim: value)
          .font(DS.TextStyle.body.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
    .frame(minHeight: 24)
  }

  /// `toLocaleDateString(locale, {day, month: 'short'})` của một ngày lịch.
  static func day(_ s: String) -> String {
    guard let d = LocalDate(s) else { return s }
    var c = DateComponents()
    c.year = d.year
    c.month = d.month
    c.day = d.day
    guard let date = Calendar.current.date(from: c) else { return s }
    return date.formatted(Date.FormatStyle().day().month(.abbreviated).locale(.app))
  }

  private func setJoined(_ on: Bool) async {
    taps += 1
    if case .failed(let f) = await book.setJoined(id, on, lang: AppServices.appLang) {
      message = CommunityPostView.failureText(f)
    }
  }

  private func claim(_ ch: CommunityChallenges.Challenge) async {
    taps += 1
    switch await book.claim(ch.id, lang: AppServices.appLang) {
    case .claimed(let coins, let title):
      claimed.toggle()
      ChallengeCelebration.enqueue(services, coins: coins, title: title)
    case .failed(let f):
      message = CommunityPostView.failureText(f)
    case .ignored:
      break
    }
  }
}

/// Màn chúc mừng khi nhận thưởng — cùng hàng đợi với thử thách tuần.
enum ChallengeCelebration {
  @MainActor static func enqueue(_ services: AppServices, coins: Int, title: String) {
    let got = coins > 0 ? CommunityChallengeText.got(coins) : ""
    services.celebrations.enqueue(
      title: String(localized: "community.challenge.done"),
      description: [title, got].filter { !$0.isEmpty }.joined(separator: " · "), icon: "trophy", tier: "gold")
  }
}

/// "Tất cả thử thách ›" — lối vào thứ hai của trang thử thách.
struct SeeAllChallengesLink: View {
  let open: () -> Void

  var body: some View {
    Button(action: open) {
      HStack(spacing: 4) {
        Text("community.challenges.seeall").font(DS.TextStyle.footnote.weight(.semibold))
        Image(systemName: "chevron.right").font(.footnote).accessibilityHidden(true)
      }
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .frame(maxWidth: .infinity, minHeight: 44)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

// MARK: - Thẻ nổi bật ở đầu Khám phá

/// Một thẻ: cái đang theo mà chưa nhận, không thì cái đông người nhất. Một
/// hành động đổi theo trạng thái: Tham gia → thanh tiến độ → Nhận N xu → đã
/// nhận.
struct ChallengeHeroCard: View {
  let book: CommunityChallengesBook
  let ch: CommunityChallenges.Challenge
  let open: (ChallengeRoute) -> Void
  let openAll: () -> Void
  @Environment(AppServices.self) private var services
  @State private var message: String?
  @State private var taps = 0
  @State private var claimed = false

  var body: some View {
    let done = ch.joined && ch.reached
    let left = CommunityChallenges.dayGap(book.today, ch.endsOn) ?? 0
    let startsIn = CommunityChallenges.dayGap(book.today, ch.startsOn) ?? 0
    let busy = book.working.contains(ch.id)
    VStack(spacing: 0) {
      Button {
        open(ChallengeRoute(id: ch.id))
      } label: {
        DSCard {
          VStack(alignment: .leading, spacing: DS.Spacing.sm) {
            Text(verbatim: ch.title)
              .font(DS.TextStyle.title2)
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .multilineTextAlignment(.leading)
            HStack(spacing: DS.Spacing.sm) {
              Label("community.challenge.badge", systemImage: "trophy.fill")
                .font(DS.TextStyle.footnote.weight(.semibold))
                .foregroundStyle(DS.Color.readinessYellow.swiftUI)
              Image(systemName: "person.2").font(.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .accessibilityHidden(true)
              Text(verbatim: CommunityChallengeText.people(ch.participants))
                .font(DS.TextStyle.footnote)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
            if ch.joined {
              ProgressView(value: ch.percent, total: 100)
                .tint(done ? DS.Color.readinessGreen.swiftUI : DS.Color.foreground.swiftUI)
            }
            HStack {
              if ch.joined {
                Text(verbatim: CommunityChallengeText.days(min(ch.progress, ch.target), ch.target))
                  .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
                  .foregroundStyle(DS.Color.foreground.swiftUI)
              }
              Spacer()
              Text(verbatim: startsIn > 0 ? CommunityChallengeText.startsIn(startsIn) : CommunityChallengeText.endsIn(left))
                .font(DS.TextStyle.footnote)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
            heroAction(done: done, busy: busy)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
      .buttonStyle(.plain)
      SeeAllChallengesLink(open: openAll)
    }
    .sensoryFeedback(.selection, trigger: taps)
    .sensoryFeedback(.success, trigger: claimed)
    .alert(
      Text(verbatim: message ?? ""),
      isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })
    ) {
      Button(String(localized: "common.ok"), role: .cancel) {}
    }
  }

  @ViewBuilder private func heroAction(done: Bool, busy: Bool) -> some View {
    if !ch.joined {
      pill(String(localized: "community.challenge.join"), busy: busy) {
        taps += 1
        Task {
          if case .failed(let f) = await book.setJoined(ch.id, true, lang: AppServices.appLang) {
            message = CommunityPostView.failureText(f)
          }
        }
      }
    } else if ch.claimed {
      Label("community.challenge.claimed", systemImage: "checkmark")
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 44)
    } else if done {
      pill(CommunityChallengeText.claim(ch.rewardCoins), busy: busy) {
        taps += 1
        Task {
          switch await book.claim(ch.id, lang: AppServices.appLang) {
          case .claimed(let coins, let title):
            claimed.toggle()
            ChallengeCelebration.enqueue(services, coins: coins, title: title)
            open(ChallengeRoute(id: ch.id))
          case .failed(let f): message = CommunityPostView.failureText(f)
          case .ignored: break
          }
        }
      }
    }
  }

  private func pill(_ label: String, busy: Bool, _ run: @escaping () -> Void) -> some View {
    Button(action: run) {
      Group {
        if busy { ProgressView().tint(DS.Color.primaryForeground.swiftUI) } else { Text(verbatim: label) }
      }
      .font(DS.TextStyle.headline)
      .foregroundStyle(DS.Color.primaryForeground.swiftUI)
      .frame(maxWidth: .infinity, minHeight: 44)
      .background(DS.Color.primary.swiftUI, in: Capsule())
    }
    .buttonStyle(.plain)
    .disabled(busy)
    .accessibilityLabel(Text(verbatim: label))
  }
}
