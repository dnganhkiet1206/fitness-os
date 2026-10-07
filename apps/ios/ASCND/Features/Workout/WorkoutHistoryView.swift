// Buổi tập đã ghi — port RN `app/sessions.tsx` (#375, #400).
//
// Đọc `HistoryBook` (Core, local-first): cache hiện ngay, buổi vừa chốt hiện
// ngay, xoá đi qua outbox. View chỉ trình bày + hỏi lại trước khi xoá.
//
// Giữ như RN:
// - 90 ngày, mới trước, nhóm theo tháng ĐỊA PHƯƠNG; đầu tháng có số buổi, tổng
//   khối lượng và % so với tháng trước (`HistoryMonths`, cùng luật loại tháng
//   đang chạy / tháng bị cửa sổ cắt);
// - đọc LỖI không phải lịch sử RỖNG: lỗi khi chưa có gì để hiện → màn lỗi có
//   thử lại, không bao giờ nói "chưa tập buổi nào";
// - xoá: vuốt, VÀ một nút luôn thấy (vuốt là "vô hình cho tới khi đoán ra"),
//   luôn hỏi lại trước (`sessions.tsx:64`).
// Khác RN (cải tiến, không mất gì): có cache mà làm mới lỗi thì vẫn hiện danh
// sách kèm dải báo, thay vì giấu cả danh sách.
// Chưa port (ghi ở PARITY_MATRIX): kcal mỗi buổi (cần hồ sơ năng lượng), đơn
// vị lb, nút "Ghi buổi tập" ở trạng thái rỗng (chưa có màn ghi tay), dựng lại
// điểm sẵn sàng sau khi xoá (#266) — nên câu hỏi lại KHÔNG hứa điều đó.
import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

public struct WorkoutHistoryView: View {
  let book: HistoryBook
  @State private var pendingDelete: HistoryEntry?
  @State private var deleteFailed = false

  public init(book: HistoryBook) {
    self.book = book
  }

  public var body: some View {
    content
      .navigationTitle(String(localized: "history.title"))
      .task { if !book.loaded { await book.load() } }
      .refreshable { await book.refresh() }
      .confirmationDialog(
        String(localized: "history.delete.title"),
        isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
        titleVisibility: .visible,
        presenting: pendingDelete
      ) { entry in
        Button(String(localized: "history.delete.confirm"), role: .destructive) {
          Task { await delete(entry) }
        }
        Button(String(localized: "common.cancel"), role: .cancel) {}
      } message: { entry in
        Text(String(format: String(localized: "history.delete.message"), entry.templateName))
      }
      .alert(String(localized: "async.error.generic"), isPresented: $deleteFailed) {
        Button(String(localized: "common.cancel"), role: .cancel) {}
      }
  }

  @ViewBuilder private var content: some View {
    if !book.loaded {
      DSLoadingView(message: String(localized: "history.loading"))
    } else if book.entries.isEmpty, book.failure != nil {
      // Lỗi trả lời TRƯỚC trường hợp rỗng, không bao giờ thay cho nó (RN).
      DSErrorView(message: String(localized: "history.loadFailed")) {
        Task { await book.refresh() }
      }
    } else if book.entries.isEmpty {
      DSEmptyState(systemImage: "dumbbell", title: String(localized: "history.empty.title"))
    } else {
      list
    }
  }

  private var list: some View {
    let months = HistoryMonths.group(book.entries, timeZone: .current, now: EpochMillis(Date()))
    return List {
      if book.failure != nil {
        staleBanner
      }
      ForEach(months) { m in
        Section {
          ForEach(m.entries) { e in
            row(e, peak: m.peakKg)
              .swipeActions(edge: .trailing) {
                Button(role: .destructive) { pendingDelete = e } label: {
                  Label(String(localized: "history.delete.confirm"), systemImage: "trash")
                }
              }
          }
        } header: {
          monthHeader(m)
        }
      }
    }
    .listStyle(.insetGrouped)
  }

  // MARK: - Đầu tháng

  private func monthHeader(_ m: HistoryMonth) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(monthLabel(m))
        .font(DS.TextStyle.footnote.weight(.semibold))
        .textCase(.uppercase)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      HStack(spacing: DS.Spacing.sm) {
        Text(verbatim: monthMeta(m))
          .font(DS.TextStyle.caption.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        if let change = m.changePercent, change != 0 {
          // Xanh CHỈ khi tăng; giảm là màu chìm — một tháng nhẹ hơn là deload
          // ngang với bỏ tập, tô đỏ là gọi mọi tháng nghỉ theo kế hoạch là thất
          // bại (RN `monthChange`).
          HStack(spacing: 2) {
            Image(systemName: change > 0 ? "arrow.up.right" : "arrow.down.right")
              .accessibilityHidden(true)
            Text(String(format: String(localized: change > 0 ? "history.month.up" : "history.month.down"), abs(change)))
          }
          .font(DS.TextStyle.caption.weight(.semibold).monospacedDigit())
          .foregroundStyle(change > 0 ? DS.Color.readinessGreen.swiftUI : DS.Color.mutedForeground.swiftUI)
        }
      }
    }
    .padding(.vertical, DS.Spacing.xs)
  }

  /// "Tháng 9 năm 2026" theo ngôn ngữ app (RN `toLocaleDateString(month long, year)`).
  private func monthLabel(_ m: HistoryMonth) -> String {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = .current
    let date = cal.date(from: DateComponents(year: m.year, month: m.month, day: 15)) ?? Date()
    return date.formatted(.dateTime.month(.wide).year())
  }

  /// "4 buổi · 48.200 kg" — không có khối lượng thì chỉ số buổi (RN).
  private func monthMeta(_ m: HistoryMonth) -> String {
    let n = m.entries.count
    let count = String(format: String(localized: n == 1 ? "history.month.sessions.one" : "history.month.sessions.other"), n)
    return m.volumeKg > 0 ? "\(count)  ·  \(m.volumeKg.formatted()) kg" : count
  }

  // MARK: - Hàng

  private func row(_ e: HistoryEntry, peak: Int) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      // Phần thông tin: MỘT phần tử VoiceOver. Nút xoá đứng riêng để vẫn bấm
      // được (không `.combine` cả hàng — P2 #523).
      HStack(spacing: DS.Spacing.md) {
        VStack(alignment: .leading, spacing: 4) {
          HStack(spacing: DS.Spacing.xs) {
            Text(verbatim: e.templateName)
              .font(DS.TextStyle.headline)
              .foregroundStyle(DS.Color.foreground.swiftUI)
            if e.prDetected {
              Image(systemName: "trophy.fill")
                .font(.caption)
                .foregroundStyle(DS.Color.readinessYellow.swiftUI)
            }
          }
          Text(e.at.date, format: .dateTime.weekday(.abbreviated).day().month(.abbreviated))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          // Thanh tỉ lệ với buổi nặng nhất tháng (RN `volumeRatio`).
          if peak > 0 {
            GeometryReader { g in
              Capsule()
                .fill(DS.Color.metricBlue.swiftUI.opacity(0.6))
                .frame(width: max(4, g.size.width * Double(e.volumeKg) / Double(peak)))
            }
            .frame(height: 3)
          }
        }
        Spacer(minLength: DS.Spacing.sm)
        VStack(alignment: .trailing, spacing: 4) {
          Text(verbatim: "\(e.volumeKg.formatted()) kg")
            .font(DS.TextStyle.body.monospacedDigit())
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Text(String(format: String(localized: "history.sets"), e.completedSets, e.exerciseCount))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(verbatim: rowLabel(e)))
      // Nút xoá luôn thấy — vuốt chỉ là lối tắt (RN "the button stays").
      Button { pendingDelete = e } label: {
        Image(systemName: "trash")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(minWidth: 44, minHeight: 44)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel(Text(String(format: String(localized: "history.delete.a11y"), e.templateName)))
    }
  }

  /// "Push A, 4.200 kg, 12 hiệp, thứ Hai 5 thg 10[, Kỷ lục cá nhân]".
  private func rowLabel(_ e: HistoryEntry) -> String {
    var parts = [
      String(format: String(localized: "history.a11y.row"), e.templateName, e.volumeKg, e.completedSets),
      e.at.date.formatted(.dateTime.weekday(.wide).day().month(.wide)),
    ]
    if e.prDetected { parts.append(String(localized: "history.pr")) }
    return parts.joined(separator: ", ")
  }

  private var staleBanner: some View {
    HStack(spacing: DS.Spacing.xs) {
      Image(systemName: "wifi.slash")
        .accessibilityHidden(true)
      Text(String(localized: "history.offline"))
        .font(DS.TextStyle.caption)
    }
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    .frame(maxWidth: .infinity)
  }

  // MARK: - Xoá

  private func delete(_ entry: HistoryEntry) async {
    pendingDelete = nil
    do throws(HistoryBook.DeleteRefusal) {
      try await book.delete(entry.id)
    } catch {
      // `notFound`: buổi đã biến khỏi danh sách (xoá ở nơi khác) — không báo.
      if case .storage = error { deleteFailed = true }
    }
  }
}
