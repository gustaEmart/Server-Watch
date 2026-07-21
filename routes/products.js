export function createProductCatalogHandler({
  randomId,
  nowIso,
  readBody,
  sendJson,
  notFound,
  requireAdmin,
  listedProducts,
  normalizeProductName,
  addProduct,
  updateProduct,
  removeProduct,
  productUsageCount,
  scheduleSave,
  broadcastSnapshot
}) {
  const productKey = (value) => String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");

  return async function handleProductCatalog(req, res, { parts }) {
    if (!requireAdmin(req, res)) return true;

    if (req.method === "GET" && parts.length === 2) {
      return sendJson(res, 200, listedProducts());
    }

    if (req.method === "POST" && parts.length === 2) {
      const payload = await readBody(req);
      const name = normalizeProductName(payload.name);
      if (listedProducts().some((product) => productKey(product.name) === productKey(name))) {
        const error = new Error("Ja existe um produto com este nome no catalogo.");
        error.statusCode = 409;
        throw error;
      }
      const now = nowIso();
      const product = { id: randomId(), name, createdAt: now, updatedAt: now };
      addProduct(product);
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 201, product);
    }

    const id = String(parts[2] || "");
    const product = listedProducts().find((item) => item.id === id);
    if (!product) return notFound(res);

    if (req.method === "PUT" && parts.length === 3) {
      const payload = await readBody(req);
      const name = normalizeProductName(payload.name);
      if (listedProducts().some((item) => item.id !== product.id && productKey(item.name) === productKey(name))) {
        const error = new Error("Ja existe um produto com este nome no catalogo.");
        error.statusCode = 409;
        throw error;
      }
      const previousName = product.name;
      product.name = name;
      product.updatedAt = nowIso();
      updateProduct(product, previousName);
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, product);
    }

    if (req.method === "DELETE" && parts.length === 3) {
      const usage = productUsageCount(product.id);
      if (usage) {
        const error = new Error(`Este produto esta vinculado a ${usage} empresa(s) e nao pode ser removido do catalogo.`);
        error.statusCode = 409;
        throw error;
      }
      removeProduct(product.id);
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, { ok: true, id: product.id });
    }

    return false;
  };
}
