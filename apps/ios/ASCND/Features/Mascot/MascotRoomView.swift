import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Phòng linh vật (#527 Phase 7) — `app/mascot-room.tsx` @ fac9ac2, trên
/// `MascotRoomController`. Kinh tế do server quyết (`claim_quest_reward`,
/// `buy_streak_freeze`); màn chỉ đọc sổ và gọi hai RPC ấy.
///
/// Như RN, từ trên xuống: sân khấu của Koa + xu bay lên khi nhận; vòng năng
/// lượng năm tín hiệu; cấp / hạng / thanh XP / chuỗi; băng chuỗi (giữ 0–2, mua
/// 150 xu); hành trình hạng; nhiệm vụ hôm nay (CHỈ hiện đã nhận hay chưa — RN
/// tự nhận ở nơi khác) + dòng thưởng chuỗi (nút nhận duy nhất); thưởng thử thách
/// tuần (biên nhận, không nút); số thử thách / huy hiệu.
///
/// Chưa có (ghi ở #527, không giả vờ):
/// - phần studio của `MascotScene` (cây, côn trùng, cái liếc) và cảm xúc do
///   engine chọn — `MascotStage` vẽ Koa thật (K4) đứng `idle`, mặc đồ trong tủ;
/// - câu nói / tâm trạng của Koa (`useMascot`), dòng "Koa để ý" (mô hình cá
///   nhân trên máy) — không có nguồn native;
/// - tự nhận nhiệm vụ (`use-quest-autoclaim`, gắn toàn app ở RN);
/// - đổi linh vật. Hàng thử thách / huy hiệu dẫn tới `ChallengesView` /
///   `AwardsView` khi được truyền sổ; hàng "Cửa hàng" dẫn tới `ShopView` (sổ dựng
///   tại đây từ `AppServices`, đọc lại ví khi mua / nhận thưởng);
/// - nút "+300 xu" của bản dev (server từ chối khoá `dev:`) — không port.
struct MascotRoomView: View {
  let room: MascotRoomController
  /// Sổ huy chương cho hàng "Huy hiệu" (`nav.push('/awards')`) — B truyền khi nối.
  var awards: AwardsBook? = nil
  /// Sổ thử thách tuần cho hàng "Thử thách" (`nav.push('/challenges')`).
  var challenges: WeeklyChallengesBook? = nil

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.locale) private var locale
  @Environment(AppServices.self) private var services
  @State private var shop: MascotShopBook?
  @State private var burst: Burst?
  @State private var notice: String?
  @State private var celebrate = 0
  /// Thanh DEV: ép một cảm xúc để soát hình (`setDevEmotion`), chỉ bản Debug.
  @State private var devEmotion: KoaEmotion.Emotion?

  struct Burst: Equatable {
    let id: Int
    let amount: Int
  }

  var body: some View {
    content
      .navigationTitle(Text(String(localized: "mr.title")))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .primaryAction) { coinPill }
      }
      .task {
        if shop == nil { shop = services.makeMascotShop(userId: room.userId) }
        await room.load()
        // tủ đồ cho đồ Koa đang mặc trên sân khấu (`equippedOutfits` của RN)
        if let shop, case .loading = shop.phase { await shop.load() }
      }
      .refreshable {
        await room.load()
        await shop?.load()
      }
      .onChange(of: room.welcomeGranted) { _, amount in
        guard let amount else { return }
        say(amount == 1 ? String(localized: "mr.welcome.one") : String(localized: "mr.welcome.other \(amount)"))
        room.welcomeShown()
      }
      .alert(
        String(localized: "mr.error.title"),
        isPresented: Binding(get: { room.actionFailure != nil }, set: { if !$0 { room.clearFailure() } })
      ) {
        Button(String(localized: "common.cancel"), role: .cancel) {}
      } message: {
        Text(room.actionFailure.map(Self.message) ?? "")
      }
  }

  @ViewBuilder private var content: some View {
    switch room.phase {
    case .loading:
      DSLoadingView()
    case .failed(let f):
      if f == .offline {
        DSOfflineView { Task { await room.load() } }
      } else {
        DSErrorView(message: String(localized: "async.error.generic")) { Task { await room.load() } }
      }
    case .ready:
      ScrollView {
        VStack(spacing: DS.Spacing.md) {
          stage
          #if DEBUG
            devBar
          #endif
          if let notice {
            Text(notice)
              .font(DS.TextStyle.footnote)
              .padding(DS.Spacing.sm)
              .frame(maxWidth: .infinity)
              .background(DS.Color.secondary.swiftUI, in: Capsule())
          }
          energyCard
          levelCard
          freezeCard
          journeyCard
          questsCard
          weeklyCard
          counts
        }
        .padding(DS.Spacing.md)
      }
      .background(DS.Color.background.swiftUI)
    }
  }

  // MARK: - Đầu màn

  private var coinPill: some View {
    Label {
      Text(room.balance.formatted(.number.locale(.app))).monospacedDigit()
    } icon: {
      Image(systemName: "circle.circle.fill").foregroundStyle(DS.Color.readinessYellowGraphic.swiftUI)
    }
    .font(DS.TextStyle.footnote.weight(.semibold))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      Text(room.balance == 1 ? String(localized: "mr.balance.one") : String(localized: "mr.balance.other \(room.balance)")))
  }

  #if DEBUG
    /// Thanh DEV của RN (`__DEV__`): ép một cảm xúc để soát hình, mở spec
    /// sheet. Chữ cố ý không dịch — công cụ cho dev, bản Release không có.
    private var devBar: some View {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: DS.Spacing.xs) {
          devChip("auto", on: devEmotion == nil) { devEmotion = nil }
          ForEach(KoaEmotion.devEmotions, id: \.self) { e in
            devChip(e.rawValue, on: devEmotion == e) { devEmotion = e }
          }
          NavigationLink {
            KoaSheetView()
          } label: {
            Text(verbatim: "spec sheet →")
              .font(DS.TextStyle.caption.monospaced())
              .padding(.horizontal, DS.Spacing.sm)
              .padding(.vertical, DS.Spacing.xs)
              .background(DS.Color.secondary.swiftUI, in: Capsule())
          }
        }
      }
    }

    private func devChip(_ label: String, on: Bool, action: @escaping () -> Void) -> some View {
      Button(action: action) {
        Text(verbatim: label)
          .font(DS.TextStyle.caption.monospaced())
          .foregroundStyle(on ? DS.Color.background.swiftUI : DS.Color.foreground.swiftUI)
          .padding(.horizontal, DS.Spacing.sm)
          .padding(.vertical, DS.Spacing.xs)
          .background(on ? DS.Color.foreground.swiftUI : DS.Color.secondary.swiftUI, in: Capsule())
      }
      .buttonStyle(.plain)
      .sensoryFeedback(.selection, trigger: on)
    }
  #endif

  private var stage: some View {
    ZStack(alignment: .top) {
      MascotStage(
        level: room.level, accent: Color(hex: room.rank.colorHex),
        energy: Double(room.energyCount) / Double(MascotRules.energySignals.count),
        streak: room.streak.count, celebrateSignal: celebrate, emotion: devEmotion ?? .idle,
        equipped: shop?.inventory.filter(\.equipped).map(\.itemKey) ?? [])
      if let burst {
        Text(verbatim: "+\(burst.amount)")
          .font(DS.TextStyle.headline.monospacedDigit())
          .padding(.horizontal, DS.Spacing.sm)
          .padding(.vertical, DS.Spacing.xs)
          .background(DS.Color.card.swiftUI, in: Capsule())
          .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
          .id(burst.id)
          .accessibilityHidden(true)
      }
    }
  }

  // MARK: - Năng lượng

  private var energyCard: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        HStack(spacing: DS.Spacing.md) {
          EnergyRing(segments: MascotRules.energySignals.map { (on: room.questDone($0), color: Self.signalColor($0)) })
            .frame(width: 96, height: 96)
            .overlay {
              VStack(spacing: 0) {
                Text(verbatim: "\(room.energyCount)/\(MascotRules.energySignals.count)")
                  .font(DS.TextStyle.title2.monospacedDigit())
                Text(String(localized: "mr.today")).font(DS.TextStyle.caption)
              }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
              Text(String(localized: "mr.energy.a11y \(room.energyCount) \(MascotRules.energySignals.count)")))
          VStack(alignment: .leading, spacing: DS.Spacing.xs) {
            Text(String(localized: "mr.energy")).font(DS.TextStyle.headline)
            Text(Self.headline(room.energyHeadline))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
        HStack(spacing: DS.Spacing.xs) {
          ForEach(MascotRules.energySignals, id: \.self) { q in
            let on = room.questDone(q)
            VStack(spacing: 2) {
              Image(systemName: Self.signalSymbol(q))
                .foregroundStyle(on ? Self.signalColor(q) : DS.Color.mutedForeground.swiftUI)
              Text(Self.signalName(q)).font(DS.TextStyle.caption)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(on ? Self.signalColor(q).opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
            .accessibilityElement(children: .combine)
            .accessibilityValue(Text(Self.signalState(on)))
          }
        }
      }
    }
  }

  // MARK: - Cấp, hạng

  private var levelCard: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack {
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: room.rank.name(lang)).font(DS.TextStyle.headline).foregroundStyle(Color(hex: room.rank.colorHex))
            Text(String(localized: "mr.level \(room.level)")).font(DS.TextStyle.footnote)
          }
          Spacer()
          if room.streak.count >= 2 {
            Label(streakText(room.streak.count), systemImage: "flame.fill")
              .font(DS.TextStyle.caption.weight(.semibold))
              .foregroundStyle(DS.Color.metricOrange.swiftUI)
          }
        }
        ProgressView(value: Double(room.intoLevel), total: Double(MascotRules.levelXp))
          .tint(Color(hex: room.rank.colorHex))
          .accessibilityLabel(Text(String(localized: "mr.level \(room.level)")))
        Text(String(localized: "mr.levelHint \(MascotRules.levelXp - room.intoLevel)"))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
  }

  // MARK: - Băng chuỗi

  private var freezeCard: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack {
          Image(systemName: "snowflake").foregroundStyle(DS.Color.metricBlue.swiftUI).accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "mr.freeze.title")).font(DS.TextStyle.headline)
            Text(String(localized: "mr.freeze.held \(room.freezesHeld) \(MascotRules.freezeMax)"))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Spacer()
          Button {
            Task { await room.buyFreeze() }
          } label: {
            if room.buyingFreeze {
              ProgressView()
            } else if room.freezeFull {
              Text(String(localized: "mr.freeze.full"))
            } else {
              Text(String(localized: "mr.freeze.buy \(MascotRules.freezePrice)"))
            }
          }
          .buttonStyle(.bordered)
          .frame(minHeight: 44)
          .disabled(!room.canBuyFreeze)
        }
        Text(String(localized: "mr.freeze.hint"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        if room.freezesUsed > 0 {
          Text(
            room.freezesUsed == 1
              ? String(localized: "mr.freeze.saved.one") : String(localized: "mr.freeze.saved.other \(room.freezesUsed)")
          )
          .font(DS.TextStyle.caption)
        }
      }
    }
  }

  // MARK: - Hành trình hạng

  private var journeyCard: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text(String(localized: "mr.journey")).font(DS.TextStyle.headline)
        Text(journeySubtitle).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
        ForEach(MascotRules.ranks, id: \.key) { r in
          let current = r.key == room.rank.key
          let reached = room.level >= r.minLevel
          HStack {
            Image(systemName: reached ? "star.fill" : "star")
              .foregroundStyle(reached ? Color(hex: r.colorHex) : DS.Color.mutedForeground.swiftUI)
              .accessibilityHidden(true)
            Text(verbatim: r.name(lang)).font(current ? DS.TextStyle.body.weight(.semibold) : DS.TextStyle.body)
            Spacer()
            Text(String(localized: "mr.level \(r.minLevel)"))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          .accessibilityElement(children: .combine)
          .accessibilityAddTraits(current ? .isSelected : [])
        }
      }
    }
  }

  private var journeySubtitle: String {
    guard let next = room.nextRank else { return String(localized: "mr.maxRank") }
    let n = next.minLevel - room.level
    return n == 1
      ? String(localized: "mr.levelsToRank.one \(next.name(lang))")
      : String(localized: "mr.levelsToRank.other \(n) \(next.name(lang))")
  }

  // MARK: - Nhiệm vụ

  private var questsCard: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text(String(localized: "mr.quests")).font(DS.TextStyle.headline)
        Text(String(localized: "mr.quests.hint")).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
        ForEach(room.activeQuests, id: \.key) { q in
          let claimed = room.isClaimed(MascotRules.questRefKey(room.today, q.key))
          rewardRow(
            title: q.name(lang, stepsGoal: room.stepsGoal), coins: q.coins, xp: q.xp, claimed: claimed
          ) {
            // Không có nút: nhiệm vụ tự nhận ở nơi khác (RN). Xong mà chưa nhận → "…".
            Text(verbatim: room.questDone(q.key) ? "…" : "—")
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .accessibilityLabel(Text(Self.questState(done: room.questDone(q.key))))
          }
        }
        if room.showsStreakBonus {
          rewardRow(
            title: streakText(room.streak.count), coins: room.streakBonus, xp: MascotRules.streakXp,
            claimed: room.isClaimed(room.streakRefKey)
          ) {
            Button(String(localized: "mr.claim")) {
              Task { await claimStreak() }
            }
            .buttonStyle(.borderedProminent)
            .frame(minHeight: 44)
            .disabled(room.claiming)
          }
        }
      }
    }
  }

  private func rewardRow<Action: View>(
    title: String, coins: Int, xp: Int, claimed: Bool, @ViewBuilder action: () -> Action
  ) -> some View {
    HStack {
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: title)
          .strikethrough(claimed)
          .foregroundStyle(claimed ? DS.Color.mutedForeground.swiftUI : DS.Color.foreground.swiftUI)
        Text(verbatim: "+\(coins) · +\(xp) XP")
          .font(DS.TextStyle.caption.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      Spacer()
      if claimed {
        Label(String(localized: "mr.claimed"), systemImage: "checkmark")
          .font(DS.TextStyle.caption.weight(.semibold))
          .foregroundStyle(DS.Color.readinessGreen.swiftUI)
      } else {
        action()
      }
    }
    .frame(minHeight: 44)
    .accessibilityElement(children: .combine)
  }

  // MARK: - Thử thách tuần (biên nhận)

  @ViewBuilder private var weeklyCard: some View {
    let done = room.completedChallenges
    if !done.isEmpty {
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          Text(String(localized: "mr.weekly")).font(DS.TextStyle.headline)
          ForEach(done) { ch in
            let paid = ch.paid
            rewardRow(title: ChallengeText.title(ch.key, lang: lang) ?? ch.title, coins: paid.coins, xp: paid.xp, claimed: true) {
              EmptyView()
            }
          }
        }
      }
    }
  }

  /// Số thử thách đã xong / tổng; số huy hiệu — mỗi hàng dẫn tới màn của nó khi có sổ.
  private var counts: some View {
    DSCard {
      VStack(spacing: DS.Spacing.sm) {
        if let challenges {
          NavigationLink {
            ChallengesView(book: challenges, lang: lang)
          } label: {
            challengesRow
          }
        } else {
          challengesRow
        }
        if let awards {
          NavigationLink {
            AwardsView(book: awards, lang: lang)
          } label: {
            awardsRow
          }
        } else {
          awardsRow
        }
        if let shop {
          NavigationLink {
            ShopView(book: shop, lang: lang) { Task { await room.load() } }
          } label: {
            LabeledContent(String(localized: "shop.title")) {
              Image(systemName: "bag.fill").accessibilityHidden(true)
            }
          }
        }
      }
    }
  }

  private var challengesRow: some View {
    LabeledContent(String(localized: "mr.challenges")) {
      if let all = room.challenges, !all.isEmpty {
        Text(verbatim: "\(all.filter(\.completed).count)/\(all.count)").monospacedDigit()
      } else {
        Text(verbatim: "—")
      }
    }
  }

  private var awardsRow: some View {
    LabeledContent(String(localized: "mr.awards")) {
      Text(verbatim: room.awardCount.map { $0 > 0 ? String($0) : "—" } ?? "—").monospacedDigit()
    }
  }

  // MARK: - Việc

  private func claimStreak() async {
    guard let outcome = await room.claimStreakBonus() else { return }
    show(burst: outcome.amount)
    if let rank = outcome.newRank {
      say(String(localized: "mr.rankUp \(rank.name(lang))"))
    } else if let level = outcome.newLevel {
      say(String(localized: "mr.levelUp \(level)"))
    } else {
      celebrate += 1
    }
  }

  private func show(burst amount: Int) {
    let next = Burst(id: (burst?.id ?? 0) + 1, amount: amount)
    withAnimation(DSMotion.animation(.easeOut(duration: 0.3), reduceMotion: reduceMotion)) { burst = next }
    Task {
      try? await Task.sleep(for: .seconds(1.1))
      if burst == next {
        // reduceMotion: `DSMotion.animation` trả nil — biến mất ngay.
        withAnimation(DSMotion.animation(.easeIn(duration: 0.3), reduceMotion: reduceMotion)) { burst = nil }
      }
    }
  }

  /// Thay toast của RN: một dòng dưới sân khấu + VoiceOver, tự ẩn.
  private func say(_ text: String) {
    notice = text
    AccessibilityNotification.Announcement(text).post()
    Task {
      try? await Task.sleep(for: .seconds(3))
      if notice == text { notice = nil }
    }
  }

  private var lang: AppPreferences.Lang {
    AppPreferences.Lang(rawValue: String(locale.identifier.prefix(2))) ?? .en
  }

  private func streakText(_ n: Int) -> String {
    n == 1 ? String(localized: "mr.streak.one") : String(localized: "mr.streak.other \(n)")
  }

  // MARK: - Chữ, màu

  static func headline(_ h: MascotRules.EnergyHeadline) -> String {
    switch h {
    case .empty: String(localized: "mr.energy.empty")
    case .low: String(localized: "mr.energy.low")
    case .mid: String(localized: "mr.energy.mid")
    case .full: String(localized: "mr.energy.full")
    }
  }

  static func signalState(_ on: Bool) -> String {
    on ? String(localized: "mr.signal.done") : String(localized: "mr.signal.notDone")
  }

  /// Xong mà chưa nhận ("…") hay chưa xong ("—").
  static func questState(done: Bool) -> String {
    done ? String(localized: "mr.quest.collecting") : String(localized: "mr.quest.notDone")
  }

  static func signalName(_ q: MascotRules.Quest) -> String {
    switch q {
    case .meal: String(localized: "mr.signal.meal")
    case .workout: String(localized: "mr.signal.workout")
    case .water: String(localized: "mr.signal.water")
    case .sleep: String(localized: "mr.signal.sleep")
    case .steps: String(localized: "mr.signal.steps")
    }
  }

  static func signalSymbol(_ q: MascotRules.Quest) -> String {
    switch q {
    case .meal: "fork.knife"
    case .workout: "dumbbell.fill"
    case .water: "drop.fill"
    case .sleep: "moon.fill"
    case .steps: "figure.walk"
    }
  }

  /// Cùng token với RN (`SIGNAL_META`).
  static func signalColor(_ q: MascotRules.Quest) -> Color {
    switch q {
    case .meal: DS.Color.metricOrangeGraphic.swiftUI
    case .workout: DS.Color.metricRose.swiftUI
    case .water: DS.Color.metricCyan.swiftUI
    case .sleep: DS.Color.metricPurple.swiftUI
    case .steps: DS.Color.readinessGreen.swiftUI
    }
  }

  static func message(_ f: MascotFailure) -> String {
    switch f {
    case .offline: String(localized: "auth.error.network")
    case .notSignedIn: String(localized: "mr.error.signedOut")
    case .insufficientCoins: String(localized: "mr.error.coins")
    case .freezeLimit: String(localized: "mr.error.freezeLimit")
    case .dailyCeiling: String(localized: "mr.error.ceiling")
    case .alreadyOwned: String(localized: "shop.error.owned")
    case .unknownReward, .unknownItem, .server: String(localized: "auth.error.generic")
    }
  }
}

/// Vòng năng lượng (`EnergyRing`): năm cung, cung nào xong thì sáng màu của nó.
struct EnergyRing: View {
  let segments: [(on: Bool, color: Color)]

  var body: some View {
    Canvas { ctx, size in
      let n = max(segments.count, 1)
      let lineWidth: CGFloat = 10
      let rect = CGRect(origin: .zero, size: size).insetBy(dx: lineWidth / 2, dy: lineWidth / 2)
      let gap = 6.0
      for (i, s) in segments.enumerated() {
        let start = -90.0 + Double(i) * 360 / Double(n) + gap / 2
        let end = -90.0 + Double(i + 1) * 360 / Double(n) - gap / 2
        var path = Path()
        path.addArc(
          center: CGPoint(x: rect.midX, y: rect.midY), radius: rect.width / 2, startAngle: .degrees(start),
          endAngle: .degrees(end), clockwise: false)
        ctx.stroke(
          path, with: .color(s.on ? s.color : DS.Color.ringTrack.swiftUI.opacity(0.4)),
          style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
      }
    }
  }
}

/// Sân khấu của Koa. Koa là `MascotFigureView` thật (#527 K4: bộ dựng của
/// `KoaFigure`), mặc đúng đồ trong tủ, gật đầu khi vừa nhận thưởng
/// (`acknowledge` của `stage-renderer.tsx`: nghiêng 6° rồi lò xo về, phóng
/// 1,03). CHƯA có phần còn lại của `MascotScene` / `StageRenderer` — studio,
/// cây, côn trùng, cái liếc, cảm xúc tự chọn của engine (`useMascotEmotion`):
/// vòng năng lượng sau lưng giữ chỗ cho đèn của studio.
struct MascotStage: View {
  let level: Int
  let accent: Color
  /// 0…1 — số tín hiệu đã xong / năm.
  let energy: Double
  let streak: Int
  let celebrateSignal: Int
  var emotion: KoaEmotion.Emotion = .idle
  /// Khoá đang mặc, theo thứ tự hàng của `mascot_inventory`.
  var equipped: [String] = []

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private struct Nod {
    var angle = 0.0
    var scale = 1.0
  }

  var body: some View {
    VStack(spacing: DS.Spacing.xs) {
      ZStack(alignment: .bottom) {
        Circle()
          .fill(accent.opacity(0.12))
          .frame(width: 180, height: 180)
        Circle()
          .trim(from: 0, to: energy)
          .stroke(accent, style: StrokeStyle(lineWidth: 6, lineCap: .round))
          .rotationEffect(.degrees(-90))
          .padding(6)
          .frame(width: 180, height: 180)
        MascotFigureView(emotion: emotion, equipped: equipped, size: 150)
          // reduceMotion: giá trị không đổi thì không gật
          .keyframeAnimator(initialValue: Nod(), trigger: reduceMotion ? 0 : celebrateSignal) { view, v in
            view.rotationEffect(.degrees(v.angle), anchor: .bottom).scaleEffect(v.scale, anchor: .bottom)
          } keyframes: { _ in
            KeyframeTrack(\.angle) {
              CubicKeyframe(6, duration: 0.2)
              SpringKeyframe(0, spring: .init(mass: 1, stiffness: 160, damping: 14))
            }
            KeyframeTrack(\.scale) {
              LinearKeyframe(1.03, duration: 0.18)
              SpringKeyframe(1, spring: .init(mass: 1, stiffness: 180, damping: 14))
            }
          }
      }
      Text(String(localized: "mr.level \(level)")).font(DS.TextStyle.caption.weight(.semibold))
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, DS.Spacing.md)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(String(localized: "mr.stage.a11y \(level)")))
  }
}

/// Chữ thử thách tuần (`CHALLENGE_TEXT`: tên, mô tả, phần thưởng), chép máy
/// vào `challenge-text.json` (`apps/ios/tools/challenge-text/gen.mjs --check`).
enum ChallengeText {
  private struct File: Decodable {
    let titles: [String: [String: String]]
    let descs: [String: [String: String]]
    let rewards: [String: [String: String]]
  }

  private static let file: File? = {
    guard let url = Bundle.main.url(forResource: "challenge-text", withExtension: "json"),
      let data = try? Data(contentsOf: url)
    else { return nil }
    return try? JSONDecoder().decode(File.self, from: data)
  }()

  /// `nil` khi khoá lạ — màn dùng tiêu đề đã lưu trong hàng (`t ? … : ch.title`).
  static func title(_ key: String, lang: AppPreferences.Lang) -> String? { file?.titles[key]?[lang.rawValue] }
  static func desc(_ key: String, lang: AppPreferences.Lang) -> String? { file?.descs[key]?[lang.rawValue] }
  static func reward(_ key: String, lang: AppPreferences.Lang) -> String? { file?.rewards[key]?[lang.rawValue] }

  /// Tiếng Anh — giá trị lịch sử ghi vào hàng gieo (RN: `t.title.en`, …).
  static func english(_ key: String) -> (title: String, desc: String, reward: String) {
    (file?.titles[key]?["en"] ?? key, file?.descs[key]?["en"] ?? "", file?.rewards[key]?["en"] ?? "")
  }
}

extension Color {
  /// "#rrggbb" — màu nhấn của hạng (`RANKS[].color`), cố định như RN.
  init(hex: String) {
    let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    let v = UInt32(s, radix: 16) ?? 0x8b93a4
    self.init(
      red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
  }
}
