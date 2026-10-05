/// Lớp ghi khi mất mạng — đúng bốn lớp của `native/docs/OFFLINE-POLICY.md`
/// (Kiệt quyết, #65/#161/#165). "Mặc định" không có case riêng: nó LÀ `now`.
public enum OfflineClass: String, Sendable, Hashable, Codable {
  /// Ghi nhận: một sự thật mới về chính mình, kèm thời điểm. Xếp hàng, sống
  /// qua tắt app, gửi khi có mạng.
  case record
  /// Trạng thái: cờ / lựa chọn về một giá trị tuyệt đối. Áp ngay, gộp theo
  /// khoá, chỉ trong phiên.
  case state
  /// Tức thời (và mặc định): mất mạng thì từ chối ngay.
  case now
}

/// Vì sao một lần gửi thất bại — đủ để quyết có gửi lại hay không, không hơn.
/// Tầng mạng (#224) dịch lỗi thật (URLError, PostgrestError) sang đây.
public enum WriteFailure: Sendable, Hashable {
  /// Không tới được server: không có mạng, mất kết nối, timeout, DNS.
  case offline
  /// Server trả lỗi. `code` là SQLSTATE hoặc mã PostgREST; `nil` khi không có
  /// mã (5xx của gateway, thân lỗi rỗng).
  case server(code: String?)
  /// Bản ghi thuộc tài khoản khác phiên hiện tại (`WrongAccountError`).
  case wrongAccount
  /// Bản ghi bản build này không đọc / không phát lại được (`UnusableWriteError`).
  case unusable
}

/// Gửi lại hay thôi — theo baseline `offline-write.ts` @ fac9ac2, với một chỗ
/// lệch có chủ đích ghi trong ADR-0003 (ngân sách thử lại không tính lần mất
/// mạng).
public enum RetryPolicy {
  /// Mã mà hỏi lại không bao giờ đổi được câu trả lời (`permanentFailure`,
  /// offline-write.ts:357). Thêm mã mới ở ĐÂY và kèm vector — không ở chỗ gọi.
  public static let permanentCodes: Set<String> = [
    "42501",  // RLS / không có quyền
    "42703",  // cột không tồn tại
    "23505",  // trùng khoá — bản ghi đã tới server rồi
    "23503",  // khoá ngoại
    "23514",  // vi phạm CHECK
    "23502",  // NOT NULL
    "22P02",  // giá trị không đúng kiểu
    "22007",  // ngày giờ sai định dạng
    "54000",  // trần (báo cáo cộng đồng mỗi ngày, đăng bài mỗi giờ)
    "CR001",  // bị đội kiểm duyệt tạm khoá đăng
  ]

  /// Số lần gửi lại sau lỗi TẠM THỜI (không phải mất mạng). Baseline:
  /// `failureCount < 3` → tối đa 3 lần gửi lại, 4 lần gửi tổng.
  public static let maxTransientRetries = 3

  /// Trần khoảng chờ giữa hai lần gửi.
  public static let maxDelayMillis: Int64 = 30_000

  public static func isPermanent(_ f: WriteFailure) -> Bool {
    switch f {
    case .wrongAccount, .unusable: return true
    case .offline: return false
    case .server(let code?):
      return code.hasPrefix("PGRST") || permanentCodes.contains(code)
    case .server(nil): return false
    }
  }

  /// Khoảng chờ trước lần gửi kế tiếp, sau lần lỗi thứ `failures` (đếm từ 1,
  /// mọi loại lỗi). TanStack `defaultRetryDelay(failureCount)` với
  /// `failureCount` đếm từ 0: 1 s, 2 s, 4 s, … trần 30 s.
  public static func delayMillis(afterFailures failures: Int) -> Int64 {
    let exponent = max(0, failures - 1)
    guard exponent < 15 else { return maxDelayMillis }  // 2^15 s đã quá trần từ lâu
    return min(1000 << Int64(exponent), maxDelayMillis)
  }
}

/// Lịch sử thất bại của một bản ghi trong hàng đợi.
public struct FailureHistory: Sendable, Hashable, Codable {
  /// Mọi lần lỗi — nuôi khoảng chờ (như baseline).
  public private(set) var failures: Int = 0
  /// Chỉ lỗi tạm thời không phải mất mạng — nuôi ngân sách thử lại.
  public private(set) var transientFailures: Int = 0

  public init() {}

  public enum Decision: Sendable, Hashable {
    /// Gửi lại sau `delayMillis`; `needsNetwork` = chờ có mạng rồi mới gửi.
    case retry(delayMillis: Int64, needsNetwork: Bool)
    /// Thôi. `permanent`: server/dữ liệu từ chối; ngược lại: hết ngân sách.
    case giveUp(permanent: Bool)
  }

  /// Ghi nhận một lần lỗi và trả lời: gửi lại khi nào, hay thôi.
  public mutating func record(_ failure: WriteFailure) -> Decision {
    failures += 1
    if RetryPolicy.isPermanent(failure) { return .giveUp(permanent: true) }
    if failure == .offline {
      return .retry(delayMillis: RetryPolicy.delayMillis(afterFailures: failures), needsNetwork: true)
    }
    transientFailures += 1
    guard transientFailures <= RetryPolicy.maxTransientRetries else { return .giveUp(permanent: false) }
    return .retry(delayMillis: RetryPolicy.delayMillis(afterFailures: failures), needsNetwork: false)
  }
}
