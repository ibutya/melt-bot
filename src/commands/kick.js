const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { sendModerationActionLog } = require("../utils/moderation-log");

const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("ユーザーをKickします")
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
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

  const member = await interaction.guild.members.fetch(user.id).catch(() => null);

  if (!member) {
    await interaction.reply({ content: "対象メンバーがサーバー内に見つかりません。", ephemeral: true });
    return;
  }

  await member.kick(reason);
  await sendModerationActionLog(interaction.guild, "KICK", user, interaction.user, reason);
  await interaction.reply({ content: `${user} をKickしました。`, ephemeral: true });
}

module.exports = {
  data,
  execute,
};
