const {
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { getGuildSettings } = require("../utils/app-config");

function buildSuggestionModal() {
  const input = new TextInputBuilder()
    .setCustomId("content")
    .setLabel("内容")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000);

  return new ModalBuilder()
    .setCustomId("suggestion:submit")
    .setTitle("意見箱")
    .addComponents(new ActionRowBuilder().addComponents(input));
}

async function handleSuggestionInteraction(interaction) {
  if (interaction.isButton() && interaction.customId === "suggestion:open") {
    await interaction.showModal(buildSuggestionModal());
    return true;
  }

  if (!interaction.isModalSubmit() || interaction.customId !== "suggestion:submit") {
    return false;
  }

  const settings = getGuildSettings(interaction.guildId).suggestion;

  if (settings.enabled === false || !settings.channelId) {
    await interaction.reply({ content: "意見箱は現在利用できません。", ephemeral: true });
    return true;
  }

  const channel = await interaction.guild.channels.fetch(settings.channelId).catch(() => null);

  if (!channel?.isTextBased()) {
    await interaction.reply({ content: "意見箱チャンネルが見つかりません。", ephemeral: true });
    return true;
  }

  const content = interaction.fields.getTextInputValue("content");
  const embed = new EmbedBuilder()
    .setTitle("意見箱")
    .setDescription(content)
    .setColor(0x5865f2)
    .setTimestamp();

  if (!settings.anonymous) {
    embed.setAuthor({
      name: interaction.user.tag,
      iconURL: interaction.user.displayAvatarURL(),
    });
    embed.setFooter({ text: interaction.user.id });
  }

  await channel.send({ embeds: [embed] });
  await interaction.reply({ content: "送信しました。", ephemeral: true });
  return true;
}

module.exports = { handleSuggestionInteraction };
