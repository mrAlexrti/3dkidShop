# GPT Agent + Codex через GitHub для проекта 3dkidShop

## Цель

Настроить безопасный процесс разработки, где:

- `main` остается стабильной production-веткой.
- GPT выступает как постановщик задач, архитектор и ревьюер.
- Codex выполняет задачи в отдельных ветках.
- Все изменения проходят через GitHub Issue и Pull Request.
- Production не меняется, пока владелец проекта вручную не примет PR.

---

## Текущий контекст проекта

Проект: `3dkidShop`  
GitHub: `mrAlexrti/3dkidShop`  
Тип проекта: интернет-магазин 3D-печатных товаров  
Стек: Next.js, React, Tailwind, Prisma, PostgreSQL, Vercel

Текущая production-ветка:

```text
main
```

Рабочие/экспериментальные ветки, которые уже встречались:

```text
audit-fix-all
claude-patch-v3
redesign-3dkid-v2
```

Рекомендованная схема:

```text
main                  → Production
codex/task-001        → задача Codex
codex/task-002        → следующая задача Codex
redesign-3dkid-v2     → экспериментальный редизайн / Preview
```

---

## Главный принцип безопасности

Codex и любые AI-агенты не должны работать напрямую с `main`.

Запрещено:

```text
git push origin main
git merge ... в main без Pull Request
force push
изменение .env / production secrets
удаление веток
```

Разрешено:

```text
создавать отдельные ветки
коммитить в task-ветки
создавать Pull Request
исправлять замечания в той же task-ветке
```

---

## Роли

### Пользователь

Принимает финальное решение:

- какую задачу запускать;
- принимать ли Pull Request;
- выкатывать ли изменения в production.

### GPT Agent

Роль: тимлид, аналитик, постановщик задач и ревьюер.

Задачи GPT:

1. Разобрать пожелание пользователя.
2. Сформировать GitHub Issue для Codex.
3. Указать ограничения: какие файлы можно менять, какие нельзя.
4. После работы Codex проверить Pull Request.
5. Найти риски, лишние изменения и возможные поломки.
6. Сформировать список правок для Codex, если PR плохой.
7. Дать финальную рекомендацию: можно мержить или нет.

GPT не должен без необходимости писать большой код вместо Codex.

### Codex

Роль: исполнитель.

Задачи Codex:

1. Взять GitHub Issue.
2. Создать отдельную ветку.
3. Внести изменения.
4. Проверить сборку.
5. Сделать коммит.
6. Открыть Pull Request.

---

## Настройка защиты ветки main

GitHub:

```text
Repository → Settings → Branches → Add branch protection rule
```

Branch name pattern:

```text
main
```

Минимально включить:

```text
Require a pull request before merging
```

Пока НЕ включать, если работаешь один:

```text
Require approvals
```

Пока НЕ включать, если нет настроенных проверок:

```text
Require status checks to pass before merging
```

Когда появятся Vercel/GitHub Actions checks, можно включить:

```text
Require status checks to pass before merging
```

---

## Рекомендуемая структура веток

Для каждой задачи создавать отдельную ветку:

```text
codex/<short-task-name>
```

Примеры:

```text
codex/product-card-redesign
codex/checkout-validation-fix
codex/nova-poshta-branch-selector
codex/mobile-header-cleanup
```

Не использовать одну вечную ветку для всего подряд. Иначе будет каша, а не разработка.

---

## Файл AGENTS.md

Создать в корне проекта файл:

```text
AGENTS.md
```

Содержимое:

```md
# Agent Rules for 3dkidShop

## Project

This repository contains a production Next.js storefront for a 3D printing shop.

Tech stack:
- Next.js
- React
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL
- Vercel

## Branch rules

- Never work directly on `main`.
- Never push directly to `main`.
- Never force push.
- Never delete branches.
- Always create a dedicated branch for each task using this pattern:
  - `codex/<short-task-name>`
- All production changes must go through Pull Request.

## Safety rules

Do not modify unless explicitly requested:

- `.env`
- `.env.local`
- `.env.production`
- production secrets
- Prisma schema or migrations
- checkout/payment logic
- deployment configuration
- package manager lock files

If a task requires changing any of the above, explain why before making changes.

## Before editing

Run:

```bash
git status
git branch
```

Confirm that the active branch is not `main`.

## Development rules

- Keep changes minimal and focused on the task.
- Preserve existing business logic.
- Do not rewrite unrelated components.
- Do not introduce new dependencies unless clearly justified.
- Prefer reusable components.
- Keep Tailwind classes readable.
- Preserve Ukrainian storefront localization unless the task says otherwise.

## Validation

Before opening a Pull Request, run:

```bash
npm run build
```

If available, also run:

```bash
npm run lint
```

## Pull Request requirements

Every PR must include:

- What was changed.
- Why it was changed.
- Files touched.
- How it was tested.
- Risks or known limitations.
```

---

## Шаблон Issue для Codex

Использовать такой формат:

```md
# Task: <короткое название задачи>

## Context

Project: 3dkidShop  
Stack: Next.js, React, Tailwind, Prisma, PostgreSQL, Vercel  
Production branch: `main`  
Work branch: `codex/<task-name>`

Do not work on `main`.

## Goal

<Что нужно сделать простыми словами>

## Scope

Allowed to change:

- <file or folder>
- <file or folder>

Do not change:

- `.env*`
- `prisma/*`, unless explicitly required
- checkout/payment logic, unless explicitly required
- unrelated pages/components
- deployment settings

## Requirements

- <конкретное требование 1>
- <конкретное требование 2>
- <конкретное требование 3>

## UI/UX notes

- Preserve current visual identity unless task says otherwise.
- Must work correctly on mobile and desktop.
- Avoid layout jumps.
- Keep Ukrainian text and storefront localization.

## Validation

Before opening PR:

```bash
npm run build
```

If available:

```bash
npm run lint
```

## Pull Request

Create a Pull Request into `main`.

PR description must include:

- Summary of changes.
- Files changed.
- Testing result.
- Screenshots or Vercel Preview link if UI was changed.
- Risks / limitations.
```

---

## Шаблон промпта для GPT перед созданием Issue

```text
Ты технический лид проекта 3dkidShop.

Сформируй GitHub Issue для Codex.

Проект: Next.js интернет-магазин 3D-печатных товаров.
Production ветка: main.
Codex должен работать только в отдельной ветке codex/<task-name>.

Задача пользователя:
<описание задачи>

Нужно:
1. Сформировать четкое ТЗ.
2. Указать файлы/папки, которые можно менять.
3. Указать, что нельзя менять.
4. Добавить проверки перед PR.
5. Добавить критерии приемки.
6. Не давать Codex переписывать весь проект без необходимости.
```

---

## Шаблон ревью Pull Request от GPT

```text
Ты ревьюер проекта 3dkidShop.

Проверь Pull Request от Codex.

Контекст:
- production branch: main
- PR branch: <branch>
- задача: <issue/task>

Проверь:
1. Соответствует ли PR задаче.
2. Нет ли лишних изменений.
3. Не изменены ли .env, Prisma, checkout/payment/API без необходимости.
4. Не сломана ли структура Next.js.
5. Нет ли очевидных багов в React/TypeScript.
6. Нет ли проблем с адаптивностью.
7. Нормально ли выглядит UX.
8. Прошел ли npm run build.
9. Можно ли мержить PR.

Вывод дай в формате:

- Verdict: APPROVE / REQUEST CHANGES / REJECT
- Main problems
- Minor problems
- What to ask Codex to fix
- Merge recommendation
```

---

## Ручной workflow без автоматизации

Самый простой рабочий вариант:

1. Пользователь пишет задачу GPT.
2. GPT готовит Issue-текст.
3. Пользователь создает Issue на GitHub.
4. Codex берет Issue и делает PR.
5. Пользователь присылает GPT ссылку на PR или diff.
6. GPT делает ревью.
7. Пользователь решает: мержить или отправить на доработку.

---

## Полуавтоматический workflow через GitHub

Если GPT имеет доступ к GitHub:

1. GPT создает Issue.
2. Codex работает по Issue.
3. Codex открывает PR.
4. GPT читает PR diff.
5. GPT оставляет review comment или готовит список правок.
6. Пользователь подтверждает merge.

---

## Проверочные команды

Перед началом работы:

```bash
git status
git branch
git pull origin main
```

Создать ветку вручную:

```bash
git checkout main
git pull origin main
git checkout -b codex/<task-name>
git push -u origin codex/<task-name>
```

Посмотреть изменения ветки относительно main:

```bash
git diff main...codex/<task-name>
```

Проверить сборку:

```bash
npm run build
```

---

## Что делать, если PR не понравился

Не мержить.

Варианты:

```text
1. Оставить комментарии в PR.
2. Попросить Codex исправить в той же ветке.
3. Закрыть PR.
4. Удалить ветку.
```

Production не изменится, пока PR не попадет в `main`.

---

## Что делать, если Codex испортил ветку

Если ветка не нужна:

```bash
git push origin --delete codex/<task-name>
```

Локально:

```bash
git branch -D codex/<task-name>
```

Если нужно откатить последний коммит в ветке:

```bash
git revert <commit_hash>
```

Не использовать `force push`, если не понимаешь последствия.

---

## Рекомендованный первый тест

Сначала дать Codex маленькую безопасную задачу.

Пример:

```text
Улучшить визуальное состояние кнопки "Купить" на карточке товара.
Не менять корзину, API, Prisma, checkout и package.json.
```

Так можно проверить весь процесс: Issue → Codex → PR → Vercel Preview → GPT Review.

---

## Короткий итог

Правильная схема:

```text
Пользователь
  ↓
GPT формирует Issue
  ↓
GitHub Issue
  ↓
Codex делает branch + PR
  ↓
Vercel Preview
  ↓
GPT ревьюит PR
  ↓
Пользователь мержит или отклоняет
```

Это безопаснее, чем давать агенту напрямую менять production.
