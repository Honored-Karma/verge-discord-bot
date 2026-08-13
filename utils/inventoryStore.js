const MAX_ATTEMPTS = 8;

function quantityMatch(document) {
  return Object.hasOwn(document, "qty")
    ? { qty: document.qty }
    : { qty: { $exists: false } };
}

export async function incrementInventoryStack(
  inventory,
  { playerId, itemName, quantity },
) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const current = await inventory.findOne(
      { player_id: playerId, item_name: itemName },
      { projection: { _id: 1, qty: 1 } },
    );

    if (!current) {
      try {
        await inventory.insertOne({
          player_id: playerId,
          item_name: itemName,
          qty: quantity,
        });
        return { success: true, previousQuantity: 0, totalQuantity: quantity };
      } catch (error) {
        if (error?.code === 11000) continue;
        throw error;
      }
    }

    const previousQuantity = Number(current.qty ?? 0);
    const totalQuantity = previousQuantity + quantity;
    if (!Number.isSafeInteger(previousQuantity)
      || previousQuantity < 0
      || !Number.isSafeInteger(totalQuantity)) {
      return { success: false, reason: "quantity_too_large" };
    }

    const update = await inventory.updateOne(
      { _id: current._id, ...quantityMatch(current) },
      { $set: { qty: totalQuantity } },
    );
    if (update.matchedCount === 1) {
      return { success: true, previousQuantity, totalQuantity };
    }
  }

  return { success: false, reason: "inventory_busy" };
}
