const { createLogEmbed, sendGuildLog } = require("./guild-log");
const { formatUser, truncateText } = require("./text");

async function sendModerationActionLog(guild, title, targetUser, moderator, reason, extraFields = []) {
  const embed = createLogEmbed(title, 0xed4245)
    .addFields(
      { name: "対象", value: formatUser(targetUser), inline: true },
      { name: "実行者", value: formatUser(moderator), inline: true },
      { name: "理由", value: truncateText(reason) },
      ...extraFields,
    );

  await sendGuildLog(guild, "moderation", embed);
}

module.exports = { sendModerationActionLog };
