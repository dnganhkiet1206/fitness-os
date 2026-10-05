// Dynamic Island gallery — C sở hữu (#368).
//
// Gallery deterministic cho Live Activity / Dynamic Island states.
// Dùng fixture, không đổi timer semantics.
//
// States: resting, near-finish, active, ready.
//
// NOTE: Đây là SwiftUI mock để review layout (mở file này trong Xcode →
// canvas #Preview). DI thật cần máy thật.
// File nằm trong Shared/ của module AscndNative nên được compile vào app
// target qua podspec (Shared/**/*.swift) — KHÔNG đưa vào widget extension
// (plugin with-ascnd-widgets.js chỉ copy file liệt kê trong SWIFT_SOURCES).
// #235 chưa resolve — không đoán product decisions.
import SwiftUI

/// Fixture cho DI ContentState.
struct DIContentFixture: Hashable {
  let activityState: String // resting/active/ready
  let exerciseName: String
  let setNumber: Int
  let totalSets: Int
  let totalSeconds: Int
  let remainingSeconds: Int

  static var resting: Self {
    .init(
      activityState: "resting",
      exerciseName: "Bench Press",
      setNumber: 2, totalSets: 4,
      totalSeconds: 90, remainingSeconds: 45
    )
  }

  static var nearFinish: Self {
    .init(
      activityState: "resting",
      exerciseName: "Bench Press",
      setNumber: 3, totalSets: 4,
      totalSeconds: 90, remainingSeconds: 5
    )
  }

  static var active: Self {
    .init(
      activityState: "active",
      exerciseName: "Overhead Press",
      setNumber: 1, totalSets: 3,
      totalSeconds: 0, remainingSeconds: 0
    )
  }

  static var ready: Self {
    .init(
      activityState: "ready",
      exerciseName: "Squat",
      setNumber: 0, totalSets: 5,
      totalSeconds: 120, remainingSeconds: 120
    )
  }
}

/// Mock expanded view (theo spec: [-15][+15][Ring]).
struct DIExpandedMock: View {
  let fixture: DIContentFixture

  var body: some View {
    HStack(spacing: 16) {
      // -15
      Button("-15") {}
        .frame(width: 44, height: 44)
        .background(Color.gray.opacity(0.2))
        .clipShape(Circle())
      // +15
      Button("+15") {}
        .frame(width: 44, height: 44)
        .background(Color.gray.opacity(0.2))
        .clipShape(Circle())
      // Ring + digits
      ZStack {
        Circle()
          .stroke(Color.gray.opacity(0.3), lineWidth: 6)
          .frame(width: 60, height: 60)
        Text(timeString)
          .font(.system(.body, design: .monospaced))
      }
      VStack(alignment: .leading) {
        Text(fixture.exerciseName)
          .font(.caption)
        Text("Set \(fixture.setNumber + 1)/\(fixture.totalSets)")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
    .padding()
    .background(Color.black)
    .foregroundStyle(.white)
    .clipShape(RoundedRectangle(cornerRadius: 20))
  }

  private var timeString: String {
    let s = fixture.remainingSeconds
    return String(format: "%d:%02d", s / 60, s % 60)
  }
}

/// Mock compact view (theo spec: [logo][digits], không ring).
struct DICompactMock: View {
  let fixture: DIContentFixture

  var body: some View {
    HStack(spacing: 8) {
      // Logo placeholder
      Text("A")
        .font(.caption.bold())
        .frame(width: 24, height: 24)
        .background(Color.yellow)
        .clipShape(Circle())
      Text(timeString)
        .font(.system(.caption, design: .monospaced))
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 6)
    .background(Color.black)
    .foregroundStyle(.white)
    .clipShape(Capsule())
  }

  private var timeString: String {
    let s = fixture.remainingSeconds
    return String(format: "%d:%02d", s / 60, s % 60)
  }
}

struct DIGallery: View {
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        Text("Dynamic Island Gallery")
          .font(.title2.bold())
          .padding(.horizontal)

        gallerySection("Expanded — resting") {
          DIExpandedMock(fixture: .resting)
        }
        gallerySection("Expanded — near finish") {
          DIExpandedMock(fixture: .nearFinish)
        }
        gallerySection("Expanded — active") {
          DIExpandedMock(fixture: .active)
        }
        gallerySection("Expanded — active") {
          DIExpandedMock(fixture: .active)
        }
        gallerySection("Expanded — ready") {
          DIExpandedMock(fixture: .ready)
        }
        gallerySection("Compact — resting") {
          DICompactMock(fixture: .resting)
        }
        gallerySection("Compact — near finish") {
          DICompactMock(fixture: .nearFinish)
        }
        gallerySection("Compact — active") {
          DICompactMock(fixture: .active)
        }
        gallerySection("Compact — ready") {
          DICompactMock(fixture: .ready)
        }
      }
      .padding(.vertical)
    }
  }

  private func gallerySection<Content: View>(
    _ title: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.headline)
        .padding(.horizontal)
      content()
        .padding(.horizontal)
    }
  }
}

#Preview("DI Gallery — Light") {
  DIGallery()
    .preferredColorScheme(.light)
}

#Preview("DI Gallery — Dark") {
  DIGallery()
    .preferredColorScheme(.dark)
}
