FROM node:20-alpine AS build

# Ajouter cette ligne
RUN apk add --no-cache openssl1.1-compat

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

COPY . .
RUN npx prisma generate


FROM node:20-alpine AS runtime

# Ajouter cette ligne aussi dans le runtime
RUN apk add --no-cache openssl1.1-compat

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app .

EXPOSE 5000
CMD ["node", "index.js"]