FROM node:20-alpine AS build
WORKDIR /app

# 1) Copier les fichiers du backend AVANT npm ci
COPY package*.json ./
COPY . .

# 2) Installer les deps (postinstall Prisma verra déjà prisma/schema.prisma)
RUN npm ci

# 3) (Optionnel) générer Prisma explicitement
RUN npx prisma generate

# 4) Nettoyer les deps de build
RUN rm -rf node_modules


FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app .

EXPOSE 5000
CMD ["node", "index.js"]