import { incrementInventoryStack } from "./inventoryStore.js";

function safeQuantity(value) {
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
}

async function participantsExist(players, fromId, toId, session = null) {
  const options = session ? { session, projection: { id: 1 } } : { projection: { id: 1 } };
  const [sender, recipient] = await Promise.all([
    players.findOne({ id: fromId }, options),
    players.findOne({ id: toId }, options),
  ]);
  if (!sender) return { success: false, reason: "sender_not_found" };
  if (!recipient) return { success: false, reason: "recipient_not_found" };
  return { success: true };
}

export async function transferItemInTransaction(
  { players, inventory },
  { fromId, toId, itemName, quantity, session },
) {
  const participants = await participantsExist(players, fromId, toId, session);
  if (!participants.success) return participants;

  const options = { session };
  const [senderStack, recipientStack] = await Promise.all([
    inventory.findOne({ player_id: fromId, item_name: itemName }, options),
    inventory.findOne({ player_id: toId, item_name: itemName }, options),
  ]);
  const senderQuantity = safeQuantity(senderStack?.qty);
  const recipientQuantity = safeQuantity(recipientStack?.qty ?? 0);
  if (!senderStack || senderQuantity === null || senderQuantity < quantity) {
    return {
      success: false,
      reason: senderStack ? "insufficient_quantity" : "not_found",
      available: senderQuantity || 0,
    };
  }
  if (recipientQuantity === null
    || !Number.isSafeInteger(recipientQuantity + quantity)) {
    return { success: false, reason: "quantity_too_large" };
  }

  const debit = await inventory.updateOne(
    { _id: senderStack._id, qty: senderQuantity },
    { $set: { qty: senderQuantity - quantity } },
    options,
  );
  if (debit.modifiedCount !== 1) {
    return { success: false, reason: "inventory_changed" };
  }

  if (recipientStack) {
    const credit = await inventory.updateOne(
      { _id: recipientStack._id, qty: recipientQuantity },
      { $set: { qty: recipientQuantity + quantity } },
      options,
    );
    if (credit.modifiedCount !== 1) throw new Error("Recipient inventory changed");
  } else {
    await inventory.insertOne({
      player_id: toId,
      item_name: itemName,
      qty: quantity,
    }, options);
  }

  return {
    success: true,
    itemName,
    quantity,
    senderQuantity: senderQuantity - quantity,
    recipientQuantity: recipientQuantity + quantity,
    mode: "transaction",
  };
}

export async function transferItemCompensated(
  { players, inventory },
  { fromId, toId, itemName, quantity },
) {
  const participants = await participantsExist(players, fromId, toId);
  if (!participants.success) return participants;

  const debit = await inventory.findOneAndUpdate(
    {
      player_id: fromId,
      item_name: itemName,
      qty: { $gte: quantity, $lte: Number.MAX_SAFE_INTEGER },
    },
    { $inc: { qty: -quantity } },
    { returnDocument: "after" },
  );
  if (!debit) {
    const current = await inventory.findOne({ player_id: fromId, item_name: itemName });
    return {
      success: false,
      reason: current ? "insufficient_quantity" : "not_found",
      available: safeQuantity(current?.qty) || 0,
    };
  }

  let credit;
  try {
    credit = await incrementInventoryStack(inventory, {
      playerId: toId,
      itemName,
      quantity,
    });
  } catch (error) {
    const rollback = await inventory.updateOne(
      { _id: debit._id },
      { $inc: { qty: quantity } },
    ).catch(() => ({ modifiedCount: 0 }));
    if (rollback.modifiedCount !== 1) {
      console.error("Critical item transfer rollback failure:", error);
      return { success: false, reason: "rollback_failed" };
    }
    throw error;
  }

  if (!credit.success) {
    const rollback = await inventory.updateOne(
      { _id: debit._id },
      { $inc: { qty: quantity } },
    );
    return rollback.modifiedCount === 1
      ? credit
      : { success: false, reason: "rollback_failed" };
  }

  return {
    success: true,
    itemName,
    quantity,
    senderQuantity: Number(debit.qty),
    recipientQuantity: credit.totalQuantity,
    mode: "compensated",
  };
}
