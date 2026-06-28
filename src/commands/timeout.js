const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { sendModerationActionLog } = require("../utils/moderation-log");

const data = new SlashCommandBuilder()
  .setName("timeout")
  .setDescription("ユーザーをTimeoutします")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("対象ユーザー")
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("minutes")
      .setDescription("Timeout時間（分）")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(40320),
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("理由")
      .setMaxLength(1000),
  );

async function execute(interaction) {
  const user = interaction.options.getUser("user", true);
  const minutes = interaction.options.getInteger("minutes", true);
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

  await member.timeout(minutes * 60 * 1000, reason);
  await sendModerationActionLog(interaction.guild, "TIMEOUT", user, interaction.user, reason, [
    { name: "期間", value: `${minutes}分`, inline: true },
  ]);
  await interaction.reply({ content: `${user} を ${minutes}分 Timeoutしました。`, ephemeral: true });
}

module.exports = {
  data,
  execute,
};
