import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { checkGlobalCooldown } from '../utils/cooldowns.js';
import { logCommand } from '../utils/logs.js';
import { generateRoastMessage, getCustomRoasts } from '../utils/roastData.js';

export const data = new SlashCommandBuilder()
    .setName('roast')
    .setDescription('Дружеский подкол и прожарка с пингом и смайликами 🤡')
    .addUserOption(option =>
        option.setName('target')
            .setDescription('Кого подколоть (по умолчанию — ты сам)')
            .setRequired(false))
    .addBooleanOption(option =>
        option.setName('hidden')
            .setDescription('Показать результат только вам (эфемерально)')
            .setRequired(false));

export async function execute(interaction) {
    const cooldown = checkGlobalCooldown(interaction.user.id);
    if (cooldown.onCooldown) {
        return interaction.reply({
            content: `⏱️ Подождите **${cooldown.remainingFormatted}** перед следующей прожаркой, остыньте немного! 🧊`,
            flags: MessageFlags.Ephemeral,
        });
    }

    const target = interaction.options.getUser('target') || interaction.user;
    const hidden = interaction.options.getBoolean('hidden') === true;
    const pingMs = interaction.client.ws?.ping ?? 0;
    const extraRoasts = await getCustomRoasts().catch(() => []);

    const message = generateRoastMessage({
        callerId: interaction.user.id,
        targetId: target.id,
        botId: interaction.client.user?.id,
        pingMs,
        extraRoasts,
    });

    logCommand({
        command: 'roast',
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        channelId: interaction.channelId,
        extra: {
            targetId: target.id,
            targetTag: target.tag,
            isSelf: target.id === interaction.user.id,
            isBot: Boolean(interaction.client.user?.id && target.id === interaction.client.user.id),
        },
    }).catch(() => {});

    return interaction.reply({
        content: message,
        flags: hidden ? MessageFlags.Ephemeral : undefined,
    });
}
