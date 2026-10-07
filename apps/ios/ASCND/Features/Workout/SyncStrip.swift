// Dải trạng thái outbox — C sở hữu UI (#277).
//
// "Chốt lúc offline vẫn là thành công (đã lưu trên máy)" — dải này chỉ nói
// hàng đợi đồng bộ đang ở đâu, không làm màn tập lo về mạng.
//
// Presentation thuần: nhận `OutboxStatus`, A8 (#272) nối `SyncWorker` thật.
// Chữ cho `dead` (bị server từ chối) là placeholder chờ Kiệt duyệt.
import ASCNDDesignSystem
import SwiftUI

/// Trạng thái hàng đợi — A8 thay bằng dữ liệu `SyncWorker` thật.
public enum OutboxStatus: Equatable, Sendable {
  /// Không có gì chờ gửi.
  case ok
  /// N mục đang chờ gửi (offline hoặc đang thử lại).
  case pending(Int)
  /// N mục bị server từ chối — chữ là placeholder chờ Kiệt duyệt (#277).
  case dead(Int)
}

public struct SyncStrip: View {
  let status: OutboxStatus

  public init(status: OutboxStatus) {
    self.status = status
  }

  public var body: some View {
    switch status {
    case .ok:
      EmptyView()
    case .pending(let n):
      strip(
        systemImage: "arrow.triangle.2.circlepath",
        text: String(format: String(localized: "workout.sync.pending"), n),
        tint: DS.Color.metricBlue
      )
    case .dead(let n):
      strip(
        systemImage: "exclamationmark.octagon",
        // PLACEHOLDER — chờ Kiệt duyệt chữ cho mục bị server từ chối (#277).
        text: String(format: String(localized: "workout.sync.dead"), n),
        tint: DS.Color.destructive
      )
    }
  }

  private func strip(systemImage: String, text: String, tint: DSColor) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      Image(systemName: systemImage)
        .foregroundStyle(tint.swiftUI)
      Text(text)
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Spacer(minLength: 0)
    }
    .padding(.horizontal, DS.Spacing.md)
    .frame(minHeight: 44)
    .background(tint.swiftUI.opacity(0.1))
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.sm))
    .accessibilityLabel(Text(text))
  }
}

// MARK: - Preview

#Preview("pending") {
  VStack {
    SyncStrip(status: .pending(3))
    SyncStrip(status: .ok)
  }
  .padding()
}

#Preview("dead — placeholder") {
  SyncStrip(status: .dead(1))
    .padding()
}

#Preview("Dynamic Type XXXL") {
  SyncStrip(status: .pending(12))
    .padding()
    .dynamicTypeSize(.accessibility3)
}
