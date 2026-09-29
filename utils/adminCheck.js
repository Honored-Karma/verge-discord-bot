import { PermissionFlagsBits } from "discord.js";
import { loadAdminConfigFile } from "../config/adminConfig.js";

function getEnvRoleIds(...envNames) {
  return envNames.flatMap((envName) =>
    process.env[envName]
      ? process.env[envName].split(",").map((id) => id.trim()).filter(Boolean)
      : []
  );
}

function memberHasAnyRole(member, roleIds) {
  if (!member || !roleIds || roleIds.length === 0) return false;
  try {
    if (member.roles?.cache) {
      if (typeof member.roles.cache.some === "function") {
        return member.roles.cache.some((role) =>
          roleIds.includes(typeof role === "object" ? role?.id : role)
        );
      }
      if (Array.isArray(member.roles.cache)) {
        return member.roles.cache.some((role) =>
          roleIds.includes(typeof role === "object" ? role?.id : role)
        );
      }
    }
    if (Array.isArray(member.roles)) {
      return member.roles.some((role) =>
        roleIds.includes(typeof role === "object" ? role?.id : role)
      );
    }
  } catch (e) {
    console.error("Error checking member roles:", e);
  }
  return false;
}

export function isAdmin(member) {
  if (!member) return false;

  // Check if owner
  if (member.guild?.ownerId === member.id) return true;

  // Check if has Administrator permission
  if (
    member.permissions?.has &&
    member.permissions.has(PermissionFlagsBits.Administrator)
  )
    return true;

  // Check specific admin user IDs (ENV + config/admins.json)
  const envAdminIds = process.env.ADMIN_IDS
    ? process.env.ADMIN_IDS.split(",").map((id) => id.trim()).filter(Boolean)
    : [];
  const fileConfig = loadAdminConfigFile();
  const allAdminIds = Array.from(new Set([...envAdminIds, ...fileConfig.adminUserIds]));
  if (allAdminIds.includes(member.id)) return true;

  // Check if has role with name "Game Master"
  if (
    member.roles?.cache &&
    typeof member.roles.cache.some === "function" &&
    member.roles.cache.some((role) => (role.name || role) === "Game Master")
  ) {
    return true;
  }

  // Check ADMIN_ROLE_IDS (admin role without owner permissions)
  const envAdminRoleIds = getEnvRoleIds("ADMIN_ROLE_IDS", "ADMIN_ROLE_ID");
  const allAdminRoleIds = Array.from(new Set([...envAdminRoleIds, ...fileConfig.adminRoleIds]));
  if (memberHasAnyRole(member, allAdminRoleIds)) {
    return true;
  }

  return false;
}

// Check whether a member has permission to run a specific admin-style command.
// This allows configured role IDs to run certain commands based on their role.
export function hasCommandPermission(member, commandName) {
  if (!member) return false;

  // Full admins pass immediately
  if (isAdmin(member)) return true;

  // Commands that Game Masters can use (AP, SP, currency, items, reputation, logs, multipliers)
  const gmCommands = [
    "add-ap",
    "add-sp",
    "add-currency",
    "deduct-currency",
    "set-ap",
    "set-sp",
    "set-currency",
    "set-ap-multiplier",
    "set-sp-multiplier",
    "set-salary-multiplier",
    "give-item",
    "remove-item",
    "add-reputation",
    "deduct-reputation",
    "set-reputation",
    "train-block",
    "logs",
    "render-ui",
    "set-rank",
  ];

  // Commands that style-giver roles can use
  const styleGiverCommands = ["give-style", "remove-player-style"];

  // Physical stats are managed by profile reviewers, moderators, GMs and admins.
  // LIMITED_ADMIN_ROLE_IDS is kept as a compatibility fallback for existing setups.
  const physicalStatsCommands = ["physical-register", "physical-edit"];

  // Commands that Anketolog (profile reviewers who approve character applications) can use:
  // Allows granting combat styles, currency, SP/AP, items, rank, reputation, and physical stats.
  const anketologCommands = [
    "give-style",
    "remove-player-style",
    "add-currency",
    "set-currency",
    "deduct-currency",
    "add-sp",
    "set-sp",
    "add-ap",
    "set-ap",
    "give-item",
    "remove-item",
    "set-rank",
    "add-reputation",
    "set-reputation",
    "deduct-reputation",
    "physical-register",
    "physical-edit",
    "accept",
    "accept-application",
  ];

  // 1. Check Anketolog commands (application acceptance and player onboarding)
  if (anketologCommands.includes(commandName)) {
    const anketologRoleIds = getEnvRoleIds(
      "ANKETOLOG_ROLE_IDS",
      "ANKETOLOG_ROLE_ID"
    );
    if (memberHasAnyRole(member, anketologRoleIds)) {
      return true;
    }
  }

  // 2. Check GM commands
  if (gmCommands.includes(commandName)) {
    const gmRoleIds = getEnvRoleIds(
      "GM_ROLE_IDS",
      "GM_ROLE_ID",
      "LIMITED_ADMIN_ROLE_IDS"
    );
    if (memberHasAnyRole(member, gmRoleIds)) {
      return true;
    }
  }

  // 3. Check style-giver commands
  if (styleGiverCommands.includes(commandName)) {
    const styleGiverRoleIds = getEnvRoleIds(
      "GIVE_STYLE_ROLE_IDS",
      "GIVE_STYLE_ROLE_ID",
      "ANKETOLOG_ROLE_IDS",
      "ANKETOLOG_ROLE_ID"
    );
    if (memberHasAnyRole(member, styleGiverRoleIds)) {
      return true;
    }
  }

  // 4. Check physical stats commands
  if (physicalStatsCommands.includes(commandName)) {
    const physicalRoleIds = getEnvRoleIds(
      "ANKETOLOG_ROLE_IDS",
      "ANKETOLOG_ROLE_ID",
      "MODERATOR_ROLE_IDS",
      "MODERATOR_ROLE_ID",
      "GM_ROLE_IDS",
      "GM_ROLE_ID",
      "LIMITED_ADMIN_ROLE_IDS"
    );
    if (memberHasAnyRole(member, physicalRoleIds)) {
      return true;
    }
  }

  return false;
}
