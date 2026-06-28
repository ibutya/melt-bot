const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getDisTube } = require("../services/music");

const VOLUME_MIN = 1;
const VOLUME_MAX = 100;

function requireVoiceChannel(interaction) {
  const vc = interaction.member?.voice?.channel;
  if (!vc) {
    interaction.reply({
      content: "❌ ボイスチャンネルに参加してから使用してください。",
      ephemeral: true,
    });
    return null;
  }
  return vc;
}

function requireQueue(interaction) {
  const queue = getDisTube().getQueue(interaction.guildId);
  if (!queue) {
    interaction.reply({
      content: "❌ 現在再生中の曲がありません。",
      ephemeral: true,
    });
    return null;
  }
  return queue;
}

const data = new SlashCommandBuilder()
  .setName("music")
  .setDescription("音楽再生コマンド")
  .addSubcommand((sub) =>
    sub
      .setName("play")
      .setDescription("曲またはプレイリストを再生・追加します")
      .addStringOption((opt) =>
        opt
          .setName("query")
          .setDescription("URL または検索ワード (YouTube / Spotify / SoundCloud)")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("pause").setDescription("一時停止します")
  )
  .addSubcommand((sub) =>
    sub.setName("resume").setDescription("再開します")
  )
  .addSubcommand((sub) =>
    sub.setName("skip").setDescription("次の曲にスキップします")
  )
  .addSubcommand((sub) =>
    sub.setName("stop").setDescription("再生を停止してキューをクリアします")
  )
  .addSubcommand((sub) =>
    sub.setName("nowplaying").setDescription("現在再生中の曲を表示します")
  )
  .addSubcommand((sub) =>
    sub.setName("queue").setDescription("キューを表示します")
  )
  .addSubcommand((sub) =>
    sub
      .setName("volume")
      .setDescription("音量を変更します (1〜100)")
      .addIntegerOption((opt) =>
        opt
          .setName("level")
          .setDescription("音量 (1〜100)")
          .setRequired(true)
          .setMinValue(VOLUME_MIN)
          .setMaxValue(VOLUME_MAX)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("loop")
      .setDescription("ループモードを設定します")
      .addStringOption((opt) =>
        opt
          .setName("mode")
          .setDescription("ループモード")
          .setRequired(true)
          .addChoices(
            { name: "オフ", value: "0" },
            { name: "1曲ループ", value: "1" },
            { name: "全曲ループ", value: "2" }
          )
      )
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const distube = getDisTube();

  // play だけ defer（検索に時間がかかる）
  if (sub === "play") {
    await interaction.deferReply();
  }

  try {
    switch (sub) {
      case "play": {
        const vc = requireVoiceChannel(interaction);
        if (!vc) return;

        const query = interaction.options.getString("query");

        await distube.play(vc, query, {
          member: interaction.member,
          textChannel: interaction.channel,
          interaction,
        });

        // playSong / addSong イベントでメッセージ送信されるので
        // ここでは defer を解決するだけ
        await interaction.editReply("🔍 検索中...");
        break;
      }

      case "pause": {
        const queue = requireQueue(interaction);
        if (!queue) return;
        if (queue.paused) {
          return interaction.reply({ content: "⚠️ すでに一時停止中です。", ephemeral: true });
        }
        await distube.pause(interaction.guildId);
        await interaction.reply("⏸️ 一時停止しました。");
        break;
      }

      case "resume": {
        const queue = requireQueue(interaction);
        if (!queue) return;
        if (!queue.paused) {
          return interaction.reply({ content: "⚠️ すでに再生中です。", ephemeral: true });
        }
        await distube.resume(interaction.guildId);
        await interaction.reply("▶️ 再開しました。");
        break;
      }

      case "skip": {
        const queue = requireQueue(interaction);
        if (!queue) return;
        if (queue.songs.length <= 1) {
          return interaction.reply({ content: "⚠️ スキップできる次の曲がありません。", ephemeral: true });
        }
        await distube.skip(interaction.guildId);
        await interaction.reply("⏭️ スキップしました。");
        break;
      }

      case "stop": {
        const queue = requireQueue(interaction);
        if (!queue) return;
        await distube.stop(interaction.guildId);
        await interaction.reply("⏹️ 停止してキューをクリアしました。");
        break;
      }

      case "nowplaying": {
        const queue = requireQueue(interaction);
        if (!queue) return;
        const song = queue.songs[0];
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🎵 再生中")
          .setDescription(`**[${song.name}](${song.url})**`)
          .addFields(
            { name: "再生時間", value: `${queue.formattedCurrentTime} / ${song.formattedDuration}`, inline: true },
            { name: "音量", value: `${queue.volume}%`, inline: true },
            { name: "リクエスト", value: `${song.user}`, inline: true }
          )
          .setThumbnail(song.thumbnail);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case "queue": {
        const queue = requireQueue(interaction);
        if (!queue) return;
        const songs = queue.songs
          .slice(0, 10)
          .map((s, i) =>
            i === 0
              ? `▶️ **${s.name}** (${s.formattedDuration})`
              : `${i}. ${s.name} (${s.formattedDuration})`
          )
          .join("\n");
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("📋 キュー")
          .setDescription(songs || "曲がありません")
          .setFooter({ text: `合計 ${queue.songs.length} 曲` });
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case "volume": {
        const queue = requireQueue(interaction);
        if (!queue) return;
        const level = interaction.options.getInteger("level");
        await distube.setVolume(interaction.guildId, level);
        await interaction.reply(`🔊 音量を ${level}% に設定しました。`);
        break;
      }

    case "loop": {
        const queue = requireQueue(interaction);
        if (!queue) return;
        const mode = parseInt(interaction.options.getString("mode"));
        await distube.setRepeatMode(interaction.guildId, mode);
        const labels = ["オフ", "1曲ループ", "全曲ループ"];
        await interaction.reply(`🔁 ループモード: **${labels[mode]}**`);
        break;
      }
    }
  } catch (error) {
    console.error("Music command error:", error);
    const msg = `❌ エラーが発生しました: ${error.message}`;
    if (interaction.deferred) {
      await interaction.editReply(msg);
    } else if (!interaction.replied) {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
}

module.exports = { data, execute };