const banCommand = require("./ban");
const configCommand = require("./config");
const kickCommand = require("./kick");
const rolePanelCommand = require("./role-panel");
const strikeCommand = require("./strike");
const suggestionCommand = require("./suggestion");
const ticketCommand = require("./ticket");
const timeoutCommand = require("./timeout");
const vcCommand = require("./vc");
const warnCommand = require("./warn");
const musicCommand = require("./music");

const commands = [
  banCommand,
  configCommand,
  kickCommand,
  rolePanelCommand,
  strikeCommand,
  suggestionCommand,
  ticketCommand,
  timeoutCommand,
  vcCommand,
  warnCommand,
  musicCommand,
];

module.exports = { commands };
