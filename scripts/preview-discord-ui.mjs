// Local fixtures only. Does not connect to MongoDB, Discord or remote image hosts.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderPhysicalCard, renderProfileCard } from "../utils/profileCard.js";
import { modernizeResponsePayload } from "../utils/modernResponses.js";
import { createProfileV2Components } from "../utils/profileComponents.js";
import { createTrainingSuccessComponents } from "../utils/trainingComponents.js";
import { createPayPreviewComponents } from "../utils/bankingComponents.js";
import { calculateTransfer } from "../utils/banking.js";
import { createInventoryEmptyComponents } from "../utils/inventoryComponents.js";
import { createShopItemComponents } from "../utils/shopComponents.js";
import { listShopItems } from "../utils/shopCatalog.js";
import { createMissionCardEmbed, createMissionActionRows } from "../utils/missionComponents.js";
import { createGiveItemReceiptComponents } from "../utils/giveItemComponents.js";

const out = path.resolve(process.argv[2] || ".cache/discord-ui");
await mkdir(out, { recursive: true });
const fixture = { characterName: "Аяко Мидзуки-Волкова", attributeName: "Тень Пепла",
  styles: [{ name: "Муай Тай", sp: 1200 }, { name: "Айкидо", sp: 480 }],
  ap: 12480, totalSP: 1680, apMultiplier: 150, spMultiplier: 120, salaryMultiplier: 100,
  krw: 17500000, yen: 940000, reputation: 1500, reputationTier: "Городской",
  orgName: "TENRYU", orgRank: "A", slot: 1, leaderboardRank: { position: 3, total: 25 } };
const large = { ...fixture, characterName: "Александра-Мидзуки Великая Хранительница Северного Предела",
  orgName: "Организация с очень длинным названием и подразделением", attributeName: "Название атрибута без ограничения ширины",
  ap: Number.MAX_SAFE_INTEGER, totalSP: 8000000000, yen: Number.MAX_SAFE_INTEGER, krw: Number.MAX_SAFE_INTEGER };
const stats = { punch_strength_kg: 180, lifting_strength_kg: 240, speed_kmh: 38, stamina_percent: 82, reaction_ms: 120 };
for (const [name, values] of [["profile", fixture], ["profile-long", large], ["profile-empty", { characterName: "Ли", slot: 2 }]]) {
  await writeFile(path.join(out, `${name}.png`), await renderProfileCard(values));
}
await writeFile(path.join(out, "physical.png"), await renderPhysicalCard({ characterName: fixture.characterName, stats, slot: 1 }));
const player = { id: "fixture", character_name: fixture.characterName, organization: fixture.orgName, rank: "A",
  attribute_name: fixture.attributeName, ap: fixture.ap, yen: fixture.yen, krw: fixture.krw,
  ap_multiplier: 150, sp_multiplier: 120, reputation: fixture.reputation };
const mission = { public_id: "M001", title: "Тихий переход", type: "raid", status: "recruiting",
  description: "Провести группу через закрытый район. Исход сцены определяет ГМ.", min_rank: "C", max_players: 4,
  participants: [], reward: { yen: 1000, ap: 10 }, created_by: { username: "ГМ" } };
const previews = {
  profile: { components: createProfileV2Components({ page: "main", player, slot: 1, totalSP: fixture.totalSP, styles: fixture.styles, textMode: true }) },
  training: { components: createTrainingSuccessComponents({ ...fixture, gained: 15, newAP: 12495, baseReward: 10, multiplier: 150,
    dynamicBonus: 20, shopBonus: 0, retryAt: 1793642400, activityText: "Персонаж отрабатывает последовательность движений." }) },
  transfer: { components: createPayPreviewComponents({ senderName: fixture.characterName, recipientName: "Ли", recipientSlot: 2,
    currency: "yen", calculation: calculateTransfer(1000), senderBalance: 5000 }) },
  shop: { components: createShopItemComponents({ characterName: fixture.characterName, balance: 50000, currency: "yen", item: listShopItems()[0] }) },
  inventory: { components: createInventoryEmptyComponents(fixture.characterName) },
  mission: { embeds: [createMissionCardEmbed(mission)], components: createMissionActionRows(mission) },
  grant: { components: createGiveItemReceiptComponents({ characterName: fixture.characterName, slot: 1,
    result: { itemName: "AP Tome (50)", quantity: 2, previousQuantity: 1, totalQuantity: 3 } }) },
};
const payloads = Object.fromEntries(Object.entries(previews).map(([name, payload]) => [name, modernizeResponsePayload(payload)]));
await writeFile(path.join(out, "payloads.json"), JSON.stringify(payloads, null, 2));
console.log(`Local PNG fixtures and component payloads: ${out}`);
