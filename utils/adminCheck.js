import { PermissionFlagsBits } from "discord.js";
import { getStaffConfig } from "../config/adminConfig.js";

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
  const memberId = member?.id || member?.user?.id;
  if (!memberId) return false;

  // Check if owner
  if (member.guild?.ownerId === memberId) return true;

  // Check if has Administrator permission
  if (
    member.permissions?.has &&
    member.permissions.has(PermissionFlagsBits.Administrator)
  )
    return true;

  // Check specific admin user IDs (ENV + config/admins.json)
  const config = getStaffConfig();
  if (config.adminUserIds.includes(memberId)) return true;

  // Check ADMIN_ROLE_IDS (admin role without owner permissions)
  if (memberHasAnyRole(member, config.adminRoleIds)) {
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

  const config = getStaffConfig();

  // Head GM role IDs (Главный ГМ)
  const headGmRoleIds = config.headGmRoleIds;

  // GM role IDs (Мастер игры) — Head GM inherits all regular GM commands
  const gmRoleIds = Array.from(new Set([
    ...config.gmRoleIds,
    ...headGmRoleIds,
  ]));

  // Head Anketolog role IDs (Главный Анкетолог)
  const headAnketologRoleIds = config.headAnketologRoleIds;

  // Anketolog role IDs (Анкетолог) — Head Anketolog inherits all regular Anketolog commands
  const anketologRoleIds = Array.from(new Set([
    ...config.anketologRoleIds,
    ...headAnketologRoleIds,
  ]));

  // Moderator roles grant only SP awards among character-management commands.
  if (commandName === "add-sp" && memberHasAnyRole(member,
    config.moderatorRoleIds)) {
    return true;
  }

  // 1. Regular GM commands (Мастер Игры)
  // add-ap; add-sp; give-style; add-currency; add-reputation; purge offtop; mission create
  const gmCommands = [
    "add-ap",
    "add-sp",
    "give-style",
    "add-currency",
    "add-reputation",
    "purge-offtop",
    "mission",
    "mission-create",
    "physical-register",
    "physical-edit",
    "train-block",
  ];
  if (gmCommands.includes(commandName) && memberHasAnyRole(member, gmRoleIds)) {
    return true;
  }

  // 2. Head GM commands (Главный ГМ)
  // GM commands + /set'ы, multipliers, deductions, item distribution, logs, training blocks
  const headGmOnlyCommands = [
    "set-ap",
    "set-sp",
    "set-currency",
    "set-reputation",
    "set-rank",
    "set-ap-multiplier",
    "set-sp-multiplier",
    "set-salary-multiplier",
    "deduct-currency",
    "deduct-reputation",
    "give-item",
    "remove-item",
    "remove-player-style",
    "train-block",
    "logs",
    "physical-register",
    "physical-edit",
  ];
  if (headGmOnlyCommands.includes(commandName) && memberHasAnyRole(member, headGmRoleIds)) {
    return true;
  }

  // 3. Regular Anketolog commands (Анкетолог)
  // Выдача стиля; /accept; /add-currency; physical register; physical edit
  const anketologCommands = [
    "give-style",
    "accept",
    "accept-application",
    "add-currency",
    "physical-register",
    "physical-edit",
  ];
  if (anketologCommands.includes(commandName) && memberHasAnyRole(member, anketologRoleIds)) {
    return true;
  }

  // 4. Head Anketolog commands (Главный Анкетолог)
  // Anketolog commands + /set'ы, deductions, slot granting, avatar, style removal, starter item management
  const headAnketologOnlyCommands = [
    "set-rank",
    "set-currency",
    "set-reputation",
    "deduct-currency",
    "deduct-reputation",
    "remove-player-style",
    "grant-slot",
    "set-avatar",
    "give-item",
    "remove-item",
    "add-ap",
    "add-sp",
    "set-ap",
    "set-sp",
  ];
  if (headAnketologOnlyCommands.includes(commandName) && memberHasAnyRole(member, headAnketologRoleIds)) {
    return true;
  }

  // 5. Commands that style-giver roles can use
  const styleGiverCommands = ["give-style", "remove-player-style"];
  if (styleGiverCommands.includes(commandName)) {
    if (memberHasAnyRole(member, config.styleGiverRoleIds)) {
      return true;
    }
  }

  return false;
}
