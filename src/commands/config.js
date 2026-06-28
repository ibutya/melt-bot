const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { LOG_CATEGORIES, getGuildSettings } = require("../utils/app-config");

const data = new SlashCommandBuilder()
  .setName("config")
  .setDescription("config.jsonの現在値を表示します")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("show")
      .setDescription("現在のサーバー設定を表示します"),
  );

async function execute(interaction) {
  const config = getGuildSettings(interaction.guildId);
  const welcome = config.welcome;
  const voice = config.voiceSystem;
  const ticket = config.ticket;
  const suggestion = config.suggestion;
  const logLines = LOG_CATEGORIES.map((category) => {
    const log = config.logs[category];
    const channel = log.channelId ? `<#${log.channelId}>` : "未設定";
    const status = log.enabled === false ? "OFF" : "ON";

    return `${category}: ${status} / ${channel}`;
  });

  const welcomeChannel = welcome.channelId ? `<#${welcome.channelId}>` : "未設定";
  const welcomeStatus = welcome.enabled === false ? "OFF" : "ON";

  await interaction.reply({
    content: [
      `welcome: ${welcomeStatus} / ${welcomeChannel}`,
      `welcome message: ${welcome.message}`,
      `voice trigger: ${voice.createChannelId ? `<#${voice.createChannelId}>` : "未設定"}`,
      `ticket category: ${ticket.categoryId || "未設定"}`,
      `suggestion: ${suggestion.enabled === false ? "OFF" : "ON"} / ${suggestion.channelId ? `<#${suggestion.channelId}>` : "未設定"} / anonymous=${suggestion.anonymous}`,
      "",
      ...logLines,
      "",
      "設定変更はプロジェクト直下の config.json を編集してください。",
    ].join("\n"),
    ephemeral: true,
  });
}

module.exports = {
  data,
  execute,
};
