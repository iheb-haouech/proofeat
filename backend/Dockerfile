# Étape build (Debian, pas Alpine)
FROM node:20 AS build

WORKDIR /app

# Dépendances backend
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

# Code backend
COPY . .
RUN npx prisma generate

# Étape runtime
FROM node:20 AS runtime

WORKDIR /app
ENV NODE_ENV=production

# On récupère tout du build (code + node_modules + prisma)
COPY --from=build /app .

EXPOSE 5000
CMD ["node", "index.js"]