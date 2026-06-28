const { prisma } = require("../db");

function getGuildConfig(guildId) {
  return prisma.guildConfig.findUnique({
    where: { guildId },
  });
}

function upsertGuildConfig(guildId, data) {
  return prisma.guildConfig.upsert({
    where: { guildId },
    create: {
      guildId,
      ...data,
    },
    update: data,
  });
}

module.exports = {
  getGuildConfig,
  upsertGuildConfig,
};
