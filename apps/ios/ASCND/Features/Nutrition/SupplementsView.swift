import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Một thực phẩm bổ sung: dấu đã uống (chỉ đọc — xem dưới), tên, liều ·
/// thời điểm. Nút xoá nằm ở `SupplementsView`, ngoài phần tử gộp này.
struct SupplementRowLabel: View {
  let item: Supplement
  /// Đã uống để HIỆN (ý đang chờ của lớp Trạng thái thắng bản server).
  var taken: Bool? = nil

  private var shown: Bool { taken ?? item.taken }

  var body: some View {
    HStack(spacing: DS.Spacing.md) {
      Image(systemName: shown ? "checkmark.circle.fill" : "circle")
        .font(.title2)
        .foregroundStyle(shown ? MascotRoomView.signalColor(.meal) : DS.Color.mutedForeground.swiftUI.opacity(0.6))
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: item.name)
          .font(DS.TextStyle.body)
          .strikethrough(shown)
          .foregroundStyle(shown ? DS.Color.mutedForeground.swiftUI : DS.Color.foreground.swiftUI)
        let detail = Supplements.detail(dose: item.doseText, timingLabel: SupplementsView.timingLabel(item.timing))
        if !detail.isEmpty {
          Text(verbatim: detail)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      Spacer(minLength: 0)
    }
    .accessibilityElement(children: .combine)
    .accessibilityValue(
      Text(shown ? String(localized: "supplements.a11y.taken") : String(localized: "supplements.a11y.notTaken")))
  }
}

/// Màn Thực phẩm bổ sung (#527 Phase 3 · 3.9) — `app/supplements.tsx` trên
/// `SupplementBook`.
///
/// Như RN:
/// - nút "+" trên thanh điều hướng mở / đóng khung thêm: tên, liều, một trong
///   năm thời điểm; Lưu khoá khi tên rỗng hay đang gửi;
/// - thẻ "Hôm nay · x / y đã uống hôm nay", rồi từng mục: liều · thời điểm;
/// - xoá hỏi lại; thêm / xoá chỉ khi có mạng;
/// - rỗng: "Chưa có supplement nào" + gợi ý (chữ của RN, nguyên văn).
///
/// Khác RN / chưa có:
/// - thiết kế lại 13/10 (chủ dự án duyệt mock): vòng tiến độ + việc còn lại,
///   một thẻ danh sách, dấu tick màu cam bữa ăn, xoá bằng vuốt / giữ lâu /
///   hành động VoiceOver (RN: nút thùng rác trên mỗi hàng);
/// - tick "đã uống" qua lớp Trạng thái #161 (`StateWriter`, chủ dự án chốt
///   port 2026-10-12): giá trị tuyệt đối, gộp theo (mục, ngày), ý cuối thắng;
///   mất mạng thì giữ trong phiên và báo MỘT lần ("tắt app trước lúc đó thì
///   thay đổi này mất"); mục đã xoá ở nơi khác thì bỏ ý và báo;
/// - chưa có toast: kết quả hiện bằng hộp thoại và được VoiceOver đọc;
/// - lần đọc đầu hỏng thì nói lỗi (RN cũng ném lỗi, không hiện "chưa uống").
struct SupplementsView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let book: SupplementBook
  @Environment(AppServices.self) private var services
  @State private var adding = false
  @State private var name = ""
  @State private var dose = ""
  @State private var timing = Supplements.defaultTiming
  @State private var pendingDelete: Supplement?
  @State private var message: String?
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  @Environment(\.colorScheme) private var scheme

  /// Nền hàng gần với thẻ kính (`todayCard`) trên giấy ấm; Giảm trong suốt → đặc.
  private var rowFill: some View {
    Group {
      if reduceTransparency { DS.Color.card.swiftUI } else { Color.white.opacity(scheme == .dark ? 0.08 : 0.55) }
    }
  }

  var body: some View {
    content
      .navigationTitle(String(localized: "supplements.title"))
      .ascndPage()
      .toolbar {
        ToolbarItem(placement: .primaryAction) {
          Button {
            adding.toggle()
          } label: {
            Image(systemName: adding ? "xmark" : "plus")
              .frame(minWidth: 44, minHeight: 44)
          }
          .accessibilityLabel(Text(adding ? String(localized: "supplements.a11y.close") : String(localized: "supplements.a11y.add")))
          .sensoryFeedback(.selection, trigger: adding)
        }
      }
      .refreshable { await book.refresh() }
      .onChange(of: services.stateWriter.notice) { _, notice in
        switch notice {
        case .gone: message = String(localized: "state.gone")
        case .failed: message = String(localized: "async.error.generic")
        case nil: return
        }
        services.stateWriter.clearNotice()
      }
      .task { await book.refresh() }
      .alert(
        pendingDelete.map { String(localized: "supplements.delete.confirm \($0.name)") } ?? "",
        isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
        presenting: pendingDelete
      ) { item in
        Button(String(localized: "supplements.delete"), role: .destructive) {
          Task { await delete(item) }
        }
        Button(String(localized: "common.cancel"), role: .cancel) {}
      }
      .alert(
        message ?? "",
        isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })
      ) {
        Button(String(localized: "common.cancel"), role: .cancel) {}
      }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView()
    case .failed(.offline):
      DSOfflineView { Task { await book.refresh() } }
    case .failed:
      DSErrorView(message: String(localized: "async.error.generic")) { Task { await book.refresh() } }
    case .ready(let items):
      // `List` để có vuốt-xoá của hệ thống; tô như thẻ danh sách của tab
      // (thiết kế lại 13/10, chủ dự án duyệt mock).
      List {
        if adding {
          form.listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
        }
        if items.isEmpty {
          DSEmptyState(
            systemImage: "pills",
            title: String(localized: "supplements.empty.title"),
            message: String(localized: "supplements.empty.hint"))
            .listRowBackground(Color.clear)
        } else {
          Section {
            summary(items)
          }
          .listRowBackground(Color.clear)
          .listRowInsets(EdgeInsets())
          Section {
            ForEach(items) { item in
              row(item)
                .listRowBackground(rowFill)
                .alignmentGuide(.listRowSeparatorLeading) { _ in 44 }
            }
          } footer: {
            Text(String(localized: "supplements.swipeHint"))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
      }
      .listStyle(.insetGrouped)
      .scrollContentBackground(.hidden)
      .listSectionSpacing(DS.Spacing.md)
    }
  }

  // MARK: - Hôm nay

  /// Vòng "đã uống / tổng" + việc còn lại (thiết kế lại 13/10).
  private func summary(_ items: [Supplement]) -> some View {
    let taken = book.shownTakenCount(writer: services.stateWriter)
    let left = items.filter { !book.shownTaken($0, writer: services.stateWriter) }
    let accent = MascotRoomView.signalColor(.meal)
    return HStack(spacing: DS.Spacing.md) {
      ZStack {
        Circle().stroke(accent.opacity(0.18), lineWidth: 6)
        Circle()
          .trim(from: 0, to: items.isEmpty ? 0 : CGFloat(taken) / CGFloat(items.count))
          .stroke(accent, style: StrokeStyle(lineWidth: 6, lineCap: .round))
          .rotationEffect(.degrees(-90))
          .animation(DSMotion.animation(.snappy, reduceMotion: reduceMotion), value: taken)
        Text(verbatim: "\(taken)/\(items.count)")
          .font(.custom("Menlo", size: 15, relativeTo: .body).weight(.semibold))
          .monospacedDigit()
      }
      .frame(width: 60, height: 60)
      .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(String(localized: "supplements.today")).font(DS.TextStyle.headline)
        Text(left.isEmpty
          ? String(localized: "supplements.allTaken")
          : String(localized: "supplements.left \(left.count)") + " — " + left.map(\.name).formatted(.list(type: .and).locale(.app)))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(2)
      }
      Spacer(minLength: 0)
    }
    .padding(DS.Spacing.md)
    .todayCard()
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text(String(localized: "supplements.today")))
    .accessibilityValue(Text(verbatim: "\(taken) / \(items.count) " + String(localized: "supplements.takenToday")))
  }

  private func row(_ item: Supplement) -> some View {
    let taken = book.shownTaken(item, writer: services.stateWriter)
    return HStack(spacing: DS.Spacing.sm) {
      // `toggle.set(s.id, !s.taken)`: cả hàng là ô tick; xoá bằng vuốt.
      Button {
        let wasEmpty = services.stateWriter.size == 0
        let outcome = book.setTaken(item, taken: !taken, writer: services.stateWriter)
        // Nói MỘT lần mỗi đợt mất mạng, lúc ý chờ đầu tiên xuất hiện — và nói
        // trước điều sẽ mất.
        if outcome == .queued, !services.sync.online, wasEmpty {
          message = String(localized: "state.queued")
        }
      } label: {
        SupplementRowLabel(item: item, taken: taken)
          .frame(minHeight: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .sensoryFeedback(.selection, trigger: taken)
      .accessibilityAddTraits(taken ? [.isButton, .isSelected] : .isButton)
      .accessibilityAction(named: Text(String(localized: "supplements.a11y.delete \(item.name)"))) {
        pendingDelete = item
      }
    }
    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
      Button(role: .destructive) {
        pendingDelete = item
      } label: {
        Label(String(localized: "supplements.delete"), systemImage: "trash")
      }
      .disabled(book.deleting)
    }
    .contextMenu {
      Button(role: .destructive) {
        pendingDelete = item
      } label: {
        Label(String(localized: "supplements.delete"), systemImage: "trash")
      }
    }
  }

  // MARK: - Thêm

  private var form: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text(String(localized: "supplements.add.title")).font(DS.TextStyle.headline)
        field(String(localized: "supplements.name")) {
          TextField(text: $name, prompt: Text(String(localized: "supplements.name.placeholder"))) { Text(String(localized: "supplements.name")) }
            .textInputAutocapitalization(.words)
        }
        field(String(localized: "supplements.dose")) {
          TextField(text: $dose, prompt: Text(verbatim: "5g")) { Text(String(localized: "supplements.dose")) }
        }
        Text(String(localized: "supplements.timing"))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Picker(selection: $timing) {
          ForEach(Supplements.timings, id: \.self) { key in
            Text(verbatim: Self.timingLabel(key) ?? key).tag(key)
          }
        } label: {
          Text(String(localized: "supplements.timing"))
        }
        .pickerStyle(.menu)
        .frame(minHeight: 44)
        DSButton(String(localized: "common.save")) {
          Task { await submit() }
        }
        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || book.adding)
        .opacity(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || book.adding ? 0.5 : 1)
      }
    }
  }

  private func field<Input: View>(_ label: String, @ViewBuilder _ input: () -> Input) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(verbatim: label)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
      input()
        .padding(DS.Spacing.sm)
        .frame(minHeight: 44)
        .background(DS.Color.input.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
    }
  }

  private func submit() async {
    switch await book.add(name: name, dose: dose, timing: timing, online: services.sync.online) {
    case .added:
      adding = false
      name = ""
      dose = ""
      timing = Supplements.defaultTiming
    case .emptyName:
      break
    case .onlineOnly:
      show(String(localized: "supplements.error.onlineOnly"))
    case .failed:
      show(String(localized: "async.error.generic"))
    }
  }

  private func delete(_ item: Supplement) async {
    switch await book.delete(id: item.id, online: services.sync.online) {
    case .deleted: break
    case .onlineOnly: show(String(localized: "supplements.error.onlineOnly"))
    case .nothingWritten: show(String(localized: "supplements.error.nothingWritten"))
    case .failed: show(String(localized: "async.error.generic"))
    }
  }

  private func show(_ text: String) {
    message = text
    AccessibilityNotification.Announcement(text).post()
  }

  /// `timingLabel`: nhãn của năm thời điểm; giá trị lạ (bản web cũ) hiện nguyên.
  static func timingLabel(_ t: String?) -> String? {
    switch t {
    case "morning": String(localized: "supplements.timing.morning")
    case "pre-workout": String(localized: "supplements.timing.preWorkout")
    case "post-workout": String(localized: "supplements.timing.postWorkout")
    case "with meals": String(localized: "supplements.timing.withMeal")
    case "before bed": String(localized: "supplements.timing.beforeBed")
    default: t
    }
  }
}
