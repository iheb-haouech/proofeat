require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
prisma.$connect()
  .then(() => {
    console.log("DB_OK");
    return prisma.$disconnect();
  })
  .catch((e) => {
    console.log("DB_ERR", e.message);
    process.exit(1);
  });
