const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Partials,
} = require("discord.js");
const { discordToken } = require("./config");
const { commands } = require("./commands");
const { registerEvents } = require("./events");
const { handleRolePanelButton } = require("./interactions/role-panel");
const { handleSuggestionInteraction } = require("./interactions/suggestion");
const { handleTicketInteraction } = require("./interactions/ticket");
const { prisma } = require("./db");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.Message,
    Partials.User,
  ],
});

client.commands = new Collection(commands.map((command) => [command.data.name, command]));

registerEvents(client);

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);

      if (command?.autocomplete) {
        await command.autocomplete(interaction);
      }

      return;
    }

    if (await handleTicketInteraction(interaction)) {
      return;
    }

    if (await handleSuggestionInteraction(interaction)) {
      return;
    }

    if (await handleRolePanelButton(interaction)) {
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      return;
    }

    await command.execute(interaction);
  } catch (error) {
    console.error("Interaction handling failed:", error);

    const payload = {
      content: "処理中にエラーが発生しました。",
      ephemeral: true,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => undefined);
      return;
    }

    await interaction.reply(payload).catch(() => undefined);
  }
});

async function shutdown() {
  await prisma.$disconnect();
  client.destroy();
}

process.on("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});

client.login(discordToken);
