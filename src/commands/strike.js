const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { prisma } = require("../db");
const { changeStrikeCount, setStrikeCount } = require("../services/strikes");
const { formatUser, truncateText } = require("../utils/text");

const data = new SlashCommandBuilder()
  .setName("strike")
  .setDescription("Strikeを管理します")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("add")
      .setDescription("Strikeを追加します")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("対象ユーザー")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("count")
          .setDescription("追加数")
          .setMinValue(1)
          .setMaxValue(10),
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("理由")
          .setMaxLength(1000),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("remove")
      .setDescription("Strikeを減らします")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("対象ユーザー")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("count")
          .setDescription("減少数")
          .setMinValue(1)
          .setMaxValue(10),
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("理由")
          .setMaxLength(1000),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("set")
      .setDescription("Strikeを指定値にします")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("対象ユーザー")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("count")
          .setDescription("設定値")
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(100),
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("理由")
          .setMaxLength(1000),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("check")
      .setDescription("現在のStrikeを確認します")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("対象ユーザー")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("history")
      .setDescription("Strike履歴を表示します")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("対象ユーザー")
          .setRequired(true),
      ),
  );

async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const user = interaction.options.getUser("user", true);

  if (["add", "remove", "set"].includes(subcommand) && user.id === interaction.user.id) {
    await interaction.reply({
      content: "自分自身のStrikeは操作できません。",
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "add") {
    const count = interaction.options.getInteger("count") ?? 1;
    const reason = interaction.options.getString("reason") ?? "理由なし";
    const result = await changeStrikeCount({
      guild: interaction.guild,
      user,
      moderator: interaction.user,
      amount: count,
      reason,
    });

    await interaction.reply({
      content: `${user} のStrikeを ${result.oldCount} → ${result.newCount} にしました。${result.punishmentResult ? `\n処罰: ${result.punishmentResult}` : ""}`,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "remove") {
    const count = interaction.options.getInteger("count") ?? 1;
    const reason = interaction.options.getString("reason") ?? "理由なし";
    const result = await changeStrikeCount({
      guild: interaction.guild,
      user,
      moderator: interaction.user,
      amount: -count,
      reason,
      applyAutoPunishment: false,
    });

    await interaction.reply({
      content: `${user} のStrikeを ${result.oldCount} → ${result.newCount} にしました。`,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "set") {
    const count = interaction.options.getInteger("count", true);
    const reason = interaction.options.getString("reason") ?? "理由なし";
    const result = await setStrikeCount({
      guild: interaction.guild,
      user,
      moderator: interaction.user,
      count,
      reason,
    });

    await interaction.reply({
      content: `${user} のStrikeを ${result.oldCount} → ${result.newCount} にしました。${result.punishmentResult ? `\n処罰: ${result.punishmentResult}` : ""}`,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "check") {
    const record = await prisma.strikeUser.findUnique({
      where: {
        guildId_userId: {
          guildId: interaction.guildId,
          userId: user.id,
        },
      },
    });

    await interaction.reply({
      content: `${user} のStrike: ${record?.strikeCount ?? 0}`,
      ephemeral: true,
    });
    return;
  }

  const histories = await prisma.strikeHistory.findMany({
    where: {
      guildId: interaction.guildId,
      userId: user.id,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (histories.length === 0) {
    await interaction.reply({ content: `${user} のStrike履歴はありません。`, ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${formatUser(user)} のStrike履歴`)
    .setColor(0x5865f2)
    .setDescription(
      histories
        .map((history) => {
          const createdAt = `<t:${Math.floor(history.createdAt.getTime() / 1000)}:R>`;
          const moderator = history.moderatorId ? `<@${history.moderatorId}>` : "System";

          return `${createdAt} / ${history.amount > 0 ? "+" : ""}${history.amount} / ${moderator}\n${truncateText(history.reason, 160)}`;
        })
        .join("\n\n"),
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = {
  data,
  execute,
};
