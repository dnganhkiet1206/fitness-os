import AVFoundation

/// Tiếng của phòng Koa (31/10, Kiệt): vài tiếng nhỏ cho Koa sống động hơn, chỉ khi người dùng chạm
/// hoặc ở khoảnh khắc lớn. Giọng Koa kiểu hoạt hình tự tổng hợp, công tắc là tiếng CC0 của Kenney
/// (`tools/koa-sound`). `.ambient`: im theo công tắc im lặng, không ngắt
/// nhạc đang nghe. Tắt được bằng nút loa trên thanh của phòng.
@MainActor
enum KoaSound {
  enum Cue: String {
    case boop1 = "koa-boop-1"
    case boop2 = "koa-boop-2"
    case boop3 = "koa-boop-3"
    case click = "koa-click"
    case land = "koa-land"
    case yawn = "koa-yawn"
    case cheer = "koa-cheer"
  }

  /// Chạm Koa: đổi tiếng, không lặp liền một tiếng.
  private static var lastBoop = Cue.boop3
  static func boop() {
    lastBoop = [Cue.boop1, .boop2, .boop3].filter { $0 != lastBoop }.randomElement() ?? .boop1
    play(lastBoop)
  }

  nonisolated static let offKey = "koa.sound.off"

  private static var players: [Cue: AVAudioPlayer] = [:]

  static func play(_ cue: Cue) {
    guard !UserDefaults.standard.bool(forKey: offKey) else { return }
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.ambient, options: .mixWithOthers)
    try? session.setActive(true)
    guard let player = player(cue) else { return }
    player.currentTime = 0
    player.play()
  }

  private static func player(_ cue: Cue) -> AVAudioPlayer? {
    if let p = players[cue] { return p }
    guard let url = Bundle.main.url(forResource: cue.rawValue, withExtension: "wav"),
      let p = try? AVAudioPlayer(contentsOf: url)
    else { return nil }
    p.volume = 0.4
    p.prepareToPlay()
    players[cue] = p
    return p
  }
}
