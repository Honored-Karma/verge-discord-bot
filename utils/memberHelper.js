export async function resolveMember(interaction) {
    if (!interaction) return null;
    // Prefer guild member fetch to ensure roles are present
    try {
        if (interaction.guild) {
            const fetched = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
            if (fetched) return fetched;
        }
    } catch (e) {
        console.error('resolveMember fetch error', e);
    }
    // Fallback to provided member (may be partial)
    return interaction.member || null;
}
