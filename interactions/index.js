import { registerInteractionHandler } from "../utils/interactionRouter.js";
import {
  LEADERBOARD_NAMESPACE,
  leaderboardInteractionHandler,
} from "./leaderboardSession.js";
import { HELP_NAMESPACE, helpInteractionHandler } from "./helpSession.js";
import {
  INVENTORY_NAMESPACE,
  inventoryInteractionHandler,
} from "./inventorySession.js";
import { PAY_NAMESPACE, payInteractionHandler } from "./paySession.js";
import { PROFILE_NAMESPACE, profileInteractionHandler } from "./profileSession.js";
import {
  SHOP_ORDER_NAMESPACE,
  shopOrderInteractionHandler,
} from "./shopOrderSession.js";
import { SHOP_NAMESPACE, shopInteractionHandler } from "./shopSession.js";
import {
  TRAIN_SP_NAMESPACE,
  trainSpInteractionHandler,
} from "./trainSpSession.js";
import {
  MISSION_NAMESPACE,
  missionInteractionHandler,
} from "./missionSession.js";
import {
  MISSION_BUILDER_NAMESPACE,
  missionBuilderInteractionHandler,
} from "./missionBuilderSession.js";
import {
  PHYSICAL_STATS_NAMESPACE,
  physicalStatsInteractionHandler,
} from "./physicalStatsSession.js";
import {
  ANNOUNCE_BUILDER_NAMESPACE,
  announceInteractionHandler,
} from "./announceSession.js";

/**
 * Single place where persistent interaction handlers are wired up. Every panel
 * registered here keeps working after a bot restart, because the state lives in
 * MongoDB and the message id is the session key.
 */
export function registerInteractionHandlers() {
  registerInteractionHandler(SHOP_NAMESPACE, shopInteractionHandler);
  registerInteractionHandler(PAY_NAMESPACE, payInteractionHandler);
  registerInteractionHandler(LEADERBOARD_NAMESPACE, leaderboardInteractionHandler);
  registerInteractionHandler(PROFILE_NAMESPACE, profileInteractionHandler);
  registerInteractionHandler(INVENTORY_NAMESPACE, inventoryInteractionHandler);
  registerInteractionHandler(SHOP_ORDER_NAMESPACE, shopOrderInteractionHandler);
  registerInteractionHandler(TRAIN_SP_NAMESPACE, trainSpInteractionHandler);
  registerInteractionHandler(HELP_NAMESPACE, helpInteractionHandler);
  registerInteractionHandler(MISSION_NAMESPACE, missionInteractionHandler);
  registerInteractionHandler(MISSION_BUILDER_NAMESPACE, missionBuilderInteractionHandler);
  registerInteractionHandler(PHYSICAL_STATS_NAMESPACE, physicalStatsInteractionHandler);
  registerInteractionHandler(ANNOUNCE_BUILDER_NAMESPACE, announceInteractionHandler);
  return [
    SHOP_NAMESPACE,
    PAY_NAMESPACE,
    LEADERBOARD_NAMESPACE,
    PROFILE_NAMESPACE,
    INVENTORY_NAMESPACE,
    SHOP_ORDER_NAMESPACE,
    TRAIN_SP_NAMESPACE,
    HELP_NAMESPACE,
    MISSION_NAMESPACE,
    MISSION_BUILDER_NAMESPACE,
    PHYSICAL_STATS_NAMESPACE,
    ANNOUNCE_BUILDER_NAMESPACE,
  ];
}
