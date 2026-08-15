/**
 * Безопасный URL аватара для миниатюр Components V2.
 *
 * `ThumbnailBuilder.setURL` валидирует аргумент и бросает исключение на всём,
 * что не строка-ссылка. Миниатюра — украшение, но падение в билдере роняло
 * рендер целой панели: инвентарь, профиль или выдачу предмета целиком.
 *
 * Источники URL разные и не все надёжны: `character_avatar` игрок задаёт сам
 * через `/set-avatar`, а `displayAvatarURL()` вызывается на объекте, который в
 * некоторых путях может оказаться не полноценным пользователем. Поэтому здесь
 * единственная точка, где ссылка приводится к пригодному виду.
 */
const DEFAULT_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";

export function safeAvatarUrl(value, fallback = DEFAULT_AVATAR) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return /^https?:\/\/\S+$/i.test(candidate) ? candidate : fallback;
}

export { DEFAULT_AVATAR };
