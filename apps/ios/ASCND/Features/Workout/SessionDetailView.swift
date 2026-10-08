import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Chi tiết một buổi đã ghi (#527 Phase 2/8) — trên `HistoryBook.detail(id)` /
/// `SessionDetail` (#428). Mở từ hàng của lịch sử buổi tập.
///
/// RN @ fac9ac2 KHÔNG có màn này: hàng của `sessions.tsx` chỉ có nút xoá. Mọi
/// con số ở đây là luật ĐÃ CÓ của RN mà `SessionDetail` port lại (thẻ xem
/// trước khi đăng `payloadFromSession`, `volume_load`, `trainingMinutes`,
/// `findRecords`) — màn không tính gì mới:
/// - tên đã lưu ("Buổi tập" khi trống), ngày, phút ƯỚC LƯỢNG (dấu ~), volume
///   đã lưu theo đơn vị tạ, gắng sức của buổi, cờ kỷ lục;
/// - từng bài theo thứ tự: set đã làm, set nặng nhất, volume của bài, từng set
///   (khởi động đánh dấu, không bỏ; bài giữ tư thế theo giây);
/// - kỷ lục: so với các buổi TRƯỚC nó trong lịch sử đang có — và nói rõ cửa sổ;
/// - xoá: hỏi lại như hàng của lịch sử (`HistoryBook.delete`), xong thì đóng.
///
/// Trạng thái: chưa đọc lịch sử → đang tải; buổi không còn (xoá ở máy này hay
/// nơi khác, ra khỏi cửa sổ, không phải của người đang đăng nhập) → nói thẳng.
struct SessionDetailView: View {
  let book: HistoryBook
  let id: String

  @Environment(\.dismiss) private var dismiss
  @Environment(\.weightUnit) private var unit
  @Environment(\.locale) private var locale
  @State private var confirmingDelete = false
  @State private var deleteFailed = false

  var body: some View {
    content
      .navigationTitle(Text(title))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if case .ready = book.detail(id) {
          ToolbarItem(placement: .primaryAction) {
            Button(role: .destructive) {
              confirmingDelete = true
            } label: {
              Image(systemName: "trash")
            }
            .accessibilityLabel(Text(String(localized: "history.delete.confirm")))
          }
        }
      }
      .confirmationDialog(
        String(localized: "history.delete.title"), isPresented: $confirmingDelete, titleVisibility: .visible
      ) {
        Button(String(localized: "history.delete.confirm"), role: .destructive) {
          Task { await delete() }
        }
        Button(String(localized: "common.cancel"), role: .cancel) {}
      } message: {
        Text(String(format: String(localized: "history.delete.message"), title))
      }
      .alert(String(localized: "async.error.generic"), isPresented: $deleteFailed) {
        Button(String(localized: "common.cancel"), role: .cancel) {}
      }
  }

  private var title: String {
    if case .ready(let d) = book.detail(id), let t = d.title { return t }
    return String(localized: "sd.title.fallback")
  }

  @ViewBuilder private var content: some View {
    switch book.detail(id) {
    case .loading:
      DSLoadingView(message: String(localized: "history.loading"))
    case .notFound:
      DSEmptyState(
        systemImage: "questionmark.folder", title: String(localized: "sd.notFound"),
        message: String(localized: "sd.notFound.hint"))
    case .ready(let d):
      List {
        Section { summary(d) }
        ForEach(Array(d.exercises.enumerated()), id: \.offset) { _, e in
          Section {
            ForEach(Array(e.sets.enumerated()), id: \.offset) { _, s in
              setRow(s)
            }
          } header: {
            exerciseHeader(e)
          }
        }
        if !d.records.isEmpty {
          Section {
            ForEach(Array(d.records.enumerated()), id: \.offset) { _, r in
              recordRow(r)
            }
          } header: {
            Text("sd.records")
          } footer: {
            // Cửa sổ so sánh phải được nói ra: lúc chốt RN so với 400 buổi.
            Text(String(localized: "sd.records.window \(d.comparedSessions) \(HistoryBook.windowDays)"))
          }
        }
      }
    }
  }

  // MARK: - Đầu màn

  private func summary(_ d: SessionDetail) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(d.at.date, format: .dateTime.weekday(.wide).day().month(.wide).year().hour().minute())
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      HStack(spacing: DS.Spacing.md) {
        if let v = d.volumeKg, v > 0 {
          stat(String(localized: "summary.volume"), "\(unit.volume(Double(v)).formatted(.number.locale(.app))) \(unit.label)")
        }
        stat(String(localized: "summary.sets"), "\(d.completedSets)")
        stat(String(localized: "summary.exercises"), "\(d.exercises.count)")
        if let m = d.estimatedMinutes {
          // Dấu ~: ƯỚC LƯỢNG từ set, không phải số đo.
          stat(String(localized: "sd.minutes"), "~\(m)")
        }
      }
      HStack(spacing: DS.Spacing.sm) {
        if let rpe = d.sessionRpe {
          Text(String(localized: "sd.effort \(rpe)"))
            .font(DS.TextStyle.caption.weight(.semibold))
            .padding(.horizontal, DS.Spacing.sm)
            .padding(.vertical, 2)
            .background(DS.Color.secondary.swiftUI, in: Capsule())
        }
        if d.prDetected {
          Label(String(localized: "history.pr"), systemImage: "trophy.fill")
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.readinessYellow.swiftUI)
        }
        if d.warmupSets > 0 {
          Text(String(localized: "sd.warmupCount \(d.warmupSets)"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
    }
    .padding(.vertical, DS.Spacing.xs)
  }

  private func stat(_ label: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(verbatim: value).font(DS.TextStyle.title2.monospacedDigit())
      Text(verbatim: label).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .accessibilityElement(children: .combine)
  }

  // MARK: - Bài

  private func exerciseHeader(_ e: SessionDetail.Exercise) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(verbatim: e.name).font(DS.TextStyle.headline).textCase(nil)
      Text(verbatim: exerciseMeta(e))
        .font(DS.TextStyle.caption)
        .textCase(nil)
    }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
  }

  /// "3 set · nặng nhất 60 kg × 8 · 1.440 kg".
  private func exerciseMeta(_ e: SessionDetail.Exercise) -> String {
    var parts = [
      e.workingSets == 1 ? String(localized: "sd.sets.one") : String(localized: "sd.sets.other \(e.workingSets)"),
    ]
    if let w = e.topWeightKg, let r = e.topReps {
      parts.append(String(localized: "sd.top \(load(w)) \(r)"))
    }
    if e.volumeKg > 0 { parts.append("\(unit.volume(Double(e.volumeKg)).formatted(.number.locale(.app))) \(unit.label)") }
    return parts.joined(separator: "  ·  ")
  }

  private func setRow(_ s: SessionDetail.SetLine) -> some View {
    HStack {
      Text(verbatim: "\(s.position)")
        .font(DS.TextStyle.caption.monospacedDigit())
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(minWidth: 24, alignment: .leading)
      Text(verbatim: setText(s)).font(DS.TextStyle.body.monospacedDigit())
      Spacer()
      if s.warmup {
        Text("summary.warmup")
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      if let rpe = s.rpe {
        Text(verbatim: "RPE \(rpe)")
          .font(DS.TextStyle.caption.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
    .accessibilityElement(children: .combine)
  }

  /// Set giữ tư thế theo giây; tạ / rep không đọc được thì "—" ở ô ấy.
  private func setText(_ s: SessionDetail.SetLine) -> String {
    if let d = s.durationSec, s.reps == nil { return "\(d)s" }
    let reps = s.reps.map(String.init) ?? "—"
    guard let w = s.weightKg else { return "— × \(reps)" }
    return w > 0 ? "\(load(w)) × \(reps)" : reps
  }

  private func load(_ kg: Double) -> String { unit.localizedLoad(kg, locale: locale) ?? unit.load(kg) }

  // MARK: - Kỷ lục

  private func recordRow(_ r: PersonalRecord) -> some View {
    HStack {
      Image(systemName: "trophy.fill").foregroundStyle(DS.Color.readinessYellow.swiftUI).accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: r.exercise).font(DS.TextStyle.body)
        Text(verbatim: recordText(r))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
    .accessibilityElement(children: .combine)
  }

  private func recordText(_ r: PersonalRecord) -> String {
    switch r.kind {
    case .weight:
      return String(localized: "sd.record.weight \(load(r.value)) \(load(r.previous))")
    case .reps:
      let at = r.atWeight.map { load($0) } ?? String(localized: "sd.bodyweight")
      return String(localized: "sd.record.reps \(Int(r.value)) \(at) \(Int(r.previous))")
    }
  }

  private func delete() async {
    do throws(HistoryBook.DeleteRefusal) {
      try await book.delete(id)
      dismiss()
    } catch {
      // `notFound`: buổi đã biến (xoá ở nơi khác) — không báo, như hàng của lịch sử.
      if case .storage = error { deleteFailed = true } else { dismiss() }
    }
  }
}
