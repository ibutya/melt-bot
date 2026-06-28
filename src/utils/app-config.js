const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(process.cwd(), "config.json");

const LOG_CATEGORIES = [
  "member",
  "message",
  "channel",
  "role",
  "voice",
  "moderation",
  "invite",
  "event",
];

const DEFAULT_GUILD_SETTINGS = {
  welcome: {
    enabled: true,
    channelId: "",
    message: "👋 ようこそ！ {user} さん",
  },
  logs: Object.fromEntries(
    LOG_CATEGORIES.map((category) => [
      category,
      {
        enabled: true,
        channelId: "",
      },
    ]),
  ),
  moderation: {
    strikeDecayDays: 30,
    punishments: {
      1: { action: "WARNING" },
      2: { action: "TIMEOUT", durationSeconds: 86_400 },
      3: { action: "TIMEOUT", durationSeconds: 604_800 },
      4: { action: "KICK" },
      5: { action: "BAN" },
    },
    strikeRoles: {
      1: "",
      2: "",
      3: "",
      4: "",
      5: "",
    },
  },
  antiRaid: {
    enabled: true,
    messageSpam: {
      enabled: true,
      threshold: 5,
      windowSeconds: 7,
      strikeAmount: 1,
    },
    massMentions: {
      enabled: true,
      threshold: 5,
      strikeAmount: 1,
    },
    inviteLinks: {
      enabled: true,
      strikeAmount: 1,
    },
    channelCreate: {
      enabled: true,
      threshold: 5,
      windowSeconds: 30,
      strikeAmount: 1,
    },
    roleCreate: {
      enabled: true,
      threshold: 5,
      windowSeconds: 30,
      strikeAmount: 1,
    },
  },
  voiceSystem: {
    createChannelId: "",
    categoryId: "",
    channelName: "🎤 {user.name}の部屋",
  },
  ticket: {
    enabled: true,
    categoryId: "",
    supportRoleIds: [],
    panelTitle: "チケット",
    panelDescription: "問い合わせ、通報、サポートが必要な場合はボタンからチケットを作成してください。",
  },
  suggestion: {
    enabled: true,
    channelId: "",
    anonymous: true,
    panelTitle: "意見箱",
    panelDescription: "意見や要望を送信できます。",
  },
};

let cachedConfig = null;
let cachedMtimeMs = null;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(...objects) {
  const output = {};

  for (const object of objects) {
    if (!isPlainObject(object)) {
      continue;
    }

    for (const [key, value] of Object.entries(object)) {
      if (value === undefined) {
        continue;
      }

      if (isPlainObject(value) && isPlainObject(output[key])) {
        output[key] = deepMerge(output[key], value);
        continue;
      }

      if (isPlainObject(value)) {
        output[key] = deepMerge(value);
        continue;
      }

      output[key] = value;
    }
  }

  return output;
}

function loadConfigFile() {
  try {
    const stat = fs.statSync(CONFIG_PATH);

    if (cachedConfig && cachedMtimeMs === stat.mtimeMs) {
      return cachedConfig;
    }

    cachedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    cachedMtimeMs = stat.mtimeMs;
    return cachedConfig;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to load config.json:", error);
    }

    return cachedConfig ?? {};
  }
}

function getGuildSettings(guildId) {
  const config = loadConfigFile();
  const globalSettings = {
    welcome: config.welcome,
    logs: config.logs,
    moderation: config.moderation,
    antiRaid: config.antiRaid,
    voiceSystem: config.voiceSystem,
    ticket: config.ticket,
    suggestion: config.suggestion,
  };
  const guildSettings = config.guilds?.[guildId] ?? {};

  return deepMerge(DEFAULT_GUILD_SETTINGS, globalSettings, guildSettings);
}

function getLogSettings(guildId, category) {
  const settings = getGuildSettings(guildId);

  return settings.logs?.[category] ?? { enabled: false, channelId: "" };
}

function renderTemplate(template, values) {
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (match, key) => {
    const value = key.split(".").reduce((current, part) => current?.[part], values);

    if (key === "user" && isPlainObject(value) && value.mention) {
      return value.mention;
    }

    if (key === "guild" && isPlainObject(value) && value.name) {
      return value.name;
    }

    return value === undefined || value === null ? match : String(value);
  });
}

module.exports = {
  CONFIG_PATH,
  LOG_CATEGORIES,
  getGuildSettings,
  getLogSettings,
  renderTemplate,
};
