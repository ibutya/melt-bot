const { EmbedBuilder } = require("discord.js");

function registerMusicEvents(client, distube) {
  distube.on("playSong", (queue, song) => {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("▶️ 再生中")
      .setDescription(`**[${song.name}](${song.url})**`)
      .addFields(
        { name: "再生時間", value: song.formattedDuration, inline: true },
        { name: "リクエスト", value: `${song.user}`, inline: true }
      )
      .setThumbnail(song.thumbnail);

    queue.textChannel?.send({ embeds: [embed] });
  });

  distube.on("addSong", (queue, song) => {
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("➕ キューに追加")
      .setDescription(`**[${song.name}](${song.url})**`)
      .addFields(
        { name: "再生時間", value: song.formattedDuration, inline: true },
        { name: "キュー位置", value: `#${queue.songs.length}`, inline: true }
      );

    queue.textChannel?.send({ embeds: [embed] });
  });

  distube.on("addList", (queue, playlist) => {
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("➕ プレイリストを追加")
      .setDescription(`**${playlist.name}** (${playlist.songs.length}曲)`);

    queue.textChannel?.send({ embeds: [embed] });
  });

  distube.on("finish", (queue) => {
    queue.textChannel?.send("⏹️ キューが終了しました。");
  });

  distube.on("error", (error, queue) => {
    console.error("DisTube error:", error);
    queue?.textChannel?.send(`❌ エラーが発生しました: ${error.message}`);
  });

  distube.on("disconnect", (queue) => {
    queue.textChannel?.send("👋 ボイスチャンネルから切断しました。");
  });
}

module.exports = { registerMusicEvents };