import ASCNDCore
import AVFoundation
import ASCNDDesignSystem
import PhotosUI
import SwiftUI
import UIKit

/// Ảnh tiến trình (#527) — `app/progress-photos.tsx` @ fac9ac2 trên
/// `ProgressPhotosBook`.
///
/// Như RN: lưới hai cột mới → cũ (tư thế · ngày · nút xoá 44 pt, nhấn giữ cũng
/// xoá); đọc lỗi khác trống (thử lại), trống mời thêm ảnh; thêm ảnh = chọn tư
/// thế (trước / nghiêng / sau) rồi chụp bằng camera trước, JPEG ≤ 1920 px chất
/// lượng 0.6; xoá hỏi lại; chế độ so sánh: chọn hai ảnh → tấm so sánh (cũ bên
/// trái, cân + vòng eo gần nhất không sau ngày ảnh, hiệu ±0.1); kéo để đọc lại.
///
/// Khác RN: thêm "Chọn từ thư viện ảnh" (`PhotosPicker`, không cần quyền) cạnh
/// camera; cân trên tấm so sánh theo đơn vị của tài khoản; quyền camera do hệ
/// thống hỏi (bị từ chối thì báo + mở Cài đặt).
struct ProgressPhotosView: View {
  let book: ProgressPhotosBook

  @Environment(\.weightUnit) private var unit
  @Environment(\.openURL) private var openURL
  @State private var comparing = false
  @State private var selected: [String] = []
  @State private var adding = false
  @State private var confirm: ProgressPhotos.Photo?
  @State private var notice: String?
  @State private var pair: Pair?

  struct Pair: Identifiable {
    let before: ProgressPhotos.Photo
    let after: ProgressPhotos.Photo
    var id: String { before.id + after.id }
  }

  private let columns = [GridItem(.flexible(), spacing: DS.Spacing.sm), GridItem(.flexible(), spacing: DS.Spacing.sm)]

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        switch book.phase {
        case .loading:
          DSLoadingView()
        case .failed:
          DSErrorView(message: String(localized: "photos.loadfailed")) { Task { await book.load() } }
        case .ready where book.photos.isEmpty:
          DSEmptyState(
            systemImage: "camera", title: String(localized: "photos.empty"),
            actionTitle: String(localized: "photos.add"), action: { adding = true })
        case .ready:
          if let notice {
            Text(verbatim: notice)
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.destructive.swiftUI)
          }
          if comparing {
            Text("photos.compare.hint")
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          LazyVGrid(columns: columns, spacing: DS.Spacing.sm) {
            ForEach(book.photos) { cell($0) }
          }
        }
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text("photos.title"))
    .toolbar {
      if !book.photos.isEmpty {
        ToolbarItem(placement: .topBarTrailing) {
          Button {
            comparing.toggle()
            selected = []
          } label: {
            Image(systemName: "rectangle.split.2x1")
              .frame(minWidth: 44, minHeight: 44)
          }
          .accessibilityLabel(Text("photos.compare"))
          .accessibilityAddTraits(comparing ? .isSelected : [])
        }
      }
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          adding = true
        } label: {
          if book.uploading {
            ProgressView()
          } else {
            Image(systemName: "plus").frame(minWidth: 44, minHeight: 44)
          }
        }
        .disabled(book.uploading)
        .accessibilityLabel(Text("photos.add"))
      }
    }
    .task { if case .loading = book.phase { await book.load() } }
    .refreshable { await book.load() }
    .sheet(isPresented: $adding) {
      AddProgressPhotoSheet { jpeg, pose in
        adding = false
        Task { await upload(jpeg, pose) }
      }
    }
    .sheet(item: $pair) { CompareSheet(book: book, pair: $0, unit: unit) }
    .alert(
      Text("photos.delete.title"), isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }),
      presenting: confirm
    ) { p in
      Button("common.cancel", role: .cancel) {}
      Button("photos.delete.confirm", role: .destructive) { Task { await delete(p) } }
    }
    .sensoryFeedback(.selection, trigger: selected)
  }

  // MARK: - Ô ảnh

  private func cell(_ p: ProgressPhotos.Photo) -> some View {
    let isOn = selected.contains(p.id)
    let when = p.date.map { $0.calendarDate.formatted(.dateTime.day().month(.abbreviated).locale(.app)) } ?? ""
    return VStack(alignment: .leading, spacing: 0) {
      ZStack(alignment: .topTrailing) {
        AsyncImage(url: book.url(p)) { phase in
          if let image = phase.image {
            image.resizable().scaledToFill()
          } else {
            DS.Color.secondary.swiftUI
              .overlay { Image(systemName: "photo").foregroundStyle(DS.Color.mutedForeground.swiftUI) }
          }
        }
        .aspectRatio(0.8, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.md))
        if comparing {
          Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
            .font(.title3)
            .foregroundStyle(isOn ? DS.Color.primary.swiftUI : .white)
            .padding(DS.Spacing.xs)
            .accessibilityHidden(true)
        }
      }
      .contentShape(Rectangle())
      .onTapGesture { if comparing { toggle(p) } }
      .onLongPressGesture { if !comparing { confirm = p } }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(verbatim: "\(poseName(p.pose)) \(when)"))
      .accessibilityAddTraits(comparing ? (isOn ? [.isButton, .isSelected] : .isButton) : .isImage)
      .accessibilityAction { if comparing { toggle(p) } }
      HStack {
        Text(verbatim: poseName(p.pose)).font(DS.TextStyle.caption.weight(.semibold))
        Spacer()
        Text(verbatim: when).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
        if !comparing {
          Button {
            confirm = p
          } label: {
            Image(systemName: "trash")
              .font(.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .frame(width: 44, height: 44)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .disabled(book.deleting != nil)
          .accessibilityLabel(Text("photos.delete.a11y \(poseName(p.pose)) \(when)"))
        }
      }
      .frame(minHeight: 44)
    }
  }

  private func poseName(_ pose: String) -> String {
    switch pose {
    case "side": String(localized: "photos.pose.side")
    case "back": String(localized: "photos.pose.back")
    default: String(localized: "photos.pose.front")
    }
  }

  private func toggle(_ p: ProgressPhotos.Photo) {
    if let i = selected.firstIndex(of: p.id) {
      selected.remove(at: i)
      return
    }
    selected.append(p.id)
    if selected.count > 2 { selected.removeFirst() }
    if selected.count == 2 {
      let byId = Dictionary(uniqueKeysWithValues: book.photos.map { ($0.id, $0) })
      if let a = byId[selected[0]], let b = byId[selected[1]] {
        let (before, after) = ProgressPhotos.ordered(a, b)
        pair = Pair(before: before, after: after)
      }
    }
  }

  // MARK: - Việc

  private func upload(_ jpeg: Data, _ pose: ProgressPhotos.Pose) async {
    switch await book.upload(jpeg: jpeg, pose: pose) {
    case .done, .busy: notice = nil
    case .nothingWritten: notice = String(localized: "photos.error.generic")
    case .failed(let f): notice = Self.message(f)
    }
  }

  private func delete(_ p: ProgressPhotos.Photo) async {
    switch await book.delete(p) {
    case .done, .busy: notice = nil
    case .nothingWritten: notice = String(localized: "photos.error.nothingwritten")
    case .failed(let f): notice = Self.message(f)
    }
  }

  static func message(_ f: ProgressPhotosFailure) -> String {
    switch f {
    case .offline: String(localized: "photos.error.offline")
    case .tooLarge: String(localized: "photos.error.toolarge")
    case .server: String(localized: "photos.error.generic")
    }
  }
}

// MARK: - Thêm ảnh

/// Chọn tư thế rồi chụp (camera trước) hoặc chọn từ thư viện; ảnh nén về JPEG
/// cạnh ≤ 1920 px, chất lượng 0.6 (`photo-size.ts`).
private struct AddProgressPhotoSheet: View {
  let onPicked: (Data, ProgressPhotos.Pose) -> Void

  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @State private var pose: ProgressPhotos.Pose = .front
  @State private var camera = false
  @State private var item: PhotosPickerItem?
  @State private var denied = false

  var body: some View {
    NavigationStack {
      Form {
        Picker(selection: $pose) {
          Text("photos.pose.front").tag(ProgressPhotos.Pose.front)
          Text("photos.pose.side").tag(ProgressPhotos.Pose.side)
          Text("photos.pose.back").tag(ProgressPhotos.Pose.back)
        } label: {
          Text("photos.pose")
        }
        .pickerStyle(.segmented)
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
          Button {
            Task { await openCamera() }
          } label: {
            Label("photos.take", systemImage: "camera")
          }
        }
        PhotosPicker(selection: $item, matching: .images) {
          Label("photos.library", systemImage: "photo.on.rectangle")
        }
        if denied {
          Section {
            Text("photos.camera.denied").font(DS.TextStyle.footnote)
            Button("photos.camera.settings") {
              if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            }
          }
        }
      }
      .navigationTitle(Text("photos.add"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("common.cancel") { dismiss() } }
      }
      .onChange(of: item) { _, new in
        guard let new else { return }
        Task {
          if let data = try? await new.loadTransferable(type: Data.self), let image = UIImage(data: data),
            let jpeg = Self.jpeg(image)
          {
            onPicked(jpeg, pose)
          }
        }
      }
      .fullScreenCover(isPresented: $camera) {
        CameraPicker { image in
          camera = false
          if let image, let jpeg = Self.jpeg(image) { onPicked(jpeg, pose) }
        }
        .ignoresSafeArea()
      }
    }
  }

  private func openCamera() async {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: camera = true
    case .notDetermined:
      if await AVCaptureDevice.requestAccess(for: .video) { camera = true } else { denied = true }
    default: denied = true
    }
  }

  /// Cạnh dài ≤ 1920 px, JPEG 0.6; còn quá 5 MiB thì hạ chất lượng một lần.
  static func jpeg(_ image: UIImage) -> Data? {
    let size = image.size
    let scale = min(1, ProgressPhotos.maxEdge / max(size.width, size.height, 1))
    let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: target))
    }
    if let data = resized.jpegData(compressionQuality: ProgressPhotos.jpegQuality), data.count <= ProgressPhotos.maxBytes {
      return data
    }
    return resized.jpegData(compressionQuality: 0.4)
  }
}

/// Camera trước của hệ thống (`UIImagePickerController`).
private struct CameraPicker: UIViewControllerRepresentable {
  let done: (UIImage?) -> Void

  func makeUIViewController(context: Context) -> UIImagePickerController {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    if UIImagePickerController.isCameraDeviceAvailable(.front) { picker.cameraDevice = .front }
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

  func makeCoordinator() -> Coordinator { Coordinator(done: done) }

  final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    let done: (UIImage?) -> Void
    init(done: @escaping (UIImage?) -> Void) { self.done = done }

    func imagePickerController(
      _ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
      done(info[.originalImage] as? UIImage)
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { done(nil) }
  }
}

// MARK: - So sánh

private struct CompareSheet: View {
  let book: ProgressPhotosBook
  let pair: ProgressPhotosView.Pair
  let unit: WeightUnit

  @Environment(\.dismiss) private var dismiss
  @State private var result: ProgressPhotos.Comparison?

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: DS.Spacing.md) {
          HStack(spacing: DS.Spacing.sm) {
            column(pair.before)
            column(pair.after)
          }
          DSCard {
            VStack(alignment: .leading, spacing: DS.Spacing.sm) {
              row(
                "photos.compare.weight", before: result?.weightBefore.map { ProgressPhotos.weightText($0, unit: unit) },
                after: result?.weightAfter.map { ProgressPhotos.weightText($0, unit: unit) },
                delta: ProgressPhotos.weightDeltaText(result?.weightDelta, unit: unit))
              row(
                "photos.compare.waist", before: result?.waistBefore.map(ProgressPhotos.waistText),
                after: result?.waistAfter.map(ProgressPhotos.waistText),
                delta: ProgressPhotos.deltaText(result?.waistDelta, unit: "cm"))
            }
          }
        }
        .padding(DS.Spacing.md)
      }
      .navigationTitle(Text("photos.compare"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("photos.close") { dismiss() } }
      }
      .task { result = await book.comparison(pair.before, pair.after) }
    }
  }

  private func column(_ p: ProgressPhotos.Photo) -> some View {
    VStack(spacing: DS.Spacing.xs) {
      AsyncImage(url: book.url(p)) { phase in
        if let image = phase.image { image.resizable().scaledToFill() } else { DS.Color.secondary.swiftUI }
      }
      .aspectRatio(0.75, contentMode: .fit)
      .clipShape(RoundedRectangle(cornerRadius: DS.Radius.md))
      .accessibilityHidden(true)
      if let d = p.date {
        Text(d.calendarDate, format: .dateTime.day().month(.abbreviated).year().locale(.app))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
    .frame(maxWidth: .infinity)
  }

  private func row(_ label: LocalizedStringKey, before: String?, after: String?, delta: String) -> some View {
    HStack {
      Text(label).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Spacer()
      Text(verbatim: "\(before ?? "—") → \(after ?? "—") (\(delta))")
        .font(DS.TextStyle.footnote.monospacedDigit())
        .foregroundStyle(DS.Color.foreground.swiftUI)
    }
    .accessibilityElement(children: .combine)
  }
}
