import SwiftUI

@main
struct ASCNDWatchApp: App {
  @State private var model: WatchWorkoutModel

  init() {
    _model = State(initialValue: WatchWorkoutModel())
  }

  var body: some Scene {
    WindowGroup {
      WatchWorkoutView(model: model)
        .task { model.start() }
    }
  }
}
