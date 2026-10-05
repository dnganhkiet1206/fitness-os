// Preview gallery — C sở hữu (#306).
//
// Gallery deterministic cho C↔D review nhanh trước merge.
// Mỗi section là một scenario; tên Preview mô tả đúng trạng thái.
//
// Các màn phức tạp (Today/Workout/Summary/Auth) có Preview riêng trong file
// của chúng — gallery này tập trung DS components + async states (không cần
// controller/backend).
//
// KHÔNG phải iPhone validation. Kiệt là người validate trên máy.
import ASCNDDesignSystem
import SwiftUI

struct PreviewGallery: View {
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.xl) {
        gallerySection("Buttons") {
          VStack(spacing: DS.Spacing.sm) {
            DSButton("Primary", style: .primary) {}
            DSButton("Secondary", style: .secondary) {}
            DSButton("Destructive", style: .destructive) {}
            DSButton("Disabled", style: .primary) {}
              .disabled(true)
          }
        }

        gallerySection("Async states") {
          VStack(spacing: DS.Spacing.md) {
            DSLoadingView(message: "Đang tải…")
              .frame(height: 120)
            DSErrorView(message: "Có lỗi xảy ra.") {}
              .frame(height: 200)
            DSOfflineView {}
              .frame(height: 200)
          }
        }

        gallerySection("Cards & tiles") {
          VStack(spacing: DS.Spacing.md) {
            DSCard {
              Text("Card content")
                .font(DS.TextStyle.body)
            }
            HStack(spacing: DS.Spacing.md) {
              DSStatTile(label: "Volume", value: "1,340", unit: "kg")
              DSStatTile(label: "Sets", value: "12")
              DSStatTile(label: "Bài", value: "5")
            }
          }
        }

        gallerySection("Empty states") {
          DSEmptyState(
            title: "Chưa có dữ liệu",
            message: "Hoàn thành một buổi tập để xem ở đây."
          )
          .frame(height: 200)
        }

        gallerySection("Section headers") {
          VStack(alignment: .leading, spacing: DS.Spacing.sm) {
            DSSectionHeader("Hôm nay")
            DSSectionHeader("Tuần này", actionTitle: "Xem tất cả") {}
          }
        }
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle("Preview Gallery")
  }

  private func gallerySection<Content: View>(
    _ title: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(title)
        .font(DS.TextStyle.headline)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      content()
    }
  }
}

// MARK: - Preview matrix

#Preview("Gallery — Light") {
  NavigationStack {
    PreviewGallery()
  }
  .preferredColorScheme(.light)
}

#Preview("Gallery — Dark") {
  NavigationStack {
    PreviewGallery()
  }
  .preferredColorScheme(.dark)
}

#Preview("Gallery — XXXL") {
  NavigationStack {
    PreviewGallery()
  }
  .dynamicTypeSize(.accessibility3)
}
