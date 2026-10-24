// Lớp chuyển động của site.
//
// 1. Nền: chép AuthHeroBackdrop / AuthDust (AuthView.swift, Kiệt đã duyệt cho màn đăng nhập) —
//    hai dải sáng cam thở chậm (CSS đọc --breath, --drift) + bụi sáng ấm trôi lên, hai lớp.
// 2. Cảnh cuộn kiểu trang sản phẩm Apple: mỗi `[data-scene]` cao hơn màn hình, con `.sticky` ghim
//    lại; JS chỉ đặt --p (0 → 1 theo vị trí cuộn trong cảnh), CSS biến --p thành chuyển động.
//    Cảnh có bước (`[data-step]`): mỗi bước nhận --v (0 → 1, độ hiện) và --d (lệch so với tâm bước).
// 3. Hiện dần khi cuộn, viền thẻ sáng theo con trỏ, mục lục pháp lý theo đoạn đang đọc.
//
// Giảm chuyển động hoặc không JS: cảnh không ghim, mọi bước hiện hết (CSS lo phần này).
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;
  root.classList.add('js');
  if (reduce) root.classList.add('still');

  // ---- Nền: dải sáng thở + bụi ----
  var canvas = document.querySelector('canvas.dust');
  var ctx = canvas && canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;
  function size() {
    W = window.innerWidth; H = window.innerHeight;
    if (!canvas) return;
    canvas.width = W * dpr; canvas.height = H * dpr;
  }
  function rnd(seed, k) { var x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return Math.abs(x % 1); }
  function dust(t, layer) {
    var count = layer === 0 ? 18 : 6;
    for (var i = 0; i < count; i++) {
      var seed = i * 7919 + layer * 104729;
      var r = function (k) { return rnd(seed, k); };
      var speed = (layer === 0 ? 5 : 9) + r(1) * 7;
      var travel = H + 40;
      var y = H + 20 - ((r(2) * travel + t * speed) % travel);
      var x = r(3) * W + Math.sin(t * (0.2 + r(4) * 0.3) + r(5) * 6.28) * (8 + r(6) * 16);
      var rad = (layer === 0 ? 0.5 : 0.8) + r(7) * (layer === 0 ? 0.9 : 1.1);
      var twinkle = 0.5 + 0.5 * Math.sin(t * (0.7 + r(8) * 1.2) + r(9) * 6.28);
      var a = (layer === 0 ? 0.34 : 0.55) * twinkle * Math.max(0, Math.min(1, y / 120, (H - y) / 160));
      if (a <= 0) continue;
      var glow = ctx.createRadialGradient(x, y, 0, x, y, rad * 6);
      glow.addColorStop(0, 'rgba(255,115,25,' + a * 0.35 + ')');
      glow.addColorStop(1, 'rgba(255,115,25,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, rad * 6, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(255,' + Math.round(219 + r(10) * 25) + ',' + Math.round(173 + r(11) * 51) + ',' + a + ')';
      ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832); ctx.fill();
    }
  }
  function ambient(ms) {
    var t = reduce ? 0 : ms / 1000;
    root.style.setProperty('--breath', reduce ? 0.5 : (0.5 + 0.5 * Math.sin(t * 2 * Math.PI / 3.2)).toFixed(3));
    root.style.setProperty('--drift', reduce ? 0 : Math.sin(t * 2 * Math.PI / 14).toFixed(3));
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      dust(t, 0); dust(t, 1);
    }
    if (!reduce && !document.hidden) requestAnimationFrame(ambient);
  }

  // ---- Cảnh cuộn ----
  var scenes = Array.prototype.map.call(document.querySelectorAll('[data-scene]'), function (el) {
    return { el: el, steps: el.querySelectorAll('[data-step]'), n: Number(el.getAttribute('data-steps')) || 0 };
  });
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  function scenesUpdate() {
    scenes.forEach(function (s) {
      var b = s.el.getBoundingClientRect();
      var span = b.height - H;
      // Cảnh ghim: 0 khi đỉnh cảnh chạm đỉnh màn hình, 1 khi đáy cảnh chạm đáy màn hình.
      var p = span > 0 ? clamp(-b.top / span, 0, 1) : clamp((H - b.top) / (H + b.height), 0, 1);
      s.el.style.setProperty('--p', p.toFixed(4));
      if (!s.n) return;
      var x = p * s.n; // 0 → n; bước k ở giữa tại k + 0.5
      s.steps.forEach(function (st) {
        var k = Number(st.getAttribute('data-step'));
        var d = x - (k + 0.5);
        // Bước đầu đã hiện sẵn khi vào cảnh, bước cuối còn nguyên khi ra cảnh.
        if ((k === 0 && d < 0) || (k === s.n - 1 && d > 0)) d = 0;
        // Rõ hẳn trong ~60 % quãng cuộn của bước, chuyển cảnh gọn ở hai đầu.
        st.style.setProperty('--v', clamp(2 - Math.abs(d) * 3.2, 0, 1).toFixed(3));
        st.style.setProperty('--d', clamp(d, -1, 1).toFixed(3));
        st.style.setProperty('--local', clamp(x - k, 0, 1).toFixed(3));
        st.classList.toggle('is-current', Math.abs(d) < 0.5);
        // Koa lớn lên: sáu vóc dáng chia đều quãng cuộn của bước.
        var morph = st.querySelector('[data-morph]');
        if (morph) {
          var idx = Math.min(morph.children.length - 1, Math.floor(clamp(x - k, 0, 0.999) * morph.children.length));
          for (var c = 0; c < morph.children.length; c++) morph.children[c].classList.toggle('on', c === idx);
        }
      });
      var dots = s.el.querySelectorAll('[data-dot]');
      dots.forEach(function (dot, i) { dot.classList.toggle('is-current', Math.floor(clamp(x, 0, s.n - 0.001)) === i); });
    });
  }

  // ---- Pháp lý: thanh tiến độ + mục lục ----
  var bar = document.querySelector('.progress');
  var links = document.querySelectorAll('.toc-side a[href^="#"]');
  var targets = Array.prototype.map.call(links, function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
  function readingUpdate() {
    if (bar) {
      var max = document.documentElement.scrollHeight - H;
      bar.style.transform = 'scaleX(' + (max > 0 ? clamp(window.scrollY / max, 0, 1) : 0) + ')';
    }
    var current = -1;
    targets.forEach(function (el, i) { if (el && el.getBoundingClientRect().top < H * 0.3) current = i; });
    links.forEach(function (a, i) { a.classList.toggle('is-active', i === current); });
  }

  var queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; if (!reduce) scenesUpdate(); readingUpdate(); });
  }

  size();
  window.addEventListener('resize', function () { size(); onScroll(); if (reduce) ambient(0); });
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !reduce) requestAnimationFrame(ambient); });
  requestAnimationFrame(ambient);
  if (!reduce) scenesUpdate();
  readingUpdate();

  // ---- Hiện dần khi cuộn (ngoài cảnh) ----
  var items = document.querySelectorAll('.page-head, .card, .faq details, .legal .block, .main > section > h2, .eyebrow');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) {
      if (el.closest('[data-scene]')) return;
      el.classList.add('reveal');
      var sib = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      el.style.setProperty('--delay', Math.min(sib, 5) * 70 + 'ms');
      io.observe(el);
    });
  }

  // ---- Koa: mắt nhìn theo con trỏ (con ngươi dịch tối đa 4 × 3 đơn vị) ----
  var lookers = document.querySelectorAll('[data-look]');
  document.addEventListener('pointermove', function (e) {
    lookers.forEach(function (p) {
      var b = p.getBoundingClientRect();
      if (b.bottom < 0 || b.top > H) return;
      var dx = (e.clientX - (b.left + b.width / 2)) / b.width, dy = (e.clientY - (b.top + b.height * 0.35)) / b.height;
      var k = Math.min(1, Math.hypot(dx, dy) * 2), a = Math.atan2(dy, dx);
      p.style.setProperty('--lx', (Math.cos(a) * 4 * k).toFixed(2) + 'px');
      p.style.setProperty('--ly', (Math.sin(a) * 3 * k).toFixed(2) + 'px');
      // Đầu nghiêng nhẹ về phía con trỏ (tối đa 7°), cùng chiều với mắt.
      if (!reduce) p.style.setProperty('--hr', clamp(dx * 14, -7, 7).toFixed(2) + 'deg');
    });
  }, { passive: true });

  // ---- Koa: chạm / bấm thì nhảy lên, tai giật; mở trang thì Koa đầu tiên nhảy chào ----
  function hop(stage) {
    if (reduce || stage.classList.contains('hop')) return;
    stage.classList.add('hop');
    setTimeout(function () { stage.classList.remove('hop'); }, 950);
  }
  lookers.forEach(function (p) { p.addEventListener('click', function () { hop(p); }); });
  if (lookers[0]) setTimeout(function () { hop(lookers[0]); }, 1300);
  document.querySelectorAll('[data-morph]').forEach(function (m) { if (m.firstElementChild) m.firstElementChild.classList.add('on'); });

  // ---- Koa đọc ngày: chạm để đổi nét mặt; tự đổi khi đang thấy mà chưa chạm ----
  document.querySelectorAll('[data-mood]').forEach(function (box) {
    var picks = box.querySelectorAll('[data-mood-pick]'), faces = box.querySelectorAll('[data-mood-face]'), whys = box.querySelectorAll('[data-mood-why]');
    var cur = 0, touched = false, timer = null;
    function show(i) {
      cur = i;
      picks.forEach(function (b, j) { b.setAttribute('aria-pressed', String(j === i)); });
      faces.forEach(function (f, j) { f.classList.toggle('is-current', j === i); });
      whys.forEach(function (w, j) { w.hidden = j !== i; });
    }
    picks.forEach(function (b, j) { b.addEventListener('click', function () { touched = true; clearInterval(timer); show(j); }); });
    if (reduce || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        clearInterval(timer);
        if (e.isIntersecting && !touched) timer = setInterval(function () { show((cur + 1) % picks.length); }, 2600);
      });
    }, { threshold: 0.4 }).observe(box);
  });

  // ---- Viền thẻ sáng theo con trỏ ----
  document.addEventListener('pointermove', function (e) {
    var card = e.target.closest && e.target.closest('.card');
    if (!card) return;
    var b = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - b.left) + 'px');
    card.style.setProperty('--my', (e.clientY - b.top) + 'px');
  }, { passive: true });
})();
