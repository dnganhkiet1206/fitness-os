import ASCNDCore
import ASCNDDesignSystem
import AVFoundation
import SwiftUI
import VisionKit

/// Quét mã vạch (#527) — `app/scan-barcode.tsx` @ fac9ac2: camera đọc mã
/// (EAN-13 / EAN-8 / UPC / Code 128), tra Open Food Facts (`BarcodeLookup`),
/// tìm thấy thì trả món về màn Ghi bữa; không thấy thì báo rồi quét tiếp sau
/// 1,6 s. Rời màn giữa lúc tra thì kết quả về muộn bị bỏ (`useOperation`).
///
/// Như RN: chưa cấp quyền → lời xin quyền + "Cho phép Camera"; đã từ chối →
/// "Mở Cài đặt" (xin lại không hiện hộp thoại nào).
///
/// Khác RN: luôn có ô NHẬP MÃ bằng tay — mã mờ / máy không có camera
/// (simulator) vẫn tra được; RN chỉ có camera.
struct ScanBarcodeView: View {
  /// Món tìm được — nơi gọi thêm vào bữa rồi đóng màn.
  let onFound: (BarcodeLookup.Food) -> Void
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @State private var permission = AVCaptureDevice.authorizationStatus(for: .video)
  @State private var status: Status = .scanning
  @State private var manual = ""
  @State private var lookup: Task<Void, Never>?
  @FocusState private var manualFocused: Bool

  enum Status: Equatable { case scanning, lookingUp, notFound }

  private var cameraUsable: Bool {
    DataScannerViewController.isSupported && permission == .authorized
  }

  var body: some View {
    NavigationStack {
      ZStack {
        Color.black.ignoresSafeArea()
        if cameraUsable {
          BarcodeScanner(active: status == .scanning) { code in found(code) }
            .ignoresSafeArea()
          frameOverlay
        } else {
          noCamera
        }
      }
      .safeAreaInset(edge: .bottom) { manualEntry }
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button { dismiss() } label: {
            Image(systemName: "xmark").frame(minWidth: 44, minHeight: 44)
          }
          .accessibilityLabel(Text(String(localized: "common.close")))
        }
      }
      .navigationTitle(Text(String(localized: "scan.title")))
      .navigationBarTitleDisplayMode(.inline)
      .toolbarColorScheme(.dark, for: .navigationBar)
    }
    .task {
      // Máy không quét được (simulator, máy cũ): không xin quyền camera vô ích.
      if DataScannerViewController.isSupported, permission == .notDetermined {
        let granted = await AVCaptureDevice.requestAccess(for: .video)
        permission = granted ? .authorized : .denied
      }
    }
    .onDisappear { lookup?.cancel() }
    .sensoryFeedback(.success, trigger: status == .lookingUp)
  }

  // MARK: - Camera

  private var frameOverlay: some View {
    VStack(spacing: DS.Spacing.md) {
      RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous)
        .strokeBorder(.white.opacity(0.85), lineWidth: 2)
        .frame(width: 260, height: 160)
      HStack(spacing: DS.Spacing.sm) {
        if status == .lookingUp { ProgressView().tint(.white) }
        Text(statusText)
          .font(DS.TextStyle.body)
          .foregroundStyle(.white)
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.vertical, 6)
      .background(.black.opacity(0.45), in: Capsule())
      .accessibilityElement(children: .combine)
    }
    .allowsHitTesting(false)
  }

  private var statusText: String {
    switch status {
    case .scanning: String(localized: "scan.point")
    case .lookingUp: String(localized: "scan.lookingUp")
    case .notFound: String(localized: "scan.notFound")
    }
  }

  /// Không dùng được camera: chưa / không cấp quyền, hoặc máy không quét được.
  private var noCamera: some View {
    VStack(spacing: DS.Spacing.md) {
      Image(systemName: "barcode.viewfinder")
        .font(.system(size: 44, weight: .light))
        .foregroundStyle(.white.opacity(0.8))
        .accessibilityHidden(true)
      if DataScannerViewController.isSupported && permission != .authorized {
        Text(String(localized: "scan.permission.title"))
          .font(DS.TextStyle.title)
          .foregroundStyle(.white)
        Text(String(localized: "scan.permission.hint"))
          .font(DS.TextStyle.body)
          .foregroundStyle(.white.opacity(0.75))
          .multilineTextAlignment(.center)
        // Đã từ chối: xin lại không hiện hộp thoại nào — mở Cài đặt.
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
        Text(String(localized: "scan.noCamera"))
          .font(DS.TextStyle.body)
          .foregroundStyle(.white.opacity(0.75))
          .multilineTextAlignment(.center)
        if status != .scanning {
          Text(statusText).font(DS.TextStyle.body).foregroundStyle(.white)
        }
      }
    }
    .padding(DS.Spacing.lg)
  }

  // MARK: - Nhập tay

  private var manualEntry: some View {
    HStack(spacing: DS.Spacing.sm) {
      TextField(String(localized: "scan.manual.placeholder"), text: $manual)
        .keyboardType(.numberPad)
        .focused($manualFocused)
        .font(DS.TextStyle.body.monospacedDigit())
        .padding(.horizontal, DS.Spacing.md)
        .frame(minHeight: 48)
        .background(.white.opacity(0.14), in: Capsule())
        .foregroundStyle(.white)
        .submitLabel(.search)
        .onSubmit { submitManual() }
      Button(String(localized: "scan.manual.go")) { submitManual() }
        .font(DS.TextStyle.headline)
        .foregroundStyle(.black)
        .padding(.horizontal, DS.Spacing.md)
        .frame(minHeight: 48)
        .background(.white, in: Capsule())
        .disabled(Self.cleaned(manual).isEmpty || status == .lookingUp)
        .opacity(Self.cleaned(manual).isEmpty ? 0.5 : 1)
    }
    .padding(DS.Spacing.md)
    .background(.black.opacity(0.6))
  }

  static func cleaned(_ s: String) -> String { s.filter(\.isNumber) }

  private func submitManual() {
    let code = Self.cleaned(manual)
    guard !code.isEmpty else { return }
    manualFocused = false
    found(code)
  }

  // MARK: - Tra

  private func found(_ code: String) {
    guard status != .lookingUp else { return }
    status = .lookingUp
    let lang = AppServices.appLang
    lookup = Task {
      let food = await Self.lookup(code, lang: lang)
      guard !Task.isCancelled else { return }
      if let food {
        onFound(food)
        dismiss()
      } else {
        status = .notFound
        try? await Task.sleep(for: .milliseconds(1600))
        guard !Task.isCancelled else { return }
        status = .scanning
      }
    }
  }

  /// `lookupBarcode`: lỗi mạng / HTTP / JSON hỏng đều là "không tìm thấy" như RN.
  static func lookup(_ code: String, lang: String) async -> BarcodeLookup.Food? {
    guard let url = BarcodeLookup.url(code) else { return nil }
    do {
      let (data, response) = try await URLSession.shared.data(from: url)
      let ok = (response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
      let body = try? JSONDecoder().decode(JSONValue.self, from: data)
      // Thiếu khẩu phần → 100 g, không phải cả gói (khác RN, NATIVE_IMPROVEMENTS).
      return BarcodeLookup.parse(body, ok: ok, code: code, lang: lang, packageAsServing: false)
    } catch {
      return nil
    }
  }
}

/// `CameraView` + `onBarcodeScanned` của RN trên VisionKit. Chỉ báo mã khi
/// `active` (đang tra / vừa báo không thấy thì bỏ qua — `lockedRef`).
private struct BarcodeScanner: UIViewControllerRepresentable {
  let active: Bool
  let onCode: (String) -> Void

  func makeUIViewController(context: Context) -> DataScannerViewController {
    let vc = DataScannerViewController(
      recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce, .code128])],
      qualityLevel: .balanced, recognizesMultipleItems: false, isHighFrameRateTrackingEnabled: false,
      isHighlightingEnabled: true)
    vc.delegate = context.coordinator
    return vc
  }

  func updateUIViewController(_ vc: DataScannerViewController, context: Context) {
    context.coordinator.parent = self
    if !vc.isScanning { try? vc.startScanning() }
  }

  static func dismantleUIViewController(_ vc: DataScannerViewController, coordinator: Coordinator) {
    vc.stopScanning()
  }

  func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

  final class Coordinator: NSObject, DataScannerViewControllerDelegate {
    var parent: BarcodeScanner
    init(parent: BarcodeScanner) { self.parent = parent }

    func dataScanner(_ s: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
      guard parent.active else { return }
      for item in items {
        if case .barcode(let b) = item, let code = b.payloadStringValue, !code.isEmpty {
          parent.onCode(code)
          return
        }
      }
    }
  }
}
