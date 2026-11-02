import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';
import { runTupperMessageAction } from '../interactions/tupperSession.js';
export const data = new ContextMenuCommandBuilder().setName('Кто автор отыгрыша?').setType(ApplicationCommandType.Message).setDMPermission(false);
export const description = 'Посмотреть автора сообщения отыгрыша';
export async function execute(i) {
  await runTupperMessageAction(i, 'query');
}
