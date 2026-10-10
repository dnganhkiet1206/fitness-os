// App tự khai báo cùng tên thì là của app, không phải của module.
enum JS { static func round(_ x: Double) -> Double { x } }
extension MealDiary { static func jsNumber(_ x: Int) -> String { "" } }
let r = JS.round(1)
let s = MealDiary.jsNumber(2)
