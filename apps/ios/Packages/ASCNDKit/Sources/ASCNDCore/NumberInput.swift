/// Lọc cho ô nhập số — theo `native/src/lib/number-input.ts` @ fac9ac2.
///
/// RN lọc ngay lúc gõ (`onChangeText={(v) => set(decText(v))}`), nên thứ hiện
/// trong ô và thứ được lưu là cùng một chuỗi. Lọc ở setter của core giữ đúng
/// điều đó cho mọi màn, không phụ thuộc màn nào nhớ gọi.
///
/// Rỗng vẫn là rỗng: "0" là một câu trả lời, rỗng là chưa trả lời.
public enum NumberInput {
  /// Số thập phân (`decText`): chữ số ASCII và ĐÚNG MỘT dấu chấm.
  ///
  /// `decimal-pad` của iOS in dấu phân cách theo vùng của máy — máy tiếng Việt
  /// gõ ra `71,5`. Không đổi thì `Double("71,5")` là nil và tạ bị ghi 0 kg mà
  /// không báo gì. Dấu chấm thứ hai trở đi bị bỏ nhưng chữ số sau nó giữ lại;
  /// "." một mình thành "0."; số 0 đầu chỉ cắt khi còn chữ số theo sau.
  public static func decimal(_ raw: String) -> String {
    var out = ""
    var dotted = false
    for c in raw.unicodeScalars {
      if c == "," || c == "." {
        if !dotted { dotted = true; out.unicodeScalars.append(".") }
      } else if ("0"..."9").contains(c) {
        out.unicodeScalars.append(c)
      }
    }
    if out == "." { return "0." }
    return stripLeadingZeros(out)
  }

  /// Số nguyên (`intText`): chỉ chữ số ASCII, không giữ số 0 thừa ở đầu.
  public static func integer(_ raw: String) -> String {
    stripLeadingZeros(String(String.UnicodeScalarView(raw.unicodeScalars.filter { ("0"..."9").contains($0) })))
  }

  /// `/^0+(?=\d)/`: cắt các số 0 đầu khi theo sau còn một chữ số.
  private static func stripLeadingZeros(_ s: String) -> String {
    var scalars = Substring(s).unicodeScalars
    while scalars.count > 1, scalars.first == "0", let next = scalars.dropFirst().first, ("0"..."9").contains(next) {
      scalars = scalars.dropFirst()
    }
    return String(scalars)
  }
}
