const { PermissionFlagsBits, Routes, SlashCommandBuilder } = require("discord.js");
const { prisma } = require("../db");

const data = new SlashCommandBuilder()
  .setName("vc")
  .setDescription("自分のTempVCを管理します")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("name")
      .setDescription("VC名を変更します")
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("新しいVC名")
          .setRequired(true)
          .setMaxLength(100),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("limit")
      .setDescription("VCの人数上限を変更します")
      .addIntegerOption((option) =>
        option
          .setName("number")
          .setDescription("0で制限なし")
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(99),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("VCステータスを変更します")
      .addStringOption((option) =>
        option
          .setName("text")
          .setDescription("ステータス")
          .setRequired(true)
          .setMaxLength(500),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("lock")
      .setDescription("VCをロックします"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("unlock")
      .setDescription("VCロックを解除します"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("hide")
      .setDescription("VCを非表示にします"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("show")
      .setDescription("VCの非表示を解除します"),
  );

async function getManagedVoice(interaction) {
  const channel = interaction.member.voice.channel;

  if (!channel) {
    await interaction.reply({ content: "VCに参加してから実行してください。", ephemeral: true });
    return null;
  }

  const tempVC = await prisma.tempVC.findUnique({
    where: { channelId: channel.id },
  });

  if (!tempVC) {
    await interaction.reply({ content: "このVCはBotが作成したTempVCではありません。", ephemeral: true });
    return null;
  }

  const canManage = tempVC.ownerId === interaction.user.id
    || interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

  if (!canManage) {
    await interaction.reply({ content: "このVCを管理できるのは作成者またはチャンネル管理権限を持つメンバーです。", ephemeral: true });
    return null;
  }

  return { channel, tempVC };
}

async function setVoiceStatus(channel, text) {
  if (typeof channel.setStatus === "function") {
    await channel.setStatus(text);
    return;
  }

  await channel.client.rest.put(Routes.channelVoiceStatus(channel.id), {
    body: { status: text },
  });
}

async function execute(interaction) {
  const managedVoice = await getManagedVoice(interaction);

  if (!managedVoice) {
    return;
  }

  const { channel, tempVC } = managedVoice;
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "name") {
    const name = interaction.options.getString("name", true);

    await channel.setName(name, "Temp VC owner rename");
    await interaction.reply({ content: `VC名を「${name}」に変更しました。`, ephemeral: true });
    return;
  }

  if (subcommand === "limit") {
    const number = interaction.options.getInteger("number", true);

    await channel.setUserLimit(number, "Temp VC owner limit");
    await interaction.reply({ content: `人数上限を ${number === 0 ? "なし" : `${number}人`} に変更しました。`, ephemeral: true });
    return;
  }

  if (subcommand === "status") {
    const text = interaction.options.getString("text", true);

    await setVoiceStatus(channel, text);
    await interaction.reply({ content: "VCステータスを変更しました。", ephemeral: true });
    return;
  }

  if (subcommand === "lock") {
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
      Connect: false,
    }, { reason: "Temp VC owner lock" });
    await channel.permissionOverwrites.edit(tempVC.ownerId, {
      Connect: true,
      ViewChannel: true,
    }, { reason: "Temp VC owner lock owner allow" });
    await interaction.reply({ content: "VCをロックしました。", ephemeral: true });
    return;
  }

  if (subcommand === "unlock") {
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
      Connect: null,
    }, { reason: "Temp VC owner unlock" });
    await channel.permissionOverwrites.edit(tempVC.ownerId, {
      Connect: null,
    }, { reason: "Temp VC owner unlock owner reset" });
    await interaction.reply({ content: "VCロックを解除しました。", ephemeral: true });
    return;
  }

  if (subcommand === "hide") {
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
      ViewChannel: false,
    }, { reason: "Temp VC owner hide" });
    await channel.permissionOverwrites.edit(tempVC.ownerId, {
      ViewChannel: true,
      Connect: true,
    }, { reason: "Temp VC owner hide owner allow" });
    await interaction.reply({ content: "VCを非表示にしました。", ephemeral: true });
    return;
  }

  await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
    ViewChannel: null,
  }, { reason: "Temp VC owner show" });
  await channel.permissionOverwrites.edit(tempVC.ownerId, {
    ViewChannel: null,
  }, { reason: "Temp VC owner show owner reset" });
  await interaction.reply({ content: "VCの非表示を解除しました。", ephemeral: true });
}

module.exports = {
  data,
  execute,
};
