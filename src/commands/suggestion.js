const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");
const { getGuildSettings } = require("../utils/app-config");

const data = new SlashCommandBuilder()
  .setName("suggestion")
  .setDescription("意見箱を管理します")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("panel")
      .setDescription("意見箱パネルを投稿します"),
  );

async function execute(interaction) {
  const settings = getGuildSettings(interaction.guildId).suggestion;
  const embed = new EmbedBuilder()
    .setTitle(settings.panelTitle)
    .setDescription(settings.panelDescription)
    .setColor(0x57f287);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("suggestion:open")
      .setLabel("送信")
      .setStyle(ButtonStyle.Success),
  );

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: "意見箱パネルを投稿しました。", ephemeral: true });
}

module.exports = {
  data,
  execute,
};
