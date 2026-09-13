/**
 * Bản JS và bản NATIVE của worklets phải khớp tới TẬN SỐ PATCH.
 *
 * ── vì sao tệp này tồn tại ──
 *
 * Worklets có sẵn một phép kiểm phiên bản (`checkCppVersion`), và nó ném lỗi
 * khi JS lệch native. Nhưng đọc kỹ `matchVersion` thì nó so **major và minor
 * rồi bỏ qua patch**:
 *
 *     // x.y.z, compare only major and minor, skip patch
 *
 * Với repo này đó đúng là chỗ hở duy nhất cần bịt. Bản vá A9 là bước từ
 * `0.10.0` lên `0.10.1` — một bước PATCH. Nên một máy còn pod `0.10.0` chạy
 * cùng JS `0.10.1` sẽ khởi động **êm ru, không một lời cảnh báo**, và "app
 * chạy bình thường" bị đọc nhầm thành "pod đã mới".
 *
 * Chuyện đó không phải giả định. Ba báo cáo sự cố từ máy thật (05/09, 12/09,
 * 13/09) mang đúng một chữ ký trong `JSScheduler::scheduleOnJS`, và hai tệp
 * cuối có `slice_uuid` GIỐNG HỆT nhau — cùng một nhị phân, tức lần thứ ba
 * không hề dựng lại. Câu hỏi "máy đang chạy pod nào" đã ba lần không trả lời
 * được, mỗi lần tốn một vòng dựng máy thật.
 *
 * Nay nó tự trả lời. Worklets tự đặt CẢ HAI con số lên global — lớp native đặt
 * `_WORKLETS_VERSION_CPP`, còn lớp JS đặt `_WORKLETS_VERSION_JS` ngay trong
 * hàm dựng `NativeWorklets` — nên tệp này không import gì và không gõ số nào:
 * nó chỉ so hai thứ chính thư viện đã khai. Không có chỗ nào để lệch.
 *
 * ── vì sao chỉ ở `__DEV__`, và vì sao KHÔNG ném ──
 *
 * Đây là câu hỏi của người DỰNG app, không phải của người dùng: bản phát hành
 * thì pod đi kèm nhị phân, không lệch được. Và không ném vì một lệch patch
 * chưa chắc đã hỏng — ném là biến một câu cảnh báo hữu ích thành một app không
 * mở được.
 */
type WorkletsGlobals = { _WORKLETS_VERSION_CPP?: string; _WORKLETS_VERSION_JS?: string };

export function warnWorkletsVersionSkew() {
  if (!__DEV__) return;
  const { _WORKLETS_VERSION_CPP: cpp, _WORKLETS_VERSION_JS: jsVersion } =
    globalThis as unknown as WorkletsGlobals;
  if (!cpp || !jsVersion) {
    console.warn(
      '[worklets] không đọc được cặp phiên bản (_WORKLETS_VERSION_CPP / _WORKLETS_VERSION_JS). ' +
        'Không kết luận được pod nào đang chạy.',
    );
    return;
  }
  if (cpp === jsVersion) return;
  console.warn(
    `[worklets] LỆCH: native ${cpp}, JS ${jsVersion}. Phép kiểm sẵn có của worklets BỎ QUA số ` +
      'patch nên nó im lặng ở đây. Pod chưa được cài lại: chạy `npm run prebuild:free` rồi dựng ' +
      'lại. Chữ ký A9 (SIGABRT trong JSScheduler::scheduleOnJS) đến từ đúng chỗ lệch này.',
  );
}
