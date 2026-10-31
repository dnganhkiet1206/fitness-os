import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Phòng linh vật (#527 Phase 7) — `app/mascot-room.tsx` @ fac9ac2, trên
/// `MascotRoomController`. Kinh tế do server quyết; màn chỉ đọc sổ.
///
/// Từ trên xuống: sân khấu của Koa (bảng trên tường là hạng Gains); thẻ Hôm nay —
/// năng lượng và nhiệm vụ gộp một (29/10, Kiệt), mỗi nhiệm vụ một đoạn vòng, CHỈ hiện
/// đã nhận hay chưa (tự nhận ở nơi khác); hạng; Tuần của Koa; tủ đồ / huy hiệu.
/// Chuỗi ngày, thưởng chuỗi và băng chuỗi bỏ khỏi phòng (29/10, Kiệt; V1: Gains là
/// thang duy nhất) — sổ chuỗi ở `MascotRoomController` giữ nguyên.
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
  @State private var notice: String?
  @State private var celebrate = 0
  /// Giờ hiện tại, đổi mỗi phút: tới giờ ngủ khi đang mở phòng thì Koa đi ngủ ngay.
  @State private var clock = Date.now
  /// Đã cuộn hết phòng: tiêu đề hiện trên thanh điều hướng.
  @State private var pastStage = false
  /// Số trên bảng tường (29/10, Kiệt: người dùng chọn) — lưu trên máy.
  @AppStorage("koa.roomBoard") private var boardStat = RoomBoard.Stat.rank.rawValue
  @Environment(\.weightUnit) private var unit
  /// Thanh DEV: ép mức bụi (hình và thẻ dọn) để soát phần 5, chỉ bản Debug. Nút "Dọn
  /// ngay" vẫn gọi `clean_koa_room` thật.
  @State private var devDust: Int?
  /// Thanh DEV: ép một cảm xúc để soát hình (`setDevEmotion`), chỉ bản Debug.
  @State private var devEmotion: KoaEmotion.Emotion?
  #if DEBUG
    @AppStorage("koa.debug.map") private var debugMap = false
    /// Đo hiệu năng (`-koaBench`): Koa luôn đứng, để số đo không phụ thuộc giờ trong ngày.
    private var benchEmotion: KoaEmotion.Emotion? { [nil, .live].contains(KoaDirectorDriver.bench) ? nil : .idle }
  #else
    private var benchEmotion: KoaEmotion.Emotion? { nil }
  #endif

  var body: some View {
    content
      // Bố cục tràn viền (Kiệt 31/10): phòng phủ tới mép màn, không có tiêu đề; tiêu đề chỉ
      // hiện trên thanh điều hướng khi đã cuộn hết phòng.
      .navigationTitle(Text(verbatim: pastStage ? String(localized: "mr.title") : ""))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) { coinPill.padding(.horizontal, 6) }
      }
      .task {
        if shop == nil { shop = sharedShop ?? services.makeMascotShop(userId: room.userId) }
        shop?.gains = room.gains
        await room.load()
        await services.koaWeek(userId: room.userId)?.claimIfComplete(koaWeekState)
        // tủ đồ cho đồ Koa đang mặc trên sân khấu (`equippedOutfits` của RN)
        if let shop, case .loading = shop.phase { await shop.load() }
        await services.loadKoaDust(userId: room.userId)
      }
      .refreshable {
        await room.load()
        await shop?.load()
        await services.loadKoaDust(userId: room.userId)
      }
      .onReceive(Timer.publish(every: 30, on: .main, in: .common).autoconnect()) { clock = $0 }
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
        VStack(spacing: 0) {
          stage
          sheet
        }
      }
      .ignoresSafeArea(edges: .top)
      .modifier(KoaTopEdge(hidden: !pastStage))
      .onScrollGeometryChange(for: Bool.self) { g in
        g.contentOffset.y + g.contentInsets.top > g.containerSize.width * StudioScene.sceneBottom / StudioScene.width - 90
      } action: { _, past in
        pastStage = past
      }
      .background(DS.Color.background.swiftUI)
    }
  }

  /// Nội dung dưới phòng: thẻ bo góc phủ lên mép sàn, thay cho viền mờ.
  private var sheet: some View {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
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
          // Kiểu Apple Health (Kiệt duyệt 24/10): thẻ tóm tắt, chi tiết ở màn con.
          dustCard
          // Năng lượng + nhiệm vụ gộp một thẻ, chuỗi bỏ khỏi phòng (29/10, Kiệt).
          sectionTitle(String(localized: "mr.sec.today"))
          todaySummary
          sectionTitle(String(localized: "mr.sec.progress"))
          rankSummary
          weekSummary
          sectionTitle(String(localized: "mr.sec.more"))
          moreList
        }
        .padding(DS.Spacing.md)
        .padding(.top, DS.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DS.Color.background.swiftUI, in: UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28))
        .padding(.top, -KoaBedroom.tail)
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
          ForEach(0..<4, id: \.self) { n in
            devChip("dust \(n)", on: devDust == n) { devDust = devDust == n ? nil : n }
          }
          devChip("map", on: debugMap) { debugMap.toggle() }
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
      MascotStage(
        level: room.level, build: room.gains.rank,
        energy: Double(room.energyCount) / Double(MascotRules.energySignals.count),
        celebrateSignal: celebrate, emotion: devEmotion ?? benchEmotion ?? mood,
        equipped: shop?.inventory.filter(\.equipped).map(\.itemKey) ?? [],
        // Dáng theo tình huống thật (25/10); thanh DEBUG ép cảm xúc thì tắt dáng.
        gesture: devEmotion == nil ? roomGesture : nil,
        board: board,
        onBoard: {
          boardStat = (RoomBoard.Stat(rawValue: boardStat) ?? .rank).next.rawValue
        },
        dust: devDust ?? dust?.level ?? 0, walks: true,
        // sự kiện thật cho ký ức của Koa; Gains chưa tải xong thì chưa có gì để nói
        companion: room.gains == .zero
          ? nil : KoaCompanion.Facts(gains: room.gains, today: room.today, mood: moodRead.reason),
        userId: room.userId, sleep: KoaMood.SleepWindow(profile: profile?.profile))
        .sensoryFeedback(.selection, trigger: boardStat)
  }

  // MARK: - Bụi (phần 5)

  @State private var cleaning = false

  private var dust: KoaDust.State? {
    #if DEBUG
      if let n = devDust { return KoaDust.State(level: n, idle: n == 0 ? 0 : KoaDust.thresholds[n - 1]) }
    #endif
    guard let d = services.koaDust, d.userId == room.userId else { return nil }
    return d.state
  }

  /// Phòng bám bụi: vì sao, dọn miễn phí thế nào, hay dọn ngay bằng 30 xu.
  @ViewBuilder private var dustCard: some View {
    if let d = dust, d.level > 0 {
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          Label(String(localized: "mr.dust.title \(d.idle)"), systemImage: "sparkles")
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Text("mr.dust.how")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .fixedSize(horizontal: false, vertical: true)
          Button {
            Task { await clean() }
          } label: {
            HStack(spacing: 6) {
              if cleaning { ProgressView().controlSize(.small) }
              Text(String(localized: "mr.dust.clean \(KoaDust.cleanCoins)"))
            }
          }
          .buttonStyle(.dsPillSecondary)
          .disabled(cleaning || room.balance < KoaDust.cleanCoins)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }

  private func clean() async {
    guard !cleaning else { return }
    cleaning = true
    defer { cleaning = false }
    if let f = await services.cleanKoaRoom(userId: room.userId) {
      say(f == .insufficientCoins ? String(localized: "shop.notenough") : Self.message(f))
    } else {
      say(String(localized: "mr.dust.cleaned"))
      devDust = nil
      await room.load()
    }
  }

  /// Bảng tường theo lựa chọn: hạng Gains, buổi tuần này, kỷ lục gần nhất.
  private var board: StudioScene.Board {
    let l = String(locale.identifier.prefix(2))
    switch RoomBoard.Stat(rawValue: boardStat) ?? .rank {
    case .rank: return RoomBoard.rank(room.gains.rank, of: MascotRules.ranks.count, lang: l)
    case .week:
      return RoomBoard.week(done: koaWeekState?.done ?? 0, target: koaWeekState?.target ?? 0, lang: l)
    case .record:
      return RoomBoard.record(RoomBoard.latestRecord(flow?.insights?.performances ?? []), unit: unit, lang: l)
    }
  }

  /// Dáng trong phòng: đủ tuần → ăn mừng, vừa tập → ta-da, lỡ buổi → hờn dỗi, mệt →
  /// mệt lả, chưa ghi gì → tò mò. Đêm / ngủ / buồn giữ dáng của cảm xúc.
  private var roomGesture: KoaGesture? {
    if [.sleep, .sad, .deflated].contains(mood) { return nil }
    return KoaGesture.pick(
      trainedToday: room.gains.lastSession == room.today, weekComplete: koaWeekState?.complete ?? false,
      missedPlanned: room.gains.missedDays >= 1, tired: mood == .tired, loggedAnything: room.energyCount > 0)
  }

  /// Nét mặt của ngày (Koa đợt 1) — CÙNG bộ máy với Koa ở Hôm nay.
  private var mood: KoaEmotion.Emotion { moodRead.emotion }

  private var moodRead: KoaMood.Read {
    KoaToday.read(
      room: room, localWaterMl: nil, profile: profile?.profile,
      riskHour: KoaToday.riskHour(services.habitHours, userId: room.userId),
      hour: Calendar.current.component(.hour, from: clock),
      minute: Calendar.current.component(.minute, from: clock))
  }

  // MARK: - Thẻ tóm tắt (kiểu Apple Health, 24/10)

  /// Hôm nay: vòng mỗi đoạn một nhiệm vụ đang tính + số xu còn nhận được; chi tiết là
  /// vòng năng lượng lớn và danh sách nhiệm vụ trong một màn.
  private var todaySummary: some View {
    let quests = room.activeQuests
    let done = quests.filter { room.questDone($0.key) }.count
    let left = quests.filter { !room.isClaimed(MascotRules.questRefKey(room.today, $0.key)) }.reduce(0) { $0 + $1.coins }
    return NavigationLink {
      RoomDetailPage(title: String(localized: "mr.quests")) {
        VStack(spacing: DS.Spacing.md) {
          energyCard
          questsCard
        }
      }
    } label: {
      RoomSummaryCard(
        symbol: "checklist", tint: DS.Color.readinessGreen.swiftUI, title: String(localized: "mr.card.quests"),
        corner: String(localized: "mr.now"), value: "\(done)", unit: String(localized: "mr.quests.of \(quests.count)"),
        detail: left > 0 ? String(localized: "mr.quests.coinsLeft \(left)") : String(localized: "mr.claimed")
      ) {
        EnergyRing(segments: questSegments, lineWidth: 7, gap: 8)
          .frame(width: 50, height: 50)
      }
    }
    .buttonStyle(TodayPressStyle())
  }

  /// Mỗi nhiệm vụ đang tính là một đoạn vòng, tô màu khi đã làm.
  private var questSegments: [(on: Bool, color: Color)] {
    room.activeQuests.map { (on: room.questDone($0.key), color: Self.signalColor($0.key)) }
  }

  private var rankSummary: some View {
    let rank = gainsRank
    let tint = Color(hex: rank.colorHex)
    let pct = KoaGains.toNext(room.gains.points).map { Double($0.have) / Double(max(1, $0.need)) } ?? 1
    return NavigationLink {
      RoomDetailPage(title: String(localized: "mr.sec.rank")) { rankCard }
    } label: {
      VStack(alignment: .leading, spacing: 0) {
        RoomSummaryCard(
          symbol: "dumbbell.fill", tint: tint, title: String(localized: "mr.card.rank \(rank.name(lang))"),
          corner: String(localized: "mr.details"), value: room.gains.points.formatted(.number.locale(.app)),
          unit: "Gains", detail: String(journeySubtitle.characters)
        ) {
          GeometryReader { g in
            ZStack(alignment: .leading) {
              Capsule().fill(DS.Color.foreground.swiftUI.opacity(0.12))
              Capsule().fill(tint).frame(width: g.size.width * min(1, max(0, pct)))
            }
          }
          .frame(width: 96, height: 8)
          .padding(.bottom, 6)
          .accessibilityHidden(true)
        }
      }
    }
    .buttonStyle(TodayPressStyle())
  }

  @ViewBuilder private var weekSummary: some View {
    if let state = koaWeekState {
      NavigationLink {
        RoomDetailPage(title: String(localized: "dp.week")) { weeklyCard }
      } label: {
        RoomSummaryCard(
          symbol: "calendar", tint: DS.Color.readinessGreen.swiftUI, title: String(localized: "dp.week"),
          value: "\(min(state.done, state.target))", unit: String(localized: "mr.week.of \(state.target)"),
          detail: state.complete
            ? String(localized: "kw.claimed") : String(localized: "kw.reward \(KoaGains.fullWeek) \(KoaWeek.rewardCoins)")
        ) {
          RoomWeekBars(days: state.days, today: TodayPlanHero.today(), tint: DS.Color.readinessGreen.swiftUI)
        }
      }
      .buttonStyle(TodayPressStyle())
    }
  }

  /// Khám phá thêm: danh sách kiểu Health (một nhóm, hàng có mũi tên).
  private var moreList: some View {
    let awardValue = room.awardCount.flatMap { $0 > 0 ? String($0) : nil }
    return VStack(spacing: 0) {
      if let shop {
        NavigationLink {
          ShopView(book: shop, lang: lang) { Task { await room.load() } }
        } label: {
          RoomLinkRow(symbol: "tshirt.fill", tint: DS.Color.metricPurple.swiftUI, label: String(localized: "shop.title"))
        }
        .buttonStyle(TodayPressStyle())
      }
      if shop != nil, awards != nil { Divider().padding(.leading, 64) }
      if let awards {
        NavigationLink {
          AwardsView(book: awards, lang: lang)
        } label: {
          RoomLinkRow(
            symbol: "medal.fill", tint: DS.Color.readinessYellowGraphic.swiftUI, label: String(localized: "mr.awards"),
            value: awardValue)
        }
        .buttonStyle(TodayPressStyle())
      }
    }
    .dsCard(radius: 22)
  }

  // MARK: - Năng lượng

  /// `energyCard` của RN: vòng 104 (nét 10) mỗi đoạn một nhiệm vụ, giữa là "3/5" +
  /// "HÔM NAY". Hàng ô tín hiệu bên dưới bỏ 29/10 — trùng danh sách nhiệm vụ ngay sau.
  private var questsDone: Int { room.activeQuests.filter { room.questDone($0.key) }.count }

  private var energyCard: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        HStack(spacing: DS.Spacing.md) {
          EnergyRing(segments: questSegments)
            .frame(width: 104, height: 104)
            .overlay {
              VStack(spacing: 3) {
                (Text(verbatim: "\(questsDone)")
                  .font(.system(size: 26, weight: .heavy).monospacedDigit())
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                  + Text(verbatim: "/\(room.activeQuests.count)")
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
              Text(String(localized: "mr.energy.a11y \(questsDone) \(room.activeQuests.count)")))
          VStack(alignment: .leading, spacing: 4) {
            Text(String(localized: "mr.energy")).font(DS.TextStyle.headline)
            Text(Self.headline(room.energyHeadline))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
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

  /// Ba loại nhiệm vụ (#527 phần 4, Kiệt duyệt 29/10): Hôm nay (chỉ xu), Tập luyện
  /// (xu + Gains), Khám phá app (một lần, chỉ xu). Việc xong mờ đi và xuống cuối nhóm;
  /// việc khám phá xong thì biến mất. Không có nút: mọi nhiệm vụ tự nhận ở nơi khác.
  private var questsCard: some View {
    VStack(spacing: DS.Spacing.md) {
      questGroup(String(localized: "mr.q.today"), tag: String(localized: "mr.q.coinsOnly"), rows: todayRows)
      questGroup(String(localized: "mr.q.training"), tag: String(localized: "mr.q.coinsGains"), rows: trainingRows)
      let explore = exploreRows
      if !explore.isEmpty {
        questGroup(String(localized: "mr.q.explore"), tag: String(localized: "mr.q.once"), rows: explore)
      }
    }
  }

  /// Một hàng nhiệm vụ: đã xong (tô vòng) / đã nhận (mờ, "Đã nhận").
  struct QuestRow: Identifiable {
    let id: String
    let title: String
    var hint: String?
    let coins: Int
    var gains: Int?
    let done: Bool
    let claimed: Bool
  }

  private var todayRows: [QuestRow] {
    room.activeQuests.filter { $0.key != .workout }.map { q in
      QuestRow(
        id: q.key.rawValue, title: q.name(lang, stepsGoal: room.stepsGoal), coins: q.coins, done: room.questDone(q.key),
        claimed: room.isClaimed(MascotRules.questRefKey(room.today, q.key)))
    }
  }

  private var trainingRows: [QuestRow] {
    var rows: [QuestRow] = []
    if let w = room.activeQuests.first(where: { $0.key == .workout }) {
      rows.append(
        QuestRow(
          id: "workout", title: w.name(lang, stepsGoal: room.stepsGoal), coins: w.coins, gains: KoaGains.plannedSession,
          done: room.questDone(.workout), claimed: room.isClaimed(MascotRules.questRefKey(room.today, .workout))))
    }
    let overload = room.isClaimed(OverloadQuest.refKey(room.today))
    rows.append(
      QuestRow(
        id: "overload", title: String(localized: "mr.q.overload"), hint: String(localized: "mr.q.overload.hint"),
        coins: OverloadQuest.coins, gains: OverloadQuest.gains, done: overload, claimed: overload))
    if let state = koaWeekState {
      let claim = services.koaWeek(userId: room.userId)?.claim ?? .notYet
      let claimed = if case .notYet = claim { false } else if case .failed = claim { false } else { true }
      rows.append(
        QuestRow(
          id: "week", title: String(localized: "mr.q.week"),
          hint: String(localized: "mr.q.week.progress \(min(state.done, state.target)) \(state.target)"),
          coins: KoaWeek.rewardCoins, gains: KoaGains.fullWeek, done: state.complete, claimed: claimed))
    }
    return rows
  }

  /// Việc khám phá còn lại — xong (đã có trong sổ) thì không hiện nữa.
  private var exploreRows: [QuestRow] {
    ExploreQuest.allCases.filter { !room.isClaimed($0.refKey) }.map { q in
      QuestRow(
        id: q.rawValue, title: Self.exploreTitle(q), hint: Self.exploreHint(q), coins: q.coins, done: false,
        claimed: false)
    }
  }

  private func questGroup(_ title: String, tag: String, rows: [QuestRow]) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack(alignment: .firstTextBaseline) {
          Text(verbatim: title).font(DS.TextStyle.headline)
            .accessibilityAddTraits(.isHeader)
          Spacer(minLength: DS.Spacing.sm)
          Text(verbatim: tag)
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        // xong / đã nhận xuống cuối, giữ thứ tự gốc trong mỗi phần
        ForEach(rows.enumerated().sorted { ($0.element.claimed ? 1 : 0, $0.offset) < ($1.element.claimed ? 1 : 0, $1.offset) }
          .map(\.element))
        { r in
          rewardRow(title: r.title, hint: r.hint, coins: r.coins, gains: r.gains, claimed: r.claimed) {
            Image(systemName: r.done ? "circle.inset.filled" : "circle")
              .font(.system(size: 20))
              .foregroundStyle(
                r.done ? DS.Color.readinessGreen.swiftUI : DS.Color.mutedForeground.swiftUI.opacity(0.5))
              .accessibilityLabel(Text(Self.questState(done: r.done)))
          }
        }
      }
    }
  }

  static func exploreTitle(_ q: ExploreQuest) -> String {
    switch q {
    case .photo: String(localized: "mr.x.photo")
    case .voice: String(localized: "mr.x.voice")
    case .mealcam: String(localized: "mr.x.mealcam")
    case .barcode: String(localized: "mr.x.barcode")
    case .reminder: String(localized: "mr.x.reminder")
    case .review: String(localized: "mr.x.review")
    case .askkoa: String(localized: "mr.x.askkoa")
    }
  }

  static func exploreHint(_ q: ExploreQuest) -> String {
    switch q {
    case .photo: String(localized: "mr.x.photo.hint")
    case .voice: String(localized: "mr.x.voice.hint")
    case .mealcam: String(localized: "mr.x.mealcam.hint")
    case .barcode: String(localized: "mr.x.barcode.hint")
    case .reminder: String(localized: "mr.x.reminder.hint")
    case .review: String(localized: "mr.x.review.hint")
    case .askkoa: String(localized: "mr.x.askkoa.hint")
    }
  }

  /// Một hàng thưởng (`questRow` của RN): tên (đã nhận thì mờ đi), gợi ý, dưới là
  /// đồng xu + "+N" vàng (+ Gains xanh cho việc tập); bên phải "✓ Đã nhận" xanh hoặc việc. GĐ2: bỏ "+N XP" —
  /// Gains là thang tiến bộ duy nhất ra giao diện; XP vẫn cộng ở server.
  private func rewardRow<Action: View>(
    title: String, hint: String? = nil, coins: Int, gains: Int? = nil, claimed: Bool, @ViewBuilder action: () -> Action
  ) -> some View {
    HStack(spacing: DS.Spacing.md) {
      VStack(alignment: .leading, spacing: 3) {
        Text(verbatim: title)
          .font(DS.TextStyle.body)
          .foregroundStyle(claimed ? DS.Color.mutedForeground.swiftUI : DS.Color.foreground.swiftUI)
        if let hint {
          Text(verbatim: hint)
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        HStack(spacing: 4) {
          Image(systemName: "circle.circle.fill").font(.system(size: 11))
            .foregroundStyle(DS.Color.readinessYellowGraphic.swiftUI)
            .accessibilityHidden(true)
          Text(verbatim: "+\(coins)")
            .foregroundStyle(DS.Color.readinessYellow.swiftUI)
          if let gains {
            Text(String(localized: "mr.q.gains \(gains)"))
              .foregroundStyle(DS.Color.readinessGreen.swiftUI)
          }
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

  // MARK: - Việc

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

  static func headline(_ h: MascotRules.EnergyHeadline) -> String {
    switch h {
    case .empty: String(localized: "mr.energy.empty")
    case .low: String(localized: "mr.energy.low")
    case .mid: String(localized: "mr.energy.mid")
    case .full: String(localized: "mr.energy.full")
    }
  }

  /// Xong mà chưa nhận ("…") hay chưa xong ("—").
  static func questState(done: Bool) -> String {
    done ? String(localized: "mr.quest.collecting") : String(localized: "mr.quest.notDone")
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
/// mặc, sàn + bục sáng theo năng lượng, bảng hạng Gains, trăng theo ngày. Gật đầu
/// khi vừa nhận thưởng (`acknowledge`: nghiêng 6° rồi lò xo về, phóng 1,03).
/// CHƯA có: cây / bụi sáng chuyển động (`PlantsCanvas`, `Motes` — ở đây đứng
/// yên), côn trùng, cái liếc, cảm xúc tự chọn của engine (`useMascotEmotion`).
struct MascotStage: View {
  let level: Int
  /// Hạng vóc dáng (Gains) của Koa trên sân khấu.
  var build = 0
  /// 0…1 — số tín hiệu đã xong / năm.
  let energy: Double
  let celebrateSignal: Int
  var emotion: KoaEmotion.Emotion = .idle
  /// Khoá đang mặc, theo thứ tự hàng của `mascot_inventory`.
  var equipped: [String] = []
  /// Dáng biểu cảm mới theo tình huống (25/10).
  var gesture: KoaGesture?
  /// Bảng số trên tường (29/10); `nil` = bảng hạng.
  var board: StudioScene.Board?
  /// Chạm bảng để đổi số hiện; `nil` = bảng chỉ để xem.
  var onBoard: (() -> Void)?
  /// Mức bụi 0…3 (phần 5).
  var dust = 0
  /// Koa sống trong phòng (29/10): đạo diễn hành vi (`KoaDirector`) — chào người xem, ghé
  /// đồ vật, tự hào khi có buổi tập thật; chạm sàn thì đi tới đó. Chỉ phòng linh vật; cửa
  /// hàng giữ Koa đứng trên bục.
  var walks = false
  /// Sự thật của ngày cho ký ức của Koa (`nil` = chưa có dữ liệu).
  var companion: KoaCompanion.Facts?
  /// Chủ của ký ức.
  var userId = ""
  /// Giờ ngủ của người này: Koa trầm dần trước giờ ngủ.
  var sleep = KoaMood.SleepWindow.standard

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.scenePhase) private var scenePhase
  @State private var director = KoaDirectorDriver()
  #if DEBUG
    private var benchMode: Bool { ![nil, .live].contains(KoaDirectorDriver.bench) }
  #else
    private var benchMode: Bool { false }
  #endif
  /// Lần cuối người xem ở phòng (giây epoch) — quyết định chào hay chỉ nhìn.
  @AppStorage("koa.room.seen") private var seenAt = 0.0
  #if DEBUG
    /// Lớp debug: sân khấu, sàn, vùng chặn, chỗ ghé, đích, đường đi, hành vi (chỉ bản Debug).
    @AppStorage("koa.debug.map") private var debugMap = false
  #endif
  /// Sân khấu còn trong khung cuộn (như `KoaFigureView`): ngoài khung thì không đi dạo.
  @State private var onScreen = true
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
    o.board = board ?? RoomBoard.rank(build, of: MascotRules.ranks.count, lang: lang)
    o.decor = MascotShop.decorChoice(equipped: Set(equipped))
    o.dust = dust
    // theo ngày: `.now` đổi mỗi lần tính, làm bộ nhớ đệm của phòng trượt ở mọi khung
    o.moon = StudioScene.moonPhase(Calendar.current.startOfDay(for: .now))
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

  /// Phòng vẽ sẵn: lúc lá cây rung thì bỏ phần từ chậu cây trở lên (lớp trên vẽ phần ấy).
  private var backdrop: StudioScene.Options {
    var o = studio
    if director.swaying { o.omit = StudioScene.fromPlant }
    return o
  }

  /// `HERO_W = round(128 / 0.93)`.
  private static let heroWidth = 138.0

  /// (a) Người xem tới phòng: đi vắng từ 5 phút thì Koa chào đầy đủ (nhìn trước, lại gần);
  /// mới rời đi thì chỉ nhìn — không chào đi chào lại mỗi lần mở.
  private func arrive() {
    guard walks, !reduceMotion, !benchMode else { return }
    let away = Date.now.timeIntervalSince1970 - seenAt
    seenAt = Date.now.timeIntervalSince1970
    director.request(away >= 300 ? .greet : .notice)
  }

  /// Chỉ đi được khi Koa đang đứng (ngồi thiền / cầm tạ thì ở yên).
  private var canWalk: Bool {
    walks && KoaEmotion.state(emotion).pose == .idle
  }

  /// Đang ngủ và đã tới cửa: sang phòng ngủ gác mái, sân khấu nghỉ hẳn.
  private var inBedroom: Bool { walks && emotion == .sleep && director.settled }

  /// Cảm xúc là dáng ngồi mà Koa chưa về tới bục: vẫn đứng và đi về, tới nơi mới ngồi.
  private var shownEmotion: KoaEmotion.Emotion {
    walks && !canWalk && !director.settled ? .idle : emotion
  }

  var body: some View {
    // không có dòng "Cấp N" dưới sân khấu (RN cũng không) — thẻ cấp ngay dưới nói rồi
    let tail = walks ? KoaBedroom.tail : 0
    let asleep = inBedroom
    ZStack {
      StudioBackdrop(options: backdrop)
        .overlay {
          GeometryReader { g in
            ZStack(alignment: .topLeading) {
              if walks {
                KoaBedroomLayer(plan: Self.doorPlan(open: director.doorOpen, light: scheme == .light)).equatable()
                  .frame(width: g.size.width, height: g.size.width / StudioScene.width * StudioScene.sceneBottom)
                  .allowsHitTesting(false)
                floorTaps(g.size.width)
                livingHero(g.size.width)
              } else {
                hero(g.size.width)
              }
            }
          }
        }
        .background(walks ? Self.floorEdge(light: scheme == .light) : .clear)
        // lia ngang: phòng ngủ ở bên kia cánh cửa
        .visualEffect { content, proxy in content.offset(x: asleep ? proxy.size.width : 0) }
      if asleep { KoaBedroomView(equipped: equipped, build: build).transition(.move(edge: .leading)) }
    }
    .clipped()
    .animation(reduceMotion ? nil : .easeInOut(duration: 1.1), value: asleep)
    .aspectRatio(StudioScene.width / (StudioScene.sceneBottom + tail), contentMode: .fit)
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(String(localized: "mr.stage.a11y \(level)")))
    .accessibilityAction(named: Text("mr.walk.a11y")) {
      guard canWalk else { return }
      if reduceMotion { director.place(KoaRoomMap.user) } else { director.request(.greet) }
    }
    .onScrollVisibilityChange(threshold: 0.2) { onScreen = $0 }
    // cuộn xuống đọc thẻ (sân khấu khuất quá nửa): Koa không đi lại, không kéo mắt khỏi nội dung
    .onScrollVisibilityChange(threshold: 0.6) { director.context.quiet = !$0 }
    .onChange(of: companion, initial: true) { _, facts in
      if walks, !benchMode { director.sync(facts, userId: userId) }
      settle()
    }
    .onChange(of: canWalk) { settle() }
    .onAppear { arrive() }
    .onDisappear {
      seenAt = Date.now.timeIntervalSince1970
      director.save()
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active {
        arrive()
      } else {
        seenAt = Date.now.timeIntervalSince1970
        director.save()
      }
    }
    // vừa dọn phòng: Koa ngoái nhìn kệ
    .onChange(of: dust) { old, new in
      if new < old, !reduceMotion { director.request(.look("shelf")) }
    }
    .overlay {
      if let onBoard, !inBedroom {
        GeometryReader { g in boardButton(g.size.width, action: onBoard) }
      }
    }
  }

  /// Tới giờ ngồi: Koa tự đi về bục. Giảm chuyển động thì đứng ngay ở đó, không đi.
  private func settle() {
    guard walks else { return }
    director.context.settle = !canWalk
    director.context.bedtime = emotion == .sleep
    if !canWalk, reduceMotion, !director.settled {
      director.place(emotion == .sleep ? KoaRoomMap.door : KoaRoomMap.stageMark)
    }
  }

  /// Màu nền dưới mép sàn của phòng chính, phần nằm dưới thẻ nội dung.
  private static func floorEdge(light: Bool) -> Color {
    light ? Color(red: 0.86, green: 0.8, blue: 0.72) : Color(red: 0.03, green: 0.04, blue: 0.11)
  }

  private static func doorPlan(open: Bool, light: Bool) -> [KoaPaint.Op] {
    KoaPaint.plan(KoaRender.Element("Svg", kids: KoaBedroom.door(open: open, light: light)))
  }

  /// Vùng chạm đúng khung bảng số (`270, 245`, 102 × 62 trong toạ độ phòng).
  private func boardButton(_ width: CGFloat, action: @escaping () -> Void) -> some View {
    let k = width / StudioScene.width
    let b = studio.board
    return Button {
      action()
      // số trên bảng vừa đổi: Koa ngoái nhìn
      if !reduceMotion { director.request(.look("board")) }
    } label: {
      Color.clear.contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .frame(width: 102 * k, height: max(62 * k, 44))
    .offset(x: 270 * k, y: 245 * k)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .accessibilityLabel(Text(verbatim: "\(b?.word ?? "") \(b?.value ?? "")"))
    .accessibilityHint(Text("mr.board.hint"))
  }

  /// Vùng sàn nhận chạm (dưới Koa — chạm Koa vẫn là chọc Koa): chạm đâu Koa đi tới đó
  /// (ngoài vùng sàn hợp lệ thì tới điểm gần nhất).
  private func floorTaps(_ width: CGFloat) -> some View {
    let k = Double(width) / StudioScene.width
    let top = 360.0, bottom = StudioScene.sceneBottom
    return Color.clear
      .contentShape(Rectangle())
      .frame(width: width, height: (bottom - top) * k)
      .offset(y: top * k)
      .onTapGesture(coordinateSpace: .local) { p in
        guard canWalk else { return }
        let s = KoaRoomMap.spot(screenX: p.x / k, y: p.y / k + top)
        if reduceMotion { director.place(s) } else { director.request(.walkTo(s)) }
      }
      .accessibilityHidden(true)
  }

  /// Koa lớn dần theo cấp (neo ở chân).
  private var levelScale: Double { min(1 + Double(level - 1) * 0.012, 1.1) }

  /// Koa sống trong phòng theo `KoaDirectorDriver`. Giảm chuyển động / rời màn / app ra
  /// nền: đồng hồ dừng, Koa đứng nguyên chỗ (như trước khi có đạo diễn).
  private func livingHero(_ width: CGFloat) -> some View {
    let running = !reduceMotion && onScreen && scenePhase == .active && !inBedroom
    return TimelineView(.animation(minimumInterval: director.moving ? 1.0 / 60 : 1.0 / 30, paused: !running)) { tl in
      let f = running ? step(tl.date) : director.frame
      // đồng hồ dừng và Koa vừa được đặt chỗ mới (Giảm chuyển động): đứng ở đó
      let still = running ? nil : director.placed
      ZStack(alignment: .topLeading) {
        // lá cây đang rung (~3 giây): chỉ vẽ lại CHẬU CÂY ở lớp trên; phòng dưới bỏ chậu cây
        // (xem `body`) — không vẽ lại cả phòng mỗi khung
        // chỉ khi phòng dưới ĐÃ bỏ phần ấy (`swaying`) — không bao giờ vẽ hai lần một khung
        if director.swaying {
          var o = studio
          let _ = (o.plantSway = f?.plantSway ?? 0)
          StudioObjects(options: o, indices: StudioScene.fromPlant)
            .frame(width: width, height: width / StudioScene.width * StudioScene.sceneBottom)
            .allowsHitTesting(false)
        }
        hero(
          width, x: still?.x ?? f?.x ?? KoaRoomMap.stageMark.x,
          y: still.map(KoaRoomMap.screenY) ?? f?.screenY ?? StudioScene.stageMark.y,
          scale: still.map { KoaRoomMap.scale($0.d) } ?? f?.scale ?? 1,
          direct: running ? f : nil, date: tl.date)
        occlusion(width, still ?? f.map { KoaRoomMap.Spot($0.plane, $0.x, $0.depth) }, plantSway: f?.plantSway ?? 0)
        #if DEBUG
          // chế độ đo luôn bỏ qua lớp debug (nó chiếm ~5–7 điểm % CPU, làm sai số đo)
          if debugMap, !benchMode { KoaMapOverlay(frame: f).frame(width: width, height: width / StudioScene.width * StudioScene.sceneBottom) }
        #endif
      }
    }
    .onChange(of: running) { _, on in if !on { director.pause() } }
  }

  private func step(_ date: Date) -> KoaDirector.Frame {
    director.context.canWalk = canWalk
    let hour = Calendar.current.component(.hour, from: date)
    director.context.night = sleep.winding(hour: hour, minute: Calendar.current.component(.minute, from: date))
    return director.step(date, heroWidth: Self.heroWidth * levelScale)
  }

  /// Đồ vật đứng TRƯỚC Koa (Koa ở sàn, sau chân đồ): vẽ lại đúng phần ảnh của căn phòng
  /// trong hình đồ vật, đè lên Koa. Lớp này trùng từng điểm ảnh với phòng bên dưới nên không
  /// thấy được ở chỗ không có Koa — đồ vật không "hiện lên" (Kiệt 30/10).
  @ViewBuilder
  private func occlusion(_ width: CGFloat, _ spot: KoaRoomMap.Spot?, plantSway: Double) -> some View {
    if let spot {
      let objects = KoaRoomMap.occluding(spot)
      if !objects.isEmpty {
        var o = studio
        let _ = (o.plantSway = director.swaying ? plantSway : 0)
        StudioFront(options: o, indices: Set(objects.flatMap(\.elements)), swaying: director.swaying)
          .equatable()
          .frame(width: width, height: width / StudioScene.width * StudioScene.sceneBottom)
          .allowsHitTesting(false)
      }
    }
  }

  /// Koa đứng trên bục: `size = round(HERO_W·k)`, đỉnh ở `412k − 1,25·size + 6k`. Đi trong
  /// phòng: chân ở `(x, y)` của phòng, to / nhỏ theo chiều sâu (`scale`, neo ở chân).
  private func hero(
    _ width: CGFloat, x: Double = StudioScene.stageMark.x, y: Double = StudioScene.stageMark.y, scale: Double = 1,
    direct: KoaDirector.Frame? = nil, date: Date? = nil
  ) -> some View {
    let k: Double = Double(width) / StudioScene.width
    let size: Double = (Self.heroWidth * k).rounded()
    let left: Double = x * k - size / 2
    let top: Double = y * k - size * KoaMath.aspect + 6 * k
    return MascotFigureView(
      emotion: shownEmotion, equipped: equipped, gesture: gesture, size: size, build: build, interactive: true,
      walks: walks, direct: direct,
      // chạm Koa: Koa vẫn nhảy lên như cũ, rồi quay sang chào người xem
      onTap: walks && !reduceMotion
        ? {
          director.boost()
          director.touched()
          director.request(.greet)
        } : nil,
      // phòng: Koa theo đồng hồ của sân khấu (một đồng hồ, không vẽ hai lần)
      date: walks ? date : nil, onTouch: walks ? { director.boost() } : nil,
      idleClock: walks ? director.frame?.idleClock : nil)
      .scaleEffect(levelScale * scale, anchor: .bottom)
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

/// Tắt lớp nhoè ở mép trên của iOS 26 khi phòng đang tràn tới đỉnh màn.
private struct KoaTopEdge: ViewModifier {
  let hidden: Bool

  func body(content: Content) -> some View {
    if #available(iOS 26, *) {
      content.scrollEdgeEffectHidden(hidden, for: .top)
    } else {
      content
    }
  }
}

/// Căn phòng studio (#527, S1): `StudioScene.tree` → `KoaPaint` → `Canvas`,
/// toạ độ 390 phủ theo bề ngang (`xMidYMin slice` của RN).
struct StudioBackdrop: View {
  let options: StudioScene.Options

  var body: some View {
    let plan = StudioPlans.room(options)
    Canvas { ctx, canvas in
      var c = ctx
      let k = canvas.width / StudioScene.width
      c.concatenate(CGAffineTransform(scaleX: k, y: k))
      KoaCanvas.draw(plan, in: &c)
    }
    .accessibilityHidden(true)
  }
}

/// Kế hoạch vẽ của căn phòng, lưu sẵn theo `Options` (30/10, hiệu năng): phòng tĩnh — dựng
/// cây + giải kiểu một lần cho mỗi bộ tuỳ chọn, không dựng lại mỗi lần sân khấu cập nhật.
@MainActor
enum StudioPlans {
  private struct Key: Hashable {
    let options: StudioScene.Options
    let only: Set<Int>?
  }
  private static var cache: [Key: [KoaPaint.Op]] = [:]
  private static var order: [Key] = []

  static func room(_ o: StudioScene.Options) -> [KoaPaint.Op] {
    plan(Key(options: o, only: nil)) { StudioScene.tree(o) }
  }

  static func objects(_ o: StudioScene.Options, _ indices: Set<Int>) -> [KoaPaint.Op] {
    plan(Key(options: o, only: indices)) { StudioScene.objects(o, indices) }
  }

  private static func plan(_ k: Key, _ build: () -> [KoaRender.Element]) -> [KoaPaint.Op] {
    if let p = cache[k] { return p }
    let p = KoaPaint.plan(KoaRender.Element("Svg", kids: build()))
    cache[k] = p
    order.append(k)
    // lá rung tạo vài chục bộ tuỳ chọn (bậc 0,25°): giữ đủ để một đợt rung dùng lại, có chặn
    if order.count > 64 { cache[order.removeFirst()] = nil }
    return p
  }
}

/// Phần phòng che Koa: căn phòng hoàn chỉnh (cả viền tối, vệt đèn, bục nằm trên đồ vật), chỉ
/// lộ trong hình đồ vật. Vẽ riêng đồ vật thì thiếu các lớp ấy nên đồ sáng bừng lên khi bật.
/// `Equatable`: đồng hồ sân khấu chạy mà phòng không đổi thì không vẽ lại.
struct StudioFront: View, Equatable {
  let options: StudioScene.Options
  let indices: Set<Int>
  /// Đúng như phòng bên dưới lúc lá rung (`backdrop` + lớp chậu cây).
  let swaying: Bool

  var body: some View {
    var back = options
    let _ = (back.plantSway = 0)
    let _ = (back.omit = swaying ? StudioScene.fromPlant : [])
    ZStack {
      StudioBackdrop(options: back)
      if swaying { StudioObjects(options: options, indices: StudioScene.fromPlant) }
    }
    .mask { StudioObjects(options: options, indices: indices) }
  }
}

/// Vài đồ vật của căn phòng (`StudioScene.objects`) — hình mặt nạ của lớp che Koa, chậu cây đang rung.
struct StudioObjects: View {
  let options: StudioScene.Options
  let indices: Set<Int>

  var body: some View {
    let plan = StudioPlans.objects(options, indices)
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
