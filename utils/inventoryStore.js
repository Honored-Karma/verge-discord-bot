const MAX_ATTEMPTS = 8;

function quantityMatch(document) {
  return Object.hasOwn(document, "qty")
    ? { qty: document.qty }
    : { qty: { $exists: false } };
}

export async function incrementInventoryStack(
  inventory,
  { playerId, itemName, quantity, session = null },
) {
  const options = session ? { session } : {};
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const current = await inventory.findOne(
      { player_id: playerId, item_name: itemName },
      { ...options, projection: { _id: 1, qty: 1 } },
    );

    if (!current) {
      try {
        await inventory.insertOne({
          player_id: playerId,
          item_name: itemName,
          qty: quantity,
        }, options);
        return { success: true, previousQuantity: 0, totalQuantity: quantity };
      } catch (error) {
        if (error?.code === 11000 && !session) continue;
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
      options,
    );
    if (update.matchedCount === 1) {
      return { success: true, previousQuantity, totalQuantity };
    }
  }

  return { success: false, reason: "inventory_busy" };
}

export async function decrementOrRemoveInventoryStack(
  inventory,
  { playerId, itemName, quantity = 1, removeAll = false },
) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let current = await inventory.findOne(
      { player_id: playerId, item_name: itemName },
    );

    if (!current) {
      const escaped = String(itemName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      current = await inventory.findOne({
        player_id: playerId,
        item_name: { $regex: new RegExp(`^${escaped}$`, "i") },
      });
    }

    if (!current) {
      return { success: false, reason: "not_found" };
    }

    const previousQuantity = Number(current.qty ?? 0);
    if (!Number.isSafeInteger(previousQuantity) || previousQuantity <= 0) {
      await inventory.deleteOne({ _id: current._id });
      return {
        success: true,
        itemName: current.item_name,
        removedQuantity: 0,
        remainingQuantity: 0,
        previousQuantity: 0,
      };
    }

    if (removeAll) {
      const deleteResult = await inventory.deleteOne({
        _id: current._id,
        ...quantityMatch(current),
      });
      if (deleteResult.deletedCount === 1) {
        return {
          success: true,
          itemName: current.item_name,
          removedQuantity: previousQuantity,
          remainingQuantity: 0,
          previousQuantity,
        };
      }
      continue;
    }

    const safeQuantity = Number(quantity);
    if (!Number.isSafeInteger(safeQuantity) || safeQuantity < 1) {
      return { success: false, reason: "invalid_quantity" };
    }

    if (safeQuantity > previousQuantity) {
      return {
        success: false,
        reason: "insufficient_quantity",
        available: previousQuantity,
        itemName: current.item_name,
      };
    }

    if (safeQuantity === previousQuantity) {
      const deleteResult = await inventory.deleteOne({
        _id: current._id,
        ...quantityMatch(current),
      });
      if (deleteResult.deletedCount === 1) {
        return {
          success: true,
          itemName: current.item_name,
          removedQuantity: safeQuantity,
          remainingQuantity: 0,
          previousQuantity,
        };
      }
      continue;
    }

    const remainingQuantity = previousQuantity - safeQuantity;
    const update = await inventory.updateOne(
      { _id: current._id, ...quantityMatch(current) },
      { $set: { qty: remainingQuantity } },
    );
    if (update.matchedCount === 1) {
      return {
        success: true,
        itemName: current.item_name,
        removedQuantity: safeQuantity,
        remainingQuantity,
        previousQuantity,
      };
    }
  }

  return { success: false, reason: "inventory_busy" };
}

