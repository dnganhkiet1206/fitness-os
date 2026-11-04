import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// "Tải dữ liệu của bạn" (#527 mục 7, Kiệt duyệt mock v2 01/11, ảnh 3–4).
///
/// Mở là đọc hết dữ liệu (đếm theo nhóm cho người dùng thấy sẽ mang theo gì); "Tạo
/// tệp" đóng gói một zip như Apple Health — `README.txt`, `ascnd.json`, `csv/…` —
/// ngay trên máy; rồi "Chia sẻ" (bảng chia sẻ của iOS) hay "Lưu vào Tệp".
struct DataExportView: View {
  let userId: String
  @Environment(AppServices.self) private var services
  @Environment(\.locale) private var locale
  @State private var phase: Phase = .reading
  @State private var savingToFiles = false
  @State private var saved = false

  enum Phase {
    case reading
    case failed(offline: Bool)
    case ready(DataExport.Bundle)
    case packing(DataExport.Bundle)
    case packed(DataExport.Bundle, URL, Int)
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        header
        content
      }
      .padding(DS.Spacing.md)
    }
    .ascndPage()
    .navigationTitle(Text(verbatim: ""))
    .navigationBarTitleDisplayMode(.inline)
    .safeAreaInset(edge: .bottom) { actions }
    .task { if case .reading = phase { await read() } }
    .fileMover(isPresented: $savingToFiles, file: packedURL) { result in
      if case .success = result { saved = true }
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(isPacked ? "export.ready.eyebrow" : "export.eyebrow")
        .font(.system(size: 12, weight: .semibold)).tracking(1.4)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Text(isPacked ? "export.ready.title" : "export.title")
        .font(.largeTitle.bold())
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      if let b = bundle {
        Text(verbatim: String(localized: "export.total \(b.total.formatted(.number.locale(locale)))"))
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
  }

  @ViewBuilder private var content: some View {
    switch phase {
    case .reading:
      VStack(spacing: DS.Spacing.sm) {
        ProgressView()
        Text("export.reading").font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .frame(maxWidth: .infinity, minHeight: 220)
    case .failed(let offline):
      DSErrorView(message: String(localized: offline ? "export.offline" : "export.failed")) {
        Task { await read() }
      }
    case .ready(let b), .packing(let b):
      groups(b)
      Label("export.local", systemImage: "lock.fill")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(maxWidth: .infinity)
    case .packed(_, let url, let bytes):
      fileCard(url, bytes: bytes)
      if saved {
        Label("export.saved", systemImage: "checkmark.circle.fill")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.readinessGreen.swiftUI)
          .frame(maxWidth: .infinity)
      }
    }
  }

  private func groups(_ b: DataExport.Bundle) -> some View {
    VStack(spacing: 0) {
      ForEach(Array(Self.rows.enumerated()), id: \.offset) { i, r in
        if i > 0 { Divider().padding(.leading, 52) }
        HStack(spacing: DS.Spacing.md) {
          Image(systemName: r.symbol)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(r.tint)
            .frame(width: 30, height: 30)
            .background(r.tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .accessibilityHidden(true)
          Text(r.label).font(DS.TextStyle.body).foregroundStyle(DS.Color.foreground.swiftUI)
          Spacer(minLength: DS.Spacing.sm)
          Text(verbatim: r.groups.reduce(0) { $0 + b.count($1) }.formatted(.number.locale(locale)))
            .font(DS.TextStyle.body.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .padding(.horizontal, DS.Spacing.md)
        .frame(minHeight: 52)
        .accessibilityElement(children: .combine)
      }
    }
    .dsCard(radius: 22)
  }

  private func fileCard(_ url: URL, bytes: Int) -> some View {
    VStack(spacing: DS.Spacing.sm) {
      Image(systemName: "doc.zipper")
        .font(.system(size: 30, weight: .regular))
        .foregroundStyle(DS.Color.goldAccent)
        .frame(width: 64, height: 76)
        .background(DS.Color.goldAccent.opacity(0.14), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityHidden(true)
      Text(verbatim: url.lastPathComponent)
        .font(DS.TextStyle.headline)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .multilineTextAlignment(.center)
      Text(verbatim: String(
        localized: "export.file.meta \(DataExport.tables.count + 1) \(ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file))"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .padding(DS.Spacing.lg)
    .frame(maxWidth: .infinity)
    .dsCard(radius: 22)
    .accessibilityElement(children: .combine)
  }

  @ViewBuilder private var actions: some View {
    VStack(spacing: DS.Spacing.sm) {
      switch phase {
      case .ready, .packing:
        Button { Task { await pack() } } label: {
          HStack(spacing: 8) {
            if case .packing = phase { ProgressView().tint(DS.Color.background.swiftUI) }
            Text("export.make")
          }
          .frame(maxWidth: .infinity).frame(minHeight: 50)
        }
        .buttonStyle(.dsPill)
        .disabled(isPacking)
      case .packed(_, let url, _):
        ShareLink(item: url) {
          Label("export.share", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity).frame(minHeight: 50)
        }
        .buttonStyle(.dsPill)
        Button { savingToFiles = true } label: {
          Text("export.saveFiles").frame(maxWidth: .infinity).frame(minHeight: 46)
        }
        .buttonStyle(.dsPillSecondary)
      default:
        EmptyView()
      }
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.bottom, DS.Spacing.sm)
  }

  // MARK: - Việc

  private var bundle: DataExport.Bundle? {
    switch phase {
    case .ready(let b), .packing(let b), .packed(let b, _, _): b
    default: nil
    }
  }

  private var isPacked: Bool {
    if case .packed = phase { return true }
    return false
  }

  private var isPacking: Bool {
    if case .packing = phase { return true }
    return false
  }

  private var packedURL: URL? {
    if case .packed(_, let url, _) = phase { return url }
    return nil
  }

  private func read() async {
    phase = .reading
    do {
      guard let b = try await services.loadExport(userId: userId) else {
        phase = .failed(offline: false)
        return
      }
      phase = .ready(b)
    } catch {
      phase = .failed(offline: error.neverSent)
    }
  }

  private func pack() async {
    guard case .ready(let b) = phase else { return }
    phase = .packing(b)
    let day = LocalDate(SystemWallClock().nowMillis(), in: .current)
    let files = DataExport.files(b, exportedAt: Date(), lang: String(locale.identifier.prefix(2)))
    let name = DataExport.name(day)
    let result = await Task.detached { ExportArchive.zip(files: files, name: name) }.value
    if let (url, bytes) = result {
      phase = .packed(b, url, bytes)
    } else {
      phase = .failed(offline: false)
    }
  }

  private struct GroupRow {
    let symbol: String
    let tint: Color
    let label: LocalizedStringKey
    let groups: [DataExport.Group]
  }

  private static let rows: [GroupRow] = [
    .init(symbol: "fork.knife", tint: DS.Color.metricOrangeGraphic.swiftUI, label: "export.group.meals", groups: [.meals]),
    .init(symbol: "dumbbell.fill", tint: DS.Color.metricRose.swiftUI, label: "export.group.workouts", groups: [.workouts]),
    .init(symbol: "heart.text.square", tint: DS.Color.metricBlue.swiftUI, label: "export.group.body", groups: [.body, .profile]),
    .init(symbol: "pawprint.fill", tint: DS.Color.goldAccent, label: "export.group.koa", groups: [.koa]),
  ]
}

/// Ghi các tệp vào một thư mục tạm rồi nén zip — `NSFileCoordinator` với
/// `.forUploading` nén thư mục thành zip (API hệ thống, không cần thư viện).
enum ExportArchive {
  static func zip(files: [(path: String, data: Data)], name: String) -> (URL, Int)? {
    let fm = FileManager.default
    let root = fm.temporaryDirectory.appendingPathComponent("export-\(UUID().uuidString)", isDirectory: true)
    let dir = root.appendingPathComponent(name, isDirectory: true)
    do {
      for f in files {
        let url = dir.appendingPathComponent(f.path)
        try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try f.data.write(to: url, options: .completeFileProtection)
      }
    } catch {
      return nil
    }
    var out: (URL, Int)?
    var coordError: NSError?
    NSFileCoordinator().coordinate(readingItemAt: dir, options: .forUploading, error: &coordError) { zipped in
      let dest = root.appendingPathComponent("\(name).zip")
      guard (try? fm.copyItem(at: zipped, to: dest)) != nil else { return }
      let size = (try? fm.attributesOfItem(atPath: dest.path)[.size] as? Int) ?? 0
      out = (dest, size)
    }
    try? fm.removeItem(at: dir)
    return coordError == nil ? out : nil
  }
}
