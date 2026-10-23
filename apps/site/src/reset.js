// Đặt lại mật khẩu trên web (#527, 23/10). Gọi thẳng REST của Supabase Auth, không thư viện.
//
// Link có thể mang:
// - `token_hash` (mẫu email recovery trỏ về trang này, xem apps/site/README.md): đổi lấy phiên
//   bằng POST /auth/v1/verify — CHỈ khi bấm Lưu, nên máy quét link trong hộp thư không làm
//   cháy link; rồi PUT /auth/v1/user { password }.
// - `#access_token` (luồng implicit): dùng thẳng.
// - `code` (PKCE, khi app xin link): mã xác minh nằm trong app trên iPhone, web không đổi
//   được → nút "Mở trong app" mang nguyên link về `ascnd:///auth?type=recovery&code=…`.
// - `error_code` (link hết hạn / đã dùng): báo hết hạn, chỉ cách xin link mới trong app.
(function () {
  var root = document.querySelector('[data-reset]');
  if (!root) return;
  var api = root.getAttribute('data-supabase-url');
  var key = root.getAttribute('data-supabase-key');
  var scheme = root.getAttribute('data-scheme');
  var S = JSON.parse(root.querySelector('[data-strings]').textContent);
  var STORE = 'ascnd-reset';

  var query = new URLSearchParams(location.search);
  var hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  var get = function (k) { return hash.get(k) || query.get(k); };
  var link = {
    tokenHash: query.get('token_hash'),
    accessToken: hash.get('access_token'),
    code: query.get('code'),
    error: get('error_code') || get('error'),
  };
  var fromUrl = link.tokenHash || link.accessToken || link.code || link.error;
  try {
    if (fromUrl) sessionStorage.setItem(STORE, JSON.stringify(link));
    else link = JSON.parse(sessionStorage.getItem(STORE)) || link;
  } catch (e) {}
  // Token không nằm lại trên thanh địa chỉ / lịch sử. Đổi ngôn ngữ thì lấy lại từ sessionStorage.
  if (fromUrl) history.replaceState(null, '', location.pathname);

  function show(state) {
    root.querySelectorAll('[data-state]').forEach(function (s) { s.hidden = s.getAttribute('data-state') !== state; });
    var h = root.querySelector('[data-state="' + state + '"] h1');
    if (h && state !== 'form') { h.tabIndex = -1; h.focus(); }
  }
  function forget() { try { sessionStorage.removeItem(STORE); } catch (e) {} }

  // "Mở trong app": trao nguyên link cho app (code PKCE hoặc token_hash), app tự đổi lấy phiên.
  var openLink = scheme + ':///auth?type=recovery' +
    (link.code ? '&code=' + encodeURIComponent(link.code) : '') +
    (link.tokenHash ? '&token_hash=' + encodeURIComponent(link.tokenHash) : '');
  root.querySelectorAll('[data-open-app="device"], [data-open-app="form"]').forEach(function (a) { a.href = openLink; });
  // Implicit (#access_token) không trao được cho app: ẩn nút phụ ở form.
  if (!link.tokenHash) root.querySelectorAll('[data-open-app="form"]').forEach(function (a) { a.hidden = true; });

  if (link.error) {
    show(link.error === 'flow_state_not_found' ? 'device' : 'expired');
    forget();
    return;
  }
  if (link.code && !link.tokenHash && !link.accessToken) { show('device'); return; }
  if (!link.tokenHash && !link.accessToken) { show('nolink'); return; }
  show('form');

  var form = root.querySelector('form');
  var err = root.querySelector('[data-error]');
  var submit = root.querySelector('[data-submit]');
  var submitLabel = submit.textContent;
  var session = link.accessToken;

  root.querySelector('[data-toggle]').addEventListener('click', function (e) {
    var b = e.currentTarget;
    var reveal = form.password.type === 'password';
    form.password.type = form.confirm.type = reveal ? 'text' : 'password';
    b.textContent = b.getAttribute(reveal ? 'data-hide' : 'data-show');
    b.setAttribute('aria-pressed', String(reveal));
  });

  function fail(message) {
    err.textContent = message;
    err.hidden = false;
    submit.disabled = false;
    submit.textContent = submitLabel;
  }

  function call(method, path, body, token) {
    var headers = { apikey: key, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(api + '/auth/v1/' + path, { method: method, headers: headers, body: JSON.stringify(body) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw { status: res.status, code: data.error_code || data.code || data.error || '' };
          return data;
        });
      });
  }

  // Mã lỗi giống PasswordChange của app (SupabaseAuthAPI.passwordFailure).
  function message(e) {
    if (!e || e.status === undefined) return S.offline;
    if (e.code === 'weak_password') return S.weak;
    if (e.code === 'same_password') return S.same;
    if (e.status === 429 || e.code === 'over_request_rate_limit' || e.code === 'over_email_send_rate_limit') return S.rate;
    return S.generic;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.hidden = true;
    var pw = form.password.value;
    if (pw.length < 6) return fail(S.tooShort);
    if (pw !== form.confirm.value) return fail(S.mismatch);
    submit.disabled = true;
    submit.textContent = submit.getAttribute('data-saving');

    var ready = session
      ? Promise.resolve(session)
      : call('POST', 'verify', { type: 'recovery', token_hash: link.tokenHash }).then(function (d) { return (session = d.access_token); });

    ready
      .then(function (token) { return call('PUT', 'user', { password: pw }, token); })
      .then(function () {
        // Kết thúc phiên của trình duyệt (chỉ phiên này, không đăng xuất iPhone).
        call('POST', 'logout?scope=local', {}, session).catch(function () {});
        forget();
        form.reset();
        show('done');
      })
      .catch(function (e) {
        if (!session && e && (e.code === 'otp_expired' || e.status === 403 || e.status === 401)) {
          forget();
          return show('expired');
        }
        fail(message(e));
      });
  });
})();
