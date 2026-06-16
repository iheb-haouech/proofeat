#!/bin/sh
echo "Running database migrations..."
npx prisma migrate deploy || echo "Migration warning, continuing..."
exec node index.js