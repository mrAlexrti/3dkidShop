# Batch 1.8A — Color-specific Product Images & Price UX

Статус: локально реалізовано; після release audit виправлено cart fallback і перевірено restricted-role writes. Production rollout не виконувався. Поточні локальні перевірки та операторські умови наведено нижче.

## Git і межі роботи

- Репозиторій: `mrAlexrti/3dkidShop`.
- Production ref `redesign-3dkid-v2` перевірено через `git ls-remote` до роботи і після реалізації: `37bf592fd3a827211f599389cb5ccbed21b560da`.
- Локальний HEAD має той самий SHA. Створено гілку `feat/batch-1.8a-color-images-price`.
- На початку було 20 локальних видалень старих документів Batch 1.8. Їх не відновлено, не змінено й не включено до цієї реалізації. Під час майбутнього commit додавати тільки файли нижче; не використовувати `git add -A`.
- Commit, push, merge, deploy, Production SQL, `prisma db push`, `prisma migrate` та зміни Vercel Environment Variables не виконувалися.
- Neon і товар `test` не використовувалися для тестів. Дані товару, його деактивація, варіанти, зображення й історичні замовлення не змінювалися.
- `.env` не змінено. Локально `PRODUCT_MEDIA_CLEANUP_ENABLED` не заданий, тобто cleanup вимкнений наявним fail-closed кодом. Production environment не читався й не змінювався; під час rollout залишити cleanup вимкненим.

## Архітектура

`ProductImage` отримує одне nullable поле `colorValueId`, FK до стабільного `ProductOptionValue.id`. `NULL` означає універсальне фото; всі існуючі записи автоматично мають це значення. Немає backfill, нової таблиці, копіювання фото чи зміни існуючих ID.

Наявний `order` визначає порядок і головні фото. Перше фото всього товару лишається загальним головним для карток/метаданих. Перше фото конкретного кольору — головне для цього кольору. Кнопка «Зробити головним для кольору» переміщує запис перед іншими фото того самого кольору; вона не створює копію й не переміщує його перед ранішими універсальними фото. Наявна кнопка «Зробити головним» змінює загальний порядок. Ліміт залишився 1–10 фото.

`ProductForm` зберігає один draft конфігурації й передає його `VariantEditor` та список кольорів `GalleryEditor`. Новий колір до Save має тимчасовий `key`; фото передає його як `colorKey`. `syncProductConfiguration` повертає map `key → saved ID`; тільки після цього `syncProductGallery` записує постійний `colorValueId`. Значення SIZE, чужий колір, невідомий ключ або суперечливі key/ID повертають локалізовану помилку поля `images` і відкочують весь Save.

Збереження лишається в наявній транзакції: media lock → Product lock/revision check → перевірка attachable URLs → Product/configuration → gallery → superseded-media queue → фінальний `SET CONSTRAINTS ALL IMMEDIATE`. Для створення новий Product/configuration/gallery теж записуються атомарно. Gallery snapshot тепер містить також `colorValueId`. Фото з архівним кольором зберігає свою прив’язку, навіть якщо відповідне значення не потрапило на поточну сторінку історії; нову прив’язку до retired кольору сервер не дозволяє. Явний вибір універсального фото або іншого активного кольору дозволений.

DB гарантії використовують уже розгорнуті guards Batch 1.8. Новий image trigger спочатку викликає `batch18_child_guard`: блокує Product, забороняє зміну ID/власника фото й збільшує DB-managed `variantRevision`. Наступний trigger перевіряє, що значення належить COLOR-групі цього самого товару. Зворотні зміни `ProductOption.kind`, `ProductOption.productId`, `ProductOptionValue.optionId` уже заборонені Batch 1.8. FK забороняє dangling references. `ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED` дозволяє цілісне каскадне видалення товару незалежно від порядку видалення його image/value children. `ON UPDATE RESTRICT` зберігає identity. Це не просто клієнтська перевірка.

`variantRevision` лишається epoch, а не лічильником рівно одного Save: тепер навіть прямий image-only edit робить відкриту форму застарілою. Дві вкладки з однаковим revision не можуть перезаписати одна одну. Галерея й draft не скидаються після validation/network/stale errors.

На сторінці товару `ProductSelectionProvider` передає вибраний колір `NativeProductOptions` і `ProductGallery`. До вибору видно всю публічну галерею. Після вибору: фото кольору в їхньому порядку, потім універсальні фото в їхньому порядку; кожен запис рівно один раз. Фото інших кольорів не показуються. Якщо фото кольору немає — лишаються універсальні. Якщо адміністратор прибрав усі універсальні і вибраний колір не має фото — показується наявний placeholder; тому редактор радить залишити хоча б одне універсальне. Retired/unused color links збережені в БД/Admin, але виключені з публічної detail-галереї. Товари без кольорів використовують універсальні фото.

GalleryView скидається на головне фото тільки при зміні кольору. Зміна розміру, кількості, мови чи ререндер не скидає ручну навігацію. Наявні arrows/swipes/native dialog/zoom/GIF/keyboard/focus handling збережені. Вибір кольору не робить fetch або навігацію: всі дані вже є в props.

Ціна незавершеного вибору рахується за доступними, не retired комбінаціями, що відповідають **усім уже вибраним параметрам**. Повний вибір показує точну ціну; неможливий вибір — unavailable. Для Блакитного без розміру показується «від 279 грн»; 349 грн недоступної комбінації не впливає на мінімум. Несумісний розмір при зміні кольору очищається наявною поведінкою.

Cart candidate отримує головне фото кольору. Наявний store приховує непідтверджені URL до авторитетного lookup. Lookup одним наявним пакетним запитом отримує до 10 фото на товар і перевірену конфігурацію. `selectedCombination` перевіряє variant ID та всі selection IDs; тільки потім reconciliation обирає фото відповідного кольору з серверної галереї. Довільний клієнтський URL не використовується. Видалене scoped фото дає універсальний fallback. Checkout identity, schema persisted-cart і логіка платежів не змінені.

Виправлення після release audit: якщо валідного вибраного кольору немає (зокрема retired/unavailable/forged selection, SIMPLE після відмови від кольорів або SIZE/LEGACY), reconciliation обирає тільки перше універсальне фото з авторитетної галереї. Якщо універсальних фото немає — placeholder. Фото retired кольору перед універсальним більше не стає default. При відновленні того самого кольору/комбінації повертається його scoped primary; image/value/variant IDs та URL не змінюються. Для старих серверних projections без масиву `images` збережено попередній контракт поля `image`.

## Точний SQL delta

Повний виконуваний review artifact: [`release/batch-1.8a-color-images.sql`](release/batch-1.8a-color-images.sql). Він містить BEGIN/COMMIT, review sentinel і перевірку залежних enabled guards, `lock_timeout=5s`, `statement_timeout=60s`, а також:

1. `ProductImage.colorValueId TEXT NULL`, без default/backfill.
2. B-tree index `ProductImage_colorValueId_idx`.
3. FK `ProductImage_colorValueId_fkey` → `ProductOptionValue(id)`, `ON DELETE NO ACTION ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED`.
4. BEFORE INSERT/UPDATE/DELETE trigger `batch18a_10_image_owner_guard` → наявна `public.batch18_child_guard()`.
5. Нова invoker-rights функція `public.batch18a_image_color_guard()`, `search_path=pg_catalog`.
6. BEFORE INSERT/UPDATE trigger `batch18a_20_image_color_guard` → нова функція.
7. Фінальний `SET CONSTRAINTS ALL IMMEDIATE`.

Точний текст усіх statements міститься в SQL-файлі; застосовувати треба весь файл, а не лише список вище. Жодних UPDATE/DELETE/INSERT існуючих даних, змін Order/OrderItem або media lifecycle таблиць. Додаткові triggers/deferrability — SQL-only invariants; Prisma generate/db push їх не створить. Перед Production окремо погодити саме цей SQL і його SHA-256.

Rollback artifact: [`release/batch-1.8a-color-images-rollback.sql`](release/batch-1.8a-color-images-rollback.sql). Verification artifact: [`release/batch-1.8a-color-images-verify.sql`](release/batch-1.8a-color-images-verify.sql). На Neon жоден із цих файлів не запускався.

SHA-256 review artifacts (bytes локальних файлів):

```text
4ADF7631A6DD268B28D8A3575A80DEF62E29E506310EA3E15C585673E0F83EE0  batch-1.8a-color-images.sql
40C3E638D4D3CD58D36346CB2FEEC6D673986533E065ABE9E9EE1542A83CA98C  batch-1.8a-color-images-rollback.sql
5D6608177CDAA41FECBA5912AAAC294AB8C090CB8A1D0E6180D794302A79C713  batch-1.8a-color-images-verify.sql
```

Після Git checkout або зміни line endings звірити bytes з погодженим artifact та за потреби повторно зафіксувати його hash перед виконанням.

## Перевірки

| Перевірка | Результат |
|---|---|
| Prisma validate + generate | PASS, з localhost dummy URL; тільки локальна генерація клієнта |
| TypeScript `--noEmit --incremental false` | PASS |
| ESLint `src` і змінених/new QA scripts | PASS |
| Ізольована Next production build | PASS: compilation, lint/types, усі 18 static pages; Prisma замінений порожніми read fixtures, connections/writes/provider fetch заборонені |
| PostgreSQL 18 rehearsal | PASS після виправлення: новий приватний cluster, application actions через restricted login, автоматична зупинка |
| Cart retirement/restoration/SIMPLE regression | PASS після виправлення, UA/EN, in-memory + actual actions/lookup у PostgreSQL |
| Restricted image-trigger permissions | PASS: image INSERT/UPDATE/DELETE та revision bump; negative control без epoch UPDATE відкочується атомарно |
| Browser Batch 1.8A | Попередній PASS: UA/EN × 320/390/1280 px; UI не змінено, після cart-only fix не повторювався |
| Existing variants browser regression | Попередній PASS: UA/EN × 320/390/1280 px; не повторювався |
| Existing Batch 1.8 implementation | Попередній PASS, 7 груп; не повторювався |
| Existing product/cart UX | PASS, 18 груп |
| Existing media lifecycle | Попередній PASS, 29 груп; migration/media code не змінено, не повторювався |
| `git diff --check` | PASS |

PG rehearsal виконує actual create/update/archive/delete actions і real Prisma/SQL writers через окремий restricted login `app_3dkid_fixture`; owner використовується тільки для локального schema/fixture setup. Auth/cache/Blob/cleanup scheduling підмінені явними ізольованими stubs. Перевірені: одночасне створення нових кольорів/фото, повторне Save, перейменування, reorder головного фото, незмінність IDs, серверне фото кошика й fallback після видалення фото, forged selection/URL, дві concurrent форми, child-only revision invalidation, stale gallery snapshot, SIZE/чужий/невідомий колір, незмінність власників/kind/ID, атомарний rollback failed create/update, retirement/restoration зі збереженням тих самих IDs/URL, SIMPLE conversion із scoped фото перед універсальним, пропущена history page, archive, product cascade. Синтетичний історичний OrderItem залишився byte-for-byte незмінним.

Restricted profile визначено в `scripts/fixtures/batch18a-runtime-role.sql`: NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION, NOBYPASSRLS; без ownership/owner membership, schema CREATE, table TRIGGER та OrderItem mutation. Catalog Product/ProductImage мають потрібні DML, typed options/variants — SELECT/INSERT/UPDATE, Category/OrderItem — SELECT. Schema/enum USAGE і виконання guard functions дозволені. Усі application actions та нові image triggers працюють з цим профілем без додаткових grants. Окремий login `batch18a_missing_revision` має image DML і Product UPDATE(name) для row lock, але не UPDATE(variantRevision): кожен INSERT/UPDATE/DELETE фото отримує permission denied на Product, а фото й epoch залишаються незмінними. Explicit revision tampering, SIZE/foreign links також відхиляються.

Це локально перевірений аналог потрібних можливостей `app_3dkid`, а не експорт фактичних live ACL. Sanitized Production GRANT/REVOKE matrix не надано; Production не читався. Перед rollout оператор повинен підтвердити ефективні права, особливо SELECT/INSERT/UPDATE нового `ProductImage.colorValueId` і SELECT/UPDATE `Product.variantRevision`. За table-level grants окремий grant нового column не потрібен; за column-only grants його треба погодити. Не надавати runtime ownership, TRIGGER, schema CREATE або права зміни історичних замовлень. SQL fixture з локальними roles ніколи не запускати на Production.

Сам SQL перевірено на guard fail-closed, застосування без зміни наявного фото, rollback/reapply до появи прив’язок, injected failure перед COMMIT із повним відкатом DDL і відмову rollback після появи прив’язок. Read-only verification artifact також успішно виконано на expanded synthetic schema.

Browser перевірив точні ціни 199/249/279, недоступний 349 і відсутній Blue+Small; перемикання кольорів/GIF URL, universal fallback, відсутність дубльованих records, manual arrows/swipe/keyboard/lightbox/zoom/focus restore, збереження вибраного фото при зміні розміру, cart candidate + masking непідтвердженого фото, новий draft-колір у gallery select, make-primary, незмінність усіх FormData після field/network/stale errors і відсутність горизонтального overflow. Знімки Admin збережені у `.next/cache/cart-drawer-qa/batch18a-{ua,en}-{320,390,1280}.png`; оглянуто UA 320 та EN 1280. Remote image delivery/GIF decoding/optimizer на Neon/Vercel тут не тестувалися: Next image джерела перевірені за метаданими локального fixture.

Команди для відтворення з кореня репозиторію:

```powershell
$env:DATABASE_URL='postgresql://unused:unused@127.0.0.1:1/not_used'
node node_modules/prisma/build/index.js validate
node node_modules/prisma/build/index.js generate
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src scripts/fixtures/batch18a-data.ts scripts/fixtures/batch18a-browser.tsx scripts/verify-batch18a-postgres.ts scripts/verify-batch18a-runtime-role.ts scripts/verify-batch18a-cart-images.ts scripts/rehearse-batch18a-color-images.mjs scripts/source-module.ts scripts/verify-cart-drawer.ts
node node_modules/tsx/dist/cli.mjs scripts/verify-batch18a-cart-images.ts
node scripts/rehearse-batch18a-color-images.mjs
node node_modules/tsx/dist/cli.mjs scripts/verify-cart-drawer.ts 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' --color-images
node node_modules/tsx/dist/cli.mjs scripts/verify-cart-drawer.ts 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' --variants
node node_modules/tsx/dist/cli.mjs scripts/verify-batch18-implementation.ts
node node_modules/tsx/dist/cli.mjs scripts/verify-product-cart-ux.tsx
node node_modules/tsx/dist/cli.mjs scripts/verify-media-lifecycle.ts
node scripts/verify-build-isolated.mjs
```

Rehearsal не приймає існуючий DATABASE_URL, не читає `.env`, створює свій кластер і випадкову БД, використовує loopback + marker і зупиняє тільки власний кластер у finally. Застосовується синтетична catalog-підмножина pre-1.8 schema, потім наявний review SQL Batch 1.8 guards і новий delta. Це не перевірка повного production schema dump. Windows sandbox заважав запуску pg_ctl/tsx; успішні PG/browser/tsx runs виконані з погодженим escalation. Перші невдалі спроби до старту БД не мали зовнішніх ефектів.

## Ризики і подальший контрольований rollout

1. **Окреме погодження.** Ця робота завершується локальними fixes/tests. Перед Production access/backup/SQL, push/merge або deployment потрібен окремий дозвіл. Не включати 20 початкових локальних видалень документів у PR. Погодити точні SQL hashes, commit, Neon endpoint, owner/runtime roles і maintenance window. Preview для manual QA не використовується; новий Production fixture не створюється.
2. **Read-only preflight оператором.** Звірити актуальний production ref із `37bf592fd3a827211f599389cb5ccbed21b560da`; за зміни спочатку інтегрувати й повторити релевантні тести. Підтвердити Neon project/Production branch/database/server version, migration role `neondb_owner`, Vercel runtime `app_3dkid`, effective grants/role membership/RLS і точні enabled Batch 1.8 function/trigger definitions. Для new image writes runtime повинен мати Product row-lock та UPDATE(variantRevision), image DML/new-column access і option/value SELECT. Missing grants — окремий stop/approval, без автоматичних GRANT або підвищення runtime до owner.
3. **Свіжий backup і restore evidence.** Після окремого погодження створити поточний backup expanded Production schema/data, зафіксувати час/checksum і перевірити restore в новий ізольований локальний target. Це recovery rehearsal, а не Preview QA. Старі Batch 1.8 backup timestamps/hashes не є актуальними доказами. Наявний `scripts/operator/batch18-backup-restore.ps1` pins pre-1.8 schema (14 tables, zero user triggers) та старий migration hash; не запускати його unchanged на поточній БД і не обходити guards. Оператор має погодити сумісну з current schema процедуру. Зберегти schema/ACL evidence та repeatable-read fingerprints Product/Images/Option/Value/Variant/Selection, усіх даних `test` і конкретного історичного cancelled Order з OrderItems. Database backup зберігає URL, а не Blob bytes: assets не видаляти, cleanup лишити вимкненим.
4. **Maintenance.** Зупинити й drain catalog Admin writes, закрити старі форми; зафіксувати protected snapshots без паралельних catalog edits. Продумати короткі блокування image SELECT на спільній БД. Нові реальні замовлення обліковувати окремо від незмінного cancelled test order. Не змінювати checkout/payment jobs або Environment Variables заради QA.
5. **Schema first.** Після дозволу `neondb_owner` застосовує весь `release/batch-1.8a-color-images.sql` через verified direct TLS connection, нову psql session з `-X`, `ON_ERROR_STOP=1` і session setting `batch18a.reviewed_execution='color-images-reviewed'`. Sentinel не перевіряє target/backup/hash замість оператора. Немає потреби в `prisma migrate`, `db push` чи Vercel env changes. При timeout/error зупинитися; за невідомого COMMIT outcome спочатку read-only перевірити schema, без сліпого retry. Повторний запуск можливий тільки після підтвердження повного rollback і усунення blockers.
6. **Post-migration gate.** Виконати погоджений verify SQL плюс missing identity/ACL/protected-record checks у repeatable-read snapshot. Verify artifact сам лише виводить результати, тож оператор явно перевіряє pass/fail: nullable TEXT без default; valid index; validated FK з правильними delete/update/deferrability; exact enabled image triggers/function definitions; invalid links=0; до QA scoped photos=0. Перевірити new-column SELECT/INSERT/UPDATE та Product epoch UPDATE для `app_3dkid`, без додаткових DDL/order mutation прав. Порівняти before/after image IDs/URLs/order/alt, product relations, inactive `test` і cancelled order/items. Будь-яка неочікувана різниця блокує deploy. Жодного data backfill.
7. **Application rollout.** Лише після expansion/postflight і окремого дозволу push/merge/deploy погоджений commit; це стосується й push, який автоматично запускає deployment проти shared DB. Новий Prisma binary читає `colorValueId` і не може запускатися до expansion. Cleanup та існуючі variant flags не змінювати. Дочекатися Ready і перевірити, що deployment дійсно використовує `app_3dkid`.
8. **Production-only QA власником.** Власник сам тимчасово активує вже наявний `/product/test`, виконує checklist нижче й деактивує його після тесту або при першій помилці. Agent у цій роботі цього не робить. Окремий Production fixture не створювати, Preview QA не вимагати. Після QA прибрати тільки тестові локальні cart lines, переконатися в деактивації, незмінності захищених IDs/URLs/orders, зберегти operator evidence та відновити normal Admin writes із перезавантаженими формами. Blob cleanup не активувати.

### Manual QA існуючого `test` — виконує власник після rollout

- До активації зберегти ID/slug, active/orderable flags, epoch, усі image IDs/URLs/order/alt/scope та color/size/variant IDs, ціни й availability. Зафіксувати cancelled Order/OrderItems; не відкривати дії зміни/скасування/оплати замовлень. Перед manual QA `test` усе ще inactive і відсутній у storefront.
- Власник тимчасово вмикає active для цього самого product ID; orderable змінює лише за погодженим QA планом. Не створювати інший товар, не переписувати SKU/ціни/комбінації та не перевидавати IDs. Для gallery QA використовувати наявні image records/URLs: залишити universal, тимчасово призначити фото існуючим Pink/Blue IDs і записати всі погоджені зміни. Не видаляти існуючі фото/Blob assets. Якщо фото недостатньо, зупинити відповідний пункт до погодження потрібних fixture-only змін.
- Перевірити UA/EN на mobile/desktop: Pink+Small=199, Pink+Medium=249, Blue без size — від 279, Blue+Medium=279; Blue+Large=349 unavailable, Blue+Small відсутній. Зміна кольору очищає несумісний size і перемикає scoped primary; universal доступні один раз. Manual arrows/thumbnail/swipe не скидаються від size/quantity; lightbox/zoom/keyboard/focus і реальний GIF працюють.
- Тимчасово залишити Blue без scoped фото через universal reassignment тих самих image records: detail/cart дають universal fallback; повернути scope на той самий color ID. Зберегти/reload/re-save, reorder color primary і перевірити незмінність IDs/URLs. У двох Admin tabs перше Save проходить, друге отримує stale із збереженим draft; не обходити revision.
- На fixture-only даних тимчасово retire Pink із відповідними combinations: refs зберігаються, старий cart line unavailable і використовує universal/placeholder. Restore ті самі values/combinations — повертається той самий primary та selection identity. Для SIMPLE conversion спочатку погоджено retire всі несумісні rows; scoped-first фото не стає default у detail/cart. Повернути початкову COLOR_SIZE configuration шляхом restore наявних IDs; не створювати replacement values/variants. Якщо ці зміни не погоджені власником — залишити пункт pending, локальні regression tests уже покривають його.
- Кошик: дві різні combinations не зливаються, server reconciliation повертає відповідний primary, page reload/persistence не довіряють arbitrary URL. Не натискати checkout/order submit, не створювати нового замовлення, не викликати Mono або інші payments.
- У finally власник деактивує `test` навіть якщо QA впав, повертає початкові погоджені flags/gallery scopes/order/configuration, зберігаючи image/value/variant IDs та URL. Epoch/updatedAt закономірно збільшуються через Save; їх не переписувати назад. Якщо погоджено залишити нові scopes як fixture data, записати це як явний QA delta. Перевірити public unavailable, cancelled Order/OrderItems без змін, cleanup disabled; нічого не hard-delete.

Фактичні release gates після локальних fixes: current Production identity/ACL/guard preflight, свіжий backup+успішний isolated restore сумісною процедурою, operator approval міграції/deployment та owner-run Production QA. Наявного local functional blocker не виявлено. Точні live ACL і Production media/QA тут не перевірялися.

Rollback: якщо expansion-транзакція не завершилася — PostgreSQL відкочує її всю; перевірити відсутність нового column/triggers, потім усунути причину. Якщо schema вже expanded, але application має проблему — повернути попередній погоджений binary, **залишивши nullable column/FK/triggers і всі прив’язки**, зупинивши admin writes до розбору. Старий binary ігнорує нове поле; native Color+Size і image IDs лишаються. Після виправлення виконати forward recovery новим binary та повторити QA. Не скидати links у NULL і не відновлювати весь backup поверх нових замовлень.

Фізична contraction можлива тільки після повернення старого binary і тільки якщо scoped links ніколи не використовувалися/їх немає. Окремо погоджений rollback SQL бере exclusive image lock і відмовляється працювати за наявності хоча б одного non-null `colorValueId`. Автоматичного стирання links не передбачено. Якщо links уже є, використовувати forward recovery; видалення поля — окрема міграція після приватного експорту й явного погодження збереження даних.

## Файли цього batch

| Файли | Призначення |
|---|---|
| `prisma/schema.prisma` | Nullable COLOR image FK/reverse relation/index |
| `src/lib/gallery.ts` | ProductPhoto scope, snapshot, color ordering/fallback |
| `src/lib/product-gallery-admin.ts` | Draft-key resolution, ownership/kind/retired checks, stable sync |
| `src/lib/product-configuration-admin.ts` | Return saved value-ID map |
| `src/lib/actions/products.ts` | Configuration before gallery in one transaction, scoped snapshots |
| `src/lib/admin-form-validation.ts`, `src/lib/i18n.ts` | Central UA/EN fields/help/errors |
| `src/components/admin/product-form.tsx`, `variant-editor.tsx`, `gallery-editor.tsx` | Shared draft, scope select, per-color primary |
| `src/app/admin/products/[id]/edit/page.tsx` | Persisted scope props |
| `src/components/product/product-selection.tsx` | Page-local selection/gallery context |
| `src/components/product/product-gallery.tsx` | Color-only reset around existing gallery |
| `src/components/product/native-product-options.tsx` | Selected-parameter price and cart image |
| `src/app/(shop)/product/[slug]/page.tsx` | Shared provider, public active-color image projection |
| `src/lib/actions/reconcile-cart.ts`, `src/lib/cart-reconciliation.ts` | Bounded authoritative color media lookup |
| `scripts/source-module.ts`, `scripts/verify-cart-drawer.ts` | Existing isolated harness support |
| `scripts/fixtures/batch18a-baseline.sql`, `batch18a-data.ts`, `batch18a-browser.tsx` | Synthetic catalog/price/gallery/browser fixtures |
| `scripts/rehearse-batch18a-color-images.mjs`, `scripts/verify-batch18a-postgres.ts` | Owned PG cluster, actual action/DB integration |
| `scripts/fixtures/batch18a-runtime-role.sql`, `scripts/verify-batch18a-runtime-role.ts`, `scripts/verify-batch18a-cart-images.ts` | Restricted-role profile/negative controls і cart fallback regressions |
| `docs/release/batch-1.8a-color-images.sql`, `batch-1.8a-color-images-rollback.sql`, `batch-1.8a-color-images-verify.sql` | Exact expansion/contraction/verification artifacts |
| `docs/batch-1.8a-color-images-price.md` | Цей звіт, QA, ризики й контрольований rollout |

## Точний список файлів для Batch 1.8A commit

31 файл; виключає всі 20 pre-existing deletions. Це manifest для review, не інструкція staging/commit у поточній роботі.

```text
docs/batch-1.8a-color-images-price.md
docs/release/batch-1.8a-color-images-rollback.sql
docs/release/batch-1.8a-color-images-verify.sql
docs/release/batch-1.8a-color-images.sql
prisma/schema.prisma
scripts/fixtures/batch18a-baseline.sql
scripts/fixtures/batch18a-browser.tsx
scripts/fixtures/batch18a-data.ts
scripts/fixtures/batch18a-runtime-role.sql
scripts/rehearse-batch18a-color-images.mjs
scripts/source-module.ts
scripts/verify-batch18a-cart-images.ts
scripts/verify-batch18a-postgres.ts
scripts/verify-batch18a-runtime-role.ts
scripts/verify-cart-drawer.ts
src/app/(shop)/product/[slug]/page.tsx
src/app/admin/products/[id]/edit/page.tsx
src/components/admin/gallery-editor.tsx
src/components/admin/product-form.tsx
src/components/admin/variant-editor.tsx
src/components/product/native-product-options.tsx
src/components/product/product-gallery.tsx
src/components/product/product-selection.tsx
src/lib/actions/products.ts
src/lib/actions/reconcile-cart.ts
src/lib/admin-form-validation.ts
src/lib/cart-reconciliation.ts
src/lib/gallery.ts
src/lib/i18n.ts
src/lib/product-configuration-admin.ts
src/lib/product-gallery-admin.ts
```
