import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Một thực phẩm bổ sung: dấu đã uống (chỉ đọc — xem dưới), tên, liều ·
/// thời điểm. Nút xoá nằm ở `SupplementsView`, ngoài phần tử gộp này.
struct SupplementRowLabel: View {
  let item: Supplement

  var body: some View {
    HStack(spacing: DS.Spacing.md) {
      Image(systemName: item.taken ? "checkmark.circle.fill" : "circle")
        .font(.title3)
        .foregroundStyle(item.taken ? DS.Color.readinessGreen.swiftUI : DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: item.name)
          .font(DS.TextStyle.headline)
          .strikethrough(item.taken)
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
      Text(item.taken ? String(localized: "supplements.a11y.taken") : String(localized: "supplements.a11y.notTaken")))
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
/// - **tick "đã uống" chưa port** — RN đi qua lớp Trạng thái #161
///   (`state-write`), native chưa có lõi ấy (chờ chốt owner, #527). Dấu tick
///   ở đây CHỈ ĐỌC trạng thái server, không bấm được;
/// - chưa có toast: kết quả hiện bằng hộp thoại và được VoiceOver đọc;
/// - lần đọc đầu hỏng thì nói lỗi (RN cũng ném lỗi, không hiện "chưa uống").
struct SupplementsView: View {
  let book: SupplementBook
  @Environment(AppServices.self) private var services
  @State private var adding = false
  @State private var name = ""
  @State private var dose = ""
  @State private var timing = Supplements.defaultTiming
  @State private var pendingDelete: Supplement?
  @State private var message: String?

  var body: some View {
    content
      .navigationTitle(String(localized: "supplements.title"))
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
      .task { await book.refresh() }
      .confirmationDialog(
        pendingDelete.map { String(localized: "supplements.delete.confirm \($0.name)") } ?? "",
        isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
        titleVisibility: .visible,
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
      ScrollView {
        VStack(spacing: DS.Spacing.md) {
          if adding { form }
          if items.isEmpty {
            DSEmptyState(
              systemImage: "pills",
              title: String(localized: "supplements.empty.title"),
              message: String(localized: "supplements.empty.hint"))
          } else {
            summary(items)
            ForEach(items) { item in row(item) }
          }
        }
        .padding(DS.Spacing.md)
      }
    }
  }

  // MARK: - Hôm nay

  private func summary(_ items: [Supplement]) -> some View {
    DSCard {
      HStack(alignment: .firstTextBaseline) {
        Text(String(localized: "supplements.today")).font(DS.TextStyle.headline)
        Spacer()
        VStack(alignment: .trailing, spacing: 2) {
          Text(verbatim: "\(book.takenCount) / \(items.count)")
            .font(DS.TextStyle.title.monospacedDigit())
          Text(String(localized: "supplements.takenToday"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      .accessibilityElement(children: .combine)
    }
  }

  private func row(_ item: Supplement) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      SupplementRowLabel(item: item)
      Button {
        pendingDelete = item
      } label: {
        Image(systemName: "trash")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(minWidth: 44, minHeight: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(book.deleting)
      .accessibilityLabel(Text(String(localized: "supplements.a11y.delete \(item.name)")))
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, DS.Spacing.xs)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
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
