const { EmbedBuilder } = require("discord.js");
const { getLogSettings } = require("./app-config");

function createLogEmbed(title, color = 0x5865f2) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp();
}

async function sendGuildLog(guild, category, embed) {
  const logSettings = getLogSettings(guild.id, category);

  if (logSettings.enabled === false || !logSettings.channelId) {
    return;
  }

  try {
    const channel = await guild.channels.fetch(logSettings.channelId);

    if (!channel?.isTextBased()) {
      return;
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`Failed to send ${category} guild log for ${guild.id}:`, error);
  }
}

module.exports = {
  createLogEmbed,
  sendGuildLog,
};
