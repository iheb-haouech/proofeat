require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'ProofCamScan' ORDER BY ordinal_position`
  .then((rows) => {
    console.log("COLUMNS", JSON.stringify(rows, null, 2));
    return prisma.$disconnect();
  })
  .catch((e) => {
    console.log("ERR", e.message);
    process.exit(1);
  });
