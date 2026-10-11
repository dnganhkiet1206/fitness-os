import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Koa · spec sheet (#527, K4) — `app/koa-sheet.tsx` @ fac9ac2: bảng 3 (BIỂU
/// CẢM) và 5 (TƯ THẾ) của bản thiết kế "KOALA MASCOT – SVG DESIGN" chạy trên
/// máy thật, để soát hình vẽ với bản thiết kế. Chạm Koa lớn để đổi biểu cảm;
/// chạm ô để nạp vào hình lớn; tủ đồ mở từng ô một.
///
/// Như RN: chỉ hình lớn chạy hoạt ảnh (86 ô đều là khung t=0), chỉ mở được
/// thanh DEV của phòng linh vật — bản Release không có lối vào. Nhãn của tài
/// liệu thiết kế ("3. BIỂU CẢM", tên biểu cảm / tư thế / ô đồ) CỐ Ý tiếng Việt
/// như RN; tiêu đề, nhãn VoiceOver và lời gợi ý qua xcstrings (cổng i18n).
struct KoaSheetView: View {
  /// Biểu cảm vẽ cùng từng tư thế ở mục 4 của bản thiết kế (`POSE_FACE`).
  static let poseFace: [KoaFlags.Pose: KoaFlags.Expression] = [
    .idle: .happy, .turn34: .happy, .running: .happytired, .lifting: .strain, .stretching: .happy,
    .relaxing: .tired,
  ]

  static let slotLabel: [KoaFlags.Slot: String] = [
    .head: "ĐẦU", .face: "MẶT", .top: "ÁO", .bottom: "QUẦN", .shoes: "GIÀY", .back: "SAU LƯNG", .hand: "CẦM TAY",
  ]

  @State private var expression: KoaFlags.Expression = .happy
  @State private var pose: KoaFlags.Pose = .idle
  @State private var worn: KoaFlags.Worn = [:]
  /// Một ô tủ đồ mở một lúc — 70 hình cùng lúc là quá nặng.
  @State private var openSlot: KoaFlags.Slot? = .head
  @State private var taps = 0

  private let columns = Array(repeating: GridItem(.flexible(), spacing: DS.Spacing.sm), count: 3)

  var body: some View {
    ScrollView {
      VStack(spacing: DS.Spacing.md) {
        hero
        card(title: "3. BIỂU CẢM", sub: "Koa · Koala · #BFC7CF") {
          LazyVGrid(columns: columns, spacing: DS.Spacing.sm) {
            ForEach(KoaFlags.Expression.allCases, id: \.self) { e in
              tile(label: KoaFlags.expressionLabel[e] ?? e.rawValue, on: expression == e, crop: true) {
                expression = e
              } figure: {
                KoaFigureView(expression: e, worn: worn, size: 104, animated: false)
              }
            }
          }
        }
        card(title: "5. TƯ THẾ", sub: "pose · \(KoaFlags.Pose.allCases.count) trạng thái") {
          LazyVGrid(columns: columns, spacing: DS.Spacing.sm) {
            ForEach(KoaFlags.Pose.allCases, id: \.self) { p in
              tile(label: KoaFlags.poseLabel[p] ?? p.rawValue, on: pose == p, crop: false) {
                pose = p
                expression = Self.poseFace[p] ?? .happy
              } figure: {
                KoaFigureView(expression: Self.poseFace[p] ?? .happy, pose: p, worn: worn, size: 104, animated: false)
              }
            }
          }
        }
        ForEach(KoaFlags.Slot.allCases, id: \.self) { slot in wardrobe(slot) }
      }
      .padding(DS.Spacing.md)
    }
    .background(DS.Color.background.swiftUI)
    .navigationTitle(Text(String(localized: "koa.sheet.title")))
    .navigationBarTitleDisplayMode(.inline)
    .sensoryFeedback(.selection, trigger: taps)
  }

  private var hero: some View {
    VStack(spacing: DS.Spacing.xs) {
      Button {
        taps += 1
        let all = KoaFlags.Expression.allCases
        let i = all.firstIndex(of: expression) ?? 0
        expression = all[(i + 1) % all.count]
      } label: {
        KoaFigureView(expression: expression, pose: pose, worn: worn, size: 200)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "koa.sheet.cycle")))
      Text(verbatim: "\(KoaFlags.expressionLabel[expression] ?? expression.rawValue.uppercased()) · \(pose.rawValue.uppercased())")
        .font(DS.TextStyle.caption.monospaced())
        .tracking(1.6)
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Text(String(localized: "koa.sheet.hint"))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .padding(.vertical, DS.Spacing.lg)
  }

  private func card(title: String, sub: String, @ViewBuilder content: () -> some View) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: title)
          .font(DS.TextStyle.caption.monospaced())
          .tracking(2.2)
          .foregroundStyle(DS.Color.primary.swiftUI)
        Text(verbatim: sub)
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      content()
    }
    .padding(DS.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 16))
  }

  /// Một ô: hình (cắt lấy đầu với biểu cảm / đồ mặc — như mục 3 của bản thiết
  /// kế; tư thế thì cả dáng) + nhãn.
  private func tile(
    label: String, on: Bool, crop: Bool, action: @escaping () -> Void, @ViewBuilder figure: () -> some View
  ) -> some View {
    Button {
      taps += 1
      action()
    } label: {
      VStack(spacing: DS.Spacing.xs) {
        // hình 104 × 130; giữ 88 điểm trên cùng để đầu đầy ô
        figure()
          .frame(width: 104, height: crop ? 88 : 130, alignment: .top)
          .clipped()
        Text(verbatim: label)
          .font(.system(size: 11, design: .monospaced))
          .tracking(1)
          .foregroundStyle(on ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
      .padding(.vertical, DS.Spacing.sm)
      .frame(maxWidth: .infinity)
      .background(DS.Color.background.swiftUI, in: RoundedRectangle(cornerRadius: 12))
      .overlay(
        RoundedRectangle(cornerRadius: 12).stroke(on ? DS.Color.primary.swiftUI : DS.Color.border.swiftUI, lineWidth: 1)
      )
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(on ? .isSelected : [])
  }

  private func wardrobe(_ slot: KoaFlags.Slot) -> some View {
    let open = openSlot == slot
    let items = KoaFlags.items[slot] ?? []
    return VStack(alignment: .leading, spacing: DS.Spacing.md) {
      Button {
        taps += 1
        openSlot = open ? nil : slot
      } label: {
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: "\(open ? "−" : "+")  \(Self.slotLabel[slot] ?? slot.rawValue)")
            .font(DS.TextStyle.caption.monospaced())
            .tracking(2.2)
            .foregroundStyle(DS.Color.primary.swiftUI)
          Text(verbatim: "\(slot.rawValue) · \(items.count) món\(worn[slot].map { " · đang mặc \($0)" } ?? "")")
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityAddTraits(open ? .isSelected : [])
      if open {
        LazyVGrid(columns: columns, spacing: DS.Spacing.sm) {
          ForEach(items, id: \.self) { id in
            // chạm để mặc; chạm lần nữa để cởi
            tile(label: id, on: worn[slot] == id, crop: true) {
              worn[slot] = worn[slot] == id ? nil : id
            } figure: {
              KoaFigureView(pose: .idle, worn: [slot: id], size: 104, animated: false)
            }
          }
        }
      }
    }
    .padding(DS.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: 16))
  }
}

#Preview {
  NavigationStack { KoaSheetView() }
}
