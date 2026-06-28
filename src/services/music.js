const { DisTube } = require("distube");
const { YtDlpPlugin } = require("@distube/yt-dlp");
const { SpotifyPlugin } = require("@distube/spotify");
const { SoundCloudPlugin } = require("@distube/soundcloud");

let distube = null;

function createDisTube(client) {
    distube = new DisTube(client, {
      plugins: [
        new SpotifyPlugin(),
        new SoundCloudPlugin(),
        new YtDlpPlugin({
          update: false,
          ytdlpPath: "/opt/homebrew/bin/yt-dlp",
          additionalYtdlpOptions: {
            "no-playlist": true,
            "flat-playlist": true,
          },
        }),
      ],
      emitNewSongOnly: true,
      joinNewVoiceChannel: true,
    });
    return distube;
  }

function getDisTube() {
  if (!distube) throw new Error("DisTube is not initialized");
  return distube;
}

module.exports = { createDisTube, getDisTube };