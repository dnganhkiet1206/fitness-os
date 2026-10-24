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
  /// Tủ đồ dùng chung với Hôm nay (thay đồ ở đây, Koa ngoài kia đổi theo).
  var sharedShop: MascotShopBook? = nil
  @Environment(ProfileBook.self) private var profile: ProfileBook?

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.locale) private var locale
  @Environment(AppServices.self) private var services
  /// Lịch tuần + buổi đã ghi cho "Tuần của Koa" (GĐ2); `nil` ở preview.
  @Environment(WorkoutFlow.self) private var flow: WorkoutFlow?
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
      // Thiết kế lại 15/10 (chủ dự án: "redesign toàn bộ, bản cũ chỉ là đối chiếu"):
      // tiêu đề lớn trong nội dung như mọi tab, thanh điều hướng chỉ còn nút lùi.
      .navigationTitle(Text(verbatim: ""))
      .navigationBarTitleDisplayMode(.inline)
      .task {
        if shop == nil { shop = sharedShop ?? services.makeMascotShop(userId: room.userId) }
        shop?.gains = room.gains
        await room.load()
        await services.koaWeek(userId: room.userId)?.claimIfComplete(koaWeekState)
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
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          header
          stage
          #if DEBUG
            devBar
          #endif
          if let notice {
            Text(notice)
              .font(DS.TextStyle.footnote.weight(.semibold))
              .padding(.horizontal, DS.Spacing.md)
              .padding(.vertical, DS.Spacing.sm)
              .frame(maxWidth: .infinity)
              .dsCard(radius: 22)
          }
          sectionTitle(String(localized: "mr.sec.today"))
          energyCard
          sectionTitle(String(localized: "mr.sec.rank"))
          rankCard
          sectionTitle(String(localized: "mr.sec.streak"))
          streakCard
          sectionTitle(String(localized: "mr.quests"))
          questsCard
          weeklyCard
          sectionTitle(String(localized: "mr.sec.more"))
          shortcuts
        }
        .padding(DS.Spacing.md)
      }
      .background { TodayAmbient(accent: nil) }
      .statusBarScrim()
    }
  }

  // MARK: - Đầu màn

  /// Tiêu đề lớn + số xu (viên kính) bên phải.
  private var header: some View {
    HStack(alignment: .center) {
      Text(String(localized: "mr.title"))
        .font(.largeTitle.bold())
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: DS.Spacing.sm)
      coinPill
        .padding(.horizontal, 14)
        .frame(height: 40)
        .dsCard(radius: 20)
    }
  }

  private func sectionTitle(_ t: String) -> some View {
    Text(verbatim: t)
      .font(.system(size: 22, weight: .bold))
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .accessibilityAddTraits(.isHeader)
      .padding(.top, DS.Spacing.sm)
  }

  private var coinPill: some View {
    // như ô số dư của `ShopView`: `Label` + `.titleAndIcon`, không gói thành
    // `accessibilityElement(children: .ignore)` — gói như thế thì thanh công cụ
    // iOS 26 chỉ còn vẽ biểu tượng; số xu phải hiện như ô `Coin` của RN.
    Label {
      Text(verbatim: room.balance.formatted(.number.locale(.app)))
    } icon: {
      Image(systemName: "circle.circle.fill").foregroundStyle(DS.Color.readinessYellowGraphic.swiftUI)
    }
    .labelStyle(.titleAndIcon)
    .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
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
              .font(DS.TextStyle.rounded(.caption2, weight: .medium))
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
          .font(DS.TextStyle.rounded(.caption2, weight: .medium))
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
        level: room.level, build: room.gains.rank,
        energy: Double(room.energyCount) / Double(MascotRules.energySignals.count),
        streak: room.streak.count, celebrateSignal: celebrate, emotion: devEmotion ?? mood,
        equipped: shop?.inventory.filter(\.equipped).map(\.itemKey) ?? [])
        // Thẻ sân khấu bo góc (thay cảnh tràn ngang + mép tan của RN).
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: 28, style: .continuous)
            .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.08), lineWidth: 0.75)
        }
        .shadow(color: .black.opacity(0.08), radius: 18, y: 8)
      if let burst {
        Text(verbatim: "+\(burst.amount)")
          .font(DS.TextStyle.headline.monospacedDigit())
          .padding(.horizontal, DS.Spacing.sm)
          .padding(.vertical, DS.Spacing.xs)
          .dsCard(radius: 16)
          .padding(.top, DS.Spacing.sm)
          .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
          .id(burst.id)
          .accessibilityHidden(true)
      }
    }
  }

  /// Nét mặt của ngày (Koa đợt 1) — CÙNG bộ máy với Koa ở Hôm nay.
  private var mood: KoaEmotion.Emotion {
    KoaToday.read(
      room: room, localWaterMl: nil, profile: profile?.profile,
      riskHour: KoaToday.riskHour(services.habitHours, userId: room.userId),
      hour: Calendar.current.component(.hour, from: .now)
    ).emotion
  }

  // MARK: - Năng lượng

  /// `energyCard` của RN: vòng 104 (nét 10) mỗi đoạn một tín hiệu, giữa là
  /// "3/5" + "HÔM NAY"; dưới là năm ô — nền xám, xong thì tô màu tín hiệu.
  private var energyCard: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        HStack(spacing: DS.Spacing.md) {
          EnergyRing(segments: MascotRules.energySignals.map { (on: room.questDone($0), color: Self.signalColor($0)) })
            .frame(width: 104, height: 104)
            .overlay {
              VStack(spacing: 3) {
                (Text(verbatim: "\(room.energyCount)")
                  .font(.system(size: 26, weight: .heavy).monospacedDigit())
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                  + Text(verbatim: "/\(MascotRules.energySignals.count)")
                  .font(DS.TextStyle.footnote.weight(.bold))
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI))
                Text(String(localized: "mr.today"))
                  .font(.system(size: 11, weight: .bold))
                  .tracking(1.5)
                  .textCase(.uppercase)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
              Text(String(localized: "mr.energy.a11y \(room.energyCount) \(MascotRules.energySignals.count)")))
          VStack(alignment: .leading, spacing: 4) {
            Text(String(localized: "mr.energy")).font(DS.TextStyle.headline)
            Text(Self.headline(room.energyHeadline))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
        HStack(spacing: 6) {
          ForEach(MascotRules.energySignals, id: \.self) { q in
            let on = room.questDone(q)
            let color = Self.signalColor(q)
            VStack(spacing: 4) {
              Image(systemName: Self.signalSymbol(q))
                .font(.system(size: 15))
                .foregroundStyle(on ? color : DS.Color.mutedForeground.swiftUI)
              Text(Self.signalName(q))
                .font(DS.TextStyle.caption.weight(.semibold))
                .foregroundStyle(on ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }
            .padding(.vertical, DS.Spacing.sm)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(
              on ? color.opacity(0.14) : DS.Color.foreground.swiftUI.opacity(0.05),
              in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityElement(children: .combine)
            .accessibilityValue(Text(Self.signalState(on)))
          }
        }
      }
    }
  }

  // MARK: - Cấp, hạng

  /// `levelCard` của RN: huy hiệu sao + số cấp tô màu hạng; tên hạng đậm màu
  /// hạng cạnh "Cấp N"; thanh 6 điểm màu hạng trên rãnh xám; còn bao nhiêu XP.
  /// Hạng (thiết kế lại 15/10): cấp + thanh XP + trục hạng trong MỘT thẻ (trước là
  /// hai thẻ "Cấp" và "Hành trình").
  private var rankCard: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        levelRow
        Divider().opacity(0.6)
        journeySub
        RankJourneyView(ranks: MascotRules.ranks, currentKey: gainsRank.key, lang: lang)
      }
    }
  }

  /// Hạng theo Gains (GĐ2) — CÙNG hạng của vóc dáng Koa; cấp XP rời giao diện.
  private var gainsRank: MascotRules.Rank {
    MascotRules.ranks[min(room.gains.rank, MascotRules.ranks.count - 1)]
  }

  /// Hạng + Gains (GĐ2, mock `gd2-progress-koa-week.html`): tên hạng màu hạng, số
  /// Gains, thanh tới hạng kế, "còn N Gains tới …". Không còn "Cấp N" / XP.
  private var levelRow: some View {
    let rank = gainsRank
    let rankColor = Color(hex: rank.colorHex)
    let pct = KoaGains.toNext(room.gains.points).map { Double($0.have) / Double(max(1, $0.need)) } ?? 1
    return HStack(spacing: DS.Spacing.md) {
      Image(systemName: "dumbbell.fill")
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(rankColor)
        .frame(width: 46, height: 46)
        .background(rankColor.opacity(0.13), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(rankColor.opacity(0.33), lineWidth: 1))
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 6) {
        HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
          Text(verbatim: rank.name(lang))
            .font(DS.TextStyle.headline.weight(.heavy))
            .foregroundStyle(rankColor)
          Text(String(localized: "mr.gains.points \(room.gains.points)"))
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Spacer(minLength: 0)
        }
        GeometryReader { g in
          ZStack(alignment: .leading) {
            Capsule().fill(DS.Color.secondary.swiftUI)
            Capsule().fill(rankColor).frame(width: g.size.width * min(1, max(0, pct)))
          }
        }
        .frame(height: 6)
        .accessibilityElement()
        .accessibilityLabel(Text(verbatim: rank.name(lang)))
        .accessibilityValue(Text(verbatim: "\(Int((pct * 100).rounded()))%"))
      }
    }
  }

  // MARK: - Băng chuỗi

  /// Chuỗi (thiết kế lại 15/10): số ngày lớn + thưởng chuỗi (nút nhận duy nhất) +
  /// băng chuỗi — mọi thứ về chuỗi ở một thẻ (trước rải ở thẻ cấp, nhiệm vụ, băng).
  private var streakCard: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        HStack(spacing: DS.Spacing.md) {
          Image(systemName: "flame.fill")
            .font(.system(size: 26, weight: .semibold))
            .foregroundStyle(DS.Color.metricOrangeGraphic.swiftUI)
            .frame(width: 52, height: 52)
            .background(DS.Color.metricOrange.swiftUI.opacity(0.13), in: Circle())
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: streakText(room.streak.count))
              .font(.system(size: 22, weight: .bold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
          }
          Spacer(minLength: 0)
        }
        if room.showsStreakBonus {
          rewardRow(
            title: String(localized: "mr.streak.bonus"), coins: room.streakBonus,
            claimed: room.isClaimed(room.streakRefKey), flame: true
          ) {
            Button {
              Task { await claimStreak() }
            } label: {
              Text(String(localized: "mr.claim"))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(DS.Color.background.swiftUI)
                .padding(.horizontal, 18)
                .frame(minHeight: 40)
                .background(DS.Color.foreground.swiftUI, in: Capsule())
            }
            .buttonStyle(TodayPressStyle())
            .frame(minHeight: 44)
            .disabled(room.claiming)
          }
        }
        Divider().opacity(0.6)
        HStack(spacing: DS.Spacing.sm) {
          Image(systemName: "snowflake")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(DS.Color.metricBlue.swiftUI)
            .frame(width: 32, height: 32)
            .background(DS.Color.metricBlue.swiftUI.opacity(0.12), in: Circle())
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 1) {
            Text(String(localized: "mr.freeze.title")).font(DS.TextStyle.headline)
            Text(String(localized: "mr.freeze.held \(room.freezesHeld) \(MascotRules.freezeMax)"))
              .font(DS.TextStyle.caption.weight(.semibold))
              .foregroundStyle(DS.Color.metricBlue.swiftUI)
            Text(String(localized: "mr.freeze.hint"))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .fixedSize(horizontal: false, vertical: true)
          }
          Spacer(minLength: DS.Spacing.sm)
          Button {
            Task { await room.buyFreeze() }
          } label: {
            Group {
              if room.buyingFreeze {
                ProgressView()
              } else if room.freezeFull {
                Text(String(localized: "mr.freeze.full"))
              } else {
                Text(String(localized: "mr.freeze.buy \(MascotRules.freezePrice)"))
              }
            }
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .padding(.horizontal, 14)
            .frame(minHeight: 36)
            .overlay(Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.18), lineWidth: 1))
          }
          .buttonStyle(TodayPressStyle())
          .opacity(room.canBuyFreeze || room.buyingFreeze ? 1 : 0.45)
          .frame(minHeight: 44)
          .disabled(!room.canBuyFreeze)
        }
        if room.freezesUsed > 0 {
          Text(
            room.freezesUsed == 1
              ? String(localized: "mr.freeze.saved.one") : String(localized: "mr.freeze.saved.other \(room.freezesUsed)")
          )
          .font(DS.TextStyle.caption.weight(.semibold))
          .foregroundStyle(DS.Color.metricBlue.swiftUI)
        }
      }
    }
  }

  // MARK: - Hành trình hạng

  private var journeySub: some View {
    Text(journeySubtitle)
      .font(DS.TextStyle.footnote)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }

  private var journeySubtitle: AttributedString {
    // GĐ2: hạng kế tiếp theo Gains (trước lấy theo cấp XP — lệch với số Gains bên dưới).
    let ranks = MascotRules.ranks
    guard room.gains.rank + 1 < ranks.count else { return AttributedString(String(localized: "mr.maxRank")) }
    let next = ranks[room.gains.rank + 1]
    // Hạng theo Gains (#527 đợt 1): còn bao nhiêu Gains — chỉ tập mới cộng.
    let n = KoaGains.toNext(room.gains.points).map { $0.need - $0.have } ?? 0
    let name = next.name(lang)
    var a = AttributedString(String(localized: "koa.gains.toRank \(n) \(name)"))
    if let r = a.range(of: name, options: .backwards) {
      a[r].foregroundColor = Color(hex: next.colorHex)
      a[r].font = DS.TextStyle.footnote.weight(.bold)
    }
    return a
  }

  // MARK: - Nhiệm vụ

  private var questsCard: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text(String(localized: "mr.quests.hint")).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
        ForEach(room.activeQuests, id: \.key) { q in
          let claimed = room.isClaimed(MascotRules.questRefKey(room.today, q.key))
          rewardRow(
            title: q.name(lang, stepsGoal: room.stepsGoal), coins: q.coins, claimed: claimed
          ) {
            // Không có nút: nhiệm vụ tự nhận ở nơi khác. Vòng rỗng = chưa làm; vòng
            // tô = đã làm, đang chờ nhận (thiết kế lại 15/10, thay "—" / "…").
            Image(systemName: room.questDone(q.key) ? "circle.inset.filled" : "circle")
              .font(.system(size: 20))
              .foregroundStyle(
                room.questDone(q.key) ? DS.Color.readinessGreen.swiftUI : DS.Color.mutedForeground.swiftUI.opacity(0.5))
              .accessibilityLabel(Text(Self.questState(done: room.questDone(q.key))))
          }
        }
      }
    }
  }

  /// Một hàng thưởng (`questRow` của RN): tên (đã nhận thì mờ đi), dưới là
  /// đồng xu + "+N" vàng; bên phải "✓ Đã nhận" xanh hoặc việc. GĐ2: bỏ "+N XP" —
  /// Gains là thang tiến bộ duy nhất ra giao diện; XP vẫn cộng ở server.
  private func rewardRow<Action: View>(
    title: String, coins: Int, claimed: Bool, flame: Bool = false, @ViewBuilder action: () -> Action
  ) -> some View {
    HStack(spacing: DS.Spacing.md) {
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 6) {
          if flame {
            Image(systemName: "flame.fill").font(.footnote)
              .foregroundStyle(DS.Color.metricOrangeGraphic.swiftUI)
              .accessibilityHidden(true)
          }
          Text(verbatim: title)
            .font(DS.TextStyle.body)
            .foregroundStyle(claimed ? DS.Color.mutedForeground.swiftUI : DS.Color.foreground.swiftUI)
        }
        HStack(spacing: 4) {
          Image(systemName: "circle.circle.fill").font(.system(size: 11))
            .foregroundStyle(DS.Color.readinessYellowGraphic.swiftUI)
            .accessibilityHidden(true)
          Text(verbatim: "+\(coins)")
            .foregroundStyle(DS.Color.readinessYellow.swiftUI)
        }
        .font(DS.TextStyle.caption.weight(.bold).monospacedDigit())
      }
      Spacer(minLength: 0)
      if claimed {
        HStack(spacing: 4) {
          Image(systemName: "checkmark").font(.system(size: 12, weight: .heavy))
          Text(String(localized: "mr.claimed"))
        }
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.readinessGreen.swiftUI)
      } else {
        action()
      }
    }
    .frame(minHeight: 44)
    .accessibilityElement(children: .combine)
  }

  // MARK: - Thử thách tuần (biên nhận)

  /// "Tuần của Koa" (GĐ2) thay thẻ thử thách tuần chung.
  @ViewBuilder private var weeklyCard: some View {
    if let state = koaWeekState {
      KoaWeekCard(state: state, claim: services.koaWeek(userId: room.userId)?.claim ?? .notYet)
    }
  }

  private var koaWeekState: KoaWeek.State? {
    guard let flow else { return nil }
    return KoaWeek.state(today: flow.today.today, library: flow.today.library, trained: flow.today.trained)
  }

  /// Khám phá thêm (thiết kế lại 15/10): ba ô — Tủ đồ, Thử thách, Huy hiệu — mỗi ô
  /// một biểu tượng màu, tên và số; ô nào chưa có sổ thì không bấm được.
  private var shortcuts: some View {
    let awardValue = room.awardCount.flatMap { $0 > 0 ? String($0) : nil }
    return HStack(spacing: DS.Spacing.sm) {
      if let shop {
        NavigationLink {
          ShopView(book: shop, lang: lang) { Task { await room.load() } }
        } label: {
          ShortcutTile(symbol: "tshirt.fill", tint: DS.Color.metricPurple.swiftUI, label: String(localized: "shop.title"), value: nil)
        }
        .buttonStyle(TodayPressStyle())
      }
      if let awards {
        NavigationLink {
          AwardsView(book: awards, lang: lang)
        } label: {
          ShortcutTile(
            symbol: "medal.fill", tint: DS.Color.readinessYellowGraphic.swiftUI, label: String(localized: "mr.awards"),
            value: awardValue)
        }
        .buttonStyle(TodayPressStyle())
      }
    }
    .fixedSize(horizontal: false, vertical: true)
  }

  // MARK: - Việc

  private func claimStreak() async {
    guard let outcome = await room.claimStreakBonus() else { return }
    show(burst: outcome.amount)
    // GĐ2: hạng theo Gains (lên hạng mừng ở Hôm nay); cấp XP không còn ra giao diện.
    celebrate += 1
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
    case .recovery: String(localized: "mr.signal.recovery")
    }
  }

  static func signalSymbol(_ q: MascotRules.Quest) -> String {
    switch q {
    case .meal: "fork.knife"
    case .workout: "dumbbell.fill"
    case .water: "drop.fill"
    case .sleep: "moon.fill"
    case .steps: "figure.walk"
    case .recovery: "bed.double.fill"
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
    case .recovery: DS.Color.metricPurple.swiftUI
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
  /// Nét và khe (độ) — phòng linh vật 10 / 6; vòng nhỏ trên Today 8 / 8 (RN `size 64, stroke 8`).
  var lineWidth: CGFloat = 10
  var gap = 6.0

  var body: some View {
    Canvas { ctx, size in
      let n = max(segments.count, 1)
      let rect = CGRect(origin: .zero, size: size).insetBy(dx: lineWidth / 2, dy: lineWidth / 2)
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

/// Sân khấu của linh vật (#527, S1) — `StageRenderer` của RN: căn phòng studio
/// (`StudioBackdrop`, VẼ LẠI theo bản RN, Kiệt đồng ý) phủ ngang cả màn, Koa
/// đứng ở chỗ đứng trên bục (`STAGE_MARK`) với đúng cỡ / độ dời của RN, mép
/// tan vào nền trang (`stageFadeV` / `stageFadeH`). Skin theo sân khấu đang
/// mặc, sàn + bục sáng theo năng lượng, thẻ chuỗi, trăng theo ngày. Gật đầu
/// khi vừa nhận thưởng (`acknowledge`: nghiêng 6° rồi lò xo về, phóng 1,03).
/// CHƯA có: cây / bụi sáng chuyển động (`PlantsCanvas`, `Motes` — ở đây đứng
/// yên), côn trùng, cái liếc, cảm xúc tự chọn của engine (`useMascotEmotion`).
struct MascotStage: View {
  let level: Int
  /// Hạng vóc dáng (Gains) của Koa trên sân khấu.
  var build = 0
  /// 0…1 — số tín hiệu đã xong / năm.
  let energy: Double
  let streak: Int
  let celebrateSignal: Int
  var emotion: KoaEmotion.Emotion = .idle
  /// Khoá đang mặc, theo thứ tự hàng của `mascot_inventory`.
  var equipped: [String] = []

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.colorScheme) private var scheme
  @Environment(\.locale) private var locale
  /// Ngôn ngữ của chữ vẽ trên tranh trong phòng.
  private var lang: String { String(locale.identifier.prefix(2)) }

  private struct Nod {
    var angle = 0.0
    var scale = 1.0
  }

  private var studio: StudioScene.Options {
    var o = StudioScene.Options()
    o.skin = StudioScene.skinKey(equipped: Set(equipped))
    o.energy = energy
    o.streak = streak
    o.moon = StudioScene.moonPhase(.now)
    o.label = "Koa"
    // Phòng ban ngày ở giao diện sáng (15/10 — trước đây chỉ có cảnh đêm).
    o.light = scheme == .light
    // Bản tối giữ nguyên đèn treo như cũ; ban ngày tắt đèn (15/10, chủ dự án: "đèn
    // và koa bản cũ phải giữ y nguyên ở bản tối, bản buổi sáng mới là tắt đèn").
    // Cả hai bản có lớp chiều sâu.
    o.lamp = scheme == .dark
    o.depth = true
    o.lang = lang
    return o
  }

  /// `HERO_W = round(128 / 0.93)`.
  private static let heroWidth = 138.0

  var body: some View {
    // không có dòng "Cấp N" dưới sân khấu (RN cũng không) — thẻ cấp ngay dưới nói rồi
    StudioBackdrop(options: studio)
      .overlay { GeometryReader { g in hero(g.size.width) } }
      .aspectRatio(StudioScene.width / StudioScene.sceneBottom, contentMode: .fit)
      .frame(maxWidth: .infinity)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(String(localized: "mr.stage.a11y \(level)")))
  }

  /// Koa đứng trên bục: `size = round(HERO_W·k)`, đỉnh ở `412k − 1,25·size + 6k`.
  private func hero(_ width: CGFloat) -> some View {
    let k: Double = Double(width) / StudioScene.width
    let size: Double = (Self.heroWidth * k).rounded()
    let left: Double = StudioScene.stageMark.x * k - size / 2
    let top: Double = StudioScene.stageMark.y * k - size * KoaMath.aspect + 6 * k
    let levelScale: Double = min(1 + Double(level - 1) * 0.012, 1.1)
    return MascotFigureView(emotion: emotion, equipped: equipped, size: size, build: build, interactive: true)
      .scaleEffect(levelScale, anchor: .bottom)
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
      .offset(x: left, y: top)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

/// Căn phòng studio (#527, S1): `StudioScene.tree` → `KoaPaint` → `Canvas`,
/// toạ độ 390 phủ theo bề ngang (`xMidYMin slice` của RN).
struct StudioBackdrop: View {
  let options: StudioScene.Options

  var body: some View {
    let plan = KoaPaint.plan(KoaRender.Element("Svg", kids: StudioScene.tree(options)))
    Canvas { ctx, canvas in
      var c = ctx
      let k = canvas.width / StudioScene.width
      c.concatenate(CGAffineTransform(scaleX: k, y: k))
      KoaCanvas.draw(plan, in: &c)
    }
    .accessibilityHidden(true)
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

/// Một ô "Khám phá thêm": biểu tượng màu trong vòng tròn, tên, số (nếu có).
private struct ShortcutTile: View {
  let symbol: String
  let tint: Color
  let label: String
  let value: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Image(systemName: symbol)
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(tint)
        .frame(width: 36, height: 36)
        .background(tint.opacity(0.13), in: Circle())
      Spacer(minLength: 0)
      Text(label)
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .lineLimit(2)
        .minimumScaleFactor(0.85)
      Text(verbatim: value ?? " ")
        .font(.system(size: 13).monospacedDigit())
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .padding(12)
    .frame(maxWidth: .infinity, minHeight: 116, alignment: .topLeading)
    .dsCard(radius: 20)
    .contentShape(Rectangle())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: value.map { "\(label), \($0)" } ?? label))
    .accessibilityAddTraits(.isButton)
  }
}
