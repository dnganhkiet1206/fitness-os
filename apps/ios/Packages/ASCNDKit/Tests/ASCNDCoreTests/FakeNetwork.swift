/// Mạng giả cho `StateWriter` trong test: bật / tắt giữa chừng.
///
/// Closure `online:` của `StateWriter.Environment` là `@MainActor`, nên trình biên dịch coi nó là
/// `Sendable`: bắt một biến `var` cục bộ rồi đổi sau thì bị cảnh báo "mutated after capture by
/// sendable closure" (core-linux). Đọc qua một đối tượng thì không.
@MainActor
final class FakeNetwork {
  var online: Bool

  init(online: Bool) { self.online = online }
}
