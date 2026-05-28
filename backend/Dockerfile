FROM node:20-alpine AS build

WORKDIR /app

# Copier les fichiers nécessaires pour installer les deps
COPY package*.json ./
COPY prisma ./prisma

# Installer les dépendances (prod uniquement) :
# le postinstall Prisma tourne ici, et trouve bien prisma/schema.prisma
RUN npm ci --omit=dev

# Copier le reste du code du backend
COPY . .

# (Optionnel, si tu as un build TypeScript ou autre)
# RUN npm run build

# Générer explicitement le client Prisma (si besoin)
RUN npx prisma generate


FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# On récupère le code + node_modules + prisma généré depuis l'étape build
COPY --from=build /app .

EXPOSE 5000
CMD ["node", "index.js"]