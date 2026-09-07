import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getActiveSlot, getPlayer, getTotalSP } from '../utils/dataManager.js';
import { createCooldownEmbed, createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import { createProfileV2Components } from '../utils/profileComponents.js';
import {
    createProfileSessionState,
    PROFILE_NAMESPACE,
    PROFILE_SESSION_TTL_MS,
    renderProfilePage,
} from '../interactions/profileSession.js';
import { createInteractionSession } from '../utils/interactionSessions.js';
import { makePlayerKey } from '../utils/playerKey.js';

export const data = new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Просмотр профиля игрока')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Пользователь для просмотра (оставьте пустым для себя)')
            .setRequired(false))
    .addIntegerOption(option =>
        option.setName('slot')
            .setDescription('Слот: 1 или 2 (по умолчанию активный)')
            .setRequired(false)
            .addChoices(
                { name: 'Слот 1', value: 1 },
                { name: 'Слот 2', value: 2 },
            ));

export async function execute(interaction) {
    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
        const msg = await interaction.reply({
            embeds: [createCooldownEmbed('Профиль', retryAt)],
            fetchReply: true,
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    let slot = interaction.options.getInteger('slot');
    if (!slot) slot = await getActiveSlot(targetUser.id);
    if (slot !== 1 && slot !== 2) slot = 1;

    const playerId = makePlayerKey(targetUser.id, slot);
    const player = await getPlayer(playerId);
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed(
                'Пустой слот',
                'В этом слоте нет персонажа. Используйте /register, чтобы создать нового персонажа.',
            )],
            fetchReply: true,
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const state = createProfileSessionState({
        playerId,
        targetUserId: targetUser.id,
        slot,
    });

    // Двухфазный ответ: текстовый вид уходит мгновенно, карточка досылается
    // правкой. Раньше канвас и загрузка аватара выполнялись ДО первого ответа,
    // у которого есть только три секунды.
    const response = await interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: createProfileV2Components({
            page: 'main',
            player,
            user: targetUser,
            slot,
            totalSP: await getTotalSP(playerId),
            history: [],
            imageName: null,
        }),
        fetchReply: true,
    });

    const messageId = response?.id || (await interaction.fetchReply()).id;

    const created = await createInteractionSession({
        messageId,
        namespace: PROFILE_NAMESPACE,
        ownerId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        state,
        ttlMs: PROFILE_SESSION_TTL_MS,
    });

    const view = await renderProfilePage(state, targetUser);
    if (view?.files.length) {
        await interaction.editReply({
            components: view.components,
            files: view.files,
            attachments: [],
        }).catch((error) => console.error('Profile card attach error:', error));
    }

    if (!created.success) {
        console.error('Profile session was not stored:', created.reason);
    }

    return response;
}
