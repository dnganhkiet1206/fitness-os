import ASCNDCore
import Foundation
import Testing

struct JSONValueTests {
  @Test func decodesEveryJSONKind() throws {
    let json = #"{"n":null,"t":true,"f":false,"i":3,"d":2.5,"s":"chào","a":[1,"x"],"o":{"k":1}}"#
    let v = try JSONDecoder().decode(JSONValue.self, from: Data(json.utf8))
    #expect(v["n"] == .null)
    #expect(v["t"] == .bool(true))
    #expect(v["f"] == .bool(false))
    #expect(v["i"]?.intValue == 3)
    #expect(v["d"]?.doubleValue == 2.5)
    #expect(v["d"]?.intValue == nil)
    #expect(v["s"]?.stringValue == "chào")
    #expect(v["a"] == .array([.number(1), .string("x")]))
    #expect(v["o"]?["k"]?.intValue == 1)
  }

  /// Bẫy cũ của JSONDecoder trên Darwin: số 1/0 giải mã được thành Bool.
  /// `true` phải là bool và `1` phải là số — không lẫn nhau theo chiều nào.
  @Test func doesNotConfuseBoolAndNumber() throws {
    let v = try JSONDecoder().decode(JSONValue.self, from: Data("[true, 1, 0, false]".utf8))
    #expect(v == .array([.bool(true), .number(1), .number(0), .bool(false)]))
  }

  @Test func roundTrips() throws {
    let original: JSONValue = .object(["a": .array([.null, .bool(true), .number(-1.5), .string("é")])])
    let data = try JSONEncoder().encode(original)
    #expect(try JSONDecoder().decode(JSONValue.self, from: data) == original)
  }
}
