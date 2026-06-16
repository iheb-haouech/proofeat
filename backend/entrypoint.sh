#!/bin/sh
set -e
echo "Running database migrations..."
npx prisma migrate deploy || echo "Migration failed, continuing..."
exec node index.js