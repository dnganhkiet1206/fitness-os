import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

// Các mảnh của màn tập "từng set một" (#527, thiết kế lại 14/10 — chủ dự án
// duyệt mock v2). Thuần trình bày: nhận số + callback; ghi vẫn đi qua
// `WorkoutSessionController` trong `WorkoutView`. Logic thuần ở
// `WorkoutFocus` (ASCNDCore).

private var accent: Color { WorkoutsHomeView.accent }

// MARK: - Đầu màn: ngày + thanh tiến độ theo bài

struct SessionProgressHeader: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let eyebrow: String
  let exercises: [WorkoutFocus.Exercise]
  /// Bài của set kế tiếp — đoạn ấy được tô đậm viền.
  let current: String?

  private var done: Int { exercises.reduce(0) { $0 + $1.done } }
  private var total: Int { exercises.reduce(0) { $0 + $1.total } }

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(alignment: .firstTextBaseline) {
        Text(verbatim: eyebrow)
          .font(DS.TextStyle.caption.weight(.semibold))
          .textCase(.uppercase)
          .tracking(0.6)
          .foregroundStyle(accent)
        Spacer(minLength: DS.Spacing.sm)
        Text(String(localized: "ws.sets.progress \(done) \(total)"))
          .font(DS.TextStyle.mono(.caption))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .contentTransition(.numericText())
      }
      // Một đoạn cho mỗi bài, dài theo số set — đọc ra "còn bao nhiêu" như
      // thanh của RN, mà vẫn biết đang ở bài nào.
      GeometryReader { geo in
        let gap: CGFloat = 4
        let width = max(0, geo.size.width - gap * CGFloat(max(0, exercises.count - 1)))
        HStack(spacing: gap) {
          ForEach(exercises) { ex in
            let w = total > 0 ? width * CGFloat(ex.total) / CGFloat(total) : 0
            ZStack(alignment: .leading) {
              Capsule().fill(DS.Color.foreground.swiftUI.opacity(0.08))
              Capsule()
                .fill(accent.opacity(ex.isComplete || ex.key != current ? 1 : 0.85))
                .frame(width: ex.total > 0 ? w * CGFloat(ex.done) / CGFloat(ex.total) : 0)
            }
            .frame(width: w)
          }
        }
      }
      .frame(height: 6)
      .animation(DSMotion.animation(.snappy, reduceMotion: reduceMotion), value: done)
      .accessibilityHidden(true)
    }
    .accessibilityElement(children: .combine)
  }
}

// MARK: - Ô số lớn với − / +

struct FocusStepper: View {
  @Binding var text: String
  /// "kg" / "lb" / "reps".
  let unitLabel: String
  /// Tên đọc cho VoiceOver ("Tạ (kg)", "Reps").
  let name: String
  let editable: Bool
  var keyboard: UIKeyboardType = .decimalPad
  var placeholder = "0"
  let focus: FocusState<WorkoutView.FieldFocus?>.Binding
  let field: WorkoutView.FieldFocus
  /// Bản nhỏ cho ô nhập trong dạng bảng (hai ô cạnh nhau).
  var compact = false
  let step: (String, Int) -> String

  var body: some View {
    HStack(spacing: compact ? 0 : DS.Spacing.sm) {
      roundButton("minus", String(localized: "ws.step.dec \(name)")) { text = step(text, -1) }
      VStack(spacing: 0) {
        TextField(placeholder, text: $text)
          .keyboardType(keyboard)
          .multilineTextAlignment(.center)
          .font(.system(size: compact ? 22 : 34, weight: .semibold, design: .rounded))
          .minimumScaleFactor(0.6)
          .lineLimit(1)
          .focused(focus, equals: field)
          .disabled(!editable)
          .accessibilityLabel(Text(verbatim: name))
        Text(verbatim: unitLabel)
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
      .frame(maxWidth: .infinity)
      roundButton("plus", String(localized: "ws.step.inc \(name)")) { text = step(text, 1) }
    }
    .padding(compact ? 4 : DS.Spacing.sm)
    .background((compact ? DS.Color.card.swiftUI : DS.Color.foreground.swiftUI.opacity(0.04)), in: RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous))
    .sensoryFeedback(.selection, trigger: text)
  }

  private func roundButton(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font((compact ? Font.footnote : Font.title3).weight(.semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .frame(minWidth: compact ? 44 : 48, minHeight: compact ? 44 : 48)
        // Vòng nhỏ vẽ BÊN TRONG vùng chạm ≥ 44pt.
        .background(
          Circle().fill(compact ? DS.Color.foreground.swiftUI.opacity(0.05) : DS.Color.card.swiftUI)
            .padding(compact ? 6 : 0))
        .overlay(Circle().strokeBorder(DS.Color.foreground.swiftUI.opacity(compact ? 0 : 0.08)))
    }
    .buttonStyle(TodayPressStyle())
    .buttonRepeatBehavior(.enabled)
    .disabled(!editable)
    .opacity(editable ? 1 : 0.4)
    .accessibilityLabel(Text(verbatim: label))
  }
}

// MARK: - Nghỉ giữa set

struct FocusRestCard: View {
  let timer: RestTimer
  /// "Curl · Set 3/3 · 15 kg × 10" — `nil` khi đã hết set.
  let next: String?
  /// Set vừa xong là kỷ lục (`nil` = không).
  var record: String?
  var onAdjust: (Int) -> Void
  var onSkip: () -> Void
  var onSetPaused: (Bool) -> Void

  @Environment(AppServices.self) private var services: AppServices?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var tint: Color { DS.Color.metricBlue.swiftUI }

  /// Koa nghỉ cùng người dùng, cùng dáng với Live Activity.
  @ViewBuilder private var koa: some View {
    if let services {
      let state: RestKoa = timer.isPaused ? .waiting : record == nil ? .resting : .record
      MascotFigureView(
        mascotId: services.preferences.mascotSelected, emotion: state.emotion, equipped: services.koaEquipped,
        size: 84, animated: !reduceMotion
      )
      .frame(width: 92, height: 96, alignment: .bottom)
      .accessibilityHidden(true)
    }
  }

  var body: some View {
    TimelineView(.periodic(from: .now, by: 0.25)) { context in
      let now = EpochMillis(context.date)
      let left = timer.remaining(at: now)
      let paused = timer.isPaused
      let warning = RestTimer.warns(left: left, paused: paused)
      VStack(spacing: DS.Spacing.md) {
        koa
        if let record {
          Text(verbatim: record)
            .font(DS.TextStyle.footnote.weight(.semibold))
            .multilineTextAlignment(.center)
            .foregroundStyle(DS.Color.readinessYellow.swiftUI)
        }
        Text(paused ? String(localized: "workout.rest.title.paused") : String(localized: "workout.rest.title"))
          .font(DS.TextStyle.caption.weight(.semibold))
          .textCase(.uppercase)
          .tracking(0.6)
          .foregroundStyle(tint)
        ZStack {
          Circle().stroke(tint.opacity(0.14), lineWidth: 12)
          Circle()
            .trim(from: 0, to: timer.ringFraction(at: now))
            .stroke(warning ? DS.Color.destructive.swiftUI : tint, style: StrokeStyle(lineWidth: 12, lineCap: .round))
            .rotationEffect(.degrees(-90))
          Text(verbatim: RestTimer.label(seconds: left))
            .font(.system(size: 44, weight: .semibold, design: .rounded))
            .contentTransition(.numericText(countsDown: true))
            .foregroundStyle(DS.Color.foreground.swiftUI)
        }
        .frame(width: 180, height: 180)
        .accessibilityElement()
        .accessibilityLabel(Text(String(format: String(localized: "workout.rest.left"), left)))

        HStack(spacing: DS.Spacing.sm) {
          chip(Text(verbatim: "−15s"), String(format: String(localized: "workout.rest.adjust"), "-15")) { onAdjust(-15) }
          chip(Image(systemName: paused ? "play.fill" : "pause.fill"),
               String(localized: paused ? "workout.rest.resume" : "workout.rest.pause")) { onSetPaused(!paused) }
          chip(Text(verbatim: "+15s"), String(format: String(localized: "workout.rest.adjust"), "+15")) { onAdjust(15) }
        }

        if let next {
          VStack(spacing: 2) {
            Text(String(localized: "ws.rest.next"))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Text(verbatim: next)
              .font(DS.TextStyle.headline.monospacedDigit())
              .multilineTextAlignment(.center)
          }
          .accessibilityElement(children: .combine)
        }

        Button(action: onSkip) {
          Text(String(localized: "ws.rest.skip"))
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 50)
            .overlay(Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.15)))
            .contentShape(Capsule())
        }
        .buttonStyle(TodayPressStyle())
        .accessibilityIdentifier("workout.rest.skip")
      }
      .padding(DS.Spacing.card)
      .frame(maxWidth: .infinity)
      .todayCard()
    }
  }

  private func chip<Label: View>(_ label: Label, _ a11y: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      label
        .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
        .foregroundStyle(tint)
        .padding(.horizontal, DS.Spacing.md)
        .frame(minWidth: 56, minHeight: 44)
        .background(tint.opacity(0.12), in: Capsule())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityLabel(Text(verbatim: a11y))
  }
}

// MARK: - Các bài trong buổi

struct ExerciseQueue: View {
  let exercises: [WorkoutFocus.Exercise]
  let current: String?
  let onPick: (String) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(String(localized: "ws.queue"))
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .padding(.horizontal, 4)
        .accessibilityAddTraits(.isHeader)
      VStack(spacing: 0) {
        ForEach(Array(exercises.enumerated()), id: \.element.id) { i, ex in
          if i > 0 { Divider().padding(.leading, 48).opacity(0.5) }
          row(i, ex)
        }
      }
      .todayCard()
    }
  }

  private func row(_ i: Int, _ ex: WorkoutFocus.Exercise) -> some View {
    let isCurrent = ex.key == current
    return Button { onPick(ex.key) } label: {
      HStack(spacing: 12) {
        ZStack {
          Circle().fill(ex.isComplete ? accent : accent.opacity(isCurrent ? 0.16 : 0.08))
          if ex.isComplete {
            Image(systemName: "checkmark").font(.caption.weight(.bold)).foregroundStyle(.white)
          } else {
            Text(verbatim: "\(i + 1)")
              .font(DS.TextStyle.mono(.caption).weight(.semibold))
              .foregroundStyle(accent)
          }
        }
        .frame(width: 28, height: 28)
        .accessibilityHidden(true)
        Text(verbatim: ex.name)
          .font(DS.TextStyle.body.weight(isCurrent ? .semibold : .regular))
          .foregroundStyle(ex.isComplete ? DS.Color.mutedForeground.swiftUI : DS.Color.foreground.swiftUI)
          .lineLimit(1)
        Spacer(minLength: DS.Spacing.sm)
        Text(verbatim: "\(ex.done)/\(ex.total)")
          .font(DS.TextStyle.mono(.footnote))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        if isCurrent {
          Image(systemName: "arrowtriangle.left.fill")
            .font(.caption2)
            .foregroundStyle(accent)
            .accessibilityHidden(true)
        }
      }
      .padding(.horizontal, DS.Spacing.md)
      .frame(minHeight: 52)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(ex.isComplete)
    .accessibilityAddTraits(isCurrent ? .isSelected : [])
    .accessibilityValue(Text(verbatim: "\(ex.done)/\(ex.total)"))
  }
}

// MARK: - Ngày chưa tới: xem trước

struct WorkoutPreviewView: View {
  let eyebrow: String
  let name: String
  let meta: String
  let lines: [WorkoutFocus.Preview]
  /// "Thứ Năm".
  let opensOn: String
  var onChange: (() -> Void)?

  @Environment(\.weightUnit) private var unit
  @Environment(\.locale) private var locale

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      VStack(alignment: .leading, spacing: 4) {
        Text(verbatim: eyebrow)
          .font(DS.TextStyle.caption.weight(.semibold))
          .textCase(.uppercase)
          .tracking(0.6)
          .foregroundStyle(accent)
        Text(verbatim: name)
          .font(DS.TextStyle.largeTitle.weight(.bold))
          .accessibilityAddTraits(.isHeader)
        Text(verbatim: meta)
          .font(DS.TextStyle.footnote.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(.horizontal, 4)

      VStack(spacing: 0) {
        ForEach(Array(lines.enumerated()), id: \.element.id) { i, line in
          if i > 0 { Divider().padding(.leading, 56).opacity(0.5) }
          row(i, line)
        }
      }
      .todayCard()

      HStack(spacing: DS.Spacing.sm) {
        Image(systemName: "calendar.badge.clock")
          .accessibilityHidden(true)
        Text(String(localized: "ws.preview.opens \(opensOn)"))
          .font(DS.TextStyle.footnote.weight(.medium))
        Spacer(minLength: 0)
      }
      .foregroundStyle(DS.Color.metricPurple.swiftUI)
      .padding(DS.Spacing.md)
      .background(DS.Color.metricPurple.swiftUI.opacity(0.12), in: RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous))

      if let onChange {
        Button(action: onChange) {
          Label(String(localized: "ws.preview.change"), systemImage: "arrow.left.arrow.right")
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 50)
            .overlay(Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.15)))
            .contentShape(Capsule())
        }
        .buttonStyle(TodayPressStyle())
      }
    }
  }

  private func row(_ i: Int, _ line: WorkoutFocus.Preview) -> some View {
    var parts = ["\(line.sets) × \(line.reps)"]
    if let kg = line.weightKg { parts.append(unit.localizedLoad(kg, locale: locale) ?? unit.load(kg)) }
    parts.append(String(localized: "ws.preview.rest \(line.restSeconds)"))
    return HStack(spacing: 12) {
      Text(verbatim: "\(i + 1)")
        .font(DS.TextStyle.mono(.footnote).weight(.semibold))
        .foregroundStyle(accent)
        .frame(width: 30, height: 30)
        .background(accent.opacity(0.12), in: Circle())
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: line.name)
          .font(DS.TextStyle.body.weight(.semibold))
          .lineLimit(2)
        Text(verbatim: parts.joined(separator: " · "))
          .font(DS.TextStyle.footnote.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, 12)
    .accessibilityElement(children: .combine)
  }
}

// MARK: - Dải nghỉ gọn (dạng bảng)

/// Nghỉ trong dạng bảng: một dải xanh — vòng nhỏ, thời gian, −15 / tạm dừng /
/// +15, Bỏ qua. Thẻ nghỉ lớn chỉ hợp với màn từng set.
struct RestStrip: View {
  let timer: RestTimer
  var onAdjust: (Int) -> Void
  var onSkip: () -> Void
  var onSetPaused: (Bool) -> Void

  private var tint: Color { DS.Color.metricBlue.swiftUI }

  var body: some View {
    TimelineView(.periodic(from: .now, by: 0.25)) { context in
      let now = EpochMillis(context.date)
      let left = timer.remaining(at: now)
      let paused = timer.isPaused
      let warning = RestTimer.warns(left: left, paused: paused)
      HStack(spacing: DS.Spacing.sm) {
        ZStack {
          Circle().stroke(tint.opacity(0.18), lineWidth: 4)
          Circle()
            .trim(from: 0, to: timer.ringFraction(at: now))
            .stroke(warning ? DS.Color.destructive.swiftUI : tint, style: StrokeStyle(lineWidth: 4, lineCap: .round))
            .rotationEffect(.degrees(-90))
        }
        .frame(width: 30, height: 30)
        .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 0) {
          Text(paused ? String(localized: "workout.rest.title.paused") : String(localized: "workout.rest.title"))
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(tint)
          Text(verbatim: RestTimer.label(seconds: left))
            .font(DS.TextStyle.mono(.title3).weight(.semibold))
            .contentTransition(.numericText(countsDown: true))
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(String(format: String(localized: "workout.rest.left"), left)))
        Spacer(minLength: 0)
        button(Text(verbatim: "−15"), String(format: String(localized: "workout.rest.adjust"), "-15")) { onAdjust(-15) }
        button(Image(systemName: paused ? "play.fill" : "pause.fill"),
               String(localized: paused ? "workout.rest.resume" : "workout.rest.pause")) { onSetPaused(!paused) }
        button(Text(verbatim: "+15"), String(format: String(localized: "workout.rest.adjust"), "+15")) { onAdjust(15) }
        Button(String(localized: "workout.rest.skip"), action: onSkip)
          .accessibilityIdentifier("workout.rest.skip")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(tint)
          .frame(minWidth: 44, minHeight: 44)
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.vertical, DS.Spacing.xs)
      .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
    }
  }

  private func button<L: View>(_ label: L, _ a11y: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      label
        .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
        .foregroundStyle(tint)
        .frame(minWidth: 44, minHeight: 44)
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityLabel(Text(verbatim: a11y))
  }
}

// MARK: - Ảnh của bài (lối vào hướng dẫn)

/// Ảnh vuông bo góc của một bài: ảnh / poster hướng dẫn, dấu ▶ khi có video.
/// Chưa có ảnh: chữ cái đầu trên nền màu Tập luyện. Trang trí — nút bọc nó
/// (cùng tên bài) mới là vùng chạm.
struct ExerciseThumb: View {
  let name: String
  let thumbnail: ExerciseGuideBook.Thumbnail?
  /// Có hướng dẫn để mở (bài thêm tay thì không).
  let linked: Bool
  var size: CGFloat = 52

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .fill(accent.opacity(0.12))
      if let url = thumbnail?.url {
        AsyncImage(url: url) { phase in
          if case .success(let image) = phase {
            image.resizable().scaledToFill()
          } else {
            initial
          }
        }
      } else {
        initial
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(alignment: .bottomTrailing) {
      if linked {
        Image(systemName: thumbnail?.isVideo == true ? "play.fill" : "book.fill")
          .font(.system(size: 9, weight: .bold))
          .foregroundStyle(.white)
          .padding(5)
          .background(accent, in: Circle())
          .overlay(Circle().strokeBorder(DS.Color.card.swiftUI, lineWidth: 2))
          .offset(x: 4, y: 4)
      }
    }
    .accessibilityHidden(true)
  }

  private var initial: some View {
    Text(verbatim: String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased())
      .font(.system(size: size * 0.4, weight: .bold, design: .rounded))
      .foregroundStyle(accent)
  }
}
