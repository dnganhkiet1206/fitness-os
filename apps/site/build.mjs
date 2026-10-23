#!/usr/bin/env node
// Trang hỗ trợ tĩnh của ASCND (#527, 23/10) — không phụ thuộc gói nào: `node apps/site/build.mjs`.
//
// Nguồn:
// - văn bản pháp lý: apps/ios/ASCND/Resources/legal-content.json (cùng bản app hiện trong
//   Cài đặt → Chính sách & Pháp lý), để web và app không bao giờ lệch nhau;
// - Supabase (host + key publishable): apps/ios/Config/Backend.xcconfig;
// - chữ riêng của site: content/{en,vi,es}.json; tên miền, email: site.config.json.
//
// Ra: dist/ — tiếng Anh ở gốc, tiếng Việt ở /vi/, tiếng Tây Ban Nha ở /es/.
// SITE_URL=… đè siteUrl (vd. bản xem thử trên máy: SITE_URL=http://localhost:4321).
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const out = join(here, 'dist');

const config = JSON.parse(readFileSync(join(here, 'site.config.json'), 'utf8'));
const siteUrl = (process.env.SITE_URL || config.siteUrl).replace(/\/+$/, '');
const base = new URL(siteUrl).pathname.replace(/\/+$/, ''); // '' hoặc '/fitness-os' (GitHub Pages)
const legal = JSON.parse(readFileSync(join(repo, 'apps/ios/ASCND/Resources/legal-content.json'), 'utf8'));
const xcconfig = readFileSync(join(repo, 'apps/ios/Config/Backend.xcconfig'), 'utf8');
const xc = (key) => xcconfig.match(new RegExp(`^${key}\\s*=\\s*(\\S+)`, 'm'))?.[1] ?? '';
const supabase = { url: `https://${xc('ASCND_SUPABASE_HOST')}`, key: xc('ASCND_SUPABASE_KEY') };

const langs = ['en', 'vi', 'es'];
const content = Object.fromEntries(langs.map((l) => [l, JSON.parse(readFileSync(join(here, 'content', `${l}.json`), 'utf8'))]));
const prefix = (l) => (l === 'en' ? '' : `/${l}`);

// Trang chủ là landing (Kiệt yêu cầu 23/10); các trang còn lại như mock bản 1.
const pages = [
  { id: 'home', path: '/', nav: false },
  { id: 'help', path: '/help/', nav: true },
  { id: 'privacy', path: '/privacy/', nav: true },
  { id: 'terms', path: '/terms/', nav: true },
  { id: 'account', path: '/delete-account/', nav: true },
  { id: 'about', path: '/about/', nav: true },
  { id: 'reset', path: '/reset-password/', nav: false },
];
const href = (l, id) => `${base}${prefix(l)}${pages.find((p) => p.id === id).path}`;
const asset = (p) => `${base}/assets/${p}`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function emailHTML(t, subject) {
  if (!config.supportEmail) return `<span class="todo">${esc(t.common.emailMissing)}</span>`;
  const q = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return `<a href="mailto:${esc(config.supportEmail)}${q}">${esc(config.supportEmail)}</a>`;
}
const operatorHTML = (t) => (config.operatorName ? esc(config.operatorName) : `<span class="todo">${esc(t.common.operatorMissing)}</span>`);

// legal-content.json để chỗ trống "[email hỗ trợ]" (giống app) — web thay bằng email thật.
const fillLegal = (s, t) => esc(s).replace(/\[email hỗ trợ\]/g, emailHTML(t));

function legalBlocks(blocks, t, idPrefix) {
  return blocks
    .map((b) => {
      const id = `${idPrefix}-${slug(b.title)}`;
      const body = b.body ? `<p>${fillLegal(b.body, t)}</p>` : '';
      const list = b.bullets ? `<ul>${b.bullets.map((x) => `<li>${fillLegal(x, t)}</li>`).join('')}</ul>` : '';
      return `<section class="block" id="${id}"><h3>${esc(b.title)}</h3>${body}${list}</section>`;
    })
    .join('');
}

function toc(parts, t) {
  const items = parts
    .map((p) => `<li><a href="#${p.id}">${esc(p.title)}</a><ol>${p.blocks.map((b) => `<li><a href="#${p.idPrefix}-${slug(b.title)}">${esc(b.title)}</a></li>`).join('')}</ol></li>`)
    .join('');
  return `<details class="toc"><summary>${esc(t.common.contents)}</summary><ol>${items}</ol></details>`;
}

// Mục lục cạnh bên (máy tính): ghim khi cuộn, sáng mục đang đọc.
function tocSide(parts, t) {
  return `<aside class="toc-side" aria-label="${esc(t.common.contents)}"><p>${esc(t.common.contents)}</p><ol>${parts
    .map((p) => `<li><a href="#${p.id}">${esc(p.title)}</a><ol>${p.blocks.map((b) => `<li><a href="#${p.idPrefix}-${slug(b.title)}">${esc(b.title)}</a></li>`).join('')}</ol></li>`)
    .join('')}</ol></aside>`;
}
const legalBody = (parts, t) =>
  `<div class="legal-layout">${tocSide(parts, t)}<div class="legal-flow">${toc(parts, t)}${parts
    .map((x) => `<section class="legal" id="${x.id}"><h2>${esc(x.title)}</h2>${legalBlocks(x.blocks, t, x.idPrefix)}</section>`)
    .join('')}</div></div>`;

const icons = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 12 5l7 14M8.5 12h7" /></svg>',
  koa: () => `<img src="${asset('img/koa.png')}" alt="" width="28" height="35">`,
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="3" /><path d="m4.5 7 7.5 6 7.5-6" /></svg>',
};
const icon = (k) => (typeof icons[k] === 'function' ? icons[k]() : icons[k]);

function mailButton(t, subject, label) {
  if (!config.supportEmail) return `<span class="button button--ghost is-disabled">${icon('mail')}${esc(label)} <span class="todo">${esc(t.common.emailMissing)}</span></span>`;
  return `<a class="button" href="mailto:${esc(config.supportEmail)}?subject=${encodeURIComponent(subject)}">${icon('mail')}${esc(label)}</a>`;
}

// ---- Cảnh cuộn dùng chung (fancy.js đặt --p, style.css biến thành chuyển động) ----

// Mở đầu: Koa + tiêu đề lớn; cuộn thì thu nhỏ, mờ và nhoè dần như trang sản phẩm Apple.
function intro(title, lead, hint, extra = '') {
  return `
      <section class="intro" data-scene>
        <div class="sticky intro__stage">
          <img class="intro__koa" src="${asset('img/koa.png')}" alt="" width="347" height="434">
          <h1 class="intro__title shine">${esc(title)}</h1>
          <p class="intro__lead">${esc(lead)}</p>${extra}
          <p class="intro__hint" aria-hidden="true"><span></span>${esc(hint)}</p>
        </div>
      </section>`;
}

// Câu tuyên ngôn sáng dần từng chữ theo cuộn.
function statement(text) {
  const words = text.split(/\s+/);
  return `
      <section class="statement" data-scene style="--n:${words.length}">
        <div class="sticky statement__stage"><p class="statement__text">${words
          .map((w, i) => `<span style="--i:${i}">${esc(w)}</span>`)
          .join(' ')}</p></div>
      </section>`;
}

// Sáu hạng của Koa (MascotRules.ranks + KoaGains.thresholds): cột mọc dần theo cuộn.
const ranks = [
  ['Newbie', 0, '#8b93a4'], ['Gym Rat', 40, '#2bf5a8'], ['Lifter', 120, '#3ba6ff'],
  ['Swole', 260, '#b07de0'], ['Beast', 450, '#e08a3a'], ['Mass Monster', 700, '#ffd93d'],
];
function rankLadder(gains) {
  return `<div class="ladder"><img class="ladder__koa" src="${asset('img/koa.png')}" alt="" width="347" height="434"><ol>${ranks
    .map(([name, min, color], j) => `<li style="--j:${j};--c:${color};--h:${18 + j * 16}%"><span class="ladder__bar"></span><b>${esc(name)}</b><small>${min} ${esc(gains)}</small></li>`)
    .join('')}</ol></div>`;
}

// Màn hình thật của app (chụp trên simulator, tài khoản test, đúng ngôn ngữ của trang) trong khung
// iPhone. Chụp lại: xem apps/site/README.md, mục "Ảnh màn hình app".
const phone = (l, screen) =>
  `<div class="phone"><img src="${asset(`img/app/${l}-${screen}.jpg`)}" alt="" width="590" height="1281" loading="lazy"></div>`;

// Văn bản pháp lý trên web là đúng bản trong app (legal-content.json) — nói rõ cho người đọc.
const sameAsApp = (t) =>
  `<p class="source"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>${esc(t.common.sameAsApp)}</p>`;

// ---- Nội dung từng trang ----

const render = {
  // Landing (trang chủ): mở đầu có Koa + "Sắp có trên App Store" → câu tuyên ngôn → bốn bước ghim
  // (kế hoạch, ghi, Koa lớn lên, chữ A) → tranh Hỏi Koa phóng to → điều chúng tôi giữ → sắp ra mắt.
  // App chưa phát hành: không có nút tải, không thu email, không đo lường.
  home(t, l) {
    const h = t.home;
    const soon = `<span class="soon">${icon('phone')}${esc(h.soon)}</span>`;
    const visuals = [
      phone(l, 'today'),
      phone(l, 'nutrition'),
      rankLadder(h.gains),
      phone(l, 'progress'),
    ];
    return `
      ${intro(h.title, h.lead, t.help.scrollHint, `<div class="intro__actions">${soon}<a class="button button--ghost" href="#how">${esc(h.how)}</a></div>`)}
      ${statement(h.statement)}
      <section class="story" id="how" data-scene data-steps="${h.steps.length}" style="--n:${h.steps.length}" aria-labelledby="how-title">
        <div class="sticky story__stage">
          <div class="story__text">
            <p class="eyebrow" id="how-title">${esc(h.storyTitle)}</p>
            <div class="story__steps">${h.steps
              .map(([title, body], k) => `<article class="story__step" data-step="${k}"><p class="story__num">0${k + 1}</p><h2>${esc(title)}</h2><p class="story__body">${esc(body)}</p></article>`)
              .join('')}</div>
            <div class="story__dots" aria-hidden="true">${h.steps.map((_, k) => `<span data-dot="${k}"></span>`).join('')}</div>
          </div>
          <div class="story__visual" aria-hidden="true">
            <div class="story__frame">${visuals.map((v, k) => `<div class="story__layer${v.startsWith('<div class="phone"') ? ' story__layer--phone' : ''}" data-step="${k}">${v}</div>`).join('')}</div>
          </div>
        </div>
      </section>
      <section class="zoom" data-scene>
        <div class="sticky zoom__stage">
          <figure class="zoom__frame"><img src="${asset('img/scene-askkoa.jpg')}" alt="Koa" width="902" height="568"></figure>
          <p class="zoom__caption">${esc(h.zoom)}<small>${esc(h.zoomNote)}</small></p>
        </div>
      </section>
      <section class="after" aria-labelledby="principles"><h2 id="principles">${esc(t.about.principlesTitle)}</h2>
        <div class="cards cards--three">${t.about.principles.map(([a, b], i) => `<article class="card"><p class="story__num">0${i + 1}</p><h3>${esc(a)}</h3><p>${esc(b)}</p></article>`).join('')}</div>
      </section>
      <section class="finale" aria-labelledby="finale">
        <h2 id="finale" class="finale__title">${esc(h.finalTitle)}</h2>
        <p class="lead">${esc(h.finalBody)}</p>
        <div class="intro__actions">${soon}<a class="button button--ghost" href="${href(l, 'help')}">${esc(t.nav.help)}</a></div>
      </section>`;
  },

  // Trợ giúp: trang cuộn kiểu trang sản phẩm Apple — mở đầu thu nhỏ dần, cảnh ghim ba bước
  // (chữ + tranh Koa đổi theo cuộn), câu tuyên ngôn sáng dần từng chữ, rồi câu hỏi và liên hệ.
  help(t, l) {
    const h = t.help;
    const visuals = [
      phone(l, 'nutrition'),
      `<img class="story__img" src="${asset('img/scene-workout.jpg')}" alt="" width="638" height="384">`,
      phone(l, 'progress'),
    ];
    return `
      ${intro(h.title, h.lead, h.scrollHint)}
      <section class="story" data-scene data-steps="${h.guides.length}" aria-labelledby="guides">
        <div class="sticky story__stage">
          <div class="story__text">
            <p class="eyebrow" id="guides">${esc(h.guidesTitle)}</p>
            <div class="story__steps">${h.guides
              .map((g, k) => `<article class="story__step" data-step="${k}"><p class="story__num">${esc(h.stepLabel)} 0${k + 1}</p><h2>${esc(g.title)}</h2><ul>${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></article>`)
              .join('')}</div>
            <div class="story__dots" aria-hidden="true">${h.guides.map((_, k) => `<span data-dot="${k}"></span>`).join('')}</div>
          </div>
          <div class="story__visual" aria-hidden="true">
            <div class="story__frame">${visuals.map((v, k) => `<div class="story__layer${v.startsWith('<div class="phone"') ? ' story__layer--phone' : ''}" data-step="${k}">${v}</div>`).join('')}</div>
          </div>
        </div>
      </section>
      ${statement(h.statement)}
      <section class="after" aria-labelledby="faq"><h2 id="faq">${esc(h.faqTitle)}</h2>
        <div class="faq">${h.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>
      </section>
      <section class="card card--contact card--scene" aria-labelledby="contact">
        <img class="card__scene" src="${asset('img/scene-askkoa.jpg')}" alt="" width="902" height="568" loading="lazy">
        <div class="card__body"><h2 id="contact">${esc(h.contactTitle)}</h2><p>${esc(h.contactBody)}</p>
        ${mailButton(t, 'ASCND', h.contactButton)}</div>
      </section>`;
  },

  privacy(t, l) {
    const p = t.privacy;
    const L = legal[l];
    const parts = [
      { id: 'policy', idPrefix: 'p', title: L.privacy.title, blocks: L.privacy.blocks },
      { id: 'data-ai', idPrefix: 'ai', title: p.dataPart, blocks: L.data.blocks },
    ];
    const operator = esc(p.operator).replace('{operator}', operatorHTML(t)).replace('{email}', emailHTML(t));
    return `
      <header class="page-head"><h1>${esc(p.title)}</h1><p class="lead">${esc(p.lead)}</p><p class="meta">${operator}</p>${sameAsApp(t)}</header>
      <section class="card glance" aria-labelledby="glance"><h2 id="glance">${esc(p.glanceTitle)}</h2>
        <div class="table-wrap"><table><thead><tr>${p.glanceHead.map((x) => `<th scope="col">${esc(x)}</th>`).join('')}</tr></thead>
        <tbody>${p.glance.map((r) => `<tr><th scope="row">${esc(r[0])}</th><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table></div>
        <p class="note">${esc(p.glanceNote)}</p>
      </section>
      ${legalBody(parts, t)}
      <p class="note"><a href="${href(l, 'terms')}#health">${esc(p.healthLink)}</a></p>`;
  },

  terms(t, l) {
    const p = t.terms;
    const L = legal[l];
    const parts = [
      { id: 'terms', idPrefix: 't', title: L.terms.title, blocks: L.terms.blocks },
      { id: 'health', idPrefix: 'h', title: p.healthPart, blocks: L.health.blocks },
    ];
    return `
      <header class="page-head"><h1>${esc(p.title)}</h1><p class="lead">${esc(p.lead)}</p>${sameAsApp(t)}</header>
      ${legalBody(parts, t)}`;
  },

  account(t) {
    const a = t.account;
    return `
      <header class="page-head"><h1>${esc(a.title)}</h1><p class="lead">${esc(a.lead)}</p></header>
      <section class="card card--accent" aria-labelledby="in-app"><h2 id="in-app">${esc(a.inAppTitle)}</h2>
        <ol class="steps">${a.inAppSteps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        <p class="note">${esc(a.inAppNote)}</p>
      </section>
      <div class="split">
        <section class="card" aria-labelledby="removed"><h2 id="removed">${esc(a.removedTitle)}</h2>
          <ul class="ticks">${a.removed.map((s) => `<li>${icon('check')}<span>${esc(s)}</span></li>`).join('')}</ul></section>
        <section class="card" aria-labelledby="kept"><h2 id="kept">${esc(a.keptTitle)}</h2>
          <ul class="ticks ticks--muted">${a.kept.map((s) => `<li>${icon('minus')}<span>${esc(s)}</span></li>`).join('')}</ul></section>
      </div>
      <section class="card card--contact" aria-labelledby="by-email">
        <div><h2 id="by-email">${esc(a.emailTitle)}</h2><p>${esc(a.emailBody)}</p></div>
        ${mailButton(t, a.emailSubject, a.emailButton)}
      </section>`;
  },

  about(t) {
    const a = t.about;
    // Giới thiệu: mở đầu → câu tuyên ngôn → tranh Koa tập phóng to dần ra tràn màn hình, chữ
    // hiện lên trên tranh → ba điều chúng tôi giữ → tình trạng.
    return `
      ${intro(a.title, a.lead, t.help.scrollHint)}
      ${statement(a.body[0])}
      <section class="zoom" data-scene>
        <div class="sticky zoom__stage">
          <figure class="zoom__frame"><img src="${asset('img/scene-workout.jpg')}" alt="Koa" width="638" height="384"></figure>
          <p class="zoom__caption">${esc(a.body[1])}</p>
        </div>
      </section>
      <section class="after" aria-labelledby="principles"><h2 id="principles">${esc(a.principlesTitle)}</h2>
        <div class="cards cards--three">${a.principles.map(([h, b], i) => `<article class="card"><p class="story__num">0${i + 1}</p><h3>${esc(h)}</h3><p>${esc(b)}</p></article>`).join('')}</div>
      </section>
      <section class="card card--accent" aria-labelledby="status"><h2 id="status">${esc(a.statusTitle)}</h2><p>${esc(a.status)}</p></section>`;
  },

  // Đặt lại mật khẩu: HTML có đủ mọi trạng thái, `reset.js` chỉ bật một. Không JS thì hiện
  // lời hướng dẫn "Quên mật khẩu?" (trạng thái nolink) — không bao giờ là trang trống.
  reset(t) {
    const r = t.reset;
    const openApp = (state) => `<a class="button" data-open-app="${state}" href="${config.appScheme}:///">${esc(t.common.openApp)}</a>`;
    return `
      <div class="reset card card--glass" data-reset data-supabase-url="${esc(supabase.url)}" data-supabase-key="${esc(supabase.key)}" data-scheme="${esc(config.appScheme)}">
        <section data-state="checking" hidden><h1>${esc(r.title)}</h1><p class="lead" role="status">${esc(r.checking)}</p></section>
        <section data-state="form" hidden>
          <h1>${esc(r.title)}</h1><p class="lead">${esc(r.lead)}</p>
          <form class="form" novalidate>
            <label class="field"><span>${esc(r.newLabel)}</span>
              <span class="field__row"><input name="password" type="password" autocomplete="new-password" minlength="6" required aria-describedby="rule">
              <button type="button" class="field__toggle" data-toggle data-show="${esc(r.show)}" data-hide="${esc(r.hide)}">${esc(r.show)}</button></span></label>
            <label class="field"><span>${esc(r.confirmLabel)}</span>
              <span class="field__row"><input name="confirm" type="password" autocomplete="new-password" minlength="6" required></span></label>
            <p class="hint" id="rule">${esc(r.rule)}</p>
            <p class="error" data-error role="alert" hidden></p>
            <button class="button button--block" type="submit" data-submit data-saving="${esc(r.saving)}">${esc(r.submit)}</button>
          </form>
          <a class="button button--ghost button--block" data-open-app="form" href="${config.appScheme}:///">${esc(t.common.openApp)}</a>
          <p class="note">${esc(r.signedInNote)}</p>
        </section>
        <section data-state="done" hidden><div class="badge badge--ok">${icon('check')}</div><h1>${esc(r.doneTitle)}</h1><p class="lead">${esc(r.doneBody)}</p>${openApp('done')}</section>
        <section data-state="expired" hidden><h1>${esc(r.expiredTitle)}</h1><p class="lead">${esc(r.expiredBody)}</p>${openApp('expired')}</section>
        <section data-state="device" hidden><h1>${esc(r.deviceTitle)}</h1><p class="lead">${esc(r.deviceBody)}</p>${openApp('device')}</section>
        <section data-state="nolink"><h1>${esc(r.noLinkTitle)}</h1><p class="lead">${esc(r.noLinkBody)}</p>${openApp('nolink')}</section>
        <script type="application/json" data-strings>${JSON.stringify({
          tooShort: r.tooShort, mismatch: r.mismatch, weak: r.errWeak, same: r.errSame, rate: r.errRate, offline: r.errOffline, generic: r.errGeneric,
        }).replace(/</g, '\\u003c')}</script>
      </div>`;
  },
};

// ---- Khung trang ----

function layout(l, page, body) {
  const t = content[l];
  const title = page.id === 'home' ? `ASCND · ${t.home.title}` : page.id === 'help' ? t.common.home : `${page.id === 'reset' ? t.reset.title : t[page.id].title} · ASCND`;
  const isReset = page.id === 'reset';
  const navLinks = pages
    .filter((p) => p.nav)
    .map((p) => `<a href="${href(l, p.id)}"${p.id === page.id ? ' aria-current="page"' : ''}>${esc(t.nav[p.id])}</a>`)
    .join('');
  const langLinks = langs
    .map((x) => `<a href="${href(x, page.id)}" hreflang="${x}" lang="${x}" data-lang="${x}"${x === l ? ' aria-current="true"' : ''}>${x.toUpperCase()}</a>`)
    .join('');
  const alternates = langs.map((x) => `<link rel="alternate" hreflang="${x}" href="${siteUrl}${prefix(x)}${page.path}">`).join('');
  // Trang đặt lại mật khẩu mang token trong URL: không gửi Referer, không lập chỉ mục,
  // chỉ nói chuyện với Supabase.
  const csp = isReset
    ? `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src ${supabase.url}; img-src 'self'; style-src 'self'; script-src 'self'; form-action 'none'; base-uri 'none'">`
    : '';
  return `<!doctype html>
<html lang="${l}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(isReset ? t.reset.lead : t[page.id].lead)}">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0d0c0b">
<meta name="referrer" content="${isReset ? 'no-referrer' : 'strict-origin-when-cross-origin'}">
${isReset ? '<meta name="robots" content="noindex">' : ''}${csp}
${alternates}
<link rel="icon" href="${asset('img/favicon.png')}">
<link rel="apple-touch-icon" href="${asset('img/icon.png')}">
<link rel="stylesheet" href="${asset('style.css')}">
<script src="${asset('lang.js')}" data-base="${base}" data-lang="${l}"></script>
<script src="${asset('fancy.js')}" defer></script>
${isReset ? `<script src="${asset('reset.js')}" defer></script>` : ''}
</head>
<body class="page-${page.id}">
<div class="aura" aria-hidden="true"><span></span><span></span></div>
<canvas class="dust" aria-hidden="true"></canvas>
${page.id === 'privacy' || page.id === 'terms' ? '<div class="progress" aria-hidden="true"></div>' : ''}
<a class="skip" href="#main">${esc(t.common.skip)}</a>
${config.draft ? `<div class="draft" role="note">${esc(t.common.draft)}</div>` : ''}
<header class="top">
  <a class="brand" href="${href(l, 'home')}">ASCND</a>
  <nav class="langs" aria-label="${esc(t.common.language)}">${langLinks}</nav>
</header>
<main id="main" class="main main--${page.id}">
${body}
</main>
<footer class="foot">
  <nav aria-label="ASCND">${navLinks}</nav>
  <p>${esc(t.common.status)} ${esc(t.common.updated)}: ${esc(config.updated)}.</p>
</footer>
</body>
</html>
`;
}

// ---- Ghi ra dist ----

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(here, 'src'), join(out, 'assets'), { recursive: true });

for (const l of langs) {
  for (const page of pages) {
    const dir = join(out, prefix(l).slice(1), page.path.slice(1));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), layout(l, page, render[page.id](content[l], l)));
  }
}
// 404: về trang trợ giúp (GitHub Pages / Cloudflare Pages đều đọc 404.html).
writeFileSync(join(out, '404.html'), layout('en', pages[0], render.home(content.en, 'en')));
// GitHub Pages: tắt Jekyll để thư mục assets/ được phục vụ nguyên.
writeFileSync(join(out, '.nojekyll'), '');
console.log(`ASCND site → ${out} (${langs.length * pages.length} trang, base "${base || '/'}")`);
