const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { sendModerationActionLog } = require("../utils/moderation-log");

const data = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("ユーザーに警告します")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("対象ユーザー")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("理由")
      .setMaxLength(1000),
  );

async function execute(interaction) {
  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") ?? "理由なし";

  if (user.id === interaction.user.id) {
    await interaction.reply({ content: "自分自身には実行できません。", ephemeral: true });
    return;
  }

  await user.send(`警告: ${reason}`).catch(() => undefined);
  await sendModerationActionLog(interaction.guild, "WARN", user, interaction.user, reason);
  await interaction.reply({ content: `${user} に警告しました。`, ephemeral: true });
}

module.exports = {
  data,
  execute,
};
