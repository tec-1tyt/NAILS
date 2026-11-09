# nailsby.nstjky — сайт майстрині манікюру

Односторінковий сайт з онлайн-записом і адмін-панеллю для майстрині манікюру й педикюру в Празі (Řehořova 25, Praha 3).

- **Фронтенд:** статичний HTML + CSS + JS (GSAP, ScrollTrigger, Lenis), збирається через esbuild. Без фреймворків.
- **Бекенд:** Node.js + Express 5 + SQLite (better-sqlite3), валідація zod, helmet, rate limit, сповіщення в Telegram і на email.
- **Адмінка:** `/admin` — записи, підтвердження/скасування, робочий графік, вихідні.

## Швидкий старт (локально)

Потрібен Node.js 20.12+ (рекомендовано 22 LTS).

```bash
npm install
cp .env.example .env      # відкрийте .env і задайте щонайменше ADMIN_PASSWORD
npm run build             # збирає dist/
npm start                 # http://localhost:3000, адмінка: http://localhost:3000/admin
```

Для локальної розробки в `.env` поставте `NODE_ENV=development` (інакше cookie адмінки будуть лише для HTTPS).

`npm run dev` збирає сайт і запускає сервер з автоперезапуском при зміні серверного коду (після змін у `src/` чи `content/` повторіть `npm run build`).

## Показати клієнту: демо на GitHub Pages

GitHub Pages віддає лише статичні файли, без Node-сервера. Тому туди публікується **демо-версія**: увесь дизайн, анімації, галерея й форма запису працюють, але вільні години генеруються в браузері, а заявка нікуди не надсилається (на формі й у вікні успіху є про це примітка). Демо закрите від індексації пошуковиками.

1. Створіть на GitHub новий **публічний** репозиторій (наприклад `nails-site`) без README.
2. У папці `site/` виконайте:
   ```bash
   git remote add origin https://github.com/ВАШ-ЛОГІН/nails-site.git
   git push -u origin main
   ```
3. У репозиторії: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Відкрийте вкладку **Actions**: workflow «Demo → GitHub Pages» збере сайт за 1–2 хвилини.
5. Посилання для клієнта: `https://ВАШ-ЛОГІН.github.io/nails-site/`. Воно відкривається на телефоні, а на iPhone та Android сайт можна ще й «додати на головний екран» як застосунок.

Кожен наступний `git push` автоматично оновлює демо.

Подивитися демо локально рівно так, як його віддасть GitHub Pages:

```bash
npm run preview:demo      # http://localhost:4000/nails-demo/
```

Повноцінний сайт із записом і адмінкою розгортається на Render або VPS (розділ «Розгортання» нижче).

## Де що міняти

| Що | Де | Після зміни |
|---|---|---|
| Ціни, послуги, тексти FAQ, кроки, переваги, контакти, Instagram | `content/site.json` | `npm run build` |
| Розмітка й тексти секцій | `src/index.html` | `npm run build` |
| Стилі | `src/css/main.css`, `src/css/tokens.css` (кольори, шрифти, кнопки) | `npm run build` |
| Робочі години, тривалість слоту, вихідні | `/admin` → «Графік» / «Вихідні» | одразу |
| Фото | `tools/optimize_images.py` (список `JOBS`) | `python tools/optimize_images.py ..` → `npm run build` |

Контакти з `content/site.json` (`phone`, `telegram`, `email`) показуються на сайті й у плаваючій кнопці лише тоді, коли заповнені.

## Сповіщення про новий запис

**Telegram:**
1. Створіть бота в [@BotFather](https://t.me/BotFather), скопіюйте токен у `TELEGRAM_BOT_TOKEN`.
2. Напишіть своєму боту `/start`.
3. Відкрийте `https://api.telegram.org/bot<ТОКЕН>/getUpdates` і скопіюйте `chat.id` у `TELEGRAM_CHAT_ID`.

**Email:** заповніть `SMTP_*`, `MAIL_FROM`, `MAIL_TO`. Для Gmail потрібен «пароль застосунку» (не звичайний пароль).

Якщо сповіщення не дійшло, запис усе одно зберігається, а помилка потрапляє в лог сервера.

## Як працює запис

- Слоти будуються з робочого графіка: від початку дня з кроком «тривалість слоту» (за замовчуванням 120 хв).
- Зайняті, минулі й ближчі за «мінімум до запису» слоти недоступні. Вихідні дні закриті.
- Захист: валідація на сервері, унікальний індекс у БД (один активний запис на слот), транзакція з перевіркою перетину, повторне надсилання форми повертає вже створений запис, ліміт активних записів на один номер, rate limit (8 спроб / 10 хв з IP), honeypot-поле проти ботів, helmet + CSP.

## API

| Метод | Шлях | Опис |
|---|---|---|
| GET | `/api/health` | перевірка, що сервер живий |
| GET | `/api/days` | стан днів на горизонті запису (`open` / `full` / `closed`) |
| GET | `/api/slots?date=YYYY-MM-DD` | години на день (`available: true/false`) |
| GET | `/api/schedule` | тижневий графік (для блоку «Контакти») |
| POST | `/api/booking` | створити запис `{ name, phone, serviceId, date, time, comment }` |
| POST | `/api/admin/login` · `/logout` | вхід/вихід (cookie, 12 год) |
| GET | `/api/admin/bookings?scope=upcoming\|past\|cancelled\|all` | список записів |
| PATCH | `/api/admin/bookings/:id` | `{ status: "new" \| "confirmed" \| "cancelled" }` |
| GET / PUT | `/api/admin/settings` | графік і налаштування |
| POST / DELETE | `/api/admin/days-off`, `/api/admin/days-off/:date` | вихідні |

Запити адмінки, що змінюють дані, потребують заголовка `X-Requested-With: fetch` (захист від CSRF).

## Тести

```bash
npm test
```

18 інтеграційних тестів API: валідація, honeypot, подвійне надсилання, паралельні запити на один слот, вихідні, ліміти, адмін-сесія, підроблена cookie, графік, rate limit.

## Розгортання

> **Важливо:** база SQLite — це файл. Хостинг має зберігати його між перезапусками й деплоями.

### Варіант 1. Render (рекомендовано)

1. Залийте папку `site/` у GitHub-репозиторій.
2. На [render.com](https://render.com) → **New → Blueprint** → оберіть репозиторій. Файл `render.yaml` уже налаштовує сервіс, диск для бази й health check.
   Постійний диск доступний на платному тарифі (Starter). На безкоштовному тарифі база зникатиме після кожного перезапуску.
3. У налаштуваннях сервісу заповніть змінні `ADMIN_PASSWORD`, `SITE_URL` (наприклад `https://nailsby.cz`), `TELEGRAM_*` / `SMTP_*`.
4. Підключіть свій домен у **Settings → Custom Domains**.

Вручну (без Blueprint): Web Service, Build `npm ci --include=dev && npm run build`, Start `npm start`, Disk з mount path `/var/data`, змінна `DB_PATH=/var/data/bookings.db`, `TRUST_PROXY=1`, `NODE_ENV=production`.

### Варіант 2. VPS (Ubuntu)

```bash
# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm i -g pm2

# код
git clone <ваш-репозиторій> /var/www/nails && cd /var/www/nails
npm ci --include=dev && npm run build
cp .env.example .env && nano .env      # NODE_ENV=production, TRUST_PROXY=1, ADMIN_PASSWORD, SITE_URL…
pm2 start server/index.js --name nails && pm2 save && pm2 startup
```

nginx (`/etc/nginx/sites-available/nails`):

```nginx
server {
  server_name nailsby.cz www.nailsby.cz;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/nails /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt-get install -y certbot python3-certbot-nginx && sudo certbot --nginx   # HTTPS
```

Оновлення: `git pull && npm ci --include=dev && npm run build && pm2 restart nails`.

**Резервна копія бази:** `data/bookings.db` (разом із `-wal`/`-shm`). Найпростіше раз на добу копіювати файл через cron, наприклад `sqlite3 data/bookings.db ".backup /root/backup/bookings-$(date +\%F).db"`.

### Варіант 3. Vercel

Vercel (як і GitHub Pages) підходить лише для статичної частини: його файлова система тимчасова, тож SQLite там не зберігається. Якщо хочете фронтенд саме на Vercel, бекенд розгорніть на Render, а в корені додайте `vercel.json`, щоб `/api` проксувався туди:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://ВАШ-СЕРВІС.onrender.com/api/:path*" },
    { "source": "/admin", "destination": "/admin.html" }
  ]
}
```

У такій схемі заголовки безпеки (CSP) додає лише бекенд, тож для статики їх варто прописати в `vercel.json` → `headers`. Простіше тримати все на Render або VPS.

## Чекліст перед запуском

- [ ] `SITE_URL` у `.env` (без нього canonical, Open Graph і sitemap вказують на заглушку)
- [ ] `ADMIN_PASSWORD` (мін. 8 символів) і `SESSION_SECRET`
- [ ] Telegram та/або email для сповіщень
- [ ] Реальні робочі години в `/admin` → «Графік» (зараз стоїть заглушка: Пн–Пт 10–19, Сб 10–16)
- [ ] Телефон / Telegram / email у `content/site.json`, якщо хочете їх показувати
- [ ] Перевірити тексти FAQ і «Про мене» (див. нижче)

## Що взято з матеріалів, а що є заглушкою

**З матеріалів:** ціни й тривалість (прайс PDF), адреса Řehořova 25, Praha 3, Instagram @nailsby.nstjky, імʼя та кваліфікація (сертифікат), фото.

**Заглушки / потребують перевірки:**
- телефон, Telegram, email: у матеріалах не було, на сайті приховані;
- робочі години: стартовий графік, змінюється в адмінці;
- відгуки: у матеріалах не було, тому секції відгуків немає;
- FAQ (догляд, підготовка, як часто оновлювати покриття, перенесення запису): загальні рекомендації, нехай майстриня їх перевірить;
- тривалість французького манікюру й педикюру з гель-лаком у прайсі не вказана, тому на картках її немає;
- домен (`SITE_URL`).

## Структура

```
site/
├─ content/site.json        тексти, ціни, контакти — єдине джерело контенту
├─ src/                     шаблони сторінок, CSS, JS (index, admin, 404)
├─ static/                  фото (AVIF/WebP/JPEG), шрифти, іконки
├─ scripts/build.mjs        збирання → dist/ (прапорці --demo --base=/x/ --out=dir --site=url)
├─ scripts/serve-static.mjs локальний перегляд демо-збірки
├─ .github/workflows/       автопублікація демо на GitHub Pages
├─ server/                  Express API, SQLite, сповіщення, авторизація
├─ tools/                   обробка фото та шрифтів (Python)
├─ test/api.test.mjs        тести API
├─ .env.example             приклад налаштувань
└─ render.yaml              конфігурація для Render
```
