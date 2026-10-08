import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Màn sinh trắc học (#527) — `app/biometrics.tsx` @ fac9ac2 trên
/// `BiometricsBook`.
///
/// Như RN:
/// - đọc lỗi trả lời TRƯỚC trường hợp rỗng — không bao giờ nói "chưa ghi gì"
///   thay cho "không đọc được";
/// - mỗi chỉ số một thẻ: chấm trạng thái, giá trị mới nhất (một chữ số lẻ),
///   đơn vị, đường xu hướng khi có ≥ 2 điểm; thẻ HRV chỉ cho loại bạn thật có;
/// - danh sách lần đo mới → cũ, giờ của MÁY; xoá có hỏi lại, xoá xong tính lại
///   điểm ngày ấy và hôm nay;
/// - dòng miễn trừ y khoa ở cuối.
///
/// Khác RN / chưa có: nút "+" và nút "Nhập thủ công" ở trạng thái trống (màn
/// `log-biometrics` đi qua hàng đợi offline của B — chưa port); không có toast
/// — kết quả xoá hiện bằng hộp thoại và đọc bằng VoiceOver.
struct BiometricsView: View {
  let book: BiometricsBook

  @State private var pendingDelete: Biometrics.Sample?
  @State private var outcome: BiometricsBook.DeleteOutcome?

  var body: some View {
    content
      .navigationTitle(String(localized: "bio.title"))
      .task { if case .loading = book.phase { await book.load() } }
      .refreshable { await book.load() }
      .confirmationDialog(
        String(localized: "bio.delete.title"),
        isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
        titleVisibility: .visible,
        presenting: pendingDelete
      ) { sample in
        Button(String(localized: "bio.delete.confirm"), role: .destructive) {
          Task { await delete(sample) }
        }
        Button(String(localized: "common.cancel"), role: .cancel) {}
      } message: { _ in
        Text(String(localized: "bio.delete.message"))
      }
      .alert(
        outcome.map(Self.outcomeText) ?? "",
        isPresented: Binding(get: { outcome != nil && outcome != .deleted }, set: { if !$0 { outcome = nil } })
      ) {
        Button(String(localized: "common.cancel"), role: .cancel) {}
      }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView(message: String(localized: "bio.loading"))
    case .failed:
      DSErrorView(message: String(localized: "bio.loadFailed")) {
        Task { await book.load() }
      }
    case .empty:
      DSEmptyState(
        systemImage: "waveform.path.ecg", title: String(localized: "bio.empty.title"),
        message: String(localized: "bio.empty.message"))
    case .ready(let samples):
      ScrollView {
        LazyVStack(spacing: DS.Spacing.md) {
          ForEach(Biometrics.metrics(samples), id: \.self) { metric in
            card(metric, samples)
          }
          readings
          Text(String(localized: "bio.disclaimer"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .multilineTextAlignment(.center)
            .padding(.top, DS.Spacing.xs)
        }
        .padding(DS.Spacing.md)
      }
    }
  }

  // MARK: - Thẻ chỉ số

  private func card(_ m: Biometrics.Metric, _ samples: [Biometrics.Sample]) -> some View {
    let points = Biometrics.series(m, samples)
    let latest = points.last?.value
    let status = latest.map { Biometrics.status($0, m.range) }
    let label = Self.label(m, qualified: Biometrics.rmssdQualified(samples))
    let color = Self.color(m)
    return DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack {
          HStack(spacing: DS.Spacing.sm) {
            if let status {
              Circle().fill(Self.statusColor(status)).frame(width: 8, height: 8).accessibilityHidden(true)
            }
            Text(verbatim: label).font(DS.TextStyle.headline)
          }
          Spacer()
          HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(verbatim: latest.map(Biometrics.display) ?? "—")
              .font(DS.TextStyle.title.monospacedDigit())
              .foregroundStyle(color)
            Text(verbatim: Self.unit(m))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: label))
        .accessibilityValue(Text(Self.a11yValue(latest, unit: Self.unit(m), status: status)))

        if points.count >= 2 {
          Chart(points, id: \.at) { p in
            LineMark(x: .value("t", p.at.date), y: .value("v", p.value))
              .foregroundStyle(color)
              .interpolationMethod(.monotone)
          }
          .chartXAxis(.hidden)
          .frame(height: 90)
          .accessibilityHidden(true)
        }
      }
    }
  }

  // MARK: - Danh sách lần đo

  private var readings: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(String(localized: "bio.readings"))
        .font(DS.TextStyle.caption)
        .textCase(.uppercase)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      ForEach(book.newestFirst) { s in
        DSCard {
          HStack(spacing: DS.Spacing.md) {
            VStack(alignment: .leading, spacing: 2) {
              Text(verbatim: Biometrics.stamp(s.at, in: .current)).font(DS.TextStyle.footnote)
              Text(Self.summary(s))
                .font(DS.TextStyle.caption)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .lineLimit(1)
            }
            .accessibilityElement(children: .combine)
            Spacer()
            Button {
              pendingDelete = s
            } label: {
              Image(systemName: "trash")
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(book.deleting)
            .accessibilityLabel(Text(String(localized: "bio.delete.a11y")))
          }
        }
      }
    }
    .padding(.top, DS.Spacing.xs)
  }

  private func delete(_ s: Biometrics.Sample) async {
    let result = await book.delete(s)
    outcome = result
    AccessibilityNotification.Announcement(Self.outcomeText(result)).post()
  }

  // MARK: - Chữ, màu

  /// Nhãn thẻ: dịch cho nhịp tim / nhịp thở / đau nhức; ký hiệu kỹ thuật giữ
  /// nguyên như RN (HRV, SpO₂, VO₂max).
  static func label(_ m: Biometrics.Metric, qualified: Bool) -> String {
    switch m {
    case .hr: String(localized: "bio.hr")
    case .hrvSdnn: "HRV · SDNN"
    case .hrv: qualified ? "HRV · RMSSD" : "HRV"
    case .spo2: "SpO₂"
    case .vo2max: "VO₂max"
    case .resp: String(localized: "bio.resp")
    case .soreness: String(localized: "bio.soreness")
    }
  }

  /// Đơn vị — ký hiệu quốc tế giữ nguyên; nhịp thở không có ký hiệu nên dịch.
  static func unit(_ m: Biometrics.Metric) -> String {
    switch m {
    case .hr: "bpm"
    case .hrvSdnn, .hrv: "ms"
    case .spo2: "%"
    case .vo2max: "mL/kg/min"
    case .resp: String(localized: "bio.resp.unit")
    case .soreness: "/10"
    }
  }

  static func color(_ m: Biometrics.Metric) -> Color {
    switch m {
    case .hr: DS.Color.destructive.swiftUI
    case .hrvSdnn: DS.Color.readinessGreen.swiftUI
    case .hrv, .resp: DS.Color.metricPurple.swiftUI
    case .spo2: DS.Color.metricBlue.swiftUI
    case .vo2max, .soreness: DS.Color.metricOrange.swiftUI
    }
  }

  static func statusColor(_ s: Biometrics.Status) -> Color {
    switch s {
    case .good: DS.Color.readinessGreen.swiftUI
    case .warn: DS.Color.readinessYellow.swiftUI
    case .bad: DS.Color.readinessRed.swiftUI
    }
  }

  static func statusText(_ s: Biometrics.Status) -> String {
    switch s {
    case .good: String(localized: "bio.status.good")
    case .warn: String(localized: "bio.status.warn")
    case .bad: String(localized: "bio.status.bad")
    }
  }

  /// VoiceOver: giá trị + đơn vị, rồi trạng thái mà chấm màu chỉ nói bằng màu.
  static func a11yValue(_ latest: Double?, unit: String, status: Biometrics.Status?) -> String {
    guard let latest else { return "—" }
    let value = "\(Biometrics.display(latest)) \(unit)"
    return status.map { "\(value), \(statusText($0))" } ?? value
  }

  /// `summarise`: các phần đã đo nối bằng " · ", không có gì thì "Không có giá trị".
  static func summary(_ s: Biometrics.Sample) -> String {
    let bits = Biometrics.parts(s).map(partText)
    return bits.isEmpty ? String(localized: "bio.noValues") : bits.joined(separator: " · ")
  }

  static func partText(_ p: Biometrics.Part) -> String {
    switch p {
    case .rhr(let v): String(localized: "bio.part.rhr \(v)")
    case .sdnn(let v): "SDNN \(v)ms"
    case .rmssd(let v): "RMSSD \(v)ms"
    case .spo2(let v): "SpO₂ \(v)%"
    case .resp(let v): String(localized: "bio.part.resp \(v)")
    case .vo2max(let v): "VO₂max \(v)"
    }
  }

  static func outcomeText(_ o: BiometricsBook.DeleteOutcome) -> String {
    switch o {
    case .deleted: String(localized: "bio.deleted")
    case .nothingWritten: String(localized: "bio.error.nothingWritten")
    case .failed: String(localized: "async.error.generic")
    case .rebuildFailed: String(localized: "bio.error.rebuild")
    }
  }
}
