const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { sendModerationActionLog } = require("../utils/moderation-log");

const data = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("ユーザーをBANします")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("対象ユーザー")
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("delete-message-days")
      .setDescription("削除する過去メッセージの日数")
      .setMinValue(0)
      .setMaxValue(7),
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("理由")
      .setMaxLength(1000),
  );

async function execute(interaction) {
  const user = interaction.options.getUser("user", true);
  const deleteMessageDays = interaction.options.getInteger("delete-message-days") ?? 0;
  const reason = interaction.options.getString("reason") ?? "理由なし";

  if (user.id === interaction.user.id) {
    await interaction.reply({ content: "自分自身には実行できません。", ephemeral: true });
    return;
  }

  await interaction.guild.members.ban(user.id, {
    deleteMessageSeconds: deleteMessageDays * 24 * 60 * 60,
    reason,
  });
  await sendModerationActionLog(interaction.guild, "BAN", user, interaction.user, reason, [
    { name: "削除メッセージ", value: `${deleteMessageDays}日`, inline: true },
  ]);
  await interaction.reply({ content: `${user} をBANしました。`, ephemeral: true });
}

module.exports = {
  data,
  execute,
};
