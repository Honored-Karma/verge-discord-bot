import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';
import { runTupperMessageAction } from '../interactions/tupperSession.js';
export const data = new ContextMenuCommandBuilder().setName('Изменить отыгрыш').setType(ApplicationCommandType.Message).setDMPermission(false);
export const description = 'Изменить своё сообщение отыгрыша через форму';
export async function execute(i) {
  await runTupperMessageAction(i, 'message_edit');
}
