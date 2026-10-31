import AVFoundation

/// Tiếng của phòng Koa (31/10, Kiệt): vài tiếng nhỏ cho Koa sống động hơn, chỉ khi người dùng chạm
/// hoặc ở khoảnh khắc lớn. Không phải giọng Koa. `.ambient`: im theo công tắc im lặng, không ngắt
/// nhạc đang nghe. Tắt được bằng nút loa trên thanh của phòng.
@MainActor
enum KoaSound {
  enum Cue: String {
    case boop = "koa-boop"
    case click = "koa-click"
    case land = "koa-land"
    case chime = "koa-chime"
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
