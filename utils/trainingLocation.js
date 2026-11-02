// AP and SP training share one location streak per character. Social RP does
// not advance it. Keep the snapshot in the reward claim to avoid stale rewards
// when a message in another channel resets the streak during form submission.
export function getTrainingLocation(player, context = {}) {
  if (!context.guildId || !context.channelId) {
    return { factor: 1, repeats: 0, filter: {}, updates: {} };
  }
  const previous = player.training_location || null;
  const sameChannel = previous?.guild_id === context.guildId
    && previous?.channel_id === context.channelId;
  const repeats = sameChannel ? Number(previous.repeats || 0) + 1 : 0;
  return {
    factor: Math.pow(0.8, repeats),
    repeats,
    filter: { training_location: previous },
    updates: {
      training_location: {
        guild_id: context.guildId,
        channel_id: context.channelId,
        repeats,
      },
    },
  };
}
