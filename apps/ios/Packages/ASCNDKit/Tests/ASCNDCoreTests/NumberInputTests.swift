import ASCNDCore
import Testing

/// Kỳ vọng sinh bằng node từ `decText` / `intText` của
/// `native/src/lib/number-input.ts` @ fac9ac2 — không viết tay.
struct NumberInputTests {
  static let decimalCases: [(String, String)] = [
    ("71,5", "71.5"),
    ("71.5", "71.5"),
    ("", ""),
    (".", "0."),
    (",", "0."),
    ("0", "0"),
    ("00040", "40"),
    ("000005", "5"),
    ("0.5", "0.5"),
    ("00.5", "0.5"),
    ("1,2,3", "1.23"),
    ("1.2.3", "1.23"),
    ("-5", "5"),
    ("abc", ""),
    ("62,5 kg", "62.5"),
    (" 80 ", "80"),
    ("1e3", "13"),
    ("٣", ""),
    ("１２", ""),
    ("0,", "0."),
    ("007,50", "7.50"),
    ("..5", ".5"),
  ]

  static let integerCases: [(String, String)] = [
    ("71,5", "715"),
    ("71.5", "715"),
    ("", ""),
    (".", ""),
    (",", ""),
    ("0", "0"),
    ("00040", "40"),
    ("000005", "5"),
    ("0.5", "5"),
    ("00.5", "5"),
    ("1,2,3", "123"),
    ("1.2.3", "123"),
    ("-5", "5"),
    ("abc", ""),
    ("62,5 kg", "625"),
    (" 80 ", "80"),
    ("1e3", "13"),
    ("٣", ""),
    ("１２", ""),
    ("0,", "0"),
    ("007,50", "750"),
    ("..5", "5"),
  ]

  @Test(arguments: decimalCases)
  func decimalMatchesRN(raw: String, expected: String) {
    #expect(NumberInput.decimal(raw) == expected, "decText(\(raw))")
  }

  @Test(arguments: integerCases)
  func integerMatchesRN(raw: String, expected: String) {
    #expect(NumberInput.integer(raw) == expected, "intText(\(raw))")
  }

  /// Lọc hai lần không đổi gì: ô hiện đúng chuỗi đã lưu, gõ tiếp vẫn ổn định.
  @Test(arguments: decimalCases.map(\.0))
  func decimalIsIdempotent(raw: String) {
    let once = NumberInput.decimal(raw)
    #expect(NumberInput.decimal(once) == once)
  }
}
