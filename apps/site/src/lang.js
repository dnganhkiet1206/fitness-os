// Ngôn ngữ: trang tiếng Anh (gốc) tự chuyển sang /vi/ hoặc /es/ theo ngôn ngữ trình duyệt,
// trừ khi người dùng đã tự chọn. Giữ nguyên query và hash (link đặt lại mật khẩu mang token).
(function () {
  var me = document.currentScript;
  var base = me.getAttribute('data-base') || '';
  var lang = me.getAttribute('data-lang');
  var saved = null;
  try { saved = localStorage.getItem('ascnd-lang'); } catch (e) {}

  if (lang === 'en' && saved !== 'en') {
    var want = saved || (navigator.languages && navigator.languages[0]) || navigator.language || '';
    want = want.slice(0, 2).toLowerCase();
    if (want === 'vi' || want === 'es') {
      var rest = location.pathname.slice(base.length) || '/';
      location.replace(base + '/' + want + rest + location.search + location.hash);
      return;
    }
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-lang]');
    if (!a) return;
    // Trang đặt lại mật khẩu giữ token trong sessionStorage (reset.js), nên đổi ngôn ngữ không mất link.
    try { localStorage.setItem('ascnd-lang', a.getAttribute('data-lang')); } catch (err) {}
  });
})();
