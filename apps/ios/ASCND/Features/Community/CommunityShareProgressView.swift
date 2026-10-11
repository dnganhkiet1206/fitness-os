import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Chia sẻ tiến trình (#527, lát 12) — `app/community-share-progress.tsx` @
/// fac9ac2 trên `CommunityShareProgressBook`.
///
/// Như RN: khoảng thời gian → những số nào (cân nặng bật sẵn, vòng eo phải
/// chủ động bật, bài sức mạnh: Không / 6 bài có tạ hay tập nhất) → thẻ xem
/// trước do SERVER dựng (`build_progress_payload`, chưa đủ dữ liệu thì nói
/// đúng lý do) → phong cách ảnh → chú thích → ai thấy → Đăng (chỉ khi có
/// thẻ). Chưa có hồ sơ: lời mời tạo hồ sơ. Lối vào: "Bạn muốn chia sẻ gì?" →
/// Tiến trình của tôi.
struct CommunityShareProgressScreen: View {
  var onPosted: () -> Void = {}
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @State private var book: CommunityShareProgressBook?
  @State private var built = false

  var body: some View {
    Group {
      if let book {
        CommunityShareProgressView(book: book, onPosted: onPosted)
      } else if built {
        ContentUnavailableView {
          Label("community.shareprogress.title", systemImage: "chart.line.uptrend.xyaxis")
        } description: {
          Text("placeholder.building")
        }
      } else {
        DSLoadingView()
      }
    }
    .task {
      guard !built else { return }
      book = services.makeCommunityShareProgress(userId: flow.today.userId)
      built = true
    }
  }
}

struct CommunityShareProgressView: View {
  @Bindable var book: CommunityShareProgressBook
  var onPosted: () -> Void
  @Environment(\.weightUnit) private var unit
  @Environment(\.dismiss) private var dismiss
  @State private var message: String?
  @State private var taps = 0
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
    .navigationTitle(Text("community.shareprogress.title"))
    .navigationBarTitleDisplayMode(.inline)
    .task { if book.phase == .loading { await book.load() } }
    .task(id: book.options) { await book.refreshPreview() }
    .sensoryFeedback(.selection, trigger: taps)
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
      options
      previewBlock
      ShareCaptionCard(
        caption: $book.caption, placeholder: "community.shareprogress.captionph",
        visibility: Binding(get: { book.visibility }, set: { book.visibilityPick = $0 }))
      SharePrivacyNote(text: "community.shareprogress.privacy")
      SharePostButton(posting: book.posting, enabled: book.preview != nil) { Task { await post() } }
    }
  }

  private var options: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        label("community.shareprogress.range")
        Picker(selection: $book.options.weeks) {
          ForEach(CommunityShareProgress.ranges, id: \.self) { r in
            Text("community.shareprogress.weeks \(r)").tag(r)
          }
        } label: {
          Text("community.shareprogress.range")
        }
        .pickerStyle(.segmented)
        label("community.shareprogress.include").padding(.top, DS.Spacing.sm)
        Toggle(isOn: $book.options.weight) {
          Text("community.shareprogress.weight").font(DS.TextStyle.body)
        }
        .tint(DS.Color.readinessGreen.swiftUI)
        .frame(minHeight: 44)
        Toggle(isOn: $book.options.waist) {
          Text("community.shareprogress.waist").font(DS.TextStyle.body)
        }
        .tint(DS.Color.readinessGreen.swiftUI)
        .frame(minHeight: 44)
        label("community.shareprogress.lift").padding(.top, DS.Spacing.sm)
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: DS.Spacing.sm) {
            chip(nil, String(localized: "community.shareprogress.nolift"))
            ForEach(book.lifts) { l in chip(l.id, l.name) }
          }
        }
      }
    }
  }

  private func label(_ key: LocalizedStringKey) -> some View {
    Text(key).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }

  private func chip(_ id: String?, _ name: String) -> some View {
    let on = book.options.liftId == id
    return Button {
      taps += 1
      book.options.liftId = id
    } label: {
      Text(verbatim: name)
        .font(DS.TextStyle.footnote.weight(.semibold))
        .lineLimit(1)
        .foregroundStyle(on ? DS.Color.primaryForeground.swiftUI : DS.Color.foreground.swiftUI)
        .padding(.horizontal, DS.Spacing.md)
        .frame(height: 36)
        .background(on ? DS.Color.primary.swiftUI : DS.Color.secondary.swiftUI, in: Capsule())
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(on ? .isSelected : [])
  }

  @ViewBuilder private var previewBlock: some View {
    switch book.previewPhase {
    case .loading:
      if book.preview == nil { ProgressView().frame(maxWidth: .infinity, minHeight: 44) }
    case .nothing:
      Text("community.shareprogress.nothing")
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
    case .ready:
      if let preview = book.preview {
        PostCardView(post: preview, artURL: preview.art.flatMap(book.artURL), unit: unit)
          .allowsHitTesting(false)
        ShareStylePicker(styles: book.styles, current: book.art?.style) { book.stylePick = $0 }
      }
    }
  }

  private func post() async {
    taps += 1
    switch await book.post() {
    case .posted:
      posted.toggle()
      onPosted()
      dismiss()
    case .failed(.profileRequired):
      openProfile = true
    case .failed(let f):
      message = CommunityShareWorkoutView.failureText(f)
    case .ignored:
      break
    }
  }
}
