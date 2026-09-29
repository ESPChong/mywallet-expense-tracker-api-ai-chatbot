#!/bin/sh
set -e

: "${DATABASE_URL:?DATABASE_URL is required}"

# Idempotent schema push, retried to ride out replica-set election lag.
echo ">> Applying database schema (idempotent)..."
n=0
until npx prisma db push --skip-generate; do
  n=$((n+1))
  if [ "$n" -ge 10 ]; then
    echo ">> Failed to apply database schema after 10 attempts" >&2
    exit 1
  fi
  echo ">> Database not ready yet, retrying in 3s..."
  sleep 3
done

echo ">> Starting server on port ${PORT:-3000}"
exec npx next start -p "${PORT:-3000}"