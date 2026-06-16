FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
COPY . .
RUN npx prisma generate
RUN npx prisma migrate deploy

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prismaClient.js ./prismaClient.js
COPY --from=build /app/index.js ./index.js
COPY --from=build /app/routes ./routes
COPY --from=build /app/controllers ./controllers
COPY --from=build /app/middleware ./middleware
COPY --from=build /app/lib ./lib
COPY --from=build /app/utils ./utils
COPY --from=build /app/uploads ./uploads
COPY --from=build /app/processed ./processed
COPY --from=build /app/datasets ./datasets
COPY --from=build /app/stock-invoices ./stock-invoices
COPY --from=build /app/*.traineddata ./
RUN mkdir -p uploads processed datasets stock-invoices
EXPOSE 5000
CMD ["node", "index.js"]
