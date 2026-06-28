const { REST, Routes } = require("discord.js");
const { clientId, discordToken, guildId } = require("./config");
const { commands } = require("./commands");

async function main() {
  const rest = new REST({ version: "10" }).setToken(discordToken);
  const body = commands.map((command) => command.data.toJSON());

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log(`Registered ${body.length} guild commands for ${guildId}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), { body });
  console.log(`Registered ${body.length} global commands.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
