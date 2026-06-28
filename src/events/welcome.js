const { Events } = require("discord.js");
const { getGuildSettings, renderTemplate } = require("../utils/app-config");

async function sendWelcomeMessage(member) {
  const config = getGuildSettings(member.guild.id).welcome;

  if (config.enabled === false || !config.channelId) {
    return;
  }

  try {
    const channel = await member.guild.channels.fetch(config.channelId);

    if (!channel?.isTextBased()) {
      return;
    }

    const content = renderTemplate(config.message, {
      guild: {
        id: member.guild.id,
        name: member.guild.name,
        memberCount: member.guild.memberCount,
      },
      user: {
        id: member.user.id,
        name: member.user.username,
        tag: member.user.tag,
        mention: `${member}`,
      },
    });

    await channel.send({ content });
  } catch (error) {
    console.error(`Failed to send welcome message for ${member.guild.id}:`, error);
  }
}

function registerWelcomeEvents(client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    await sendWelcomeMessage(member);
  });
}

module.exports = { registerWelcomeEvents };
