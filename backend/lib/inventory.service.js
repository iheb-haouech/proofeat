async function createProduct(prisma, user, data) {
  if (user.role !== "ADMIN") throw new Error("Unauthorized");

  return prisma.inventoryProduct.create({
    data: {
      name: data.name,
      price: Number(data.price),
      stockQuantity: Number(data.stockQuantity),
      stockUnit: data.stockUnit,
      alertThreshold: Number(data.alertThreshold),
      createdById: user.id,
    },
  });
}

async function addUsage(prisma, user, data) {
  const product = await prisma.inventoryProduct.findUnique({
    where: { id: Number(data.productId) },
  });

  if (!product) throw new Error("Produit introuvable");

  const quantity = Number(data.quantity);
  if (quantity <= 0) throw new Error("Quantité invalide");
  if (product.stockUnit !== data.unit) throw new Error("Unité invalide");
  if (product.stockQuantity < quantity) throw new Error("Stock insuffisant");

  const updated = await prisma.inventoryProduct.update({
    where: { id: product.id },
    data: {
      stockQuantity: {
        decrement: quantity,
      },
    },
  });

  await prisma.inventoryUsage.create({
    data: {
      productId: product.id,
      storeId: user.id,
      quantity,
      unit: data.unit,
    },
  });

  if (updated.stockQuantity <= updated.alertThreshold) {
    await prisma.stockAlert.create({
      data: {
        productId: updated.id,
        message: `Stock faible: ${updated.name} (${updated.stockQuantity} ${updated.stockUnit})`,
      },
    });
  }

  return updated;
}