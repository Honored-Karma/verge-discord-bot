import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getTuppers } from '../utils/tupperModel.js';
import { checkGlobalCooldown } from '../utils/cooldowns.js';
import { tupperErrorText } from '../utils/tupperErrors.js';
import { profileModal, openTupperPanel, showTupperAction, handlesTupperModal, handleTupperModal, ensureTupperAccess } from '../interactions/tupperSession.js';

export const data = new SlashCommandBuilder().setName('vupper')
  .setDescription('Создать, изменить или удалить свой профиль для отыгрыша')
  .addStringOption(o => o.setName('action').setDescription('Без параметров — форма создания профиля').addChoices(
    { name: 'Создать профиль', value: 'create' },
    { name: 'Изменить профиль', value: 'edit' },
    { name: 'Удалить профиль', value: 'delete' },
  ))
  .addStringOption(o => o.setName('profile').setDescription('Свой профиль для изменения или удаления').setAutocomplete(true));

export const handlesModal = handlesTupperModal;
export const handleModalSubmit = handleTupperModal;

export async function autocomplete(interaction) {
  const query = String(interaction.options.getFocused()).toLocaleLowerCase('ru');
  const profiles = await getTuppers(interaction.user.id);
  await interaction.respond(profiles.filter(p => p.name.toLocaleLowerCase('ru').includes(query)).slice(0, 25)
    .map(p => ({ name: p.name, value: p._id })));
}

export async function execute(interaction) {
  const cooldown = checkGlobalCooldown(interaction.user.id);
  if (cooldown.onCooldown) return interaction.reply({ content: `Подождите ${cooldown.remainingFormatted} перед следующей командой.`, flags: MessageFlags.Ephemeral });
  try {
    const action = interaction.options.getString('action') || 'create';
    const selected = interaction.options.getString('profile');
    if ((action === 'edit' || action === 'delete') && !selected) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await ensureTupperAccess(interaction);
      return await openTupperPanel(interaction);
    }
    // The common creation path opens immediately; authorization is checked on submit.
    if (action === 'create') return interaction.showModal(profileModal(interaction));
    return await showTupperAction(interaction, action, { selected });
  } catch (e) {
    const payload = { content: tupperErrorText(e, 'Не удалось открыть профили. Попробуйте снова.'), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
    if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
    return interaction.reply(payload);
  }
}
