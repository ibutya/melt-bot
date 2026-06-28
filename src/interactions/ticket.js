const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const { prisma } = require("../db");
const { getGuildSettings } = require("../utils/app-config");
const { upsertGuildConfig } = require("../utils/guild-config");

function buildTicketCloseRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:close")
      .setLabel("クローズ")
      .setStyle(ButtonStyle.Danger),
  );
}

function buildTicketDeleteRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:delete-request")
      .setLabel("削除")
      .setStyle(ButtonStyle.Danger),
  );
}

function buildTicketDeleteConfirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:delete-confirm")
      .setLabel("削除する")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("ticket:delete-cancel")
      .setLabel("キャンセル")
      .setStyle(ButtonStyle.Secondary),
  );
}

async function createTicket(interaction) {
  const settings = getGuildSettings(interaction.guildId).ticket;

  if (settings.enabled === false) {
    await interaction.reply({ content: "チケットは現在無効です。", ephemeral: true });
    return;
  }

  const existingTicket = await prisma.ticket.findFirst({
    where: {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      status: "OPEN",
    },
  });

  if (existingTicket) {
    await interaction.reply({
      content: `既に開いているチケットがあります: <#${existingTicket.channelId}>`,
      ephemeral: true,
    });
    return;
  }

  await upsertGuildConfig(interaction.guildId, {});

  const parent = settings.categoryId || interaction.channel?.parentId || null;
  const permissionOverwrites = [
    {
      id: interaction.guild.roles.everyone,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    ...settings.supportRoleIds.map((roleId) => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    })),
  ];
  const channel = await interaction.guild.channels.create({
    name: `ticket-${interaction.user.id.slice(-6)}`,
    type: ChannelType.GuildText,
    parent,
    permissionOverwrites,
    reason: "Ticket created",
  });

  await prisma.ticket.create({
    data: {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      channelId: channel.id,
    },
  });

  await channel.send({
    content: `${interaction.user} チケットを作成しました。`,
    components: [buildTicketCloseRow()],
  });

  await interaction.reply({
    content: `チケットを作成しました: ${channel}`,
    ephemeral: true,
  });
}

async function closeTicket(interaction) {
  const ticket = await prisma.ticket.findFirst({
    where: {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      status: "OPEN",
    },
  });

  if (!ticket) {
    await interaction.reply({ content: "このチャンネルは開いているチケットではありません。", ephemeral: true });
    return;
  }

  const canClose = ticket.userId === interaction.user.id
    || interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

  if (!canClose) {
    await interaction.reply({ content: "このチケットをクローズする権限がありません。", ephemeral: true });
    return;
  }

  await prisma.ticket.update({
    where: { ticketId: ticket.ticketId },
    data: { status: "CLOSED" },
  });

  await interaction.reply({
    content: `チケットをクローズしました。\nクローズした人: ${interaction.user}`,
    components: [buildTicketDeleteRow()],
    ephemeral: false,
  });

  await interaction.channel.permissionOverwrites.edit(ticket.userId, {
    ViewChannel: false,
    SendMessages: false,
    ReadMessageHistory: false,
  }, { reason: "Ticket closed" }).catch(() => undefined);
  await interaction.channel.setName(`closed-${interaction.channel.name}`.slice(0, 100), "Ticket closed").catch(() => undefined);
}

async function requestDeleteTicket(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({ content: "チケットを削除する権限がありません。", ephemeral: true });
    return;
  }

  const ticket = await prisma.ticket.findFirst({
    where: {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      status: "CLOSED",
    },
  });

  if (!ticket) {
    await interaction.reply({ content: "削除できるクローズ済みチケットが見つかりません。", ephemeral: true });
    return;
  }

  await interaction.reply({
    content: "このチケットを削除しますか？",
    components: [buildTicketDeleteConfirmRow()],
    ephemeral: true,
  });
}

async function confirmDeleteTicket(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({ content: "チケットを削除する権限がありません。", ephemeral: true });
    return;
  }

  const ticket = await prisma.ticket.findFirst({
    where: {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      status: "CLOSED",
    },
  });

  if (!ticket) {
    await interaction.update({ content: "削除できるクローズ済みチケットが見つかりません。", components: [] });
    return;
  }

  await prisma.ticket.delete({ where: { ticketId: ticket.ticketId } });
  await interaction.update({ content: "チケットを削除します。", components: [] });
  await interaction.channel.delete(`Ticket deleted by ${interaction.user.tag}`).catch((error) => {
    console.error(`Failed to delete ticket channel ${interaction.channelId}:`, error);
  });
}

async function cancelDeleteTicket(interaction) {
  await interaction.update({ content: "削除をキャンセルしました。", components: [] });
}

async function handleTicketInteraction(interaction) {
  if (interaction.isButton() && interaction.customId === "ticket:create") {
    await createTicket(interaction);
    return true;
  }

  if (interaction.isButton() && interaction.customId === "ticket:close") {
    await closeTicket(interaction);
    return true;
  }

  if (interaction.isButton() && interaction.customId === "ticket:delete-request") {
    await requestDeleteTicket(interaction);
    return true;
  }

  if (interaction.isButton() && interaction.customId === "ticket:delete-confirm") {
    await confirmDeleteTicket(interaction);
    return true;
  }

  if (interaction.isButton() && interaction.customId === "ticket:delete-cancel") {
    await cancelDeleteTicket(interaction);
    return true;
  }

  return false;
}

module.exports = {
  buildTicketCloseRow,
  buildTicketDeleteRow,
  closeTicket,
  handleTicketInteraction,
};
