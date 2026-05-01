import { PermissionFlagsBits } from "discord.js";

export function isAdmin(member) {
  if (!member) return false;

  // Check if owner
  if (member.guild.ownerId === member.id) return true;

  // Check if has Administrator permission
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  // Check specific admin user IDs
  const adminIds = process.env.ADMIN_IDS
    ? process.env.ADMIN_IDS.split(",").map((id) => id.trim())
    : [];
  if (adminIds.includes(member.id)) return true;

  // Check if has role with name "Game Master"
  if (member.roles.cache.some((role) => role.name === "Game Master"))
    return true;

  // Check ADMIN_ROLE_IDS (admin role without owner permissions)
  const adminRoleIds = process.env.ADMIN_ROLE_IDS
    ? process.env.ADMIN_ROLE_IDS.split(",").map((id) => id.trim())
    : [];
  if (
    adminRoleIds.length > 0 &&
    member.roles.cache.some((role) => adminRoleIds.includes(role.id))
  )
    return true;

  return false;
}

// Check whether a member has permission to run a specific admin-style command.
// This allows configured role IDs to run certain commands based on their role.
export function hasCommandPermission(member, commandName) {
  if (!member) return false;

  // Full admins pass immediately
  if (isAdmin(member)) return true;

  // Commands that Game Masters can use (AP, SP, currency, items)
  const gmCommands = [
    "add-ap",
    "add-sp",
    "add-currency",
    "deduct-currency",
    "set-ap",
    "set-sp",
    "set-currency",
    "give-item",
  ];

  // Commands that style-giver roles can use
  const styleGiverCommands = ["give-style", "remove-player-style"];

  // Check GM commands
  if (gmCommands.includes(commandName)) {
    const gmRoleIds = process.env.GM_ROLE_IDS
      ? process.env.GM_ROLE_IDS.split(",").map((r) => r.trim())
      : [];
    if (gmRoleIds.length > 0) {
      try {
        if (
          member.roles &&
          member.roles.cache &&
          typeof member.roles.cache.some === "function"
        ) {
          if (member.roles.cache.some((role) => gmRoleIds.includes(role.id))) {
            return true;
          }
        }
      } catch (e) {
        console.error("Error checking GM roles:", e);
      }
    }
  }

  // Check style-giver commands
  if (styleGiverCommands.includes(commandName)) {
    const styleGiverRoleIds = process.env.GIVE_STYLE_ROLE_IDS
      ? process.env.GIVE_STYLE_ROLE_IDS.split(",").map((r) => r.trim())
      : [];
    if (styleGiverRoleIds.length > 0) {
      try {
        if (
          member.roles &&
          member.roles.cache &&
          typeof member.roles.cache.some === "function"
        ) {
          if (
            member.roles.cache.some((role) =>
              styleGiverRoleIds.includes(role.id),
            )
          ) {
            return true;
          }
        }
      } catch (e) {
        console.error("Error checking style-giver roles:", e);
      }
    }
  }

  return false;
}
