const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");
const { prisma } = require("../db");
const { upsertGuildConfig } = require("../utils/guild-config");

const data = new SlashCommandBuilder()
  .setName("rolepanel")
  .setDescription("ボタン式ロールパネルを管理します")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("create")
      .setDescription("ロールパネルを作成します")
      .addStringOption((option) =>
        option
          .setName("title")
          .setDescription("パネルのタイトル")
          .setRequired(true)
          .setMaxLength(100),
      )
      .addStringOption((option) =>
        option
          .setName("description")
          .setDescription("パネルの説明")
          .setMaxLength(1000),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("add-option")
      .setDescription("ロールパネルに選択肢を追加します")
      .addStringOption((option) =>
        option
          .setName("panel-id")
          .setDescription("パネルID")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addRoleOption((option) =>
        option
          .setName("role")
          .setDescription("付与/解除するロール")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("label")
          .setDescription("ボタン表示名")
          .setRequired(true)
          .setMaxLength(80),
      )
      .addStringOption((option) =>
        option
          .setName("emoji")
          .setDescription("ボタン絵文字"),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("post")
      .setDescription("ロールパネルを投稿します")
      .addStringOption((option) =>
        option
          .setName("panel-id")
          .setDescription("パネルID")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("投稿先。省略時は現在のチャンネル")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("delete")
      .setDescription("ロールパネルを削除します")
      .addStringOption((option) =>
        option
          .setName("panel-id")
          .setDescription("パネルID")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addBooleanOption((option) =>
        option
          .setName("delete-message")
          .setDescription("投稿済みメッセージも削除します")
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("list")
      .setDescription("ロールパネル一覧を表示します"),
  );

function buildRolePanelMessage(panel) {
  const embed = new EmbedBuilder()
    .setTitle(panel.title)
    .setColor(0x57f287);

  if (panel.description) {
    embed.setDescription(panel.description);
  }

  const rows = [];
  let currentRow = new ActionRowBuilder();

  panel.options.forEach((option, index) => {
    if (index > 0 && index % 5 === 0) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }

    const button = new ButtonBuilder()
      .setCustomId(`rolepanel:${option.id}`)
      .setLabel(option.label)
      .setStyle(ButtonStyle.Secondary);

    if (option.emoji) {
      button.setEmoji(option.emoji);
    }

    currentRow.addComponents(button);
  });

  if (currentRow.components.length > 0) {
    rows.push(currentRow);
  }

  return {
    embeds: [embed],
    components: rows,
  };
}

async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const panels = await prisma.rolePanel.findMany({
    where: { guildId: interaction.guildId },
    include: { options: true },
    orderBy: { updatedAt: "desc" },
    take: 25,
  });
  const choices = panels
    .filter((panel) => {
      if (!focused) {
        return true;
      }

      return panel.id.toLowerCase().includes(focused) || panel.title.toLowerCase().includes(focused);
    })
    .slice(0, 25)
    .map((panel) => ({
      name: `${panel.title} (${panel.options.length}件) / ${panel.id.slice(-8)}`,
      value: panel.id,
    }));

  await interaction.respond(choices);
}

async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "create") {
    const title = interaction.options.getString("title", true);
    const description = interaction.options.getString("description");

    await upsertGuildConfig(interaction.guildId, {});

    const panel = await prisma.rolePanel.create({
      data: {
        guildId: interaction.guildId,
        title,
        description,
        createdById: interaction.user.id,
      },
    });

    await interaction.reply({
      content: `ロールパネルを作成しました。\nID: \`${panel.id}\``,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "add-option") {
    const panelId = interaction.options.getString("panel-id", true);
    const role = interaction.options.getRole("role", true);
    const label = interaction.options.getString("label", true);
    const emoji = interaction.options.getString("emoji");

    const panel = await prisma.rolePanel.findFirst({
      where: {
        id: panelId,
        guildId: interaction.guildId,
      },
      include: { options: true },
    });

    if (!panel) {
      await interaction.reply({ content: "パネルが見つかりません。", ephemeral: true });
      return;
    }

    if (panel.options.length >= 25) {
      await interaction.reply({ content: "1つのパネルに追加できる選択肢は25個までです。", ephemeral: true });
      return;
    }

    await prisma.rolePanelOption.create({
      data: {
        panelId: panel.id,
        roleId: role.id,
        label,
        emoji,
      },
    });

    await interaction.reply({
      content: `${role} を切り替える選択肢を追加しました。`,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "post") {
    const panelId = interaction.options.getString("panel-id", true);
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    const panel = await prisma.rolePanel.findFirst({
      where: {
        id: panelId,
        guildId: interaction.guildId,
      },
      include: {
        options: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!panel) {
      await interaction.reply({ content: "パネルが見つかりません。", ephemeral: true });
      return;
    }

    if (panel.options.length === 0) {
      await interaction.reply({ content: "選択肢がないため投稿できません。", ephemeral: true });
      return;
    }

    if (!channel?.isTextBased()) {
      await interaction.reply({ content: "テキストチャンネルを指定してください。", ephemeral: true });
      return;
    }

    const message = await channel.send(buildRolePanelMessage(panel));

    await prisma.rolePanel.update({
      where: { id: panel.id },
      data: {
        channelId: channel.id,
        messageId: message.id,
      },
    });

    await interaction.reply({
      content: `ロールパネルを ${channel} に投稿しました。`,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "delete") {
    const panelId = interaction.options.getString("panel-id", true);
    const shouldDeleteMessage = interaction.options.getBoolean("delete-message") ?? true;
    const panel = await prisma.rolePanel.findFirst({
      where: {
        id: panelId,
        guildId: interaction.guildId,
      },
    });

    if (!panel) {
      await interaction.reply({ content: "パネルが見つかりません。", ephemeral: true });
      return;
    }

    let deletedMessage = false;

    if (shouldDeleteMessage && panel.channelId && panel.messageId) {
      const channel = await interaction.guild.channels.fetch(panel.channelId).catch(() => null);

      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(panel.messageId).catch(() => null);

        if (message) {
          await message.delete().catch(() => undefined);
          deletedMessage = true;
        }
      }
    }

    await prisma.rolePanel.delete({ where: { id: panel.id } });

    await interaction.reply({
      content: `ロールパネル「${panel.title}」を削除しました。${deletedMessage ? "\n投稿済みメッセージも削除しました。" : ""}`,
      ephemeral: true,
    });
    return;
  }

  const panels = await prisma.rolePanel.findMany({
    where: { guildId: interaction.guildId },
    include: { options: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (panels.length === 0) {
    await interaction.reply({ content: "ロールパネルはまだありません。", ephemeral: true });
    return;
  }

  await interaction.reply({
    content: panels
      .map((panel) => `\`${panel.id}\` ${panel.title} (${panel.options.length}件)`)
      .join("\n"),
    ephemeral: true,
  });
}

module.exports = {
  autocomplete,
  buildRolePanelMessage,
  data,
  execute,
};
