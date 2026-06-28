const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");
const { closeTicket } = require("../interactions/ticket");
const { getGuildSettings } = require("../utils/app-config");

const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("チケットを管理します")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("panel")
      .setDescription("チケット作成パネルを投稿します"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("close")
      .setDescription("現在のチケットをクローズします"),
  );

async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "close") {
    await closeTicket(interaction);
    return;
  }

  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({ content: "チケットパネルを投稿する権限がありません。", ephemeral: true });
    return;
  }

  const settings = getGuildSettings(interaction.guildId).ticket;
  const embed = new EmbedBuilder()
    .setTitle(settings.panelTitle)
    .setDescription(settings.panelDescription)
    .setColor(0x5865f2);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:create")
      .setLabel("チケット作成")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: "チケットパネルを投稿しました。", ephemeral: true });
}

module.exports = {
  data,
  execute,
};
