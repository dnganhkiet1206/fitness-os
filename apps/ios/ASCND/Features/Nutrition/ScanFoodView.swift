import ASCNDCore
import ASCNDDesignSystem
import AVFoundation
import PhotosUI
import SwiftUI

/// Chụp ảnh món (#527, chủ dự án bật 13/10) — `app/scan-food.tsx` @ fac9ac2 trên
/// edge function `scan-food`: chụp một tấm, AI trả các món (một khẩu phần mỗi
/// món), món vào bữa đang ghi.
///
/// Như RN: hai chế độ Món ăn / Nhãn dinh dưỡng; JPEG chất lượng 0,5; món kcal 0
/// bị bỏ; lỗi của hàm theo `AI_FAILURE_KEY`.
///
/// Khác RN (tốt hơn, NATIVE_IMPROVEMENTS):
/// - chọn ảnh từ THƯ VIỆN (ảnh chụp lúc ăn, ghi sau) — RN chỉ có camera;
/// - XEM LẠI trước khi thêm: bỏ chọn món AI nhận sai, sửa tên / kcal / macro,
///   chỉnh phần ăn ½–2 — RN thêm thẳng mọi món AI thấy;
/// - ảnh được thu nhỏ (cạnh dài 1600 px) trước khi gửi: nhanh hơn, không chạm
///   trần 4 triệu ký tự của hàm.
struct ScanFoodView: View {
  /// Các món người dùng giữ — nơi gọi thêm vào bữa rồi đóng màn.
  let onAdd: ([MealLog.Food]) -> Void

  @Environment(AppServices.self) private var services
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @State private var permission = AVCaptureDevice.authorizationStatus(for: .video)
  @State private var mode: AIFood.ScanMode = .food
  @State private var phase: Phase = .capture
  @State private var picked: PhotosPickerItem?
  @State private var shutter = CameraShutter()
  @State private var rows: [Row] = []
  @State private var editing: String?
  @State private var work: Task<Void, Never>?

  enum Phase: Equatable {
    case capture
    case analyzing(UIImage)
    case review(UIImage)
    case failed(UIImage, String)
  }

  /// Một món trong danh sách xem lại: số của AI (một khẩu phần) + phần ăn.
  struct Row: Identifiable, Equatable {
    var item: AIFood.ScannedItem
    var keep = true
    var portion = 1.0
    var id: String { item.id }
    var kcal: Double { (item.kcal * portion).rounded() }

    func food() -> MealLog.Food {
      func p(_ x: Double) -> Double { (x * portion).rounded() }
      return MealLog.Food(
        id: item.id, foodItemId: nil, name: item.name, kcal: p(item.kcal), protein: p(item.protein),
        carbs: p(item.carbs), fat: p(item.fat), fiber: p(item.fiber))
    }
  }

  /// Máy có camera sau (simulator: không).
  private static let hasCamera =
    AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) != nil

  private var cameraUsable: Bool { Self.hasCamera && permission == .authorized }

  var body: some View {
    NavigationStack {
      Group {
        switch phase {
        case .capture: capture
        case .analyzing(let img): analyzing(img)
        case .review(let img): review(img)
        case .failed(let img, let message): failed(img, message)
        }
      }
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button { dismiss() } label: {
            Image(systemName: "xmark").frame(minWidth: 44, minHeight: 44)
          }
          .accessibilityLabel(Text(String(localized: "common.close")))
        }
      }
      .navigationTitle(Text(String(localized: "sf.title")))
      .navigationBarTitleDisplayMode(.inline)
      .toolbarColorScheme(phase == .capture ? .dark : nil, for: .navigationBar)
    }
    .task {
      if Self.hasCamera, permission == .notDetermined {
        let granted = await AVCaptureDevice.requestAccess(for: .video)
        permission = granted ? .authorized : .denied
      }
    }
    .onChange(of: picked) { _, item in
      guard let item else { return }
      picked = nil
      Task {
        if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) {
          analyze(img)
        }
      }
    }
    .onDisappear { work?.cancel() }
  }

  // MARK: - Chụp

  private var capture: some View {
    ZStack {
      Color.black.ignoresSafeArea()
      if cameraUsable {
        CameraPreview(shutter: shutter).ignoresSafeArea()
        RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous)
          .strokeBorder(.white.opacity(0.8), style: StrokeStyle(lineWidth: 2, dash: mode == .label ? [8, 6] : []))
          .aspectRatio(mode == .label ? 0.72 : 1, contentMode: .fit)
          .padding(.horizontal, 36)
          .allowsHitTesting(false)
          .accessibilityHidden(true)
      } else {
        noCamera
      }
    }
    .safeAreaInset(edge: .top) { modePicker }
    .safeAreaInset(edge: .bottom) { captureBar }
  }

  private var modePicker: some View {
    VStack(spacing: DS.Spacing.sm) {
      HStack(spacing: 4) {
        ForEach(AIFood.ScanMode.allCases, id: \.self) { m in
          let on = mode == m
          Button { mode = m } label: {
            Text(m == .food ? String(localized: "sf.mode.food") : String(localized: "sf.mode.label"))
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(on ? .black : .white)
              .padding(.horizontal, DS.Spacing.md)
              .frame(minHeight: 36)
              .background(on ? Color.white : .clear, in: Capsule())
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(on ? .isSelected : [])
        }
      }
      .padding(4)
      .background(.black.opacity(0.45), in: Capsule())
      Text(mode == .food ? String(localized: "sf.hint.food") : String(localized: "sf.hint.label"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(.white.opacity(0.85))
        .multilineTextAlignment(.center)
        .padding(.horizontal, DS.Spacing.lg)
    }
    .padding(.top, DS.Spacing.sm)
    .sensoryFeedback(.selection, trigger: mode)
  }

  private var captureBar: some View {
    HStack {
      PhotosPicker(selection: $picked, matching: .images) {
        VStack(spacing: 4) {
          Image(systemName: "photo.on.rectangle")
            .font(.system(size: 20, weight: .semibold))
            .frame(width: 52, height: 52)
            .background(.white.opacity(0.16), in: Circle())
          Text(String(localized: "sf.library")).font(DS.TextStyle.caption)
        }
        .foregroundStyle(.white)
      }
      .frame(maxWidth: .infinity)
      Button {
        Task { if let img = await shutter.take() { analyze(img) } }
      } label: {
        ZStack {
          Circle().fill(.white).frame(width: 66, height: 66)
          Circle().strokeBorder(.white.opacity(0.6), lineWidth: 3).frame(width: 80, height: 80)
        }
      }
      .buttonStyle(TodayPressStyle())
      .disabled(!cameraUsable)
      .opacity(cameraUsable ? 1 : 0.35)
      .accessibilityLabel(Text(String(localized: "sf.shutter")))
      Color.clear.frame(maxWidth: .infinity, maxHeight: 1)
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, DS.Spacing.md)
    .background(.black.opacity(0.55))
  }

  /// Không dùng được camera: chưa / không cấp quyền, hoặc máy không có camera
  /// (simulator) — vẫn chọn được ảnh từ thư viện.
  private var noCamera: some View {
    VStack(spacing: DS.Spacing.md) {
      Image(systemName: "camera.viewfinder")
        .font(.system(size: 44, weight: .light))
        .foregroundStyle(.white.opacity(0.8))
        .accessibilityHidden(true)
      if Self.hasCamera {
        Text(String(localized: "scan.permission.title"))
          .font(DS.TextStyle.title)
          .foregroundStyle(.white)
        Text(String(localized: "sf.permission.hint"))
          .font(DS.TextStyle.body)
          .foregroundStyle(.white.opacity(0.75))
          .multilineTextAlignment(.center)
        Button {
          if permission == .notDetermined {
            Task {
              let granted = await AVCaptureDevice.requestAccess(for: .video)
              permission = granted ? .authorized : .denied
            }
          } else if let url = URL(string: UIApplication.openSettingsURLString) {
            openURL(url)
          }
        } label: {
          Text(permission == .notDetermined
            ? String(localized: "scan.permission.allow") : String(localized: "scan.permission.settings"))
            .font(DS.TextStyle.headline)
            .foregroundStyle(.black)
            .padding(.horizontal, DS.Spacing.xl)
            .frame(minHeight: 48)
            .background(.white, in: Capsule())
        }
      } else {
        Text(String(localized: "sf.noCamera"))
          .font(DS.TextStyle.body)
          .foregroundStyle(.white.opacity(0.75))
          .multilineTextAlignment(.center)
      }
    }
    .padding(DS.Spacing.lg)
  }

  // MARK: - Đang nhận diện

  private func analyzing(_ img: UIImage) -> some View {
    VStack(spacing: DS.Spacing.lg) {
      photo(img, height: 280)
        .overlay {
          RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous).fill(.black.opacity(0.25))
          IntelligenceOrb(size: 64)
        }
      Text(mode == .food ? String(localized: "sf.analyzing") : String(localized: "sf.analyzing.label"))
        .font(DS.TextStyle.headline)
      Text(String(localized: "sf.analyzing.hint"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .multilineTextAlignment(.center)
      Spacer()
    }
    .padding(DS.Spacing.md)
    .ascndPage()
    .accessibilityElement(children: .combine)
  }

  private func photo(_ img: UIImage, height: CGFloat) -> some View {
    Image(uiImage: img)
      .resizable()
      .scaledToFill()
      .frame(maxWidth: .infinity)
      .frame(height: height)
      .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
      .accessibilityHidden(true)
  }

  // MARK: - Xem lại

  private func review(_ img: UIImage) -> some View {
    let kept = rows.filter(\.keep)
    let total = kept.reduce(0) { $0 + $1.kcal }
    return VStack(spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          photo(img, height: 160)
          if rows.isEmpty {
            emptyResult
          } else {
            VStack(alignment: .leading, spacing: 4) {
              Text(String(localized: "sf.review.title"))
                .font(DS.TextStyle.headline)
                .accessibilityAddTraits(.isHeader)
              Text(String(localized: "sf.review.hint"))
                .font(DS.TextStyle.footnote)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              IntelligenceBadge(size: 12)
            }
            VStack(spacing: 0) {
              ForEach($rows) { $row in
                if row.id != rows.first?.id { Divider().padding(.leading, 58).opacity(0.6) }
                rowView($row)
              }
            }
            .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
            .todayCard()
          }
        }
        .padding(DS.Spacing.md)
      }
      .scrollDismissesKeyboard(.interactively)
      .statusBarScrim()
      bottomBar(kept: kept, total: total)
    }
    .ascndPage()
  }

  private var emptyResult: some View {
    VStack(spacing: DS.Spacing.sm) {
      Text(String(localized: "sf.empty.title")).font(DS.TextStyle.headline)
      Text(mode == .food ? String(localized: "sf.empty.hint") : String(localized: "sf.empty.hint.label"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(DS.Spacing.lg)
    .todayCard()
  }

  private func rowView(_ row: Binding<Row>) -> some View {
    let r = row.wrappedValue
    let open = editing == r.id
    return VStack(spacing: 0) {
      HStack(spacing: DS.Spacing.sm) {
        Button { row.keep.wrappedValue.toggle() } label: {
          Image(systemName: r.keep ? "checkmark.circle.fill" : "circle")
            .font(.title2)
            .foregroundStyle(r.keep ? MascotRoomView.signalColor(.meal) : DS.Color.mutedForeground.swiftUI)
            .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(verbatim: r.item.name))
        .accessibilityValue(Text(r.keep ? String(localized: "sf.a11y.kept") : String(localized: "sf.a11y.skipped")))
        .sensoryFeedback(.selection, trigger: r.keep)
        Button {
          withAnimation(.snappy) { editing = open ? nil : r.id }
        } label: {
          HStack {
            VStack(alignment: .leading, spacing: 2) {
              Text(verbatim: r.item.name)
                .font(DS.TextStyle.body)
                .lineLimit(2)
                .strikethrough(!r.keep)
              let f = r.food()
              Text(verbatim: DiaryView.macros(f.protein, f.carbs, f.fat) + portionSuffix(r))
                .font(DS.TextStyle.caption.monospacedDigit())
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
            Spacer(minLength: DS.Spacing.sm)
            Text(verbatim: "\(DiaryView.whole(r.kcal))")
              .font(.custom("Menlo", size: 17, relativeTo: .body).weight(.semibold))
            + Text(verbatim: " ") + Text(String(localized: "nc.kcal")).font(DS.TextStyle.caption)
            Image(systemName: "chevron.down")
              .font(.caption.weight(.semibold))
              .rotationEffect(.degrees(open ? 180 : 0))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .accessibilityHidden(true)
          }
          .contentShape(Rectangle())
          .frame(minHeight: 56)
        }
        .buttonStyle(.plain)
        .accessibilityHint(Text(String(localized: "sf.a11y.edit")))
      }
      .padding(.leading, 6)
      .padding(.trailing, DS.Spacing.md)
      .opacity(r.keep ? 1 : 0.55)
      if open { editPanel(row) }
    }
  }

  private func portionSuffix(_ r: Row) -> String {
    r.portion == 1 ? "" : " · ×" + Self.portionLabel(r.portion)
  }

  static let portions: [Double] = [0.5, 1, 1.5, 2]

  static func portionLabel(_ p: Double) -> String {
    switch p {
    case 0.5: "½"
    case 1.5: "1½"
    default: DiaryView.whole(p)
    }
  }

  /// Sửa món AI nhận: tên, số của MỘT khẩu phần, phần ăn.
  private func editPanel(_ row: Binding<Row>) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      TextField(text: row.item.name) { Text(String(localized: "logMeal.custom.name")) }
        .padding(DS.Spacing.sm)
        .frame(minHeight: 44)
        .background(DS.Color.input.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
      HStack(spacing: DS.Spacing.sm) {
        numberField(String(localized: "nc.kcal"), row.item.kcal)
        numberField(String(localized: "logMeal.protein") + " (g)", row.item.protein)
      }
      HStack(spacing: DS.Spacing.sm) {
        numberField(String(localized: "logMeal.carbs") + " (g)", row.item.carbs)
        numberField(String(localized: "logMeal.fat") + " (g)", row.item.fat)
      }
      Text(String(localized: "sf.portion"))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      HStack(spacing: DS.Spacing.xs) {
        ForEach(Self.portions, id: \.self) { p in
          let on = row.wrappedValue.portion == p
          Button { row.portion.wrappedValue = p } label: {
            Text(verbatim: "×" + Self.portionLabel(p))
              .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
              .foregroundStyle(on ? .white : DS.Color.foreground.swiftUI)
              .frame(maxWidth: .infinity, minHeight: 40)
              .background(on ? MascotRoomView.signalColor(.meal) : DS.Color.muted.swiftUI, in: Capsule())
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(on ? .isSelected : [])
        }
      }
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.bottom, DS.Spacing.md)
    .padding(.leading, 42)
  }

  private func numberField(_ label: String, _ value: Binding<Double>) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(verbatim: label)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
      TextField(value: value, format: .number.precision(.fractionLength(0...1))) { Text(verbatim: label) }
        .keyboardType(.decimalPad)
        .padding(DS.Spacing.sm)
        .frame(minHeight: 44)
        .background(DS.Color.input.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
    }
  }

  private func bottomBar(kept: [Row], total: Double) -> some View {
    VStack(spacing: DS.Spacing.sm) {
      if !rows.isEmpty {
        Button {
          onAdd(kept.map { $0.food() })
          dismiss()
        } label: {
          Text(String(localized: "sf.add \(DiaryView.whole(total))"))
            .font(DS.TextStyle.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(MascotRoomView.signalColor(.meal), in: Capsule())
        }
        .buttonStyle(TodayPressStyle())
        .disabled(kept.isEmpty)
        .opacity(kept.isEmpty ? 0.4 : 1)
        .sensoryFeedback(.success, trigger: kept.count)
      }
      Button(String(localized: "sf.retake")) { retake() }
        .font(DS.TextStyle.headline)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 44)
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, DS.Spacing.sm)
    .background(.bar)
  }

  // MARK: - Lỗi

  private func failed(_ img: UIImage, _ message: String) -> some View {
    VStack(spacing: DS.Spacing.md) {
      photo(img, height: 200)
      Image(systemName: "exclamationmark.triangle")
        .font(.title)
        .foregroundStyle(DS.Color.destructive.swiftUI)
        .accessibilityHidden(true)
      Text(message)
        .font(DS.TextStyle.body)
        .multilineTextAlignment(.center)
      HStack(spacing: DS.Spacing.sm) {
        Button(String(localized: "sf.retake")) { retake() }
          .font(DS.TextStyle.headline)
          .frame(maxWidth: .infinity, minHeight: 48)
          .background(DS.Color.muted.swiftUI, in: Capsule())
        Button(String(localized: "common.retry")) { analyze(img) }
          .font(DS.TextStyle.headline)
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity, minHeight: 48)
          .background(MascotRoomView.signalColor(.meal), in: Capsule())
      }
      .buttonStyle(.plain)
      Spacer()
    }
    .padding(DS.Spacing.md)
    .ascndPage()
  }

  // MARK: - Gửi

  private func retake() {
    work?.cancel()
    rows = []
    editing = nil
    phase = .capture
  }

  private func analyze(_ img: UIImage) {
    work?.cancel()
    phase = .analyzing(img)
    let mode = mode
    let lang = AppServices.appLang
    let edge = services.makeEdgeCaller()
    work = Task {
      guard let edge else {
        phase = .failed(img, WeeklyReviewView.failureText(.notDeployed))
        return
      }
      guard let b64 = await Self.encode(img) else {
        phase = .failed(img, String(localized: "sf.error.image"))
        return
      }
      do throws(EdgeFunction.Failure) {
        let body = try await edge.call(.scanFood, body: AIFood.scanBody(imageBase64: b64, lang: lang, mode: mode))
        guard !Task.isCancelled else { return }
        rows = AIFood.scannedItems(body).map { Row(item: $0) }
        editing = nil
        phase = .review(img)
      } catch {
        guard !Task.isCancelled else { return }
        phase = .failed(img, WeeklyReviewView.failureText(error))
      }
    }
  }

  /// JPEG 0,5 (như RN) của ảnh thu nhỏ — cạnh dài 1600 px, rồi nhỏ dần tới khi
  /// vừa trần `AIFood.maxImageChars` của hàm.
  nonisolated static func encode(_ img: UIImage) async -> String? {
    await Task.detached(priority: .userInitiated) {
      var side: CGFloat = 1600
      while side >= 400 {
        if let data = resized(img, longSide: side).jpegData(compressionQuality: 0.5) {
          let b64 = data.base64EncodedString()
          if b64.count <= AIFood.maxImageChars { return b64 }
        }
        side *= 0.7
      }
      return nil
    }.value
  }

  nonisolated static func resized(_ img: UIImage, longSide: CGFloat) -> UIImage {
    let w = img.size.width
    let h = img.size.height
    let scale = min(1, longSide / max(w, h, 1))
    let size = CGSize(width: (w * scale).rounded(), height: (h * scale).rounded())
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: size, format: format).image { _ in
      img.draw(in: CGRect(origin: .zero, size: size))
    }
  }
}

// MARK: - Camera

/// Nút chụp nối với phiên camera đang chạy.
@MainActor final class CameraShutter {
  fileprivate weak var camera: CameraController?
  func take() async -> UIImage? { await camera?.capture() }
}

private struct CameraPreview: UIViewControllerRepresentable {
  let shutter: CameraShutter

  func makeUIViewController(context: Context) -> CameraController {
    let vc = CameraController()
    shutter.camera = vc
    return vc
  }

  func updateUIViewController(_ vc: CameraController, context: Context) { shutter.camera = vc }
}

/// Camera sau, chụp ảnh tĩnh (`AVCapturePhotoOutput`).
final class CameraController: UIViewController, AVCapturePhotoCaptureDelegate {
  private let session = AVCaptureSession()
  private let output = AVCapturePhotoOutput()
  private var preview: AVCaptureVideoPreviewLayer?
  private var pending: CheckedContinuation<UIImage?, Never>?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    session.sessionPreset = .photo
    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
      let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input), session.canAddOutput(output)
    else { return }
    session.addInput(input)
    session.addOutput(output)
    let layer = AVCaptureVideoPreviewLayer(session: session)
    layer.videoGravity = .resizeAspectFill
    view.layer.addSublayer(layer)
    preview = layer
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    preview?.frame = view.bounds
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    let session = session
    DispatchQueue.global(qos: .userInitiated).async { session.startRunning() }
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    let session = session
    DispatchQueue.global(qos: .userInitiated).async { session.stopRunning() }
  }

  func capture() async -> UIImage? {
    guard pending == nil, session.isRunning else { return nil }
    return await withCheckedContinuation { c in
      pending = c
      output.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
    }
  }

  nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: (any Error)?) {
    let image = photo.fileDataRepresentation().flatMap(UIImage.init(data:))
    Task { @MainActor in
      pending?.resume(returning: image)
      pending = nil
    }
  }
}
