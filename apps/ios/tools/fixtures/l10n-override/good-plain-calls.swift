// Dạng mà overload che: khoá trần, khoá có số, có bundle.
let a = String(localized: "settings.title")
let b = String(localized: "workout.sets \(n)")
let c = String(localized: "hello", bundle: .main)
let d = Text(String(localized: "a, b (c)"))
// Chú thích nhắc tới String(localized: "x", comment: "y") không bị báo.
