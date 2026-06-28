const { prisma } = require("../db");

async function handleRolePanelButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith("rolepanel:")) {
    return false;
  }

  const optionId = interaction.customId.slice("rolepanel:".length);
  const option = await prisma.rolePanelOption.findUnique({
    where: { id: optionId },
    include: { panel: true },
  });

  if (!option || option.panel.guildId !== interaction.guildId) {
    await interaction.reply({
      content: "このロールパネルは現在利用できません。",
      ephemeral: true,
    });
    return true;
  }

  const guild = interaction.guild;
  const role = await guild.roles.fetch(option.roleId).catch(() => null);

  if (!role) {
    await interaction.reply({
      content: "対象ロールが見つかりません。",
      ephemeral: true,
    });
    return true;
  }

  const botMember = await guild.members.fetchMe();

  if (role.managed || role.position >= botMember.roles.highest.position) {
    await interaction.reply({
      content: "Botより上位または管理ロールのため操作できません。",
      ephemeral: true,
    });
    return true;
  }

  const member = await guild.members.fetch(interaction.user.id);
  const hasRole = member.roles.cache.has(role.id);

  if (hasRole) {
    await member.roles.remove(role, "Role panel toggle");
    await interaction.reply({
      content: `${role} を外しました。`,
      ephemeral: true,
    });
    return true;
  }

  await member.roles.add(role, "Role panel toggle");
  await interaction.reply({
    content: `${role} を付与しました。`,
    ephemeral: true,
  });
  return true;
}

module.exports = { handleRolePanelButton };
