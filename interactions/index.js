import { registerInteractionHandler } from "../utils/interactionRouter.js";
import {
  LEADERBOARD_NAMESPACE,
  leaderboardInteractionHandler,
} from "./leaderboardSession.js";
import {
  INVENTORY_NAMESPACE,
  inventoryInteractionHandler,
} from "./inventorySession.js";
import { PAY_NAMESPACE, payInteractionHandler } from "./paySession.js";
import { PROFILE_NAMESPACE, profileInteractionHandler } from "./profileSession.js";
import { SHOP_NAMESPACE, shopInteractionHandler } from "./shopSession.js";

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
  return [
    SHOP_NAMESPACE,
    PAY_NAMESPACE,
    LEADERBOARD_NAMESPACE,
    PROFILE_NAMESPACE,
    INVENTORY_NAMESPACE,
  ];
}
