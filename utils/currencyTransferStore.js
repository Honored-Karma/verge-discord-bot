function options(session) {
  return session ? { session } : {};
}

function safeBalance(document, currency) {
  const balance = Number(document?.[currency] || 0);
  return Number.isSafeInteger(balance) && balance >= 0 ? balance : null;
}

export function isTransactionUnsupportedError(error) {
  const message = String(error?.message || "");
  return error?.code === 20
    || error?.codeName === "IllegalOperation"
    || /transaction numbers are only allowed on a replica set member or mongos/i.test(message)
    || /transactions are not supported/i.test(message);
}

export async function transferCurrencyCompensated(
  players,
  { fromId, toId, currency, calculation },
) {
  const debit = await players.findOneAndUpdate(
    {
      id: fromId,
      [currency]: {
        $gte: calculation.sent,
        $lte: Number.MAX_SAFE_INTEGER,
      },
    },
    { $inc: { [currency]: -calculation.sent } },
    { returnDocument: "after" },
  );
  if (!debit) {
    const sender = await players.findOne({ id: fromId });
    if (!sender) return { success: false, reason: "sender_not_found" };
    const available = safeBalance(sender, currency);
    return available === null
      ? { success: false, reason: "unsafe_balance" }
      : { success: false, reason: "insufficient_funds", available };
  }

  let credit;
  try {
    credit = await players.findOneAndUpdate(
      {
        id: toId,
        $or: [
          { [currency]: { $lte: Number.MAX_SAFE_INTEGER - calculation.received } },
          { [currency]: { $exists: false } },
        ],
      },
      { $inc: { [currency]: calculation.received } },
      { returnDocument: "after" },
    );
  } catch (error) {
    const rollback = await players.updateOne(
      { id: fromId },
      { $inc: { [currency]: calculation.sent } },
    ).catch(() => ({ modifiedCount: 0 }));
    if (rollback.modifiedCount !== 1) {
      console.error("Critical currency transfer rollback failure:", error);
      return { success: false, reason: "rollback_failed" };
    }
    throw error;
  }

  if (!credit) {
    const rollback = await players.updateOne(
      { id: fromId },
      { $inc: { [currency]: calculation.sent } },
    );
    if (rollback.modifiedCount !== 1) {
      return { success: false, reason: "rollback_failed" };
    }
    const recipient = await players.findOne({ id: toId });
    return {
      success: false,
      reason: recipient ? "unsafe_balance" : "recipient_not_found",
    };
  }

  return {
    success: true,
    ...calculation,
    senderBalance: Number(debit[currency]),
    recipientBalance: Number(credit[currency]),
    mode: "compensated",
  };
}

export async function transferCurrencyInTransaction(
  players,
  { fromId, toId, currency, calculation, session },
) {
  const [from, to] = await Promise.all([
    players.findOne({ id: fromId }, options(session)),
    players.findOne({ id: toId }, options(session)),
  ]);
  if (!from) return { success: false, reason: "sender_not_found" };
  if (!to) return { success: false, reason: "recipient_not_found" };

  const fromBalance = safeBalance(from, currency);
  const toBalance = safeBalance(to, currency);
  if (fromBalance === null || toBalance === null
    || !Number.isSafeInteger(toBalance + calculation.received)) {
    return { success: false, reason: "unsafe_balance" };
  }
  if (fromBalance < calculation.sent) {
    return {
      success: false,
      reason: "insufficient_funds",
      available: fromBalance,
    };
  }

  const debit = await players.updateOne(
    { id: fromId, [currency]: { $gte: calculation.sent } },
    { $inc: { [currency]: -calculation.sent } },
    options(session),
  );
  if (debit.modifiedCount !== 1) {
    return { success: false, reason: "balance_changed" };
  }
  const credit = await players.updateOne(
    { id: toId },
    { $inc: { [currency]: calculation.received } },
    options(session),
  );
  if (credit.modifiedCount !== 1) {
    throw new Error("Recipient disappeared during currency transfer");
  }

  return {
    success: true,
    ...calculation,
    senderBalance: fromBalance - calculation.sent,
    recipientBalance: toBalance + calculation.received,
    mode: "transaction",
  };
}
