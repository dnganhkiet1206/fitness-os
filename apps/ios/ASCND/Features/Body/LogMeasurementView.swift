import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Màn ghi số đo cơ thể (#527) — `app/log-measurement.tsx` trên `MeasurementLogger`.
///
/// Như RN:
/// - ngày (không qua hôm nay) + 12 ô hai cột, đúng thứ tự; nhãn vòng đo đổi
///   "(cm)" → "(in)" theo đơn vị chiều dài của tài khoản;
/// - ô nhận số thập phân (`decText`: dấu phẩy là dấu chấm, một dấu chấm);
///   ô sai thì viền đỏ + câu "cần nằm trong khoảng…" ngay dưới;
/// - nút lưu sáng khi có ô là số và không ô nào sai; có mạng: lưu rồi đóng;
///   mất mạng: xếp hàng, "đã lưu — sẽ đồng bộ", đóng; lỗi: báo, ở lại.
///
/// Mở từ deep link `ascnd://log-measurement` (lối vào ở bảng Cơ thể là màn của
/// E — `body-panel.tsx:952,1016` ở RN).
struct LogMeasurementView: View {
  let makeLogger: () -> MeasurementLogger?
  var onDone: () -> Void = {}

  @Environment(AppServices.self) private var services
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @Environment(\.dismiss) private var dismiss
  @State private var logger: MeasurementLogger?
  @State private var date = Date()
  @State private var fields: [MeasurementLog.Field: String] = [:]
  @State private var message: String?

  private var unit: MeasurementLog.LengthUnit { .init(profile: profile?.profile?.unitsHeight) }

  private var canSave: Bool {
    guard let logger, !logger.submitting, !logger.done else { return false }
    return MeasurementLog.canSave(fields, unit: unit)
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          DatePicker(
            String(localized: "measureLog.date"), selection: $date, in: ...Date(), displayedComponents: .date
          )
          .frame(minHeight: 44)
          let all = MeasurementLog.Field.allCases
          ForEach(Array(stride(from: 0, to: all.count, by: 2)), id: \.self) { i in
            HStack(alignment: .top, spacing: DS.Spacing.sm) {
              field(all[i])
              if i + 1 < all.count { field(all[i + 1]) }
            }
          }
          if let message {
            Text(verbatim: message)
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.destructive.swiftUI)
          }
          DSButton(String(localized: "common.save")) { Task { await save() } }
            .disabled(!canSave)
            .opacity(canSave ? 1 : 0.5)
        }
        .padding(DS.Spacing.lg)
      }
      .scrollDismissesKeyboard(.interactively)
      .navigationTitle(Text("measureLog.title"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.cancel")) { dismiss() }
        }
      }
    }
    .task { if logger == nil { logger = makeLogger() } }
    .onDisappear { logger?.close() }
  }

  /// `measure.*` của màn xu hướng — cùng nhãn; "(cm)" → "(in)" như RN `lbl`.
  private func label(_ f: MeasurementLog.Field) -> String {
    let key: String.LocalizationValue =
      switch f {
      case .neck: "measure.neck"
      case .shoulders: "measure.shoulders"
      case .chest: "measure.chest"
      case .waist: "measure.waist"
      case .hips: "measure.hips"
      case .bicepLeft: "measure.bicepl"
      case .bicepRight: "measure.bicepr"
      case .thighLeft: "measure.thighl"
      case .thighRight: "measure.thighr"
      case .calfLeft: "measure.calfl"
      case .calfRight: "measure.calfr"
      case .bodyFat: "measure.bodyfat"
      }
    let text = String(localized: key)
    return unit == .inches ? text.replacingOccurrences(of: "(cm)", with: "(in)") : text
  }

  private func field(_ f: MeasurementLog.Field) -> some View {
    let problem = MeasurementLog.problem(f, fields[f] ?? "", unit: unit)
    let error = problem.map { String(localized: "weight.outOfRange \($0.min) \($0.max) \($0.unit)") }
    return VStack(alignment: .leading, spacing: 6) {
      Text(verbatim: label(f))
        .font(DS.TextStyle.caption)
        .textCase(.uppercase)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .lineLimit(2)
        .accessibilityHidden(true)
      TextField(
        "—",
        text: Binding(get: { fields[f] ?? "" }, set: { fields[f] = NumberInput.decimal($0) })
      )
      .keyboardType(.decimalPad)
      .padding(.horizontal, DS.Spacing.md)
      .frame(minHeight: 48)
      .background(DS.Color.background.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
      .overlay(
        RoundedRectangle(cornerRadius: DS.Radius.md)
          .stroke(error == nil ? DS.Color.border.swiftUI : DS.Color.destructive.swiftUI, lineWidth: 1)
      )
      .accessibilityLabel(Text(verbatim: label(f)))
      .accessibilityValue(Text(verbatim: error ?? ""))
      if let error {
        Text(verbatim: error)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.destructive.swiftUI)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func save() async {
    guard let logger else { return }
    message = nil
    let day = LocalDate(EpochMillis(date), in: .current)
    switch await logger.submit(fields: fields, unit: unit, date: day, online: services.sync.online) {
    case .saved:
      AccessibilityNotification.Announcement(String(localized: "measureLog.saved")).post()
      onDone()
      dismiss()
    case .queued:
      AccessibilityNotification.Announcement(String(localized: "weight.queued")).post()
      onDone()
      dismiss()
    case .invalid, .unavailable:
      break
    case .offline:
      show(String(localized: "async.offline"))
    case .failed:
      show(String(localized: "async.error.generic"))
    }
  }

  private func show(_ text: String) {
    message = text
    AccessibilityNotification.Announcement(text).post()
  }
}
