# npp-backend

NestJS + GraphQL API для платформы NPPWEB. Сервис хранит пользователей, сессии, источники, source runs, закупки и отчёты, а также принимает ingest от `processing-worker`.

## Что нужно для запуска

Минимально нужны переменные:

- `DATABASE_URL`
- `REDIS_URL`
- `RABBITMQ_URL`
- `JWT_ACCESS_SECRET`
- `INGEST_API_TOKEN`

Готовый пример окружения удобнее брать из [`infra/.env.example`](/home/minkin/vkrdiff/infra/.env.example).

## Локальный запуск

Поднять зависимости через Docker:

```bash
cd ../infra
cp .env.example .env
docker compose --env-file .env -f docker-compose.yml -f docker-compose.apps.yml up -d postgres redis rabbitmq minio minio-init
```

Запустить backend:

```bash
cd ../npp-backend
npm install
npm run db:setup
npm run start:dev
```

Endpoints по умолчанию:

- health: `http://localhost:3000/api/health`
- ready: `http://localhost:3000/api/health/ready`
- GraphQL: `http://localhost:3000/graphql`

## Seed-данные

Seed идемпотентный и безопасно запускается повторно.

- admin: `admin@admin.ru / 12345678`
- analyst: `analyst@admin.ru / 12345678`
- user: `user@admin.ru / 12345678`

## Prisma

```bash
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:db:seed
```

## Auth flow

- `login` выдаёт `accessToken` и `refreshToken`.
- `refreshSession` перевыпускает пару токенов и ревокает старую refresh-сессию.
- `logout` завершает текущую server-side сессию.
- `accessToken` привязан к `UserSession`, поэтому после logout он становится невалидным по серверной логике.

Пример login:

```graphql
mutation {
  login(input: { email: "admin@admin.ru", password: "12345678" }) {
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

`processing-worker` вызывает mutation `ingestNormalizedItem`.

- JWT для ingest не нужен.
- обязательная авторизация идёт через заголовок `x-ingest-token`.
- `x-ingest-token` должен совпадать с `INGEST_API_TOKEN`.

## Проверка качества

```bash
npm run check
npm run test
npm run build
```
