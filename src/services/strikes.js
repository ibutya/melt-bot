const { createLogEmbed, sendGuildLog } = require("../utils/guild-log");
const { getGuildSettings } = require("../utils/app-config");
const { upsertGuildConfig } = require("../utils/guild-config");
const { prisma } = require("../db");
const { formatUser, truncateText } = require("../utils/text");

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

function normalizeAction(action) {
  return String(action ?? "WARNING").toUpperCase();
}

function getConfiguredRoleIds(settings) {
  return Object.values(settings.moderation.strikeRoles ?? {}).filter(Boolean);
}

async function getRule(guildId, strikeCount) {
  const settings = getGuildSettings(guildId);
  const dbRules = await prisma.strikeRule.findMany({
    where: {
      guildId,
      strike: {
        lte: strikeCount,
      },
    },
    orderBy: { strike: "desc" },
  });
  const dbRule = dbRules[0];

  if (dbRule) {
    return {
      action: dbRule.action,
      durationSeconds: dbRule.duration ?? null,
      roleId: dbRule.roleId,
      strike: dbRule.strike,
    };
  }

  const configuredStrikes = Object.keys(settings.moderation.punishments ?? {})
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value <= strikeCount)
    .sort((a, b) => b - a);
  const strike = configuredStrikes[0];
  const configuredRule = settings.moderation.punishments?.[strike];

  if (!configuredRule) {
    return null;
  }

  return {
    action: normalizeAction(configuredRule.action),
    durationSeconds: configuredRule.durationSeconds ?? null,
    roleId: settings.moderation.strikeRoles?.[strike] || null,
    strike,
  };
}

async function updateStrikeRole(guild, userId, strikeCount) {
  const settings = getGuildSettings(guild.id);
  const roleIds = getConfiguredRoleIds(settings);

  if (roleIds.length === 0) {
    return;
  }

  const member = await guild.members.fetch(userId).catch(() => null);

  if (!member) {
    return;
  }

  const targetRoleId = settings.moderation.strikeRoles?.[strikeCount] || null;
  const removeRoleIds = roleIds.filter((roleId) => roleId !== targetRoleId && member.roles.cache.has(roleId));

  if (removeRoleIds.length > 0) {
    await member.roles.remove(removeRoleIds, "Strike role sync").catch((error) => {
      console.error(`Failed to remove strike roles for ${guild.id}/${userId}:`, error);
    });
  }

  if (targetRoleId && !member.roles.cache.has(targetRoleId)) {
    await member.roles.add(targetRoleId, "Strike role sync").catch((error) => {
      console.error(`Failed to add strike role for ${guild.id}/${userId}:`, error);
    });
  }
}

async function applyPunishment(guild, userId, rule, reason) {
  if (!rule) {
    return "処罰ルールなし";
  }

  const action = normalizeAction(rule.action);

  if (action === "WARNING") {
    return "警告";
  }

  const member = await guild.members.fetch(userId).catch(() => null);

  if (action === "TIMEOUT") {
    if (!member) {
      return "Timeout対象がサーバー内にいません";
    }

    const durationMs = Math.min((rule.durationSeconds ?? 86_400) * 1000, MAX_TIMEOUT_MS);
    await member.timeout(durationMs, reason);
    return `Timeout ${Math.round(durationMs / 1000)}秒`;
  }

  if (action === "KICK") {
    if (!member) {
      return "Kick対象がサーバー内にいません";
    }

    await member.kick(reason);
    return "Kick";
  }

  if (action === "BAN") {
    await guild.members.ban(userId, { reason });
    return "Ban";
  }

  return `未対応アクション: ${action}`;
}

async function logStrikeChange(guild, user, moderator, amount, newCount, reason, punishmentResult) {
  const title = amount >= 0 ? "Strike追加" : "Strike減少";
  const embed = createLogEmbed(title, amount >= 0 ? 0xed4245 : 0x57f287)
    .addFields(
      { name: "ユーザー", value: formatUser(user), inline: true },
      { name: "増減", value: String(amount), inline: true },
      { name: "現在", value: String(newCount), inline: true },
      { name: "理由", value: truncateText(reason) },
    );

  if (moderator) {
    embed.addFields({ name: "実行者", value: formatUser(moderator), inline: true });
  }

  if (punishmentResult) {
    embed.addFields({ name: "処罰", value: punishmentResult, inline: true });
  }

  await sendGuildLog(guild, "moderation", embed);
}

async function changeStrikeCount({ guild, user, userId, moderator, moderatorId, amount, reason, applyAutoPunishment = true }) {
  await upsertGuildConfig(guild.id, {});

  const targetUserId = user?.id ?? userId;
  const current = await prisma.strikeUser.findUnique({
    where: {
      guildId_userId: {
        guildId: guild.id,
        userId: targetUserId,
      },
    },
  });
  const oldCount = current?.strikeCount ?? 0;
  const newCount = Math.max(0, oldCount + amount);
  const now = new Date();

  await prisma.strikeUser.upsert({
    where: {
      guildId_userId: {
        guildId: guild.id,
        userId: targetUserId,
      },
    },
    create: {
      guildId: guild.id,
      userId: targetUserId,
      strikeCount: newCount,
      lastStrikeAt: amount !== 0 ? now : current?.lastStrikeAt ?? null,
    },
    update: {
      strikeCount: newCount,
      lastStrikeAt: amount !== 0 ? now : current?.lastStrikeAt ?? null,
    },
  });

  await prisma.strikeHistory.create({
    data: {
      guildId: guild.id,
      userId: targetUserId,
      moderatorId: moderator?.id ?? moderatorId ?? null,
      amount,
      reason,
    },
  });

  await updateStrikeRole(guild, targetUserId, newCount);

  let punishmentResult = null;

  if (applyAutoPunishment && amount > 0) {
    const rule = await getRule(guild.id, newCount);
    punishmentResult = await applyPunishment(guild, targetUserId, rule, reason);
  }

  await logStrikeChange(guild, user ?? { id: targetUserId }, moderator, amount, newCount, reason, punishmentResult);

  return {
    oldCount,
    newCount,
    punishmentResult,
  };
}

async function setStrikeCount({ guild, user, moderator, count, reason, applyAutoPunishment = true }) {
  const current = await prisma.strikeUser.findUnique({
    where: {
      guildId_userId: {
        guildId: guild.id,
        userId: user.id,
      },
    },
  });
  const oldCount = current?.strikeCount ?? 0;
  const amount = Math.max(0, count) - oldCount;

  return changeStrikeCount({
    guild,
    user,
    moderator,
    amount,
    reason,
    applyAutoPunishment,
  });
}

async function runStrikeDecay(client) {
  const guilds = await prisma.guildConfig.findMany({
    include: {
      strikeUsers: {
        where: {
          strikeCount: {
            gt: 0,
          },
          lastStrikeAt: {
            not: null,
          },
        },
      },
    },
  });

  for (const guildConfig of guilds) {
    const settings = getGuildSettings(guildConfig.guildId);
    const decayDays = settings.moderation.strikeDecayDays;

    if (!decayDays || decayDays <= 0) {
      continue;
    }

    const cutoff = Date.now() - decayDays * 24 * 60 * 60 * 1000;
    const guild = client.guilds.cache.get(guildConfig.guildId);

    if (!guild) {
      continue;
    }

    for (const strikeUser of guildConfig.strikeUsers) {
      if (!strikeUser.lastStrikeAt || strikeUser.lastStrikeAt.getTime() > cutoff) {
        continue;
      }

      const user = await client.users.fetch(strikeUser.userId).catch(() => ({ id: strikeUser.userId }));
      await changeStrikeCount({
        guild,
        user,
        moderatorId: client.user.id,
        amount: -1,
        reason: "30日間Strike増加なしによる自然減少",
        applyAutoPunishment: false,
      });
    }
  }
}

module.exports = {
  changeStrikeCount,
  runStrikeDecay,
  setStrikeCount,
  updateStrikeRole,
};
