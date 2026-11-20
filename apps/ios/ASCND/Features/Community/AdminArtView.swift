import ASCNDCore
import ASCNDDesignSystem
import PhotosUI
import SwiftUI
import UIKit

/// Thư viện ảnh minh hoạ cho admin (#915, giai đoạn 2) — port của
/// `native/src/app/admin/images.tsx` (RN web): danh sách ảnh (kể cả ảnh đã
/// tắt) + bật/tắt + thêm ảnh mới qua Edge Function `admin-art`.
///
/// Tắt ảnh không xoá: bài cũ đã dùng nó vẫn phải vẽ được. Ảnh mới: chọn từ
/// thư viện, đổi sang JPEG (ảnh iPhone có thể là HEIC mà function từ chối),
/// kiểm kiểu / cỡ / style / alt ở client trước khi gửi (cùng luật với
/// function — server kiểm lại).
struct AdminArtScreen: View {
  let book: AdminBook
  @State private var uploading = false

  /// Hộp báo UIKit, hiện ngay khi gán (xem `ConfirmAlert`).
  private var message: String? {
    get { nil }
    nonmutating set { if let newValue { ConfirmAlert.ok(newValue) } }
  }

  var body: some View {
    content
      .navigationTitle(Text("community.admin.art.title"))
      .ascndPage()
      .navigationBarTitleDisplayMode(.inline)
      .refreshable { await book.load() }
      .task { if book.phase == .loading { await book.load() } }
      .toolbar {
        ToolbarItem(placement: .primaryAction) {
          Button { uploading = true } label: {
            Label(String(localized: "community.admin.art.add"), systemImage: "plus")
          }
          .disabled(book.phase != .ready)
        }
      }
      .sheet(isPresented: $uploading) { AdminArtUploadSheet(book: book) }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView()
    case .failed:
      DSErrorView(
        message: book.failure.map(ModerationFailureText.text) ?? String(localized: "community.mod.loadfailed")
      ) { Task { await book.load() } }
    case .notStaff:
      DSEmptyState(
        systemImage: "shield.slash", title: String(localized: "community.admin.art.title"),
        message: String(localized: "community.mod.notstaff"))
    case .ready:
      list
    }
  }

  private var list: some View {
    ScrollView {
      LazyVStack(spacing: DS.Spacing.md) {
        if book.art.isEmpty {
          DSEmptyState(
            systemImage: "photo", title: String(localized: "community.admin.art.title"),
            message: String(localized: "community.admin.art.empty"))
        } else {
          ForEach(book.art) { row in
            DSCard { artRow(row) }
          }
        }
      }
      .padding(DS.Spacing.md)
    }
  }

  private func artRow(_ row: ArtRow) -> some View {
    HStack(spacing: DS.Spacing.md) {
      if let url = book.artImageURL(path: row.path) {
        AsyncImage(url: url) { image in
          image.resizable().scaledToFill()
        } placeholder: {
          DS.Color.secondary.swiftUI
        }
        .frame(width: 64, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityHidden(true)
      }
      VStack(alignment: .leading, spacing: DS.Spacing.xs) {
        Text(verbatim: "\(row.kindRaw) · \(row.style)")
          .font(DS.TextStyle.body.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(1)
        Text(verbatim: row.path)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
        if !row.tags.isEmpty {
          Text(verbatim: row.tags.joined(separator: ", "))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
        }
        Text(verbatim: Self.usedByText(row.usedBy))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Button {
        toggleArt(row)
      } label: {
        Text(row.active ? "community.admin.art.off" : "community.admin.art.on")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(row.active ? DS.Color.destructive.swiftUI : DS.Color.primary.swiftUI)
          .padding(.horizontal, DS.Spacing.md)
          .frame(height: 36)
          .background(DS.Color.secondary.swiftUI, in: Capsule())
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(book.decidingArt(id: row.id))
      .accessibilityLabel(
        Text(verbatim: "\(row.active ? String(localized: "community.admin.art.off") : String(localized: "community.admin.art.on")) · \(row.style)"))
    }
    .accessibilityElement(children: .contain)
  }

  /// Tắt ảnh thì hỏi lại (bài mới sẽ không dùng nó nữa); bật lại thì làm
  /// luôn. Lý do không bắt buộc (RN gửi '').
  private func toggleArt(_ row: ArtRow) {
    if row.active {
      ConfirmAlert.choose(
        title: String(localized: "community.admin.art.offconfirm \(row.style)"),
        message: String(localized: "community.admin.art.offbody"),
        choices: [
          .cancel(),
          AlertChoice(title: String(localized: "community.admin.art.off"), role: .destructive) {
            Task { await runSetActive(row, active: false) }
          },
        ])
    } else {
      Task { await runSetActive(row, active: true) }
    }
  }

  private func runSetActive(_ row: ArtRow, active: Bool) async {
    switch await book.setArtActive(id: row.id, active: active, reason: "") {
    case .done: break
    case .failed(let f): message = ModerationFailureText.text(f)
    case .ignored: break
    }
  }

  static func usedByText(_ n: Int) -> String {
    n == 1
      ? String(localized: "community.admin.art.usedby.one \(n)")
      : String(localized: "community.admin.art.usedby.other \(n)")
  }
}

/// Form thêm ảnh mới vào thư viện.
private struct AdminArtUploadSheet: View {
  let book: AdminBook
  @Environment(\.dismiss) private var dismiss
  @State private var item: PhotosPickerItem?
  @State private var data: Data?
  @State private var preview: UIImage?
  @State private var kind: CommunityFeed.Kind = .workout
  @State private var style = ""
  @State private var tags = ""
  @State private var altEn = ""
  @State private var altVi = ""
  @State private var busy = false

  /// Hộp báo UIKit, hiện ngay khi gán (xem `ConfirmAlert`).
  private var message: String? {
    get { nil }
    nonmutating set { if let newValue { ConfirmAlert.ok(newValue) } }
  }

  private var problem: ArtUpload.Problem? {
    ArtUpload.problem(data: data, style: style, altEn: altEn, altVi: altVi)
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          PhotosPicker(selection: $item, matching: .images) {
            Label(String(localized: "community.admin.art.pick"), systemImage: "photo.on.rectangle")
          }
          if let preview {
            Image(uiImage: preview)
              .resizable()
              .scaledToFit()
              .frame(maxHeight: 200)
              .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          }
          if let data {
            Text(verbatim: Self.sizeText(data.count))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
        Section {
          Picker(String(localized: "community.admin.art.kind"), selection: $kind) {
            ForEach([CommunityFeed.Kind.workout, .progress, .recipe], id: \.self) { k in
              Text(verbatim: ModerationTargetScreen.kindText(k)).tag(k)
            }
          }
          .pickerStyle(.segmented)
          TextField(
            String(localized: "community.admin.art.style"),
            text: $style, prompt: Text("community.admin.art.stylehint")
          )
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          TextField(
            String(localized: "community.admin.art.tags"),
            text: $tags, prompt: Text("community.admin.art.tagshint")
          )
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
        } header: {
          Text("community.admin.art.details")
        }
        Section {
          TextField(String(localized: "community.admin.art.alten"), text: $altEn)
          TextField(String(localized: "community.admin.art.altvi"), text: $altVi)
        } header: {
          Text("community.admin.art.alt")
        } footer: {
          Text("community.admin.art.althint")
        }
        if let problem {
          Section {
            Text(verbatim: Self.problemText(problem))
              .font(DS.TextStyle.body)
              .foregroundStyle(DS.Color.destructive.swiftUI)
          }
        }
      }
      .navigationTitle(Text("community.admin.art.add"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.cancel")) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(String(localized: "community.admin.art.upload")) { Task { await upload() } }
            .disabled(problem != nil || busy)
        }
      }
      .onChange(of: item) { _, new in
        guard let new else { return }
        Task {
          if let raw = try? await new.loadTransferable(type: Data.self),
            let image = UIImage(data: raw),
            let jpeg = Self.jpeg(image)
          {
            data = jpeg
            preview = image
          } else {
            // Ảnh đọc không được (định dạng lạ) — xoá lựa chọn, báo lỗi.
            data = nil
            preview = nil
            item = nil
            message = String(localized: "community.admin.art.badimage")
          }
        }
      }
    }
  }

  private func upload() async {
    guard let data, problem == nil, !busy else { return }
    busy = true
    defer { busy = false }
    let upload = ArtUpload(
      data: data, mimeType: "image/jpeg", fileName: "art.jpg", kind: kind,
      style: style.trimmingCharacters(in: .whitespaces), tags: tags,
      altEn: altEn.trimmingCharacters(in: .whitespaces),
      altVi: altVi.trimmingCharacters(in: .whitespaces))
    switch await book.uploadArt(upload) {
    case .done:
      dismiss()
    case .failed(let f):
      message = ModerationFailureText.text(f)
    case .ignored:
      break
    }
  }

  /// Cạnh dài ≤ 1200 px, JPEG 0.8; còn quá 1 MiB thì hạ chất lượng một lần
  /// (trần của bucket `community-art`). Ảnh iPhone thường là HEIC — đổi sang
  /// JPEG để Edge Function nhận (chỉ PNG / JPEG / WebP).
  static func jpeg(_ image: UIImage) -> Data? {
    let size = image.size
    let scale = min(1, 1200 / max(size.width, size.height, 1))
    let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: target))
    }
    if let d = resized.jpegData(compressionQuality: 0.8), d.count <= ArtUpload.maxBytes { return d }
    return resized.jpegData(compressionQuality: 0.5)
  }

  static func problemText(_ p: ArtUpload.Problem) -> String {
    switch p {
    case .noFile: String(localized: "community.admin.art.problem.nofile")
    case .unsupportedType: String(localized: "community.admin.art.problem.type")
    case .tooLarge: String(localized: "community.admin.art.problem.large")
    case .badStyle: String(localized: "community.admin.art.problem.style")
    case .missingAlt: String(localized: "community.admin.art.problem.alt")
    }
  }

  static func sizeText(_ bytes: Int) -> String {
    let kb = Double(bytes) / 1024
    if kb >= 1024 {
      // Định dạng số trước rồi mới chèn — khoá chỉ chứa `%@` (luật i18n).
      let mb = String(format: "%.1f", locale: .app, kb / 1024)
      return String(localized: "community.admin.art.size.mb \(mb)")
    }
    return String(localized: "community.admin.art.size.kb \(Int(kb.rounded()))")
  }
}
