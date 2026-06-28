const { AuditLogEvent, ChannelType, Events, PermissionsBitField } = require("discord.js");
const { createLogEmbed, sendGuildLog } = require("../utils/guild-log");
const { formatUser, truncateText } = require("../utils/text");

const AUDIT_LOG_WINDOW_MS = 10_000;

const CHANNEL_TYPE_NAMES = {
  [ChannelType.GuildText]: "テキスト",
  [ChannelType.GuildVoice]: "VC",
  [ChannelType.GuildCategory]: "カテゴリ",
  [ChannelType.GuildAnnouncement]: "アナウンス",
  [ChannelType.GuildStageVoice]: "ステージ",
  [ChannelType.GuildForum]: "フォーラム",
  [ChannelType.GuildMedia]: "メディア",
};

const SCHEDULED_EVENT_STATUS_NAMES = {
  1: "予定",
  2: "開催中",
  3: "完了",
  4: "キャンセル",
};

async function fetchPartial(value) {
  if (!value?.partial) {
    return value;
  }

  return value.fetch().catch(() => value);
}

function isRecentAuditEntry(entry) {
  return entry && Date.now() - entry.createdTimestamp < AUDIT_LOG_WINDOW_MS;
}

async function findRecentAuditEntry(guild, type, predicate = () => true) {
  try {
    const auditLogs = await guild.fetchAuditLogs({ type, limit: 5 });

    return auditLogs.entries.find((entry) => isRecentAuditEntry(entry) && predicate(entry));
  } catch (error) {
    console.error(`Failed to fetch audit logs for ${guild.id}:`, error);
    return null;
  }
}

function addExecutorField(embed, entry) {
  if (entry?.executor) {
    embed.addFields({ name: "実行者", value: formatUser(entry.executor), inline: true });
  }
}

async function addAuditExecutor(embed, guild, auditType, targetId) {
  const entry = await findRecentAuditEntry(
    guild,
    auditType,
    (auditEntry) => !targetId || auditEntry.target?.id === targetId,
  );

  addExecutorField(embed, entry);
  return entry;
}

function getChannelKind(channel) {
  return channel?.type === ChannelType.GuildCategory ? "カテゴリ" : "チャンネル";
}

function formatChannelType(channel) {
  return CHANNEL_TYPE_NAMES[channel?.type] ?? `Type ${channel?.type ?? "Unknown"}`;
}

function formatChannel(channel) {
  if (!channel) {
    return "Unknown";
  }

  return `${channel} (${channel.id})`;
}

function formatParent(parentId) {
  return parentId ? `<#${parentId}>` : "なし";
}

function formatRole(role) {
  if (!role) {
    return "Unknown";
  }

  return `${role} (${role.id})`;
}

function formatDate(value) {
  if (!value) {
    return "なし";
  }

  return `<t:${Math.floor(value.getTime() / 1000)}:F>`;
}

function formatBoolean(value) {
  return value ? "ON" : "OFF";
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "なし";
  }

  return String(value);
}

function addChangedField(embed, name, before, after, inline = false) {
  const beforeText = formatValue(before);
  const afterText = formatValue(after);

  if (beforeText === afterText) {
    return false;
  }

  embed.addFields({
    name,
    value: `${truncateText(beforeText, 450)} → ${truncateText(afterText, 450)}`,
    inline,
  });
  return true;
}

function permissionNames(bitfield) {
  const permissions = new PermissionsBitField(bitfield);
  const names = Object.entries(PermissionsBitField.Flags)
    .filter(([, flag]) => permissions.has(flag))
    .map(([name]) => name);

  return names.length > 0 ? names.join(", ") : "なし";
}

function addPermissionDiffField(embed, name, oldPermissions, newPermissions) {
  const oldBits = new PermissionsBitField(oldPermissions).bitfield;
  const newBits = new PermissionsBitField(newPermissions).bitfield;

  if (oldBits === newBits) {
    return false;
  }

  const added = new PermissionsBitField(newBits & ~oldBits);
  const removed = new PermissionsBitField(oldBits & ~newBits);
  const lines = [];

  if (added.bitfield !== 0n) {
    lines.push(`追加: ${permissionNames(added)}`);
  }

  if (removed.bitfield !== 0n) {
    lines.push(`削除: ${permissionNames(removed)}`);
  }

  embed.addFields({ name, value: truncateText(lines.join("\n"), 1000) });
  return true;
}

function formatOverwriteTarget(guild, overwrite) {
  if (!overwrite) {
    return "Unknown";
  }

  if (overwrite.id === guild.id) {
    return "@everyone";
  }

  return overwrite.type === 1 ? `<@${overwrite.id}>` : `<@&${overwrite.id}>`;
}

function formatOverwrite(overwrite) {
  return [
    `許可: ${permissionNames(overwrite.allow)}`,
    `拒否: ${permissionNames(overwrite.deny)}`,
  ].join("\n");
}

function addOverwriteDiffField(embed, guild, oldChannel, newChannel) {
  if (!oldChannel.permissionOverwrites?.cache || !newChannel.permissionOverwrites?.cache) {
    return false;
  }

  const lines = [];
  const overwriteIds = new Set([
    ...oldChannel.permissionOverwrites.cache.keys(),
    ...newChannel.permissionOverwrites.cache.keys(),
  ]);

  for (const overwriteId of overwriteIds) {
    const oldOverwrite = oldChannel.permissionOverwrites.cache.get(overwriteId);
    const newOverwrite = newChannel.permissionOverwrites.cache.get(overwriteId);
    const target = formatOverwriteTarget(guild, newOverwrite ?? oldOverwrite);

    if (!oldOverwrite && newOverwrite) {
      lines.push(`追加: ${target}\n${formatOverwrite(newOverwrite)}`);
      continue;
    }

    if (oldOverwrite && !newOverwrite) {
      lines.push(`削除: ${target}\n${formatOverwrite(oldOverwrite)}`);
      continue;
    }

    if (
      oldOverwrite.allow.bitfield !== newOverwrite.allow.bitfield
      || oldOverwrite.deny.bitfield !== newOverwrite.deny.bitfield
    ) {
      lines.push(`変更: ${target}\n変更前:\n${formatOverwrite(oldOverwrite)}\n変更後:\n${formatOverwrite(newOverwrite)}`);
    }
  }

  if (lines.length === 0) {
    return false;
  }

  embed.addFields({ name: "権限上書き", value: truncateText(lines.join("\n\n"), 1000) });
  return true;
}

function formatScheduledEventStatus(status) {
  return SCHEDULED_EVENT_STATUS_NAMES[status] ?? String(status ?? "Unknown");
}

function addScheduledEventFields(embed, scheduledEvent) {
  embed.addFields(
    { name: "イベント", value: `${scheduledEvent.name} (${scheduledEvent.id})`, inline: true },
    { name: "状態", value: formatScheduledEventStatus(scheduledEvent.status), inline: true },
    { name: "開始", value: formatDate(scheduledEvent.scheduledStartAt), inline: true },
  );

  if (scheduledEvent.channel) {
    embed.addFields({ name: "チャンネル", value: formatChannel(scheduledEvent.channel), inline: true });
  }

  if (scheduledEvent.entityMetadata?.location) {
    embed.addFields({
      name: "場所",
      value: truncateText(scheduledEvent.entityMetadata.location, 1000),
      inline: true,
    });
  }
}

function addChannelDiffs(embed, oldChannel, newChannel) {
  let changed = false;

  changed = addChangedField(embed, "名前", oldChannel.name, newChannel.name) || changed;
  changed = addChangedField(embed, "カテゴリ", formatParent(oldChannel.parentId), formatParent(newChannel.parentId)) || changed;
  changed = addChangedField(embed, "位置", oldChannel.position, newChannel.position, true) || changed;

  if ("topic" in oldChannel || "topic" in newChannel) {
    changed = addChangedField(embed, "トピック", oldChannel.topic, newChannel.topic) || changed;
  }

  if ("nsfw" in oldChannel || "nsfw" in newChannel) {
    changed = addChangedField(embed, "NSFW", formatBoolean(oldChannel.nsfw), formatBoolean(newChannel.nsfw), true) || changed;
  }

  if ("rateLimitPerUser" in oldChannel || "rateLimitPerUser" in newChannel) {
    changed = addChangedField(embed, "低速モード", oldChannel.rateLimitPerUser, newChannel.rateLimitPerUser, true) || changed;
  }

  if ("userLimit" in oldChannel || "userLimit" in newChannel) {
    changed = addChangedField(embed, "人数上限", oldChannel.userLimit, newChannel.userLimit, true) || changed;
  }

  if ("bitrate" in oldChannel || "bitrate" in newChannel) {
    changed = addChangedField(embed, "ビットレート", oldChannel.bitrate, newChannel.bitrate, true) || changed;
  }

  if ("rtcRegion" in oldChannel || "rtcRegion" in newChannel) {
    changed = addChangedField(embed, "RTC Region", oldChannel.rtcRegion, newChannel.rtcRegion, true) || changed;
  }

  if ("videoQualityMode" in oldChannel || "videoQualityMode" in newChannel) {
    changed = addChangedField(embed, "映像品質", oldChannel.videoQualityMode, newChannel.videoQualityMode, true) || changed;
  }

  if ("defaultAutoArchiveDuration" in oldChannel || "defaultAutoArchiveDuration" in newChannel) {
    changed = addChangedField(embed, "自動アーカイブ", oldChannel.defaultAutoArchiveDuration, newChannel.defaultAutoArchiveDuration, true) || changed;
  }

  if ("defaultThreadRateLimitPerUser" in oldChannel || "defaultThreadRateLimitPerUser" in newChannel) {
    changed = addChangedField(embed, "スレッド低速モード", oldChannel.defaultThreadRateLimitPerUser, newChannel.defaultThreadRateLimitPerUser, true) || changed;
  }

  if ("status" in oldChannel || "status" in newChannel) {
    changed = addChangedField(embed, "VCステータス", oldChannel.status, newChannel.status) || changed;
  }

  changed = addOverwriteDiffField(embed, newChannel.guild, oldChannel, newChannel) || changed;
  return changed;
}

function addScheduledEventDiffs(embed, oldScheduledEvent, newScheduledEvent) {
  let changed = false;

  changed = addChangedField(embed, "名前", oldScheduledEvent.name, newScheduledEvent.name) || changed;
  changed = addChangedField(embed, "説明", oldScheduledEvent.description, newScheduledEvent.description) || changed;
  changed = addChangedField(
    embed,
    "状態",
    formatScheduledEventStatus(oldScheduledEvent.status),
    formatScheduledEventStatus(newScheduledEvent.status),
    true,
  ) || changed;
  changed = addChangedField(embed, "開始", formatDate(oldScheduledEvent.scheduledStartAt), formatDate(newScheduledEvent.scheduledStartAt), true) || changed;
  changed = addChangedField(embed, "終了", formatDate(oldScheduledEvent.scheduledEndAt), formatDate(newScheduledEvent.scheduledEndAt), true) || changed;
  changed = addChangedField(embed, "チャンネル", oldScheduledEvent.channelId, newScheduledEvent.channelId, true) || changed;
  changed = addChangedField(embed, "場所", oldScheduledEvent.entityMetadata?.location, newScheduledEvent.entityMetadata?.location) || changed;

  return changed;
}

function buildVoiceStateChanges(oldState, newState) {
  const comparisons = [
    ["selfMute", "Mute", "Unmute"],
    ["serverMute", "Server Mute", "Server Unmute"],
    ["selfDeaf", "Deafen", "Undeafen"],
    ["serverDeaf", "Server Deafen", "Server Undeafen"],
    ["selfVideo", "カメラ起動", "カメラ終了"],
    ["streaming", "画面共有開始", "画面共有終了"],
    ["suppress", "ステージ発言抑制", "ステージ発言抑制解除"],
  ];

  return comparisons
    .filter(([key]) => oldState[key] !== newState[key])
    .map(([key, enabledLabel, disabledLabel]) => ({
      key,
      label: newState[key] ? enabledLabel : disabledLabel,
      before: formatBoolean(oldState[key]),
      after: formatBoolean(newState[key]),
      serverSide: key === "serverMute" || key === "serverDeaf" || key === "suppress",
    }));
}

async function logVoiceChannelMovement(guild, member, oldState, newState) {
  let title = "VC移動";
  const fields = [
    { name: "ユーザー", value: formatUser(member?.user), inline: true },
  ];

  if (!oldState.channelId && newState.channel) {
    title = "VC参加";
    fields.push({ name: "チャンネル", value: formatChannel(newState.channel), inline: true });
  } else if (oldState.channel && !newState.channelId) {
    title = "VC退出";
    fields.push({ name: "チャンネル", value: formatChannel(oldState.channel), inline: true });
  } else {
    fields.push(
      { name: "移動前", value: formatChannel(oldState.channel), inline: true },
      { name: "移動後", value: formatChannel(newState.channel), inline: true },
    );
  }

  const embed = createLogEmbed(title, 0x5865f2).addFields(fields);

  if (oldState.channelId && newState.channelId) {
    const moveEntry = await findRecentAuditEntry(
      guild,
      AuditLogEvent.MemberMove,
      (entry) => entry.target?.id === member?.id || entry.extra?.channel?.id === newState.channelId,
    );

    if (moveEntry) {
      embed.setTitle("VC移動（管理者操作）");
      addExecutorField(embed, moveEntry);
    }
  } else if (oldState.channelId && !newState.channelId) {
    const disconnectEntry = await findRecentAuditEntry(
      guild,
      AuditLogEvent.MemberDisconnect,
      (entry) => entry.target?.id === member?.id || entry.extra?.channel?.id === oldState.channelId,
    );

    if (disconnectEntry) {
      embed.setTitle("VC退出（管理者操作）");
      addExecutorField(embed, disconnectEntry);
    }
  }

  await sendGuildLog(guild, "voice", embed);
}

async function logVoiceStateChanges(guild, member, oldState, newState) {
  if (oldState.channelId !== newState.channelId) {
    return;
  }

  const changes = buildVoiceStateChanges(oldState, newState);

  if (changes.length === 0) {
    return;
  }

  const title = changes.length === 1 ? changes[0].label : "VC状態変更";
  const embed = createLogEmbed(title, 0x5865f2)
    .addFields(
      { name: "ユーザー", value: formatUser(member?.user), inline: true },
      { name: "チャンネル", value: formatChannel(newState.channel), inline: true },
      {
        name: "変更",
        value: changes
          .map((change) => `${change.label}: ${change.before} → ${change.after}`)
          .join("\n"),
      },
    );

  if (changes.some((change) => change.serverSide)) {
    const entry = await findRecentAuditEntry(
      guild,
      AuditLogEvent.MemberUpdate,
      (auditEntry) => auditEntry.target?.id === member?.id,
    );

    addExecutorField(embed, entry);
  }

  await sendGuildLog(guild, "voice", embed);
}

function registerLoggingEvents(client) {
  client.on(Events.MessageDelete, async (message) => {
    const fetchedMessage = await fetchPartial(message);

    if (!fetchedMessage.guild || fetchedMessage.author?.bot) {
      return;
    }

    const embed = createLogEmbed("メッセージ削除", 0xed4245)
      .addFields(
        { name: "ユーザー", value: formatUser(fetchedMessage.author), inline: true },
        { name: "チャンネル", value: `${fetchedMessage.channel}`, inline: true },
        { name: "内容", value: truncateText(fetchedMessage.content) },
      );

    await sendGuildLog(fetchedMessage.guild, "message", embed);
  });

  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    const fetchedOldMessage = await fetchPartial(oldMessage);
    const fetchedNewMessage = await fetchPartial(newMessage);

    if (!fetchedNewMessage.guild || fetchedNewMessage.author?.bot) {
      return;
    }

    if (fetchedOldMessage.content === fetchedNewMessage.content) {
      return;
    }

    const embed = createLogEmbed("メッセージ編集", 0xfee75c)
      .addFields(
        { name: "ユーザー", value: formatUser(fetchedNewMessage.author), inline: true },
        { name: "チャンネル", value: `${fetchedNewMessage.channel}`, inline: true },
        { name: "編集前", value: truncateText(fetchedOldMessage.content) },
        { name: "編集後", value: truncateText(fetchedNewMessage.content) },
      );

    await sendGuildLog(fetchedNewMessage.guild, "message", embed);
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    const embed = createLogEmbed("メンバー参加", 0x57f287)
      .addFields({ name: "ユーザー", value: formatUser(member.user), inline: true });

    await sendGuildLog(member.guild, "member", embed);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    const kickEntry = await findRecentAuditEntry(
      member.guild,
      AuditLogEvent.MemberKick,
      (entry) => entry.target?.id === member.id,
    );

    if (kickEntry) {
      const embed = createLogEmbed("KICK", 0xed4245)
        .addFields({ name: "ユーザー", value: formatUser(member.user), inline: true });

      addExecutorField(embed, kickEntry);
      await sendGuildLog(member.guild, "moderation", embed);
      return;
    }

    const embed = createLogEmbed("メンバー退出", 0xed4245)
      .addFields({ name: "ユーザー", value: formatUser(member.user), inline: true });

    await sendGuildLog(member.guild, "member", embed);
  });

  client.on(Events.GuildBanAdd, async (ban) => {
    const embed = createLogEmbed("BAN", 0xed4245)
      .addFields(
        { name: "ユーザー", value: formatUser(ban.user), inline: true },
        { name: "理由", value: truncateText(ban.reason) },
      );

    await addAuditExecutor(embed, ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    await sendGuildLog(ban.guild, "moderation", embed);
  });

  client.on(Events.GuildBanRemove, async (ban) => {
    const embed = createLogEmbed("BAN解除", 0x57f287)
      .addFields({ name: "ユーザー", value: formatUser(ban.user), inline: true });

    await addAuditExecutor(embed, ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    await sendGuildLog(ban.guild, "moderation", embed);
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
    const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));

    if (addedRoles.size > 0 || removedRoles.size > 0) {
      const embed = createLogEmbed("メンバーロール変更", 0x5865f2)
        .addFields({ name: "ユーザー", value: formatUser(newMember.user), inline: true });

      if (addedRoles.size > 0) {
        embed.addFields({
          name: "付与",
          value: truncateText(addedRoles.map((role) => `${role}`).join(", ")),
        });
      }

      if (removedRoles.size > 0) {
        embed.addFields({
          name: "削除",
          value: truncateText(removedRoles.map((role) => `${role}`).join(", ")),
        });
      }

      await addAuditExecutor(embed, newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
      await sendGuildLog(newMember.guild, "role", embed);
    }

    if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
      const timeoutUntil = newMember.communicationDisabledUntil;
      const embed = createLogEmbed(timeoutUntil ? "TIMEOUT" : "TIMEOUT解除", 0xfee75c)
        .addFields(
          { name: "ユーザー", value: formatUser(newMember.user), inline: true },
          {
            name: "期限",
            value: timeoutUntil ? formatDate(timeoutUntil) : "なし",
            inline: true,
          },
        );

      await addAuditExecutor(embed, newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
      await sendGuildLog(newMember.guild, "moderation", embed);
    }
  });

  client.on(Events.ChannelCreate, async (channel) => {
    if (!channel.guild) {
      return;
    }

    const kind = getChannelKind(channel);
    const embed = createLogEmbed(`${kind}作成`, 0x57f287)
      .addFields(
        { name: kind, value: formatChannel(channel), inline: true },
        { name: "種類", value: formatChannelType(channel), inline: true },
        { name: "カテゴリ", value: formatParent(channel.parentId), inline: true },
      );

    await addAuditExecutor(embed, channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    await sendGuildLog(channel.guild, "channel", embed);
  });

  client.on(Events.ChannelDelete, async (channel) => {
    if (!channel.guild) {
      return;
    }

    const kind = getChannelKind(channel);
    const embed = createLogEmbed(`${kind}削除`, 0xed4245)
      .addFields(
        { name: kind, value: `${channel.name} (${channel.id})`, inline: true },
        { name: "種類", value: formatChannelType(channel), inline: true },
        { name: "カテゴリ", value: formatParent(channel.parentId), inline: true },
      );

    await addAuditExecutor(embed, channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    await sendGuildLog(channel.guild, "channel", embed);
  });

  client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
    if (!newChannel.guild) {
      return;
    }

    const kind = getChannelKind(newChannel);
    const embed = createLogEmbed(`${kind}編集`, 0xfee75c)
      .addFields(
        { name: kind, value: formatChannel(newChannel), inline: true },
        { name: "種類", value: formatChannelType(newChannel), inline: true },
      );

    if (!addChannelDiffs(embed, oldChannel, newChannel)) {
      return;
    }

    await addAuditExecutor(embed, newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    await sendGuildLog(newChannel.guild, "channel", embed);
  });

  client.on(Events.GuildRoleCreate, async (role) => {
    const embed = createLogEmbed("ロール作成", 0x57f287)
      .addFields(
        { name: "ロール", value: formatRole(role), inline: true },
        { name: "色", value: role.hexColor, inline: true },
        { name: "メンション可能", value: formatBoolean(role.mentionable), inline: true },
        { name: "権限", value: truncateText(permissionNames(role.permissions), 1000) },
      );

    await addAuditExecutor(embed, role.guild, AuditLogEvent.RoleCreate, role.id);
    await sendGuildLog(role.guild, "role", embed);
  });

  client.on(Events.GuildRoleDelete, async (role) => {
    const embed = createLogEmbed("ロール削除", 0xed4245)
      .addFields(
        { name: "ロール", value: `${role.name} (${role.id})`, inline: true },
        { name: "色", value: role.hexColor, inline: true },
        { name: "権限", value: truncateText(permissionNames(role.permissions), 1000) },
      );

    await addAuditExecutor(embed, role.guild, AuditLogEvent.RoleDelete, role.id);
    await sendGuildLog(role.guild, "role", embed);
  });

  client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
    const embed = createLogEmbed("ロール編集", 0xfee75c)
      .addFields({ name: "ロール", value: formatRole(newRole), inline: true });
    let changed = false;

    changed = addChangedField(embed, "名前", oldRole.name, newRole.name) || changed;
    changed = addChangedField(embed, "色", oldRole.hexColor, newRole.hexColor, true) || changed;
    changed = addChangedField(embed, "表示分離", formatBoolean(oldRole.hoist), formatBoolean(newRole.hoist), true) || changed;
    changed = addChangedField(embed, "メンション可能", formatBoolean(oldRole.mentionable), formatBoolean(newRole.mentionable), true) || changed;
    changed = addChangedField(embed, "位置", oldRole.position, newRole.position, true) || changed;
    changed = addPermissionDiffField(embed, "権限", oldRole.permissions, newRole.permissions) || changed;

    if (!changed) {
      return;
    }

    await addAuditExecutor(embed, newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    await sendGuildLog(newRole.guild, "role", embed);
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const member = newState.member ?? oldState.member;
    const guild = newState.guild ?? oldState.guild;

    if (oldState.channelId !== newState.channelId) {
      await logVoiceChannelMovement(guild, member, oldState, newState);
      return;
    }

    await logVoiceStateChanges(guild, member, oldState, newState);
  });

  client.on(Events.InviteCreate, async (invite) => {
    if (!invite.guild) {
      return;
    }

    const embed = createLogEmbed("招待リンク作成", 0x57f287)
      .addFields(
        { name: "コード", value: invite.code, inline: true },
        { name: "チャンネル", value: invite.channel ? formatChannel(invite.channel) : "Unknown", inline: true },
        { name: "作成者", value: formatUser(invite.inviter), inline: true },
        { name: "最大使用回数", value: String(invite.maxUses || "無制限"), inline: true },
        { name: "期限", value: invite.expiresAt ? formatDate(invite.expiresAt) : "なし", inline: true },
      );

    await addAuditExecutor(embed, invite.guild, AuditLogEvent.InviteCreate);
    await sendGuildLog(invite.guild, "invite", embed);
  });

  client.on(Events.InviteDelete, async (invite) => {
    if (!invite.guild) {
      return;
    }

    const embed = createLogEmbed("招待リンク削除", 0xed4245)
      .addFields(
        { name: "コード", value: invite.code, inline: true },
        { name: "チャンネル", value: invite.channel ? formatChannel(invite.channel) : "Unknown", inline: true },
      );

    await addAuditExecutor(embed, invite.guild, AuditLogEvent.InviteDelete);
    await sendGuildLog(invite.guild, "invite", embed);
  });

  client.on(Events.GuildScheduledEventCreate, async (scheduledEvent) => {
    const embed = createLogEmbed("イベント作成", 0x57f287);

    addScheduledEventFields(embed, scheduledEvent);
    await addAuditExecutor(embed, scheduledEvent.guild, AuditLogEvent.GuildScheduledEventCreate, scheduledEvent.id);
    await sendGuildLog(scheduledEvent.guild, "event", embed);
  });

  client.on(Events.GuildScheduledEventUpdate, async (oldScheduledEvent, newScheduledEvent) => {
    const embed = createLogEmbed("イベント編集", 0xfee75c);

    addScheduledEventFields(embed, newScheduledEvent);

    if (!addScheduledEventDiffs(embed, oldScheduledEvent, newScheduledEvent)) {
      return;
    }

    await addAuditExecutor(embed, newScheduledEvent.guild, AuditLogEvent.GuildScheduledEventUpdate, newScheduledEvent.id);
    await sendGuildLog(newScheduledEvent.guild, "event", embed);
  });

  client.on(Events.GuildScheduledEventDelete, async (scheduledEvent) => {
    const embed = createLogEmbed("イベント削除", 0xed4245);

    addScheduledEventFields(embed, scheduledEvent);
    await addAuditExecutor(embed, scheduledEvent.guild, AuditLogEvent.GuildScheduledEventDelete, scheduledEvent.id);
    await sendGuildLog(scheduledEvent.guild, "event", embed);
  });
}

module.exports = { registerLoggingEvents };
