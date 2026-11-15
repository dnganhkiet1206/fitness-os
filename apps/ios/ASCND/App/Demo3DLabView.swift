#if DEBUG
import SwiftUI

/// Màn Lab "3D" (chỉ bản Debug, Kiệt 14/11): danh sách mọi bài đã làm bản
/// minh hoạ 3D (`ExerciseDemo3D.catalog`), mỗi dòng có poster, tên, họ động
/// tác và thời lượng; chạm mở thẳng trình xem 3D. Dòng báo "thiếu USDZ" khi
/// tệp không có trong bundle, để thấy ngay bài nào chưa được chép vào app.
struct Demo3DLabView: View {
  private struct Target: Identifiable {
    let key: String
    var id: String { key }
  }

  @State private var target: Target?

  var body: some View {
    NavigationStack {
      List {
        Section {
          ForEach(ExerciseDemo3D.catalog, id: \.key) { item in
            row(item)
          }
        } footer: {
          Text(verbatim: "\(ExerciseDemo3D.catalog.count) bài có 3D · chuyển động chưa được chuyên gia duyệt")
        }
      }
      // Chừa chỗ cho thanh Ghi nhanh + tab bar, dòng cuối không bị che.
      .contentMargins(.bottom, 140, for: .scrollContent)
      .navigationTitle(Text(verbatim: "Bài đã có 3D"))
    }
    .fullScreenCover(item: $target) { t in
      ExerciseDemo3DView(name: t.key)
    }
  }

  @ViewBuilder
  private func row(_ item: (title: String, key: String, family: String)) -> some View {
    let demo = ExerciseDemo3D.demo(for: item.key)
    let hasUSDZ = demo.flatMap { Bundle.main.url(forResource: $0.usdzFile, withExtension: "usdz") } != nil
    Button {
      if hasUSDZ { target = Target(key: item.key) }
    } label: {
      HStack(spacing: 12) {
        poster(demo)
          .frame(width: 96, height: 54)
          .clipShape(RoundedRectangle(cornerRadius: 8))
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: item.title).font(.body.weight(.semibold))
          Text(verbatim: item.family).font(.caption.monospaced()).foregroundStyle(.secondary)
          if let demo {
            Text(verbatim: hasUSDZ ? String(format: "%.1f s", demo.durationS) : "thiếu USDZ trong bundle")
              .font(.caption2)
              .foregroundStyle(hasUSDZ ? Color.secondary : Color.red)
          }
        }
        Spacer()
        Image(systemName: "cube.transparent").foregroundStyle(.secondary)
      }
    }
    .buttonStyle(.plain)
  }

  @ViewBuilder
  private func poster(_ demo: ExerciseDemo3D.Demo?) -> some View {
    if let demo, let url = Bundle.main.url(forResource: demo.posterFile, withExtension: "jpg"),
      let image = UIImage(contentsOfFile: url.path)
    {
      Image(uiImage: image).resizable().scaledToFill()
    } else {
      Color.secondary.opacity(0.2)
    }
  }
}
#endif
