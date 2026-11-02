import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';
import { runTupperMessageAction } from '../interactions/tupperSession.js';
export const data = new ContextMenuCommandBuilder().setName('Удалить отыгрыш').setType(ApplicationCommandType.Message).setDMPermission(false);
export const description = 'Удалить своё сообщение отыгрыша или модерировать чужое';
export async function execute(i) {
  await runTupperMessageAction(i, 'message_delete');
}
