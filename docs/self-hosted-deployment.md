# IPAM — перенос на корпоративный сервер (self-hosted)

Дата: 24 августа 2026

Целевой сервер: Ubuntu Server, 8 vCPU / 16 ГБ ОЗУ / 300 ГБ диска, доступен только из корпоративной сети (без публичного домена и SSL).

Этого более чем достаточно: официальный минимум для self-hosted Supabase — 4 ГБ ОЗУ / 2 CPU, рекомендуемый — 8 ГБ+ / 4 CPU+. С учётом Next.js-приложения и запаса под бэкапы 16/8/300 — комфортный запас.

## Итоговая архитектура

Всё переезжает на один сервер, полностью независимо от облака:

- **PostgreSQL** — свой, поднимается в Docker вместе с остальным self-hosted Supabase-стеком.
- **Supabase Auth (GoTrue)** — тоже в Docker, тот же стек. Логика логина/сессий в приложении (`@supabase/supabase-js`, `@supabase/ssr`) не меняется вообще — меняется только URL, на который она смотрит.
- **Next.js-приложение** — собирается и работает через PM2 прямо на хосте (не в Docker) — самый простой и предсказуемый вариант, без своего Dockerfile и реестра образов.
- **Nginx** — обратный прокси на 80-м порту внутри сети, чтобы коллеги заходили по имени сервера без порта `:3000`.
- **GitHub остаётся** системой версионирования — тот же репозиторий, тот же push через GitHub Desktop. Автодеплой обеспечивает **self-hosted GitHub Actions runner**, установленный прямо на этом сервере: он сам открывает исходящее соединение к GitHub, поэтому во внутреннюю сеть ничего пробрасывать не нужно.

```
GitHub (push в main)
        │  (исходящее соединение от runner'а к GitHub, ничего не открываем наружу)
        ▼
┌─────────────────────────── Ubuntu-сервер ───────────────────────────┐
│                                                                       │
│  GitHub Actions runner (systemd) → git pull, build, pm2 restart     │
│                                                                       │
│  Nginx :80  →  Next.js (PM2) :3000  →  Postgres :5432 (localhost)   │
│                        │                                             │
│                        └──────────────→  Supabase Auth :8000/auth   │
│                                          (Docker, тот же стек)       │
└───────────────────────────────────────────────────────────────────┘
```

## Что нужно подготовить заранее

- SSH-доступ на сервер с правами `sudo`.
- IP-адрес или внутреннее имя сервера (например `ipam.corp.local` или просто IP).
- В GitHub-репозитории `ipam-system`: Settings → Actions → Runners → возможность создать новый self-hosted runner (нужны права администратора репозитория).
- Строка подключения к текущей БД в Supabase Cloud (Settings → Database → Connection string) — понадобится только один раз, для переноса данных.

## Порядок работы

Ниже — 9 этапов. Рекомендую проходить по одному и присылать мне вывод команд/ошибки на каждом шаге, как мы делали со всеми фичами — так безопаснее, чем настраивать всё разом и потом искать, что именно сломалось.

1. Подготовка сервера
2. Self-hosted Supabase (Postgres + Auth) в Docker
3. Применение схемы Prisma к новой БД
4. Перенос данных
5. Сборка и запуск приложения через PM2
6. Nginx как обратный прокси
7. Автодеплой: self-hosted GitHub Actions runner
8. Резервное копирование БД
9. Финальная проверка и переключение

---

## Этап 1. Подготовка сервера

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git ufw

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# после этого нужно перелогиниться (или выполнить `newgrp docker`), чтобы группа применилась

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 — держит Next.js запущенным и перезапускает при падении/перезагрузке сервера
sudo npm install -g pm2
pm2 startup systemd
# команда выше напечатает ещё одну команду с sudo — её нужно скопировать и выполнить отдельно

# Nginx
sudo apt install -y nginx
```

Firewall — раз доступ только из корпоративной сети, наружу открываем по минимуму:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw enable
```

Порты 3000 (Next.js), 5432 (Postgres) и 8000 (Supabase Auth/Kong) наружу **не открываем** — они остаются доступны только на самом сервере (`localhost`), наружу смотрит только Nginx на 80-м.

---

## Этап 2. Self-hosted Supabase (Postgres + Auth)

```bash
git clone --depth 1 https://github.com/supabase/supabase
cp -rf supabase/docker/. ~/ipam-supabase
cd ~/ipam-supabase
cp .env.example .env
sh utils/generate-keys.sh   # генерирует пароль Postgres, JWT secret и ключи API прямо в .env
```

В `.env` нужно проверить/поправить:

- `SITE_URL` — `http://<ip-или-имя-сервера>` (на этот адрес Auth будет строить ссылки, например для сброса пароля).
- `API_EXTERNAL_URL` — `http://<ip-или-имя-сервера>:8000`
- `SUPABASE_PUBLIC_URL` — `http://<ip-или-имя-сервера>:8000`
- `DISABLE_SIGNUP=true` — в приложении и так нет самостоятельной регистрации, пользователей заводит Admin через страницу Users.
- `SMTP_*` — можно оставить пустыми. Приглашения на странице Users в приложении и так генерируются в виде ссылки без отправки почты (это мы уже сделали раньше) — реальный SMTP нужен только если захотите, чтобы Supabase Auth сам слал письма сброса пароля.

По умолчанию в стек входит больше сервисов, чем реально использует приложение (оно нигде не обращается к Supabase Storage или Realtime — только к Auth, а к БД идёт напрямую через Prisma). Для первого запуска можно оставить всё как есть — 16 ГБ с запасом хватает на весь стек. Если позже захотите освободить ресурсы, самые тяжёлые и необязательные для этого приложения сервисы — Analytics (Logflare) и Storage/imgproxy/Realtime — можно убрать из `docker-compose.yml`, ничего в приложении от этого не сломается.

Запуск:

```bash
sh run.sh start
docker compose ps    # в течение минуты все сервисы должны быть "healthy"
curl http://localhost:8000/auth/v1/health   # должен ответить {"date":...} или похожий JSON
```

Пароль от Postgres и остальные секреты в любой момент можно посмотреть командой:

```bash
sh run.sh secrets
```

---

## Этап 3. Применение схемы Prisma к новой БД

```bash
git clone https://github.com/samatkaldykozov/ipam-system.git ~/ipam-system
cd ~/ipam-system
npm ci
```

Создайте `.env.production` (или `.env`) с адресом уже своей, локальной базы:

```env
DATABASE_URL=postgresql://postgres:<ПАРОЛЬ_ИЗ_ШАГА_2>@localhost:5432/postgres?connection_limit=10
DIRECT_URL=postgresql://postgres:<ПАРОЛЬ_ИЗ_ШАГА_2>@localhost:5432/postgres

NEXT_PUBLIC_SUPABASE_URL=http://<ip-или-имя-сервера>:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON/PUBLISHABLE KEY из шага 2 (sh run.sh secrets)>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE ROLE/SECRET KEY из шага 2>
```

Обратите внимание на `connection_limit=10` вместо `1` — важный момент, см. отдельный раздел в конце документа про то, почему теперь можно (и нужно) поднять этот лимит.

```bash
npx prisma migrate deploy
```

Это создаст все таблицы приложения (Network, IpAddress, Location, User, Role, AuditLog и т.д.) с нуля, используя уже существующую историю миграций из репозитория — трогать служебные схемы Supabase (`auth`, `storage` и т.п.) для этого не требуется вообще.

---

## Этап 4. Перенос данных

Тут два независимых куска: (а) данные самого приложения и (б) учётные записи пользователей в Supabase Auth.

### (а) Данные приложения

Самый безопасный вариант — выгрузить точечно только свои таблицы, не трогая внутренние схемы Supabase (так не будет проблем совместимости версий Postgres или расширений между Cloud и self-hosted):

```bash
# Там, где есть доступ к текущей Supabase Cloud БД (например, отсюда, из этой сессии):
pg_dump "<строка подключения к Supabase Cloud>" \
  --data-only --column-inserts \
  -t public.\"Network\" -t public.\"IpAddress\" -t public.\"Location\" \
  -t public.\"User\" -t public.\"Role\" -t public.\"AuditLog\" \
  -f ipam-data.sql

# Дальше файл ipam-data.sql переносится на сервер и применяется к новой локальной БД:
psql "postgresql://postgres:<ПАРОЛЬ>@localhost:5432/postgres" -f ipam-data.sql
```

`--column-inserts` делает дамп в виде читаемых `INSERT`-строк — если что-то придётся поправить руками перед применением, это легко сделать в текстовом редакторе, в отличие от бинарного/COPY-формата.

### (б) Пользователи Supabase Auth

Официальный способ — выгрузить `auth.users`/`auth.identities`, но у него есть нюансы (хэши паролей и JWT secret должны быть совместимы между Cloud и self-hosted, иначе часть данных не перенесётся корректно). Учитывая, что в внутреннем IPAM-инструменте пользователей немного (Admin/Network Engineer/Viewer — по факту несколько человек), проще и надёжнее **не переносить их, а завести заново**:

1. После переезда зайдите на новый инстанс под Admin.
2. На странице `/users` пригласите тех же людей заново (та же кнопка, что и сейчас — генерирует ссылку-приглашение).
3. Каждый по ссылке задаёт себе новый пароль.

Если пользователей много и это неудобно — есть официальный путь через дамп `auth.users`/`auth.identities` (описан в документации Supabase, ссылка внизу), но это сложнее и рискованнее для первого переезда; напишите мне, если понадобится этот вариант, пройдём отдельно.

---

## Этап 5. Сборка и запуск приложения через PM2

```bash
cd ~/ipam-system
npm run build
pm2 start npm --name ipam-system -- start
pm2 save
```

Проверка:

```bash
curl -I http://localhost:3000
```

---

## Этап 6. Nginx как обратный прокси

`/etc/nginx/sites-available/ipam-system`:

```nginx
server {
    listen 80;
    server_name ipam.corp.local;   # или просто IP сервера

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ipam-system /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Коллеги заходят по `http://<ip-или-имя-сервера>/` — без порта. Если позже понадобится HTTPS даже без публичного домена (самоподписанный сертификат или сертификат от внутреннего корпоративного CA) — скажите, отдельно настроим, сейчас не делал, раз договорились, что нужен только внутренний доступ.

---

## Этап 7. Автодеплой: self-hosted GitHub Actions runner

Раз сервер недоступен снаружи, обычные (облачные) GitHub Actions runner'ы до него не достучатся. Решение — поставить runner прямо на сервер: он сам открывает исходящее соединение к GitHub, поэтому пробрасывать ничего не нужно.

1. В репозитории: Settings → Actions → Runners → **New self-hosted runner** → Linux, x64. GitHub покажет команды с одноразовым токеном — выполните их на сервере, например:

```bash
mkdir ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-linux-x64.tar.gz -L https://github.com/actions/runner/releases/download/<версия>/actions-runner-linux-x64-<версия>.tar.gz
tar xzf actions-runner-linux-x64.tar.gz
./config.sh --url https://github.com/samatkaldykozov/ipam-system --token <ТОКЕН_ИЗ_GITHUB>
sudo ./svc.sh install
sudo ./svc.sh start
```

(`svc.sh install` регистрирует runner как systemd-сервис — он будет автоматически подниматься после перезагрузки сервера и постоянно слушать задания от GitHub.)

2. В репозитории добавьте `.github/workflows/deploy.yml`:

```yaml
name: Deploy to on-prem server
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - run: npm run build
      - run: pm2 restart ipam-system
```

3. В Settings → Secrets and variables → Actions добавьте секрет `DATABASE_URL` (то же значение, что и в `.env.production` на сервере) — он нужен, чтобы `prisma migrate deploy` мог применять будущие миграции прямо во время деплоя.

После этого каждый push в `main` через GitHub Desktop, как и раньше, сам пересоберёт и перезапустит приложение — только теперь на своём сервере вместо Vercel.

---

## Этап 8. Резервное копирование БД

Раньше бэкапы делал Supabase Cloud, теперь это тоже на вас:

```bash
sudo mkdir -p /var/backups/ipam-db
sudo tee /etc/cron.daily/ipam-db-backup > /dev/null <<'EOF'
#!/bin/bash
docker exec supabase-db pg_dump -U postgres postgres | gzip > /var/backups/ipam-db/ipam-$(date +%F).sql.gz
find /var/backups/ipam-db -mtime +14 -delete
EOF
sudo chmod +x /etc/cron.daily/ipam-db-backup
```

Имя контейнера (`supabase-db`) стоит проверить командой `docker compose ps` в `~/ipam-supabase` — оно может отличаться в зависимости от версии стека.

---

## Этап 9. Финальная проверка и переключение

- Дайте паре коллег потестировать новый адрес несколько дней, держа старый (Vercel + Supabase Cloud) как запасной вариант.
- Когда всё стабильно — сообщите всем новый внутренний адрес, переприглашение пользователей (см. Этап 4б), и можно останавливать проект на Vercel и на Supabase Cloud (или просто поставить Supabase Cloud на паузу на первое время, а не удалять сразу — так остаётся путь назад).

---

## Про лимит соединений с БД (наш прошлый инцидент)

21 августа Dashboard уже падал в проде из-за `connection_limit=1` — это было вынужденное ограничение специально под PgBouncer transaction-режим Supabase Cloud (`lib/prisma.ts` добавляет его автоматически, если строка подключения его не содержит явно). После переезда на свой сервер это ограничение **больше не нужно**: Prisma подключается к Postgres напрямую, без стороннего пулера, и сама база — не общая, а полностью ваша.

В `DATABASE_URL` на новом сервере лимит явно поднят до `connection_limit=10` (см. Этап 3) — это отменяет искусственное «одно соединение на всё приложение», из-за которого раньше случался таймаут `P2024`. Консолидацию запросов в `getDashboardData()` и обёртку `getCurrentUser()` в `cache()` трогать не нужно — это просто хорошая практика независимо от лимита, — но именно жёсткий потолок в 1 соединение, из-за которого был инцидент, теперь снят.

---

## Источники

- [Self-Hosting with Docker — Supabase Docs](https://supabase.com/docs/guides/self-hosting/docker)
- [supabase/docker README — GitHub](https://github.com/supabase/supabase/blob/master/docker/README.md)
- [Restore a Platform Project to Self-Hosted — Supabase Docs](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
