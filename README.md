# STIKR — интернет-магазин (Next.js 15 + TypeScript + Prisma)

Этот файл — пошаговая инструкция для человека, который раньше не запускал такие проекты. Идите по шагам по порядку, ничего не пропускайте.

## Что вам понадобится установить на компьютер (один раз)

1. **Node.js версии 20 или новее** — https://nodejs.org (скачайте LTS-версию, установите как обычную программу).
2. **PostgreSQL** — самый простой способ для новичка:
   - Вариант А (рекомендую): создать бесплатную базу на https://neon.tech или https://supabase.com — регистрируетесь, создаёте проект, копируете "Connection string" (строку подключения).
   - Вариант Б: установить PostgreSQL локально с сайта https://www.postgresql.org/download/.
3. **Редактор кода** (не обязателен, но удобен) — https://code.visualstudio.com

Проверить, что Node.js установился: откройте терминал (на Windows — "Командная строка" или PowerShell, на Mac — "Терминал") и введите:
```
node -v
```
Должна появиться версия, например `v20.11.0`.

## Шаг 1. Распакуйте проект

Распакуйте архив в любую папку, например `Документы/stikr-shop`.

## Шаг 2. Откройте терминал в папке проекта

В VS Code: File → Open Folder → выберите папку `stikr-shop`, затем меню Terminal → New Terminal.
Либо просто откройте обычный терминал и введите `cd путь/к/папке/stikr-shop`.

## Шаг 3. Установите зависимости

```bash
npm install
```
Это займёт пару минут — скачиваются все библиотеки проекта.

## Шаг 4. Настройте переменные окружения

1. Скопируйте файл `.env.example` и переименуйте копию в `.env`.
2. Откройте `.env` и вставьте вашу строку подключения к базе данных в `DATABASE_URL` (её даёт neon.tech/supabase.com при создании базы, либо локальный postgres).
3. Сгенерируйте секрет для авторизации командой:
```bash
npx auth secret
```
Команда сама впишет значение `AUTH_SECRET` в `.env`.
4. Добавьте ключ Новой Почты для серверного API:
```bash
NP_API_KEY="your_nova_poshta_api_key"
```

5. Для онлайн-оплати LiqPay та email-підтверджень додайте:
```bash
LIQPAY_PUBLIC_KEY="your_liqpay_public_key"
LIQPAY_PRIVATE_KEY="your_liqpay_private_key"
LIQPAY_SANDBOX="1"
LIQPAY_DEBUG="0"
NEXT_PUBLIC_SITE_URL="https://your-domain.example"

RESEND_API_KEY="your_resend_api_key"
EMAIL_FROM="3D Kid <orders@your-domain.example>"
ADMIN_EMAIL="admin@your-domain.example"
```

## Админ-авторизация, TEST_MODE и 2FA

Админка `/admin` защищена Auth.js credentials-login. Режим работы задаётся env-переменной `TEST_MODE`; если она не задана, приложение считает `TEST_MODE=0`.

### TEST_MODE=1 — режим разработки

Используйте только локально или для временного тестового деплоя. В этом режиме:
- вход разрешён по тестовым данным `admin` / `Pass12345`;
- Google Authenticator / TOTP не требуется;
- на странице `/login` и внутри `/admin` отображается предупреждение `ВНИМАНИЕ: включен TEST_MODE`.

### TEST_MODE=0 — боевой режим

Это режим для production. В этом режиме:
- тестовые данные `admin` / `Pass12345` полностью отключены;
- вход работает только через `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` и `ADMIN_TOTP_SECRET`;
- пароль хранится только как bcrypt-hash;
- TOTP-код из Google Authenticator обязателен.

### Env для Vercel

```bash
TEST_MODE=0
ADMIN_USERNAME="admin"
ADMIN_PASSWORD_HASH="$2a$12$replace_with_bcrypt_hash"
ADMIN_TOTP_SECRET="BASE32_SECRET_FROM_AUTHENTICATOR"
AUTH_SECRET="your_auth_secret"
NEXTAUTH_URL="https://3dkid-shop-y8ut.vercel.app"
```

### Как сгенерировать hash пароля

```bash
node -e "const bcrypt=require('bcryptjs'); bcrypt.hash(process.argv[1], 12).then(console.log)" "your-strong-password"
```

Скопируйте результат в `ADMIN_PASSWORD_HASH`. Сам пароль в `.env` или Vercel не храните.

### Как сгенерировать TOTP secret

```bash
node -e "const crypto=require('crypto');const a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';const b=crypto.randomBytes(20);let bits='',out='';for(const x of b)bits+=x.toString(2).padStart(8,'0');for(let i=0;i<bits.length;i+=5)out+=a[parseInt(bits.slice(i,i+5).padEnd(5,'0'),2)];console.log(out)"
```

В Google Authenticator нажмите `+` → `Enter a setup key`, задайте имя `3D Kid Admin`, вставьте `ADMIN_TOTP_SECRET` и выберите time-based code. После изменения env сделайте Redeploy в Vercel.
## Шаг 5. Создайте таблицы в базе данных и заполните демо-данными

```bash
npm run db:push
npm run db:seed
```
После этого в базе появятся товары, категории и отзывы. Админ-доступ настраивается отдельно через env-переменные; демо-пароль в коде не хранится.

## Шаг 6. Запустите сайт

```bash
npm run dev
```
В терминале появится адрес, обычно `http://localhost:3000` — откройте его в браузере.

- Сайт магазина: `http://localhost:3000`
- Каталог: `http://localhost:3000/catalog`
- Админ-панель: `http://localhost:3000/admin` (потребует вход через `/login`)

## Частые проблемы

- **"Can't reach database server"** — проверьте `DATABASE_URL` в `.env`, и что база данных действительно создана и доступна (для neon/supabase убедитесь, что скопировали именно "pooled connection string" если она есть).
- **Порт 3000 занят** — запустите `npm run dev -- -p 3001` и откройте `localhost:3001`.
- **Ошибки при `npm install`** — убедитесь, что версия Node.js 20+ (`node -v`).

## Структура проекта (кратко)

```
src/app/(shop)/        — публичные страницы магазина (главная, каталог, товар, корзина, checkout)
src/app/admin/         — защищённая админ-панель
src/app/api/           — API роуты (auth)
src/components/        — UI-компоненты по разделам
src/lib/actions/       — server actions (создание заказа, CRUD товаров/категорий, статус заказа)
src/lib/auth.ts        — настройка Auth.js
src/store/cart-store.ts— корзина (Zustand, хранится в localStorage браузера)
prisma/schema.prisma   — схема базы данных
prisma/seed.ts         — демо-данные
```

## Деплой (когда захотите выложить сайт в интернет)

Проще всего на **Vercel** (бесплатно для старта):
1. Загрузите проект на GitHub.
2. Зайдите на https://vercel.com, "Import Project", выберите репозиторий.
3. В настройках добавьте переменные окружения `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`, `TEST_MODE`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_TOTP_SECRET`, `NP_API_KEY` (те же, что в `.env`).
4. Нажмите Deploy.

Если что-то не получается на любом из шагов — пришлите мне точный текст ошибки из терминала, и я подскажу решение.

