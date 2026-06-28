const { ChannelType, Events } = require("discord.js");
const { prisma } = require("../db");
const { getGuildSettings, renderTemplate } = require("../utils/app-config");
const { upsertGuildConfig } = require("../utils/guild-config");

async function createTempVoiceChannel(newState) {
  const settings = getGuildSettings(newState.guild.id).voiceSystem;

  if (!settings.createChannelId || newState.channelId !== settings.createChannelId || !newState.member) {
    return;
  }

  await upsertGuildConfig(newState.guild.id, {});

  const name = renderTemplate(settings.channelName, {
    guild: {
      id: newState.guild.id,
      name: newState.guild.name,
    },
    user: {
      id: newState.member.id,
      name: newState.member.user.username,
      tag: newState.member.user.tag,
      mention: `${newState.member}`,
    },
  });
  const parent = settings.categoryId || newState.channel?.parentId || null;
  const channel = await newState.guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent,
    reason: "Temp VC auto create",
  });

  await prisma.tempVC.create({
    data: {
      guildId: newState.guild.id,
      channelId: channel.id,
      ownerId: newState.member.id,
    },
  });

  await newState.member.voice.setChannel(channel, "Move owner to temp VC").catch(async (error) => {
    console.error(`Failed to move member to temp VC ${channel.id}:`, error);
    await prisma.tempVC.delete({ where: { channelId: channel.id } }).catch(() => undefined);
    await channel.delete("Temp VC cleanup after move failure").catch(() => undefined);
  });
}

async function deleteEmptyTempVoiceChannel(oldState) {
  if (!oldState.channelId || oldState.channelId === oldState.guild?.afkChannelId) {
    return;
  }

  const tempVC = await prisma.tempVC.findUnique({
    where: { channelId: oldState.channelId },
  });

  if (!tempVC) {
    return;
  }

  const channel = oldState.guild.channels.cache.get(oldState.channelId)
    ?? await oldState.guild.channels.fetch(oldState.channelId).catch(() => null);

  if (channel && channel.members.size > 0) {
    return;
  }

  await prisma.tempVC.delete({ where: { channelId: oldState.channelId } }).catch(() => undefined);

  if (channel) {
    await channel.delete("Temp VC empty").catch((error) => {
      console.error(`Failed to delete temp VC ${oldState.channelId}:`, error);
    });
  }
}

function registerTempVoiceEvents(client) {
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    await createTempVoiceChannel(newState);
    await deleteEmptyTempVoiceChannel(oldState);
  });
}

module.exports = {
  registerTempVoiceEvents,
};
