const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function ensureSuperAdmin() {
  const email = "superadmin@proofeat.cloud";
  const plainPassword = "12345678";

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (!existing) {
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: "Super Admin",
        role: "SUPERADMIN",
      },
    });

    console.log("Superadmin created:", email);
    return;
  }

  if (existing.role !== "SUPERADMIN") {
    await prisma.user.update({
      where: { email },
      data: {
        role: "SUPERADMIN",
        name: existing.name || "Super Admin",
      },
    });

    console.log("Existing user upgraded to SUPERADMIN:", email);
  } else {
    console.log("Superadmin already exists:", email);
  }
}

module.exports = ensureSuperAdmin;