import ASCNDCore
import Foundation

/// Chữ của widget theo NGÔN NGỮ APP (`WidgetDataStore.locale`), không theo máy
/// (22/10: máy tiếng Việt + app tiếng Anh thì widget ra "3 of 4 done" bên cạnh nhãn
/// "HÔM NAY · CHUỖI"). `.environment(\.locale)` chỉ đổi `Text("khoá")`; còn
/// `String(localized:)` tra theo ngôn ngữ máy — đi qua đây thì tra theo app.
func widgetText(_ key: String.LocalizationValue) -> String {
  String(localized: LocalizedStringResource(key, locale: WidgetDataStore().locale))
}
