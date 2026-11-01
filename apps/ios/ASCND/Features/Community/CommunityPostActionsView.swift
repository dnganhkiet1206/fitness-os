import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thích / lưu / menu "⋯" trên thẻ bài (#527, lát 6) — `PostActions` +
/// `usePostMenu` (`components/ascnd/post-parts.tsx`) @ fac9ac2, trên
/// `CommunityPostActions`.
///
/// Màn giữ bài (feed / một bài / hồ sơ) gắn `communityPostActions(userId:host:)`;
/// thẻ đọc ngữ cảnh từ môi trường. Thẻ không có ngữ cảnh (xem trước) chỉ hiện
/// số đếm như trước.
struct CommunityPostActionsContext {
  let actions: CommunityPostActions
  let host: any CommunityPostHost
  let openMenu: @MainActor (CommunityFeed.Post) -> Void
  /// "Thử workout" (lát 15) — `nil` khi chưa dựng được sổ / luồng tập.
  var tryWorkout: (@MainActor (CommunityFeed.Post) -> Void)? = nil
  /// Bài đang thử — nút tắt trong lúc đó.
  var trying: Set<String> = []
  /// Vừa LƯU xong một bài (lát 16) — màn báo "Đã lưu" kèm lối vào thư viện.
  var saved: (@MainActor () -> Void)? = nil
  /// "Thêm vào bữa" của bài công thức (14/10) — mở Ghi bữa có sẵn món.
  var addToMeal: (@MainActor (CommunityFeed.Post) -> Void)? = nil
}

/// Món chờ thêm vào bữa (từ bài công thức).
private struct PendingMeal: Identifiable {
  let food: MealLog.Food
  var id: String { food.id }
}

extension EnvironmentValues {
  @Entry var communityPostActions: CommunityPostActionsContext? = nil
}

extension View {
  func communityPostActions(userId: String, host: any CommunityPostHost) -> some View {
    modifier(CommunityPostActionsModifier(userId: userId, host: host))
  }
}

private struct CommunityPostActionsModifier: ViewModifier {
  let userId: String
  let host: any CommunityPostHost
  @Environment(AppServices.self) private var services
  @Environment(WorkoutFlow.self) private var flow
  @State private var actions: CommunityPostActions?
  @State private var tryBook: CommunityTryBook?
  @State private var tried = 0
  /// Gán một câu là hiện ngay hộp báo UIKit (`ConfirmAlert`, 31/10): trong sheet
  /// chồng sheet, state đặt sau khi chờ server không làm `.alert` hiện.
  private var message: String? {
    get { nil }
    nonmutating set { if let newValue { ConfirmAlert.ok(newValue) } }
  }
  @State private var taps = 0
  /// "Đã lưu" đang hiện (mỗi lần lưu một số mới, để băng hiện lại đủ giờ).
  @State private var savedNotice: Int?
  @State private var openLibrary = false
  @State private var addingMeal: PendingMeal?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Đang ở chính thư viện thì không kèm nút dẫn về chỗ đang đứng (RN).
  private var inLibrary: Bool { host is CommunitySavedBook }

  func body(content: Content) -> some View {
    content
      .environment(\.communityPostActions, context)
      .overlay(alignment: .bottom) {
        if let savedNotice {
          SavedNoticeView(showOpen: !inLibrary) {
            self.savedNotice = nil
            openLibrary = true
          }
          .id(savedNotice)
          .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
        }
      }
      .task(id: savedNotice) {
        guard savedNotice != nil else { return }
        try? await Task.sleep(for: .seconds(4))
        if !Task.isCancelled { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { savedNotice = nil } }
      }
      .navigationDestination(isPresented: $openLibrary) { CommunitySavedScreen(userId: userId) }
      .sheet(item: $addingMeal) { m in
        LogMealView(userId: userId, prefill: [m.food])
      }
      .task {
        if actions == nil { actions = services.makeCommunityPostActions(userId: userId) }
        if tryBook == nil { tryBook = services.makeCommunityTry(userId: userId) }
      }
      .sensoryFeedback(.selection, trigger: taps)
      .sensoryFeedback(.success, trigger: tried)
  }

  /// Ngữ cảnh cho thẻ — dựng từng bước (một biểu thức gộp làm trình biên dịch
  /// quá thời gian suy kiểu).
  private var context: CommunityPostActionsContext? {
    guard let actions else { return nil }
    let open: @MainActor (CommunityFeed.Post) -> Void = { post in
      taps += 1
      // Đọc lại từ sổ: thẻ trong sheet có thể chưa vẽ lại sau lệnh trước.
      let now = host.post(id: post.id) ?? post
      ConfirmAlert.choose(title: menuTitle(now), choices: menuChoices(now))
    }
    var c = CommunityPostActionsContext(actions: actions, host: host, openMenu: open)
    c.saved = {
      AccessibilityNotification.Announcement(String(localized: "community.saved.toast")).post()
      withAnimation(reduceMotion ? nil : .snappy) { savedNotice = (savedNotice ?? 0) + 1 }
    }
    c.addToMeal = { post in
      guard let r = post.recipe,
        let food = CommunityCard.mealFood(r, id: UUID().uuidString.lowercased(), fallbackName: String(localized: "community.recipe"))
      else { return }
      addingMeal = PendingMeal(food: food)
    }
    if let tryBook {
      let tryIt: @MainActor (CommunityFeed.Post) -> Void = { post in Task { await tryPost(post) } }
      c.tryWorkout = tryIt
      c.trying = tryBook.busy
    }
    return c
  }

  private func menuTitle(_ p: CommunityFeed.Post) -> String {
    p.mine ? String(localized: "community.menu.mine") : (p.author?.displayName ?? "")
  }

  /// Của mình: bật / tắt bình luận, Xoá. Của người khác: nhẹ trước, nặng sau —
  /// Ẩn, Tắt tiếng 30 ngày, Báo cáo, Chặn.
  private func menuChoices(_ post: CommunityFeed.Post) -> [AlertChoice] {
    var out: [AlertChoice] = []
    if post.mine {
      out.append(AlertChoice(
        title: post.commentsOff
          ? String(localized: "community.menu.commentson") : String(localized: "community.menu.commentsoff")
      ) { Task { await setCommentsOff(!post.commentsOff, post) } })
      out.append(AlertChoice(title: String(localized: "community.menu.deletepost"), role: .destructive) {
        confirmDelete(post)
      })
    } else {
      out.append(AlertChoice(title: String(localized: "community.menu.hide")) { Task { await hide(post) } })
      if let a = post.author {
        out.append(AlertChoice(title: String(localized: "community.user.mute \(a.handle)")) { Task { await mute(a) } })
      }
      out.append(AlertChoice(title: String(localized: "community.post.report")) { askReason(post) })
      if let a = post.author {
        out.append(AlertChoice(title: String(localized: "community.user.block \(a.handle)"), role: .destructive) {
          confirmBlock(a)
        })
      }
    }
    return out + [.cancel()]
  }

  private func askReason(_ post: CommunityFeed.Post) {
    ConfirmAlert.choose(
      title: String(localized: "community.menu.reportwhy"),
      choices: [CommunityReportReason.spam, .harassment, .inappropriate, .misleading].map { r in
        AlertChoice(title: HiddenNoticeView.reasonText(r)) { Task { await report(post, reason: r) } }
      } + [.cancel()])
  }

  private func confirmDelete(_ post: CommunityFeed.Post) {
    ConfirmAlert.choose(
      title: String(localized: "community.menu.deletepost"), message: String(localized: "community.menu.deletepostbody"),
      choices: [
        .cancel(),
        AlertChoice(title: String(localized: "community.menu.delete"), role: .destructive) { Task { await delete(post) } },
      ])
  }

  private func confirmBlock(_ a: CommunityFeed.Author) {
    ConfirmAlert.choose(
      title: String(localized: "community.user.blockconfirm \(a.handle)"),
      message: String(localized: "community.user.blockbody"),
      choices: [
        .cancel(),
        AlertChoice(title: String(localized: "community.user.block \(a.handle)"), role: .destructive) {
          Task { await block(a) }
        },
      ])
  }

  /// Sau báo cáo: mời tắt tiếng / chặn người ấy.
  private func offerAfterReport(_ a: CommunityFeed.Author) {
    ConfirmAlert.choose(
      title: String(localized: "community.menu.reportednext"),
      message: String(localized: "community.menu.reportednextbody \(a.handle)"),
      choices: [
        AlertChoice(title: String(localized: "community.user.mute \(a.handle)")) { Task { await mute(a) } },
        AlertChoice(title: String(localized: "community.user.block \(a.handle)"), role: .destructive) {
          confirmBlock(a)
        },
        AlertChoice(title: String(localized: "community.menu.reportedok"), role: .cancel),
      ])
  }

  // MARK: - Lệnh

  private func say(_ out: CommunityPostActions.Outcome, done: String?) {
    switch out {
    case .done: message = done
    case .failed(let f): message = CommunityPostView.failureText(f)
    case .ignored: break
    }
  }

  /// `tryIt`: chép CẤU TRÚC buổi (tạ về 0, chỉ bài thư viện) thành template
  /// `community` rồi ghi lượt thử; báo số bài tự tạo không chép được.
  private func tryPost(_ post: CommunityFeed.Post) async {
    taps += 1
    guard let tryBook, let editor = flow.plan else {
      message = String(localized: "async.error.generic")
      return
    }
    let out = await tryBook.tryWorkout(post, fallbackName: String(localized: "community.workout")) {
      id, title, lines, fallback in
      try await editor.copyShared(id: id, title: title, lines: lines, fallbackName: fallback).skipped
    }
    switch out {
    case .tried(let skipped):
      tried += 1
      message =
        skipped == 0
        ? String(localized: "community.tried")
        : String(localized: "community.tried") + " · " + Self.skippedText(skipped)
    case .nothingToCopy: message = String(localized: "community.trynone")
    case .refused: message = String(localized: "async.error.generic")
    case .busy: break
    }
  }

  static func skippedText(_ n: Int) -> String {
    n == 1 ? String(localized: "community.tried.skipped.one \(n)") : String(localized: "community.tried.skipped.other \(n)")
  }

  private func setCommentsOff(_ off: Bool, _ post: CommunityFeed.Post) async {
    guard let actions else { return }
    let out = await actions.setCommentsOff(off, postId: post.id, host: host)
    say(out, done: off ? String(localized: "community.menu.commentsoffdone") : String(localized: "community.menu.commentsondone"))
  }

  private func delete(_ post: CommunityFeed.Post) async {
    guard let actions else { return }
    say(await actions.delete(postId: post.id, host: host), done: String(localized: "community.menu.deleted"))
  }

  private func hide(_ post: CommunityFeed.Post) async {
    guard let actions else { return }
    say(await actions.hide(postId: post.id, host: host), done: String(localized: "community.menu.hidden"))
  }

  private func report(_ post: CommunityFeed.Post, reason: CommunityReportReason) async {
    guard let actions else { return }
    let author = post.author
    let out = await actions.report(postId: post.id, reason: reason, host: host)
    if out == .done, let author {
      // Bước người ta thường cần tiếp theo: không thấy NGƯỜI ấy nữa.
      offerAfterReport(author)
    } else {
      say(out, done: String(localized: "community.post.reported"))
    }
  }

  private func mute(_ a: CommunityFeed.Author) async {
    guard let actions else { return }
    say(await actions.mute(author: a, host: host), done: String(localized: "community.user.muted \(a.handle)"))
  }

  private func block(_ a: CommunityFeed.Author) async {
    guard let actions else { return }
    say(await actions.block(author: a, host: host), done: String(localized: "community.menu.blocked"))
  }
}

/// "Đã lưu vào thư viện" + "Xem thư viện" (`showToast` của RN) — băng nổi ở đáy
/// màn, tự ẩn sau 4 giây; app chưa có toast chung.
private struct SavedNoticeView: View {
  let showOpen: Bool
  let open: () -> Void

  var body: some View {
    HStack(spacing: DS.Spacing.sm) {
      Image(systemName: "bookmark.fill")
        .foregroundStyle(DS.Color.readinessGreen.swiftUI)
        .accessibilityHidden(true)
      Text("community.saved.toast")
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
      if showOpen {
        Spacer(minLength: DS.Spacing.sm)
        Button(action: open) {
          Text("community.saved.open")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(DS.Color.primary.swiftUI)
      }
    }
    .padding(.horizontal, DS.Spacing.md)
    .frame(minHeight: 44)
    .background(DS.Color.card.swiftUI, in: Capsule())
    .overlay(Capsule().strokeBorder(DS.Color.border.swiftUI))
    .padding(DS.Spacing.md)
  }
}

/// Chữ của nút "Chia sẻ" (`shareText` của ba thẻ RN): dòng đầu dịch ở đây,
/// phần thân là `CommunityShareText`.
enum PostShareText {
  /// Tiêu đề ngắn cho khung xem trước của bảng chia sẻ.
  static func title(_ post: CommunityFeed.Post) -> String {
    switch post.kind {
    case .workout: post.workout.title ?? String(localized: "community.workout")
    case .progress: String(localized: "community.kind.progress")
    case .recipe: post.recipe.map { $0.title.isEmpty ? String(localized: "community.recipe") : $0.title } ?? ""
    }
  }

  static func text(_ post: CommunityFeed.Post, unit: WeightUnit) -> String {
    switch post.kind {
    case .workout:
      let w = post.workout
      let title = w.title ?? String(localized: "community.workout")
      let n = Int(w.exerciseCount)
      let head =
        n == 1
        ? String(localized: "community.sharetext.workout.one \(title) \(n)")
        : String(localized: "community.sharetext.workout.other \(title) \(n)")
      return CommunityShareText.workout(w, head: head, unit: unit)
    case .progress:
      guard let p = post.progress else { return "" }
      let n = Int(p.weeks)
      let head =
        n == 1
        ? String(localized: "community.sharetext.progress.one \(n)")
        : String(localized: "community.sharetext.progress.other \(n)")
      let tiles = CommunityCard.tiles(p, unit: unit).map { (label: ProgressPostBody.label($0), tile: $0) }
      return CommunityShareText.progress(head: head, tiles: tiles)
    case .recipe:
      guard let r = post.recipe else { return "" }
      let title = r.title.isEmpty ? String(localized: "community.recipe") : r.title
      let kcal = CommunityCard.grouped(r.kcal, locale: .app)
      let head = String(localized: "community.sharetext.recipe \(title) \(kcal)")
      let macros = CommunityShareText.MacroLabels(
        protein: String(localized: "logMeal.protein"), carbs: String(localized: "logMeal.carbs"),
        fat: String(localized: "logMeal.fat"))
      return CommunityShareText.recipe(r, head: head, macros: macros, locale: .app)
    }
  }
}

/// Thích · bình luận · (khoảng trống) · lưu · chia sẻ — mỗi nút một ô 44 điểm.
/// Bình luận không phải nút riêng: chạm vào đó rơi xuống thẻ, mở bài.
struct PostActionsRow: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let post: CommunityFeed.Post
  let context: CommunityPostActionsContext
  var commentCount: Int?
  @Environment(\.weightUnit) private var unit
  @State private var taps = 0
  /// Hộp báo UIKit, hiện ngay khi gán (xem `ConfirmAlert`).
  private var message: String? {
    get { nil }
    nonmutating set { if let newValue { ConfirmAlert.ok(newValue) } }
  }

  var body: some View {
    HStack(spacing: 0) {
      toggle(
        .like, on: post.liked, icon: post.liked ? "heart.fill" : "heart", count: post.likeCount,
        label: String(localized: "community.like"),
        tint: post.liked ? DS.Color.readinessRed.swiftUI : DS.Color.mutedForeground.swiftUI)
      HStack(spacing: 4) {
        Image(systemName: "bubble.right").foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Text(verbatim: "\(commentCount ?? post.commentCount)")
          .font(DS.TextStyle.footnote.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(.horizontal, DS.Spacing.sm)
      .frame(minWidth: 44, minHeight: 44)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(verbatim: "\(String(localized: "community.comment")) · \(commentCount ?? post.commentCount)"))
      Spacer(minLength: 0)
      toggle(
        .save, on: post.saved, icon: post.saved ? "bookmark.fill" : "bookmark", count: nil,
        label: String(localized: "community.save"),
        tint: post.saved ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
      // Chia sẻ thành ẢNH của chính thẻ (15/10) kèm chữ như trước.
      ShareLink(
        item: PostShareImage(post: post, unit: unit),
        message: Text(verbatim: PostShareText.text(post, unit: unit)),
        preview: SharePreview(Text(verbatim: PostShareText.title(post)), image: PostShareImage(post: post, unit: unit))
      ) {
        Image(systemName: "square.and.arrow.up")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .padding(.horizontal, DS.Spacing.sm)
          .frame(minWidth: 44, minHeight: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .simultaneousGesture(TapGesture().onEnded { taps += 1 })
      .accessibilityLabel(Text("community.share.action"))
    }
    .padding(.horizontal, -DS.Spacing.sm)
    .sensoryFeedback(.selection, trigger: taps)
  }

  private func toggle(
    _ t: CommunityToggle, on: Bool, icon: String, count: Int?, label: String, tint: Color
  ) -> some View {
    Button {
      // `Haptics.selection()` của `onMutate`: mỗi lần chạm thích / lưu.
      taps += 1
      let saving = t == .save && !post.saved
      Task {
        switch await context.actions.toggle(t, postId: post.id, host: context.host) {
        case .failed(let f): message = CommunityPostView.failureText(f)
        case .done: if saving { context.saved?() }
        default: break
        }
      }
    } label: {
      HStack(spacing: 4) {
        // Tim nảy khi bật (14/10): phản hồi ngay, trước khi server trả lời.
        Image(systemName: icon)
          .foregroundStyle(tint)
          .contentTransition(.symbolEffect(.replace))
          .symbolEffect(.bounce.up.byLayer, value: on)
        if let count {
          Text(verbatim: "\(count)").font(DS.TextStyle.footnote.monospacedDigit()).foregroundStyle(tint)
            .contentTransition(.numericText(value: Double(count)))
        }
      }
      .padding(.horizontal, DS.Spacing.sm)
      .frame(minWidth: 44, minHeight: 44)
      .contentShape(Rectangle())
      .animation(DSMotion.animation(.snappy, reduceMotion: reduceMotion), value: on)
    }
    .buttonStyle(.plain)
    .sensoryFeedback(.impact(weight: .light), trigger: on) { _, new in t == .like && new }
    .accessibilityLabel(Text(verbatim: count.map { "\(label) · \($0)" } ?? label))
    .accessibilityAddTraits(on ? .isSelected : [])
  }
}

/// Thẻ bài thành ảnh PNG để chia sẻ (Story, tin nhắn): vẽ đúng `PostCardView`
/// ở chế độ `forShare` (không nút, dải thương hiệu), 3×, nền trong suốt bo góc.
/// Ảnh minh hoạ tải mạng không vẽ được đồng bộ nên bỏ — mặt màu là hình.
struct PostShareImage: Transferable {
  let post: CommunityFeed.Post
  let unit: WeightUnit

  static var transferRepresentation: some TransferRepresentation {
    DataRepresentation(exportedContentType: .png) { item in
      try await item.png()
    }
  }

  @MainActor private func png() throws -> Data {
    let card = PostCardView(post: post, artURL: nil, unit: unit, full: true, forShare: true)
      .frame(width: 360)
      .padding(20)
      .background(DS.Color.metricBeige.solid.opacity(0.18))
      .environment(\.locale, Locale.app)
    let renderer = ImageRenderer(content: card)
    renderer.scale = 3
    guard let data = renderer.uiImage?.pngData() else { throw CocoaError(.fileWriteUnknown) }
    return data
  }
}
