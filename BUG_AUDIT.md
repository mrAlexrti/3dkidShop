# BUG AUDIT

Дата аудита: 2026-07-03  
Проект: `C:\Users\alexa\OneDrive\Документы\stikr-shop`  
Ветка: `claude-patch-v3`

## Выполненные проверки

- `pwd`: `C:\Users\alexa\OneDrive\Документы\stikr-shop`
- `git status --short --branch`: `## claude-patch-v3`
- `package.json`: Next.js 15.5.9, React 19 RC, Prisma, NextAuth, Zustand, TailwindCSS
- `src/app`: `(shop)`, `admin`, `api`, `login`, root layout/error/not-found/robots/sitemap
- `npm.cmd run build`: первый запуск завис на ранней стадии из-за окружения/font fetch; повтор с `NODE_OPTIONS=--use-system-ca` завершился успешно
- `npm.cmd run lint`: не выполняет проверку, потому что `next lint` в Next 15.5.9 открывает интерактивную настройку ESLint и завершается с кодом 1
- Browser smoke: встроенный браузер Codex не подключился из-за `EPERM` на `C:\Users\alexa\AppData`; `next dev` на `localhost:3001` завис на `Starting...`, поэтому полноценная проверка browser console не выполнена в текущей среде

## Карта приложения и сценариев

- Shop routes: `/`, `/catalog`, `/catalog?category=...`, `/product/[slug]`, `/cart`, `/checkout`, `/checkout/success`
- Admin routes: `/admin`, `/admin/products`, `/admin/products/new`, `/admin/products/[id]/edit`, `/admin/categories`, `/admin/orders`, `/admin/orders/[id]`, `/admin/content`
- API routes: `/api/auth/[...nextauth]`, `/api/novaposhta`
- Основные сценарии: просмотр каталога, фильтр/поиск/сортировка, просмотр товара по кириллическому slug, добавление в корзину, изменение корзины, оформление заказа через Новую Почту, просмотр success page, вход в админку, CRUD товаров/категорий/контента, смена статуса заказа

## Critical

| Приоритет | Компонент | Проблема | Причина | Как исправить |
|-----------|-----------|----------|---------|---------------|
| Critical | Orders / Checkout | Цена заказа полностью доверяется клиентской корзине; пользователь может изменить `localStorage` и создать заказ с любой ценой, количеством или `productId`. | `createOrder(data, items)` принимает `items: CartItem[]` с клиента и считает `subtotal` по `i.price * i.quantity` без повторной загрузки товаров из БД: `src/lib/actions/create-order.ts:12`, `src/lib/actions/create-order.ts:14`, `src/lib/actions/create-order.ts:37`, `src/lib/actions/create-order.ts:61`. | На сервере принимать только `productId`, `quantity`, выбранные опции; заново читать товары/опции из Prisma, проверять `isActive`, stock, цену и считать total только на сервере. |
| Critical | Admin server actions | CRUD server actions админки не проверяют авторизацию внутри actions. | `createProduct`, `updateProduct`, `deleteProduct`, `createCategory`, `deleteCategory`, `updateSiteContent`, `updateOrderStatus` вызывают Prisma без `auth()`/role guard: `src/lib/actions/products.ts:21`, `src/lib/actions/products.ts:50`, `src/lib/actions/products.ts:80`, `src/lib/actions/categories.ts:14`, `src/lib/actions/categories.ts:24`, `src/lib/actions/categories.ts:30`, `src/lib/actions/orders.ts:7`. | Добавить общий `requireAdmin()`/`requireManager()` helper и вызывать его в каждой admin server action перед любым изменением БД. |
| Critical | Admin auth | Админка защищает только факт логина, но не роль пользователя. Любой `MANAGER`/любой залогиненный пользователь попадает в `/admin`. | Middleware проверяет только `!!req.auth`, а layout проверяет только `session`: `src/middleware.ts:6`, `src/middleware.ts:8`, `src/app/admin/layout.tsx:6`; роль есть в токене, но не используется: `src/lib/auth.ts:29`, `src/lib/auth.ts:36`, `src/lib/auth.ts:42`. | Проверять `session.user.role === "ADMIN"` или явно разрешённые роли в middleware, admin layout и server actions. |

## High

| Приоритет | Компонент | Проблема | Причина | Как исправить |
|-----------|-----------|----------|---------|---------------|
| High | Checkout validation | Можно оформить доставку в отделение/почтомат без выбранного отделения, а курьерскую доставку без адреса. | `npWarehouseRef`, `npWarehouseAddress`, `npCourierAddress` объявлены optional без conditional validation: `src/lib/validations/checkout.ts:16`, `src/lib/validations/checkout.ts:18`; `createOrder` просто не добавляет адрес, если поле пустое: `src/lib/actions/create-order.ts:33`. | Добавить `superRefine`: для `np_warehouse` и `np_parcel_locker` требовать warehouse ref/address, для `np_courier` требовать courier address. |
| High | Product page | Неактивные товары доступны по прямому URL и могут быть добавлены в корзину. | `generateStaticParams` фильтрует `isActive`, но `getProduct` ищет по slug без `isActive: true`: `src/app/(shop)/product/[slug]/page.tsx:15`, `src/app/(shop)/product/[slug]/page.tsx:46`, `src/app/(shop)/product/[slug]/page.tsx:49`. | В `getProduct` добавить `isActive: true` для `findFirst`/поиска или после загрузки отдавать `notFound()` для inactive. |
| High | Product card / Options | Быстрое добавление из карточки обходит выбор обязательных опций товара. | `ProductCard.handleQuickAdd` кладёт в корзину базовый товар без `options`: `src/components/product/product-card.tsx:28`, `src/components/product/product-card.tsx:30`; товары в seed имеют опцию размера. | Если у товара есть опции, вести на карточку товара вместо quick add или передавать default options явно и отображать это пользователю. |
| High | Stock / Quantity | Нет проверки остатка при добавлении, изменении количества и создании заказа. | `ProductOptions` увеличивает quantity без лимита: `src/components/product/product-options.tsx:91`; `cart-store` ограничивает только минимумом `1`: `src/store/cart-store.ts:42`; `createOrder` не проверяет stock. | Проверять stock на сервере при создании заказа, блокировать превышение в UI и показывать понятную ошибку. |
| High | Nova Poshta UX | Ошибки Новой Почты полностью скрываются; пользователь не понимает, что ключ отсутствует или сервис недоступен. | `npRequest` возвращает `[]` при любой ошибке и не прокидывает error state: `src/components/checkout/checkout-form.tsx:17`, `src/components/checkout/checkout-form.tsx:19`, `src/components/checkout/checkout-form.tsx:55`, `src/components/checkout/checkout-form.tsx:80`. | Вернуть `{data,error}` из hook, показывать fallback-сообщение и разрешать ручной ввод без краша. |
| High | Nova Poshta API | Public endpoint `/api/novaposhta` whitelist-нут, но не имеет rate limiting/cache/debounce на сервере; можно жечь квоту API ключа. | Route доступен публично и проксирует `searchSettlements`/`getWarehouses` при каждом POST: `src/app/api/novaposhta/route.ts:111`, `src/app/api/novaposhta/route.ts:132`; клиент грузит до 300 отделений: `src/components/checkout/checkout-form.tsx:75`. | Добавить server-side rate limit, уменьшить лимиты, кешировать популярные города/отделения, добавить `FindByString` для отделений. |
| High | Auth / Vercel Edge | Middleware импортирует `auth`, а `auth` импортирует `bcryptjs` и Prisma; это риск Edge Runtime warnings/ошибок на Vercel. | `src/middleware.ts` импортирует `auth`: `src/middleware.ts:1`; `src/lib/auth.ts` импортирует `bcryptjs` и Prisma. Build ранее показывал Edge Runtime warnings для `bcryptjs`. | Разделить edge-safe auth config для middleware и Node-only credentials authorize, либо использовать matcher/authorized callback без импорта bcrypt в edge bundle. |
| High | Localization | Переключатель UA/EN не переводит большую часть UI: каталог, checkout form, product page, seed data, admin и часть кнопок остаются hardcoded. | Есть `useLangStore`, но многие компоненты содержат статичные строки: `src/components/catalog/catalog-filters.tsx:8`, `src/components/checkout/checkout-form.tsx:151`, `src/app/(shop)/product/[slug]/page.tsx:89`. | Системно заменить hardcoded shop strings на `t.*`; для серверных страниц выбрать locale через cookie/header/route segment. |

## Medium

| Приоритет | Компонент | Проблема | Причина | Как исправить |
|-----------|-----------|----------|---------|---------------|
| Medium | Build / DX | `npm.cmd run build` в локальной среде зависает/падает без `NODE_OPTIONS=--use-system-ca` из-за Google Fonts TLS. | `src/app/layout.tsx` использует `next/font/google`: `src/app/layout.tsx:2`; успешная сборка потребовала `NODE_OPTIONS=--use-system-ca`. | Документировать `NODE_OPTIONS=--use-system-ca` для Windows/локальной среды или перейти на self-hosted fonts. |
| Medium | Lint / QA | `npm.cmd run lint` не выполняет линтинг и уходит в интерактивную настройку. | Script использует deprecated `next lint`: `package.json`; команда завершилась кодом 1 с prompt настройки ESLint. | Мигрировать на ESLint CLI по codemod Next: `next-lint-to-eslint-cli`, добавить конфиг и CI-friendly script. |
| Medium | Catalog routing | Header ведёт в неполный/несоответствующий набор категорий: нет `posters`, а labels не соответствуют slug. | `navLinks`: `stickers` подписан `toys`, `merch` подписан `keychains`, `cards` подписан `courses`: `src/components/layout/header.tsx:126`, `src/components/layout/header.tsx:128`, `src/components/layout/header.tsx:129`, `src/components/layout/header.tsx:130`. | Генерировать nav из реальных категорий или привести slugs/labels к данным БД. |
| Medium | Catalog pagination | Некорректная страница вроде `?page=999` показывает пустой каталог без объяснения/редиректа. | `page` нормализуется только снизу, но не сверху; `skip` уходит за пределы: `src/app/(shop)/catalog/page.tsx:25`, `src/app/(shop)/catalog/page.tsx:47`. | Если `page > totalPages`, редиректить на последнюю страницу или показывать понятное empty state с reset filters. |
| Medium | Product slug | Некорректный percent-encoded slug может дать runtime 500. | `decodeURIComponent(rawSlug)` вызывается без try/catch: `src/app/(shop)/product/[slug]/page.tsx:12`. | Обернуть decode в try/catch и возвращать `notFound()` для malformed slug. |
| Medium | Prices / Currency | При EN цены отображаются как USD без конвертации из UAH; при UA применяется статический множитель 41.5, хотя комментарий говорит про EUR/демо. | `formatPrice` хранит `USD_RATE = 41.5`; для USD возвращает исходное число, для UAH умножает: `src/lib/utils.ts:7`, `src/lib/utils.ts:15`. | Определить базовую валюту БД, хранить currency явно, убрать фиктивную USD-локализацию или подключить реальную конвертацию. |
| Medium | Checkout empty cart | Пользователь может открыть checkout с пустой корзиной и заполнить форму; ошибка появится только после submit. | `CheckoutPage` всегда рендерит `CheckoutForm`, даже когда `items` пустой: `src/app/(shop)/checkout/page.tsx:10`, `src/app/(shop)/checkout/page.tsx:21`; server action возвращает ошибку позже. | На `/checkout` показывать empty state/redirect в `/cart`, отключить submit при пустой корзине. |
| Medium | Sitemap / SEO | `sitemap` использует домен `stikr.shop`, а `metadataBase` указывает Vercel URL; sitemap включает все товары, включая inactive. | `src/app/layout.tsx:16`, `src/app/sitemap.ts:8`, `src/app/sitemap.ts:11`; `sitemap` не фильтрует `isActive`. | Вынести canonical site URL в env, синхронизировать metadata/robots/sitemap, фильтровать inactive products. |
| Medium | Not Found | `app/not-found.tsx` возвращает собственные `<html>`/`<body>`, что может создать некорректную вложенность документа. | Root layout уже рендерит `<html>`/`<body>`: `src/app/layout.tsx:28`; not-found тоже: `src/app/not-found.tsx:6`. | Убрать `<html>`/`<body>` из `not-found.tsx`, возвращать только UI. |
| Medium | Admin forms | Ошибки Prisma/Zod в admin forms показываются как общий toast без field-level сообщений; duplicate slug/category не объясняется. | `ProductForm` catch показывает общий toast: `src/components/admin/product-form.tsx:34`; actions используют `parse` и Prisma exceptions без нормализации. | Возвращать typed action state с field errors, обрабатывать unique constraint и category relation errors. |

## Low

| Приоритет | Компонент | Проблема | Причина | Как исправить |
|-----------|-----------|----------|---------|---------------|
| Low | LangSwitcher | React warning из-за fragment без key при `options.map`. | В map возвращается `<>...</>` без key: `src/components/layout/lang-switcher.tsx:22`, `src/components/layout/lang-switcher.tsx:23`. | Использовать `<Fragment key={o.id}>` или обернуть элементы в keyed container. |
| Low | HTML lang / a11y | `html lang` всегда `uk`, даже при переключении EN; not-found вообще `ru`. | `src/app/layout.tsx:28`; `src/app/not-found.tsx:6`. | Хранить locale в cookie/route segment и выставлять `lang` на сервере. |
| Low | Header mobile spacing | На мобильном layout сохраняет desktop top padding `174px`, хотя комментарий говорит про мобильные `~130px`; появляется лишний вертикальный зазор. | `src/app/(shop)/layout.tsx:13`. | Использовать разные значения: например `pt-[136px] md:pt-[174px]`, сверить по фактической высоте header. |
| Low | Cart UX | Кнопка `Minus` на quantity `1` ничего визуально не меняет, пользователь может ожидать удаление или disabled-state. | Store делает `Math.max(1, quantity)`: `src/store/cart-store.ts:42`. | Disable `Minus` при `1` или превращать decrement below 1 в remove with confirm/undo. |
| Low | Checkout warehouses UX | Для больших городов отделения грузятся огромным select до 300 элементов без поиска по отделениям. | `Limit: 300` в `useWarehouses`: `src/components/checkout/checkout-form.tsx:75`. | Добавить поиск/фильтр отделений через `FindByString`, виртуализацию или lazy loading. |
| Low | README security | README и login page публикуют demo admin credentials; это опасно, если seed запускается в production. | `README.md:57`, `src/app/login/page.tsx:63`, `prisma/seed.ts:11`. | Явно пометить только для local/dev, не сидить demo admin в production, убрать подсказку с login page для prod. |

## Примечания по Новой Почте

- `NEXT_PUBLIC_NP_API_KEY` в `src` и `README.md` не найден.
- Прямой URL `https://api.novaposhta.ua/v2.0/json/` остался только на сервере: `src/app/api/novaposhta/route.ts:3`.
- Серверный route ограничен `Address/searchSettlements` и `Address/getWarehouses`, но требует rate limit и лучшую ошибку в UI.
