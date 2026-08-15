import { registerInteractionHandler } from "../utils/interactionRouter.js";
import { PAY_NAMESPACE, payInteractionHandler } from "./paySession.js";
import { SHOP_NAMESPACE, shopInteractionHandler } from "./shopSession.js";

/**
 * Single place where persistent interaction handlers are wired up. Every panel
 * registered here keeps working after a bot restart, because the state lives in
 * MongoDB and the message id is the session key.
 */
export function registerInteractionHandlers() {
  registerInteractionHandler(SHOP_NAMESPACE, shopInteractionHandler);
  registerInteractionHandler(PAY_NAMESPACE, payInteractionHandler);
  return [SHOP_NAMESPACE, PAY_NAMESPACE];
}
