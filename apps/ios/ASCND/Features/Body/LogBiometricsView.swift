import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Màn nhập chỉ số sinh trắc (#527) — `app/log-biometrics.tsx` trên `BiometricLogger`.
///
/// Như RN:
/// - câu "cần 5 lần đo trong 28 ngày mới hiện lên thẻ điểm sẵn sàng";
/// - năm ô (nhịp tim nghỉ, HRV, SpO₂ | VO₂max, nhịp thở), ô sai thì báo dưới ô
///   và khoá nút; đau nhức 1…10 (chạm lại để bỏ), công tắc "hôm nay bị ốm";
/// - số Apple Health đo hôm nay: ghi chú, điền sẵn một lần, hỏi lại khi đổi;
/// - có mạng: lưu rồi đóng; mất mạng: xếp hàng, "đã lưu — sẽ đồng bộ", đóng.
///
/// Mở từ deep link `ascnd://log-biometrics` (lối vào ở màn Sinh trắc / Hôm nay
/// là màn của E).
struct LogBiometricsView: View {
  let makeLogger: () -> BiometricLogger?
  var onDone: () -> Void = {}

  @Environment(AppServices.self) private var services
  @Environment(\.dismiss) private var dismiss
  @State private var logger: BiometricLogger?
  @State private var texts: [BiometricLog.Field: String] = [:]
  @State private var soreness: Int?
  @State private var ill = false
  @State private var message: String?
  @State private var confirming = 0
  @State private var prefilled = false

  private var canSave: Bool {
    guard let logger, !logger.submitting, !logger.done else { return false }
    return BiometricLog.canSave(texts, soreness: soreness, ill: ill)
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          note("bioLog.baselineNote")
          if logger?.healthRow != nil { note("sleepLog.healthNote") }
          field(.hr, "bioLog.hr", placeholder: "60", unit: "bpm")
          field(.hrv, "bioLog.hrv", placeholder: "62", unit: "ms")
          HStack(alignment: .top, spacing: DS.Spacing.sm) {
            field(.spo2, "bioLog.spo2", placeholder: "97", unit: "%")
            field(.vo2, "bioLog.vo2", placeholder: "44", unit: "ml/kg/min")
          }
          field(.resp, "bioLog.resp", placeholder: "14", unit: "rpm")
          sorenessScale
          Toggle(String(localized: "bioLog.ill"), isOn: $ill)
            .tint(DS.Color.readinessGreen.swiftUI)
            .frame(minHeight: 44)
          if let message {
            Text(verbatim: message)
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.destructive.swiftUI)
          }
          DSButton(String(localized: "common.save")) { requestSave() }
            .disabled(!canSave)
            .opacity(canSave ? 1 : 0.5)
        }
        .padding(DS.Spacing.lg)
      }
      .scrollDismissesKeyboard(.interactively)
      .navigationTitle(Text("bioLog.title"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.cancel")) { dismiss() }
        }
      }
      .alert(
        String(localized: "sleepLog.override.title"),
        isPresented: Binding(get: { confirming > 0 }, set: { if !$0 { confirming = 0 } })
      ) {
        Button(String(localized: "common.cancel"), role: .cancel) {}
        Button(String(localized: "sleepLog.override.confirm")) { Task { await save() } }
      } message: {
        Text(String(localized: "sleepLog.override.message \(confirming)"))
      }
    }
    .task {
      guard logger == nil else { return }
      let l = makeLogger()
      logger = l
      await l?.load()
      // Điền MỘT lần, chỉ vào ô chưa gõ.
      guard !prefilled, let row = l?.healthRow else { return }
      prefilled = true
      for (f, v) in BiometricLog.prefill(row) where (texts[f] ?? "").isEmpty { texts[f] = v }
    }
    .onDisappear { logger?.close() }
  }

  private func note(_ key: String.LocalizationValue) -> some View {
    Text(String(localized: key))
      .font(DS.TextStyle.footnote)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }

  /// Câu lỗi của ô — `outOfRangeMessage` với cận của nó.
  private func error(_ f: BiometricLog.Field) -> String? {
    guard BiometricLog.bad(f, texts[f] ?? "") else { return nil }
    let unit = f == .resp ? String(localized: "bioLog.breathUnit") : f == .vo2 ? "mL/kg/min" : f == .spo2 ? "%" : f == .hr ? "bpm" : "ms"
    return String(localized: "weight.outOfRange \(Units.text(f.bounds.lowerBound)) \(Units.text(f.bounds.upperBound)) \(unit)")
  }

  private func field(_ f: BiometricLog.Field, _ key: String.LocalizationValue, placeholder: String, unit: String) -> some View {
    let err = error(f)
    return VStack(alignment: .leading, spacing: 6) {
      Text(String(localized: key))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
      HStack {
        TextField(placeholder, text: Binding(get: { texts[f] ?? "" }, set: { texts[f] = NumberInput.decimal($0) }))
          .keyboardType(.decimalPad)
          .accessibilityLabel(Text(String(localized: key)))
          .accessibilityValue(Text(verbatim: err ?? ""))
        Text(verbatim: unit)
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
      .padding(.horizontal, DS.Spacing.md)
      .frame(minHeight: 48)
      .background(DS.Color.background.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
      .overlay(
        RoundedRectangle(cornerRadius: DS.Radius.md)
          .stroke(err == nil ? DS.Color.border.swiftUI : DS.Color.destructive.swiftUI, lineWidth: 1)
      )
      if let err {
        Text(verbatim: err)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.destructive.swiftUI)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var sorenessScale: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(String(localized: "bioLog.soreness"))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      HStack(spacing: 4) {
        ForEach(1...10, id: \.self) { n in
          let on = soreness == n
          Button {
            soreness = on ? nil : n
          } label: {
            Text(verbatim: "\(n)")
              .font(DS.TextStyle.footnote.weight(on ? .bold : .regular))
              .foregroundStyle(on ? DS.Color.primaryForeground.swiftUI : DS.Color.foreground.swiftUI)
              .frame(maxWidth: .infinity, minHeight: 44)
              .background(
                on ? DS.Color.primary.swiftUI : DS.Color.background.swiftUI,
                in: RoundedRectangle(cornerRadius: DS.Radius.sm))
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text(verbatim: "\(n)"))
          .accessibilityAddTraits(on ? .isSelected : [])
          .sensoryFeedback(.selection, trigger: soreness)
        }
      }
      Text(String(localized: "bioLog.sorenessHint"))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }

  private func requestSave() {
    guard let logger else { return }
    let n = BiometricLog.healthChanges(logger.healthRow, texts: texts)
    if n > 0 {
      confirming = n
      return
    }
    Task { await save() }
  }

  private func save() async {
    guard let logger else { return }
    message = nil
    switch await logger.submit(texts: texts, soreness: soreness, ill: ill, online: services.sync.online) {
    case .saved:
      AccessibilityNotification.Announcement(String(localized: "bioLog.saved")).post()
      onDone()
      dismiss()
    case .queued:
      AccessibilityNotification.Announcement(String(localized: "weight.queued")).post()
      onDone()
      dismiss()
    case .invalid, .unavailable:
      break
    case .failed:
      message = String(localized: "async.error.generic")
      AccessibilityNotification.Announcement(String(localized: "async.error.generic")).post()
    }
  }
}
