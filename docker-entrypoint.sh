#!/bin/sh
set -eu

attempt=1
max_attempts="${PRISMA_MIGRATE_ATTEMPTS:-30}"
delay_seconds="${PRISMA_MIGRATE_DELAY_SECONDS:-2}"

until npm run prisma:migrate; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Prisma migrations failed after ${attempt} attempts" >&2
    exit 1
  fi

  echo "Waiting for postgres before retrying Prisma migrations (${attempt}/${max_attempts})..."
  attempt=$((attempt + 1))
  sleep "${delay_seconds}"
done

npm run prisma:seed

exec node dist/main.js
