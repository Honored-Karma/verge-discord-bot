import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getTuppers } from '../utils/tupperModel.js';
import { checkGlobalCooldown } from '../utils/cooldowns.js';
import { tupperErrorText } from '../utils/tupperErrors.js';
import { profileModal, openTupperPanel, showTupperAction, handlesTupperModal, handleTupperModal, ensureTupperAccess } from '../interactions/tupperSession.js';

export const data = new SlashCommandBuilder().setName('tupper')
  .setDescription('Профили для отыгрыша: имя, аватар, маркеры и автопрокси через формы')
  .addStringOption(o => o.setName('action').setDescription('Без параметров — форма создания профиля').addChoices(
    { name: 'Создать профиль', value: 'create' }, { name: 'Открыть все профили', value: 'manage' },
    { name: 'Изменить профиль', value: 'edit' }, { name: 'Автопрокси и приватность', value: 'settings' },
    { name: 'Перенести из игрового персонажа', value: 'character' },
    { name: 'Импорт из Tupperbox / PluralKit', value: 'import' }, { name: 'Экспорт в JSON', value: 'export' },
    { name: 'Проверить права и настройки', value: 'diagnose' }, { name: 'Настроить сервер', value: 'server' },
    { name: 'Настроить права отыгрыша', value: 'rules' },
  ))
  .addStringOption(o => o.setName('profile').setDescription('Профиль для изменения').setAutocomplete(true))
  .addUserOption(o => o.setName('user').setDescription('Посмотреть публичные профили пользователя'));

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
    const target = interaction.options.getUser('user');
    const action = interaction.options.getString('action') || 'create';
    if (target && target.id !== interaction.user.id) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      return await openTupperPanel(interaction, { view_owner: target.id });
    }
    if (action === 'manage' || target) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await ensureTupperAccess(interaction);
      return await openTupperPanel(interaction);
    }
    // The common creation path opens immediately; authorization is checked on submit.
    if (action === 'create') return interaction.showModal(profileModal(interaction));
    return await showTupperAction(interaction, action, { selected: interaction.options.getString('profile') });
  } catch (e) {
    const payload = { content: tupperErrorText(e, 'Не удалось открыть профили. Попробуйте снова.'), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
    if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
    return interaction.reply(payload);
  }
}
