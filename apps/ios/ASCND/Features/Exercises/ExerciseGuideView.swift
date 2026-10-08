import ASCNDCore
import ASCNDDesignSystem
import AVKit
import SwiftUI

/// Hướng dẫn bài tập (#527 Phase 2) — sheet `app/exercise-guide.tsx` @
/// fac9ac2, trên `ExerciseGuideBook` (#440: id → tên → không có; nội dung theo
/// tiếng, es đọc en; media một kiểu một bộ). Màn không biết gì về cơ sở dữ
/// liệu: nhãn, nội dung, media đều đến từ lõi đã chọn sẵn.
///
/// RN behavior (giữ nguyên):
/// - tên bài + MỘT dòng "Nhóm cơ · Dụng cụ" (nhãn đầy đủ ở VoiceOver);
/// - ba tab: Tổng quan / Cơ & dụng cụ / Liên quan — tab là state của sheet,
///   không phải một chỗ để Back lùi về; chỉ thanh tab chuyển động, nội dung
///   đổi ngay;
/// - Tổng quan: các bước có hình (chỉ tấm CÓ chú thích), "Cách thực hiện" có
///   số, kẻ ngang khi có hai khối, "Điểm kỹ thuật" ✓ / "Lỗi thường gặp" ✕ (hai
///   cột khi đủ chỗ và chữ chưa phóng to), "chưa có hướng dẫn" chỉ khi không
///   có cả chữ lẫn media;
/// - Cơ & dụng cụ: từng nhóm cơ; dụng cụ (hình chỉ cho tạ đơn); câu riêng khi
///   chưa ghi;
/// - Liên quan: bài cùng nhóm cơ (chung nhiều trước), bài cùng dụng cụ; thư
///   viện chỉ được đọc khi mở tab này; đọc hỏng ≠ không có;
/// - nút "Bắt đầu bài tập" ở đáy và ✕ cùng làm một việc: đóng sheet.
///
/// Khác RN có chủ đích:
/// - không có ảnh demo `DEMO_HERO` (RN tự ghi là tạm thời, "phải gỡ"): không
///   có media thì không dựng khung hình;
/// - chưa có hình giải phẫu `MuscleArt` (cùng chỗ thiếu với builder): ô nhóm
///   cơ là nhãn;
/// - bản đã đọc (theo người, bài, ngôn ngữ) hiện ngay kể cả offline; lỗi làm
///   mới chỉ chiếm màn khi chưa có bản nào.
struct ExerciseGuideView: View {
  let guides: ExerciseGuideBook
  /// Cho tab Liên quan; `nil` thì tab ấy nói "không tải được".
  let library: ExerciseLibrary?
  let exerciseId: String?
  let name: String

  @Environment(\.dismiss) private var dismiss
  @Environment(\.locale) private var locale
  @Environment(\.dynamicTypeSize) private var typeSize
  @State private var tab: GuideTab = .overview
  @State private var page = 0
  @State private var viewer: ViewerTarget?

  private var lang: MuscleGroup.Language { MuscleGroup.Language(locale: locale) }
  private var title: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
  private var g: ExerciseGuide? { guides.guide }
  private var displayName: String { g?.name ?? title }
  /// RN `showMedia = !isPending && !isError`: đã có một bản để vẽ.
  private var shown: Bool { g != nil }
  private var media: MediaState { g?.media ?? .none }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          if shown, media.hasMedia {
            hero
          }
          header
          if shown {
            Picker(selection: $tab) {
              ForEach(GuideTab.allCases) { t in
                Text(t.title).tag(t)
              }
            } label: {
              EmptyView()
            }
            .pickerStyle(.segmented)
            .sensoryFeedback(.selection, trigger: tab)
          }
          tabBody
        }
        .padding(DS.Spacing.md)
      }
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button {
            dismiss()
          } label: {
            Image(systemName: "xmark")
          }
          .accessibilityLabel(Text("eg.close"))
        }
      }
      .safeAreaInset(edge: .bottom) {
        if shown {
          DSButton(String(localized: "eg.start"), style: .primary) { dismiss() }
            .padding(DS.Spacing.md)
            .background(.bar)
        }
      }
      .fullScreenCover(item: $viewer) { target in
        GuideMediaViewer(media: media, name: displayName, start: target.index)
      }
    }
    .task(id: "\(exerciseId ?? "")|\(title)|\(lang.rawValue)") {
      await guides.open(exerciseId: exerciseId, name: title, lang: lang)
    }
    .task(id: tab) {
      // Thư viện chỉ được hỏi khi tab cần nó: đọc "Tổng quan" không trả giá mạng.
      if tab == .related, let library, !library.loaded { await library.load() }
    }
  }

  // MARK: - Đầu sheet

  private var meta: String {
    [g?.muscleGroup, g?.equipment].compactMap { $0 }.joined(separator: "  ·  ")
  }

  /// Nhãn không mất đi — chúng chuyển sang VoiceOver: "Ngực · Tạ đơn" đọc lên
  /// không nói rõ cái nào là cái gì.
  private var metaA11y: String {
    [
      g?.muscleGroup.map { "\(String(localized: "eg.muscles")): \($0)" },
      g?.equipment.map { "\(String(localized: "eg.equipment")): \($0)" },
    ].compactMap { $0 }.joined(separator: ". ")
  }

  private var header: some View {
    HStack(alignment: .top, spacing: DS.Spacing.sm) {
      VStack(alignment: .leading, spacing: DS.Spacing.xs) {
        if !displayName.isEmpty {
          Text(verbatim: displayName)
            .font(DS.TextStyle.title2)
            .accessibilityAddTraits(.isHeader)
        }
        if !meta.isEmpty {
          Text(verbatim: meta)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .accessibilityLabel(Text(verbatim: metaA11y))
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if shown, media.hasMedia {
        Button {
          viewer = ViewerTarget(index: page)
        } label: {
          Image(systemName: media.shape == .video ? "play.fill" : "arrow.up.left.and.arrow.down.right")
            .frame(minWidth: 44, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .buttonBorderShape(.circle)
        .accessibilityLabel(Text("eg.openMedia"))
      }
    }
  }

  // MARK: - Khung hình

  private var hero: some View {
    TabView(selection: $page) {
      ForEach(Array(media.items.enumerated()), id: \.offset) { i, item in
        MediaThumb(item: item, label: mediaA11y(item))
          .tag(i)
      }
    }
    .tabViewStyle(.page(indexDisplayMode: media.showsDots ? .always : .never))
    .aspectRatio(3 / 4, contentMode: .fit)
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.lg))
    .overlay(alignment: .bottomTrailing) {
      if let d = media.displayDuration {
        Text(verbatim: MediaState.clockLabel(d))
          .font(DS.TextStyle.caption.monospacedDigit())
          .padding(.horizontal, DS.Spacing.sm)
          .padding(.vertical, DS.Spacing.xs)
          .background(.ultraThinMaterial, in: Capsule())
          .padding(DS.Spacing.sm)
      }
    }
  }

  /// `mediaLabel` thắng `alt`, thắng câu dựng sẵn.
  private func mediaA11y(_ item: MediaItem) -> String {
    item.title.map { "\(displayName) — \($0)" } ?? item.alt ?? String(localized: "eg.mediaAlt \(displayName)")
  }

  // MARK: - Thân tab

  @ViewBuilder private var tabBody: some View {
    if g == nil, guides.failure == nil {
      ProgressView().frame(maxWidth: .infinity, minHeight: 88)
    } else if g == nil {
      DSErrorView(message: String(localized: "eg.loadFailed")) {
        Task { await guides.open(exerciseId: exerciseId, name: title, lang: lang) }
      }
    } else if let g {
      switch tab {
      case .overview: overview(g)
      case .muscles: muscles(g)
      case .related: related(g)
      }
    }
  }

  @ViewBuilder private func overview(_ g: ExerciseGuide) -> some View {
    let steps4 = g.media.captionedItems
    if !steps4.isEmpty {
      VStack(alignment: .leading, spacing: DS.Spacing.lg) {
        ForEach(Array(steps4.enumerated()), id: \.offset) { i, item in
          mediaStep(item, index: i)
        }
      }
    }
    if !g.instructions.isEmpty {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        sectionTitle("eg.howTo")
        ForEach(Array(g.instructions.enumerated()), id: \.offset) { i, t in
          HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
            Text(verbatim: "\(i + 1)")
              .font(DS.TextStyle.caption.monospacedDigit())
              .frame(minWidth: 22, minHeight: 22)
              .background(DS.Color.secondary.swiftUI, in: Circle())
            Text(verbatim: t).font(DS.TextStyle.body)
          }
          .accessibilityElement(children: .combine)
        }
      }
    }
    let ruled = !g.instructions.isEmpty && (!g.formCues.isEmpty || !g.commonMistakes.isEmpty)
    if ruled { Divider() }
    if !g.formCues.isEmpty || !g.commonMistakes.isEmpty {
      // Hai cột chỉ khi có cả hai danh sách và chữ chưa bị phóng: không hy
      // sinh độ dễ đọc để giống ảnh tham chiếu.
      let twoCols = !g.formCues.isEmpty && !g.commonMistakes.isEmpty && typeSize <= .large
      let layout = twoCols
        ? AnyLayout(HStackLayout(alignment: .top, spacing: DS.Spacing.md))
        : AnyLayout(VStackLayout(alignment: .leading, spacing: DS.Spacing.md))
      layout {
        if !g.formCues.isEmpty {
          markedList("eg.cues", g.formCues, symbol: "checkmark", tint: DS.Color.primary.swiftUI)
        }
        if !g.commonMistakes.isEmpty {
          markedList("eg.mistakes", g.commonMistakes, symbol: "xmark", tint: DS.Color.destructive.swiftUI)
        }
      }
    }
    // Siêu dữ liệu không phải hướng dẫn; media thì có tính.
    if !g.hasContent, !g.media.hasMedia {
      VStack(alignment: .leading, spacing: DS.Spacing.xs) {
        Text("eg.empty").font(DS.TextStyle.body)
        Text("eg.empty.hint")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
  }

  /// ảnh → số bước → tiêu đề → mô tả; chạm ảnh mở trình xem ở đúng tấm ấy.
  private func mediaStep(_ item: MediaItem, index: Int) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      Button {
        let at = media.items.firstIndex(of: item) ?? 0
        viewer = ViewerTarget(index: at)
      } label: {
        MediaThumb(item: item, label: mediaA11y(item))
          .aspectRatio(4 / 3, contentMode: .fit)
          .clipShape(RoundedRectangle(cornerRadius: DS.Radius.md))
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(verbatim: mediaA11y(item)))
      .accessibilityHint(Text("eg.openMedia"))
      Text(verbatim: "\(index + 1)")
        .font(DS.TextStyle.caption.monospacedDigit())
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      if let t = item.title {
        Text(verbatim: t).font(DS.TextStyle.headline)
      }
      if !item.description.isEmpty {
        Text(verbatim: item.description)
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
  }

  /// Dấu mang NGHĨA và không chỉ ở màu (WCAG 1.4.1): tiêu đề nói thẳng nó là
  /// gì, hai glyph khác hình.
  private func markedList(_ titleKey: LocalizedStringKey, _ items: [String], symbol: String, tint: Color) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      sectionTitle(titleKey)
      ForEach(Array(items.enumerated()), id: \.offset) { _, t in
        HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
          Image(systemName: symbol)
            .font(.caption2.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: 20, height: 20)
            .background(tint, in: Circle())
            .accessibilityHidden(true)
          Text(verbatim: t).font(DS.TextStyle.body)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder private func muscles(_ g: ExerciseGuide) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      sectionTitle("eg.muscles")
      if g.muscles.isEmpty {
        hint("eg.noMuscles")
      } else {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 88), spacing: DS.Spacing.sm)], spacing: DS.Spacing.sm) {
          ForEach(g.muscles, id: \.key) { m in
            Text(verbatim: m.label)
              .font(DS.TextStyle.footnote)
              .lineLimit(1)
              .frame(maxWidth: .infinity, minHeight: 64)
              .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
          }
        }
      }
      sectionTitle("eg.equipment").padding(.top, DS.Spacing.sm)
      if let gear = g.equipment {
        HStack(spacing: DS.Spacing.sm) {
          // Hình chỉ khi đã vẽ đúng dụng cụ ấy: vẽ tạ đơn cho bài kéo cáp là nói sai.
          if g.equipmentKey == Equipment.dumbbell.rawValue {
            Image(systemName: "dumbbell.fill")
              .font(.title2)
              .frame(width: 64, height: 64)
              .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
              .accessibilityHidden(true)
          }
          Text(verbatim: gear).font(DS.TextStyle.body).lineLimit(2)
        }
      } else {
        hint("eg.noEquipment")
      }
    }
  }

  @ViewBuilder private func related(_ g: ExerciseGuide) -> some View {
    // RN đưa `guideLang` (es → en) cho nhãn nhóm cơ của bài liên quan.
    let relatedLang = MuscleGroup.Language(rawValue: GuideLang(lang).rawValue) ?? .en
    let subject = GuideRelated.Subject(g)
    let rows = library?.exercises ?? []
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      sectionTitle("eg.alsoMuscles")
      if g.muscles.isEmpty {
        hint("eg.noMuscles")
      } else {
        relatedList(GuideRelated.sameMuscle(rows, subject, lang: relatedLang), empty: "eg.noRelated")
      }
      // Không có dụng cụ thì mục này không dựng — tab Cơ & dụng cụ đã nói rồi.
      if let gear = g.equipment {
        Text(String(localized: "eg.alsoEquipment \(gear)"))
          .font(DS.TextStyle.footnote.weight(.semibold))
          .padding(.top, DS.Spacing.sm)
        relatedList(GuideRelated.sameEquipment(rows, subject, lang: relatedLang), empty: nil)
      }
    }
  }

  @ViewBuilder private func relatedList(_ items: [GuideRelated.Item], empty: LocalizedStringKey?) -> some View {
    if let library, !library.loaded, library.failure == nil {
      ProgressView().frame(maxWidth: .infinity, minHeight: 44)
    } else if library == nil || (library?.exercises.isEmpty == true && library?.failure != nil) {
      // Đọc hỏng không phải "không có": họ có thể có ba mươi bài.
      hint("eg.loadFailed")
    } else if items.isEmpty {
      if let empty { hint(empty) }
    } else {
      VStack(alignment: .leading, spacing: 0) {
        ForEach(items) { r in
          HStack {
            Text(verbatim: r.name).font(DS.TextStyle.body).lineLimit(1)
            Spacer()
            Text(verbatim: r.muscleLabel)
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .lineLimit(1)
          }
          .frame(minHeight: 44)
          .accessibilityElement(children: .combine)
          if r.id != items.last?.id { Divider() }
        }
      }
    }
  }

  private func sectionTitle(_ key: LocalizedStringKey) -> some View {
    Text(key)
      .font(DS.TextStyle.footnote.weight(.semibold))
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .textCase(.uppercase)
      .accessibilityAddTraits(.isHeader)
  }

  private func hint(_ key: LocalizedStringKey) -> some View {
    Text(key)
      .font(DS.TextStyle.footnote)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }
}

enum GuideTab: String, CaseIterable, Identifiable {
  case overview, muscles, related
  var id: String { rawValue }

  var title: String {
    switch self {
    case .overview: String(localized: "eg.tab.overview")
    case .muscles: String(localized: "eg.tab.muscles")
    case .related: String(localized: "eg.tab.related")
    }
  }
}

private struct ViewerTarget: Identifiable {
  let index: Int
  var id: Int { index }
}

/// Một tấm media: ảnh, hay poster của video (video chạy ở trình xem).
private struct MediaThumb: View {
  let item: MediaItem
  let label: String

  var body: some View {
    let uri = item.kind == .video ? (item.posterUri ?? "") : item.uri
    ZStack {
      DS.Color.secondary.swiftUI
      if let url = URL(string: uri), !uri.isEmpty {
        AsyncImage(url: url) { phase in
          switch phase {
          case .success(let image): image.resizable().scaledToFill()
          case .failure: Image(systemName: "photo").foregroundStyle(DS.Color.mutedForeground.swiftUI)
          default: ProgressView()
          }
        }
      }
      if item.kind == .video {
        Image(systemName: "play.circle.fill")
          .font(.system(size: 44))
          .foregroundStyle(.white, .black.opacity(0.4))
          .accessibilityHidden(true)
      }
    }
    .clipped()
    .accessibilityElement()
    .accessibilityLabel(Text(verbatim: label))
    .accessibilityAddTraits(.isImage)
  }
}

/// Trình xem toàn màn (`app/media-viewer.tsx`): bộ ảnh vuốt ngang, mở đúng
/// tấm đã chạm; video có điều khiển hệ thống. Không có media thì nói thẳng.
struct GuideMediaViewer: View {
  let media: MediaState
  let name: String
  let start: Int

  @Environment(\.dismiss) private var dismiss
  @State private var page = 0

  var body: some View {
    NavigationStack {
      Group {
        if media.items.isEmpty {
          Text("eg.noMedia").foregroundStyle(.white)
        } else if media.shape == .video, let v = media.items.first {
          if let url = URL(string: v.uri) {
            VideoPlayer(player: AVPlayer(url: url))
              .accessibilityLabel(Text(verbatim: label(v)))
          } else {
            Text("eg.mediaFailed").foregroundStyle(.white)
          }
        } else {
          TabView(selection: $page) {
            ForEach(Array(media.items.enumerated()), id: \.offset) { i, item in
              VStack(spacing: DS.Spacing.sm) {
                AsyncImage(url: URL(string: item.uri)) { phase in
                  switch phase {
                  case .success(let image): image.resizable().scaledToFit()
                  case .failure: Text("eg.mediaFailed").foregroundStyle(.white)
                  default: ProgressView().tint(.white)
                  }
                }
                .accessibilityLabel(Text(verbatim: label(item)))
                if let t = item.title {
                  Text(verbatim: t).font(DS.TextStyle.headline).foregroundStyle(.white)
                }
                if !item.description.isEmpty {
                  Text(verbatim: item.description).font(DS.TextStyle.body).foregroundStyle(.white.opacity(0.8))
                }
              }
              .padding(DS.Spacing.md)
              .tag(i)
            }
          }
          .tabViewStyle(.page(indexDisplayMode: media.showsDots ? .always : .never))
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color.black)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button {
            dismiss()
          } label: {
            Image(systemName: "xmark").foregroundStyle(.white)
          }
          .accessibilityLabel(Text("eg.close"))
        }
      }
    }
    .onAppear { page = min(max(start, 0), max(0, media.items.count - 1)) }
  }

  private func label(_ item: MediaItem) -> String {
    item.title.map { "\(name) — \($0)" } ?? item.alt ?? String(localized: "eg.mediaAlt \(name)")
  }
}
