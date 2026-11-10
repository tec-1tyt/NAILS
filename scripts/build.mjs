// Збирання сайту: src/ + content/ + static/ → dist/
// Запуск: npm run build   (SITE_URL з .env або content.site.url потрапляє в canonical, OG, sitemap)
//
// Мови: українська (/), англійська (/en/), чеська (/cs/).
//   Тексти шаблону позначені [[...]]; переклади — content/i18n/{en,cs}.json (ключ = український текст).
//   Якщо перекладу бракує, збірка зупиняється з помилкою, тож пропуски не потраплять на сайт.
//
// Змінні середовища / прапорці:
//   SITE_URL  / --site=   публічна адреса сайту
//   BASE_PATH / --base=   підпапка сайту (GitHub Pages: /назва-репозиторію/). За замовчуванням /
//   DEMO=1    / --demo    статична демо-версія без сервера (для показу клієнту)
//   OUT_DIR   / --out=    куди збирати (за замовчуванням dist)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const STATIC = path.join(ROOT, 'static');

// .env не перезаписує змінні, задані в командному рядку чи CI
if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : 'true'];
  }),
);
if (args.site) process.env.SITE_URL = args.site;

const DIST = path.resolve(ROOT, args.out || process.env.OUT_DIR || 'dist');
const DEMO = ['1', 'true', 'yes'].includes(String(args.demo || process.env.DEMO || '').toLowerCase());
const BASE = `/${String(args.base || process.env.BASE_PATH || '/').replace(/^\/+|\/+$/g, '')}/`.replace(/\/{2,}/g, '/');

const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));
const content = readJson('content', 'site.json');
const manifest = readJson('static', 'img', 'manifest.json');
const SITE_URL = (process.env.SITE_URL || content.site.url).replace(/\/$/, '');
const BS = String.fromCharCode(92);

// ---------- мови ----------
const LANGS = ['uk', 'en', 'cs'];
const I18N = {
  uk: { locale: 'uk-UA', ogLocale: 'uk_UA', label: 'UA', ui: null, js: null, content: null },
  en: readJson('content', 'i18n', 'en.json'),
  cs: readJson('content', 'i18n', 'cs.json'),
};
const langPath = (l) => (l === 'uk' ? '' : `${l}/`);
const CYRILLIC = /[Ѐ-ӿ]/;

/** content/site.json з перекладеними полями для мови */
function localize(lang) {
  if (lang === 'uk') return content;
  const o = I18N[lang].content;
  const c = structuredClone(content);
  Object.assign(c.site, o.site);
  Object.assign(c.master, o.master);
  c.services = c.services.map((s) => ({ ...s, duration: '', ...o.services[s.id] }));
  c.addons = c.addons.map((a, i) => ({ ...a, name: o.addons[i] }));
  c.counters = c.counters.map((x, i) => ({ ...x, ...o.counters[i] }));
  c.marquee = o.marquee;
  c.steps = o.steps;
  c.perks = o.perks;
  c.faq = o.faq;
  c.gallery = c.gallery.map((g) => ({ ...g, ...o.gallery[g.img] }));
  c.galleryFilters = c.galleryFilters.map((f) => ({ ...f, label: o.galleryFilters[f.id] }));
  return c;
}

// ---------- helpers ----------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Типографіка: число не відривається від попереднього слова, короткі слова (в, і, z, v, a, to…) — від наступного.
const typo = (s) =>
  esc(s)
    .replace(/ (\d)/g, '&nbsp;$1')
    .replace(/(^|\s)(\p{L}{1,2}) /gu, '$1$2&nbsp;');
const safeJson = (obj) => JSON.stringify(obj).replace(/</g, BS + 'u003c');
const pad = (n) => String(n).padStart(2, '0');

const svg = (inner, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
const icons = {
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  chevron: svg('<path d="M9 6l6 6-6 6"/>', 'icon icon--chevron'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  swap: svg('<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>'),
  chat: svg('<path d="M12 3.5c-4.97 0-9 3.47-9 7.75 0 2.2 1.07 4.18 2.78 5.59L5 20.5l4.17-1.9c.9.24 1.85.37 2.83.37 4.97 0 9-3.47 9-7.72S16.97 3.5 12 3.5z"/>'),
  instagram: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/>'),
  telegram: svg('<path d="M20.5 4.5L3.5 11l5.5 2 2 6 3-4 5 3.5 1.5-14zM9 13l8.5-6"/>'),
  phone: svg('<path d="M7 3.5h3l1.5 4.2-2.1 1.4a11.5 11.5 0 0 0 5.5 5.5l1.4-2.1 4.2 1.5v3a2.5 2.5 0 0 1-2.6 2.5A15 15 0 0 1 4.5 6.1 2.5 2.5 0 0 1 7 3.5z"/>'),
  mail: svg('<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M4.5 7l7.5 6 7.5-6"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
};

/** <picture> з AVIF/WebP/JPEG і правильними width/height (без стрибків верстки). */
function pic(name, { sizes, alt = '', cls = '', eager = false } = {}) {
  const m = manifest[name];
  if (!m) throw new Error(`Немає фото "${name}" у static/img/manifest.json`);
  const set = (ext) => m.widths.map((w) => `${BASE}img/${name}-${w}.${ext} ${w}w`).join(', ');
  const mid = m.widths[Math.min(1, m.widths.length - 1)];
  const h = Math.round((m.h * m.widths.at(-1)) / m.w);
  return (
    `<picture>` +
    `<source type="image/avif" srcset="${set('avif')}" sizes="${sizes}">` +
    `<source type="image/webp" srcset="${set('webp')}" sizes="${sizes}">` +
    `<img src="${BASE}img/${name}-${mid}.jpg" srcset="${set('jpg')}" sizes="${sizes}" width="${m.widths.at(-1)}" height="${h}"` +
    ` alt="${esc(alt)}"${cls ? ` class="${cls}"` : ''} decoding="async"` +
    (eager ? ' loading="eager" fetchpriority="high"' : ' loading="lazy"') +
    `></picture>`
  );
}

// ---------- токени сторінки для мови ----------
function makeTokens(lang) {
  const c = localize(lang);
  const T = (key) => {
    if (lang === 'uk') return key;
    const v = I18N[lang].ui[key];
    if (v === undefined) throw new Error(`[${lang}] немає перекладу для: «${key}» (content/i18n/${lang}.json → ui)`);
    return v;
  };
  const { services, addons, gallery, galleryFilters, faq, steps, perks, counters, marquee, contacts, address, master, site } = c;
  const groupOf = (g) => services.filter((s) => s.group === g);
  const pageUrl = (l) => `${SITE_URL}/${langPath(l)}`;

  const serviceCards = (group) =>
    groupOf(group)
      .map((s, i) => {
        const dur = s.duration ? `<span class="svc__dur">${esc(s.duration)}</span>` : '';
        return `<article class="svc" data-tilt data-reveal>
  <span class="svc__glare" aria-hidden="true"></span>
  <div class="svc__top"><span class="svc__num" aria-hidden="true">${pad(i + 1)}</span>${dur}</div>
  <h4 class="svc__name">${typo(s.name)}</h4>
  <p class="svc__desc">${typo(s.desc)}</p>
  <div class="svc__bottom">
    <p class="svc__price"><span class="svc__amount">${esc(s.price)}</span> <span class="svc__cur">${site.currency}</span></p>
    <button class="svc__btn" type="button" data-book="${s.id}" aria-label="${esc(T('Обрати: ') + s.name)}"><span>${T('Обрати')}</span>${icons.arrow}</button>
  </div>
</article>`;
      })
      .join('\n');

  const addonItems = addons
    .map(
      (a) =>
        `<li class="addon"><span class="addon__name">${esc(a.name)}</span><span class="addon__dots" aria-hidden="true"></span><span class="addon__price">${esc(a.price)} ${site.currency}</span></li>`,
    )
    .join('');

  const catLabel = Object.fromEntries(galleryFilters.map((f) => [f.id, f.label]));
  const galleryItems = gallery
    .map(
      (g, i) => `<li class="masonry__item" data-cat="${g.cat}">
  <button class="work" type="button" data-index="${i}" data-cursor="view" aria-label="${esc(T('Відкрити фото: ') + g.caption)}">
    <span class="work__pic">${pic(g.img, { sizes: '(max-width: 640px) 50vw, (max-width: 1100px) 50vw, 33vw', alt: g.alt })}</span>
    <span class="work__cap"><span class="work__cat">${esc(catLabel[g.cat])}</span><span class="work__title">${esc(g.caption)}</span></span>
    <span class="work__zoom" aria-hidden="true">${icons.arrow}</span>
  </button>
</li>`,
    )
    .join('\n');

  const filterButtons = galleryFilters
    .map((f) => {
      const n = f.id === 'all' ? gallery.length : gallery.filter((g) => g.cat === f.id).length;
      const on = f.id === 'all';
      return `<button class="filter${on ? ' is-active' : ''}" type="button" aria-pressed="${on}" data-filter="${f.id}">${esc(f.label)}<sup>${n}</sup></button>`;
    })
    .join('');

  const faqItems = faq
    .map(
      (f, i) => `<div class="faq__item">
  <h3 class="faq__h"><button class="faq__q" type="button" id="faq-q-${i}" aria-expanded="false" aria-controls="faq-a-${i}"><span>${typo(f.q)}</span><span class="faq__icon" aria-hidden="true"></span></button></h3>
  <div class="faq__a" id="faq-a-${i}" role="region" aria-labelledby="faq-q-${i}"><div class="faq__a-in"><p>${typo(f.a)}</p></div></div>
</div>`,
    )
    .join('\n');

  const portraitSizes = '(max-width: 1023px) 64vw, 30vw';
  const photoPanel = (name, alt) =>
    `<figure class="process__photo"><div class="process__photo-in" data-hparallax>${pic(name, { sizes: portraitSizes, alt })}</div></figure>`;
  const stepCard = (s, i) =>
    `<article class="step"><span class="step__num outline-text" aria-hidden="true">${pad(i + 1)}</span><h3 class="step__title"><span class="sr-only">${T('Крок ')}${i + 1}. </span>${typo(s.title)}</h3><p class="step__text">${typo(s.text)}</p></article>`;
  const stepsHtml = [
    stepCard(steps[0], 0),
    photoPanel('portrait-1', T('Настя, чорно-білий портрет у мереживній сукні')),
    stepCard(steps[1], 1),
    stepCard(steps[2], 2),
    photoPanel('portrait-4', T('Настя на повний зріст, чорно-білий портрет')),
    stepCard(steps[3], 3),
  ].join('\n');

  const perkItems = perks.map((p) => `<li><strong>${typo(p.title)}</strong><span>${typo(p.text)}</span></li>`).join('');

  const counterItems = counters
    .map(
      (x) =>
        `<li class="counter"><span class="counter__value"><span data-count="${x.value}">${x.value}</span>${x.suffix.trim() ? `<span class="counter__suf">${esc(x.suffix.trim())}</span>` : ''}</span><span class="counter__label">${typo(x.label)}</span></li>`,
    )
    .join('');

  const marqueeGroup = marquee.map((w) => `<span class="marquee__item">${esc(w)}</span><span class="marquee__star">✦</span>`).join('');
  const marqueeHtml = `<div class="marquee__group">${marqueeGroup}</div><div class="marquee__group">${marqueeGroup}</div>`;

  const groupNames = { mani: T('Манікюр'), pedi: T('Педикюр'), extra: T('Інше') };
  const serviceOptions = Object.entries(groupNames)
    .map(
      ([g, label]) =>
        `<optgroup label="${esc(label)}">${groupOf(g)
          .map((s) => `<option value="${s.id}" data-price="${esc(s.price)} ${site.currency}">${esc(s.name)} — ${esc(s.price)} ${site.currency}</option>`)
          .join('')}</optgroup>`,
    )
    .join('\n');

  // Контакти: показуємо лише ті, що заповнені в content/site.json
  const tel = contacts.phone ? contacts.phone.replace(/[^\d+]/g, '') : '';
  const tgUrl = contacts.telegram ? (contacts.telegram.startsWith('http') ? contacts.telegram : `https://t.me/${contacts.telegram.replace(/^@/, '')}`) : '';
  const channels = [
    { href: contacts.instagram, label: contacts.instagramHandle, name: 'Instagram', icon: icons.instagram, ext: true },
    tgUrl && { href: tgUrl, label: 'Telegram', name: 'Telegram', icon: icons.telegram, ext: true },
    tel && { href: `tel:${tel}`, label: contacts.phone, name: T('Подзвонити'), icon: icons.phone },
    contacts.email && { href: `mailto:${contacts.email}`, label: contacts.email, name: 'Email', icon: icons.mail },
  ].filter(Boolean);
  const extAttrs = (x) => (x.ext ? ' target="_blank" rel="noopener"' : '');
  const socials = channels.map((x) => `<a class="social" href="${esc(x.href)}"${extAttrs(x)}>${x.icon}<span>${esc(x.label)}</span></a>`).join('');
  const fabItems = [
    ...channels.map((x) => `<li><a class="fab__item" href="${esc(x.href)}"${extAttrs(x)}>${x.icon}<span>${esc(x.name)}</span></a></li>`),
    `<li><a class="fab__item fab__item--accent" href="#booking">${icons.calendar}<span>${T('Записатись онлайн')}</span></a></li>`,
  ].join('');

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'NailSalon',
    name: site.brand,
    description: site.description,
    url: pageUrl(lang),
    inLanguage: lang,
    image: `${SITE_URL}/img/og.jpg`,
    address: { '@type': 'PostalAddress', streetAddress: address.street, addressLocality: address.city, addressCountry: address.country },
    priceRange: '50–1100 Kč',
    currenciesAccepted: 'CZK',
    sameAs: [contacts.instagram],
    ...(tel ? { telephone: tel } : {}),
    employee: {
      '@type': 'Person',
      name: master.fullName,
      hasCredential: {
        '@type': 'EducationalOccupationalCredential',
        name: `${master.qualification} (${master.qualificationCode})`,
        credentialCategory: 'Profesní kvalifikace',
      },
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: T('Манікюр і педикюр'),
      itemListElement: services.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.name }, price: String(s.priceFrom), priceCurrency: 'CZK' })),
    },
  };

  const heroSizes = '(max-width: 900px) 100vw, 56vw';
  // Лише два критичні шрифти: більше preload конкурують із CSS і гальмують перший рендер.
  const preloads = [
    `<link rel="preload" href="${BASE}fonts/cormorant-garamond-cyrillic-wght-normal.woff2" as="font" type="font/woff2" crossorigin>`,
    `<link rel="preload" href="${BASE}fonts/manrope-cyrillic-wght-normal.woff2" as="font" type="font/woff2" crossorigin>`,
  ].join('\n  ');

  const hreflang = [
    ...LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${pageUrl(l)}">`),
    `<link rel="alternate" hreflang="x-default" href="${pageUrl('uk')}">`,
  ].join('\n  ');
  const langNav = LANGS.map(
    (l) =>
      `<a class="lang__link${l === lang ? ' is-active' : ''}" href="${BASE}${langPath(l)}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="page"' : ''}>${I18N[l].label}</a>`,
  ).join('');

  const siteData = {
    lang,
    locale: I18N[lang].locale,
    brand: site.brand,
    address: address.full,
    mapQuery: address.mapQuery,
    instagram: contacts.instagram,
    instagramHandle: contacts.instagramHandle,
    gallery: gallery.map((g) => ({ ...manifest[g.img], name: g.img, caption: g.caption, alt: g.alt, cat: catLabel[g.cat] })),
    ...(lang !== 'uk' ? { t: I18N[lang].js } : {}),
    // для демо-режиму: назви послуг, щоб імітувати відповідь сервера
    ...(DEMO ? { services: services.map((s) => ({ id: s.id, name: s.name })) } : {}),
  };

  return {
    T,
    tokens: {
      lang,
      ogLocale: I18N[lang].ogLocale,
      pageUrl: pageUrl(lang),
      hreflang,
      langNav,
      base: BASE,
      robotsMeta: DEMO ? '<meta name="robots" content="noindex, nofollow">' : '',
      demoNote: DEMO ? `<p class="form__legal form__demo">${T('Демо-версія сайту: заявка нікуди не надсилається, вільні години умовні.')}</p>` : '',
      title: esc(site.title),
      description: esc(site.description),
      url: SITE_URL,
      brand: esc(site.brand),
      year: String(new Date().getFullYear()),
      preloads,
      jsonld: safeJson(jsonld),
      siteData: safeJson(siteData),
      instagram: esc(contacts.instagram),
      instagramHandle: esc(contacts.instagramHandle),
      address: esc(address.full),
      mapQueryUrl: encodeURIComponent(address.mapQuery),
      masterName: esc(master.name),
      masterFullName: esc(master.fullName),
      qualification: esc(master.qualification),
      pic_hero: pic('hero', { sizes: heroSizes, alt: T('Майстриня манікюру Настя, чорно-білий портрет'), cls: 'hero__img', eager: true }),
      pic_about: pic('about', { sizes: '(max-width: 900px) 86vw, 36vw', alt: T('Настя усміхається, сидячи на підлозі студії') }),
      pic_studio: pic('studio', { sizes: '(max-width: 600px) 36vw, 220px', alt: T('Настя в салоні з сертифікатом про кваліфікацію') }),
      pic_before: pic('before-shimmer', { sizes: '(max-width: 900px) 90vw, 440px', alt: T('Нігті до манікюру') }),
      pic_after: pic('work-shimmer', { sizes: '(max-width: 900px) 90vw, 440px', alt: T('Ті самі нігті після манікюру з шимером') }),
      pic_404: manifest['portrait-3'] ? pic('portrait-3', { sizes: '(max-width: 900px) 70vw, 34vw', alt: 'Настя замислено дивиться вбік', eager: true }) : '',
      services_mani: serviceCards('mani'),
      services_pedi: serviceCards('pedi'),
      maniCount: pad(groupOf('mani').length),
      pediCount: pad(groupOf('pedi').length),
      addons: addonItems,
      gallery: galleryItems,
      filters: filterButtons,
      faq: faqItems,
      steps: stepsHtml,
      perks: perkItems,
      counters: counterItems,
      marquee: marqueeHtml,
      serviceOptions,
      socials,
      fabItems,
      ...Object.fromEntries(Object.entries(icons).map(([k, v]) => [`icon_${k}`, v])),
    },
  };
}

// ---------- build ----------
// Захист: чистимо лише теку всередині проєкту
if (!DIST.startsWith(ROOT + path.sep)) throw new Error(`OUT_DIR має бути всередині проєкту: ${DIST}`);
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });

const result = await esbuild.build({
  entryPoints: {
    main: path.join(SRC, 'js', 'main.js'),
    admin: path.join(SRC, 'js', 'admin.js'),
    style: path.join(SRC, 'css', 'main.css'),
    'admin-style': path.join(SRC, 'css', 'admin.css'),
  },
  outdir: path.join(DIST, 'assets'),
  entryNames: '[name]-[hash]',
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2022', 'chrome100', 'safari15.4', 'firefox100'],
  external: ['/fonts/*', '/img/*'],
  metafile: true,
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'warning',
  // константи для JS: шлях сайту і демо-режим (у звичайній збірці демо-код вирізається)
  define: { __BASE__: JSON.stringify(BASE), __DEMO__: JSON.stringify(DEMO) },
});
const assets = {};
for (const [out, meta] of Object.entries(result.metafile.outputs)) {
  if (!meta.entryPoint) continue;
  const rel = path.relative(DIST, path.resolve(ROOT, out)).split(path.sep).join('/');
  assets[path.basename(meta.entryPoint)] = BASE + rel;
  // шрифти в CSS підключені як /fonts/… — під підпапку (GitHub Pages) переписуємо шлях
  if (out.endsWith('.css') && BASE !== '/') {
    const file = path.resolve(ROOT, out);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('url(/fonts/', `url(${BASE}fonts/`));
  }
}

function render(file, lang, extra, outFile = file) {
  const { T, tokens } = makeTokens(lang);
  const all = { ...tokens, ...extra };
  const html = fs
    .readFileSync(path.join(SRC, file), 'utf8')
    .replace(/[ \t]*<!--[\s\S]*?-->\r?\n?/g, '')
    .replace(/\[\[([\s\S]*?)\]\]/g, (_, key) => T(key))
    .replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k) => {
      if (!(k in all)) throw new Error(`${file}: невідомий токен {{${k}}}`);
      return all[k];
    });
  if (lang !== 'uk') {
    // запобіжник: у перекладеній сторінці не має лишитися кирилиці
    const m = html.match(new RegExp(`.{0,40}${CYRILLIC.source}.{0,40}`));
    if (m) throw new Error(`[${lang}] неперекладений текст: «${m[0]}»`);
  }
  fs.mkdirSync(path.dirname(path.join(DIST, outFile)), { recursive: true });
  fs.writeFileSync(path.join(DIST, outFile), html);
}

const page = { css: assets['main.css'], js: assets['main.js'] };
for (const lang of LANGS) render('index.html', lang, page, `${langPath(lang)}index.html`);
render('404.html', 'uk', page);
render('admin.html', 'uk', { css: assets['admin.css'], js: assets['admin.js'] });

// static → dist (manifest.json лише для збирання)
fs.cpSync(STATIC, DIST, { recursive: true, filter: (src) => !src.endsWith('manifest.json') });

if (DEMO) {
  // демо не індексуємо: це превʼю для клієнта, а не робочий сайт
  fs.writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
} else {
  fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  const day = new Date().toISOString().slice(0, 10);
  const alt = LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE_URL}/${langPath(l)}"/>`).join('\n');
  const urls = LANGS.map(
    (l) => `  <url>\n    <loc>${SITE_URL}/${langPath(l)}</loc>\n    <lastmod>${day}</lastmod>\n${alt}\n  </url>`,
  ).join('\n');
  fs.writeFileSync(
    path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`,
  );
}

const kb = (f) => (fs.statSync(path.join(DIST, f)).size / 1024).toFixed(1) + ' KB';
console.log(`✓ ${path.relative(ROOT, DIST)}/ готово${DEMO ? ' (ДЕМО)' : ''}, base ${BASE}, мови: ${LANGS.join(', ')}`);
for (const [k, v] of Object.entries(assets)) console.log(`  ${k.padEnd(16)} ${v}  ${kb(v.slice(BASE.length))}`);
if (SITE_URL.includes('example')) console.warn('! SITE_URL — заглушка. Задайте SITE_URL у .env (для canonical, OG, sitemap).');
