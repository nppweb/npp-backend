# backend-api

NestJS + GraphQL API для доменной модели платформы мониторинга закупок. Сервис хранит пользователей, сессии, источники, source runs, закупки, отчеты и принимает ingest от `processing-worker`.

## Required env vars

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `INGEST_API_TOKEN`

Полный локальный пример лежит в [.env.example](/home/minkin/vkrdiff/backend-api/.env.example).

## Local dev seed

- admin: `admin@admin.ru`
- password: `admin`
- demo users: `analyst@admin.ru`, `user@admin.ru`
- password for demo users: `admin`

Seed идемпотентный и безопасно запускается повторно.

## Local run

```bash
cp .env.example .env
npm install
npm run db:setup
npm run start:dev
```

Если PostgreSQL нужен через Docker из общего infra-репозитория:

```bash
cd ../deployment-infra
cp .env.example .env
docker compose up -d postgres
cd ../backend-api
```

Endpoints по умолчанию:

- health: `http://localhost:3000/api/health`
- GraphQL: `http://localhost:3000/graphql`

## Prisma / migrations / seed

```bash
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:db:seed
```

## Auth flow

- `login` выдает `accessToken` и `refreshToken`
- `refreshSession` ревокает старую refresh-session и выдает новую пару токенов
- `logout` ревокает server-side `UserSession`
- access token теперь привязан к `UserSession`, поэтому после logout текущая сессия становится невалидной по серверной логике

Пример login:

```graphql
mutation {
  login(input: { email: "admin@admin.ru", password: "admin" }) {
    accessToken
    refreshToken
    expiresInSeconds
    user {
      email
      role
    }
  }
}
```

## Worker ingest

`processing-worker` вызывает GraphQL mutation `ingestNormalizedItem`.

- JWT для ingest не нужен
- mutation публичная только для обхода общего JWT guard
- обязательная авторизация идет через заголовок `x-ingest-token`
- значение `x-ingest-token` должно совпасть с `INGEST_API_TOKEN`

Пример:

```graphql
mutation Ingest($input: IngestNormalizedItemInput!) {
  ingestNormalizedItem(input: $input) {
    accepted
    idempotencyKey
    procurementId
  }
}
```

## Dashboard data

`dashboardSummary` отдает:

- `totalProcurements`
- `procurementsByStatus`
- `procurementsOverTime`
- `recentProcurements`
- `sourcesSummary`
- `recentSourceRuns`

Для админки дополнительно есть:

- `procurementItems`
- `procurementItem`
- `sources`
- `sourceRuns`
- `reports`
- `users`
