import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Trang gốc tab Tập luyện khi không có buổi đang tập (#527) —
/// `app/(tabs)/workouts/index.tsx` @ fac9ac2, trên các màn đã port.
///
/// Như RN: "Mẫu buổi tập (n)" — 3 mẫu mới nhất, "Xem tất cả" → danh sách mẫu
/// (`templates.tsx`: tìm, xoá có hỏi lại), "Tạo mới" → builder; đọc lỗi khác
/// trống; hàng "Thư viện & lịch sử" (số buổi đã ghi) và "Tiến bộ từng bài";
/// kéo để đọc lại.
///
/// Khác RN: thẻ buổi hôm nay là thẻ trạng thái + "Kế hoạch tuần" (nút bắt đầu
/// ở tab Hôm nay); "Thư viện & lịch sử" tách hai hàng (Lịch sử · Thư viện bài
/// tập) vì chưa có lưới nhóm cơ; chưa có đoạn Cơ thể; xoá mẫu ở danh sách đầy
/// đủ (không ở ba hàng xem trước).
struct WorkoutsHomeView: View {
  let flow: WorkoutFlow

  @State private var showsBuilder = false

  private var templates: [WorkoutTemplate] {
    (flow.today.library?.templates ?? []).sorted(by: WorkoutTemplate.newestFirst)
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.lg) {
        today
        templatesSection
        tools
      }
      .padding(DS.Spacing.md)
    }
    .refreshable { await flow.refresh() }
    .sheet(isPresented: $showsBuilder) { TemplateFormView(flow: flow) }
  }

  // MARK: - Hôm nay

  private var today: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text(String(localized: "workouts.noSession.title"))
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Text(String(localized: "workouts.noSession.message"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
        if flow.plan != nil {
          NavigationLink {
            WeekPlanView(flow: flow)
          } label: {
            Label("workoutshome.plan", systemImage: "calendar")
              .font(DS.TextStyle.footnote.weight(.semibold))
              .frame(minHeight: 44)
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  // MARK: - Mẫu buổi tập

  @ViewBuilder private var templatesSection: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack {
        Text("workoutshome.templates \(templates.count.formatted(.number.locale(.app)))")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        Spacer()
        if !templates.isEmpty {
          NavigationLink {
            TemplateListView(flow: flow)
          } label: {
            Text("workoutshome.seeall")
              .font(DS.TextStyle.footnote.weight(.semibold))
              .frame(minHeight: 44)
          }
        }
      }
      if flow.today.library == nil, flow.today.failure != nil {
        DSErrorView(message: String(localized: "history.loadFailed")) {
          Task { await flow.refresh() }
        }
      } else if templates.isEmpty {
        Text("workoutshome.notemplates")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      } else {
        VStack(spacing: 0) {
          ForEach(Array(templates.prefix(3).enumerated()), id: \.element.id) { i, t in
            if i > 0 { Divider() }
            templateRow(t)
          }
        }
        .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
      }
      if flow.plan != nil {
        Button {
          showsBuilder = true
        } label: {
          Label("wb.createNew", systemImage: "plus")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
      }
    }
  }

  private func templateRow(_ t: WorkoutTemplate) -> some View {
    let sets = t.exercises.reduce(0) { $0 + $1.sets }
    return VStack(alignment: .leading, spacing: 2) {
      Text(verbatim: t.name)
        .font(DS.TextStyle.body.weight(.semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Text(String(localized: "wb.list.meta \(t.exercises.count) \(sets)"))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, DS.Spacing.xs)
    .accessibilityElement(children: .combine)
  }

  // MARK: - Công cụ

  @ViewBuilder private var tools: some View {
    VStack(spacing: 0) {
      if let history = flow.history {
        NavigationLink {
          WorkoutHistoryView(book: history)
        } label: {
          toolRow("clock.arrow.circlepath", "history.title")
        }
        .buttonStyle(.plain)
      }
      if let library = flow.library {
        Divider()
        NavigationLink {
          ExercisesView(library: library)
        } label: {
          toolRow("books.vertical", "workoutshome.library")
        }
        .buttonStyle(.plain)
      }
      if let insights = flow.insights {
        Divider()
        NavigationLink {
          ExerciseInsightView(insights: insights, today: flow.today)
        } label: {
          toolRow("chart.line.uptrend.xyaxis", "workoutshome.insight")
        }
        .buttonStyle(.plain)
      }
    }
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
  }

  private func toolRow(_ symbol: String, _ title: LocalizedStringKey) -> some View {
    HStack(spacing: DS.Spacing.md) {
      Image(systemName: symbol)
        .foregroundStyle(DS.Color.primary.swiftUI)
        .frame(width: 28)
        .accessibilityHidden(true)
      Text(title)
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Spacer()
      Image(systemName: "chevron.right")
        .font(.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
    }
    .padding(.horizontal, DS.Spacing.md)
    .frame(minHeight: 52)
    .contentShape(Rectangle())
  }
}
