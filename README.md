# Melt Bot

自鯖で使いたいだけの自己満bot

**※`src/service/music.js`の15行目を環境に合わせて修正してください**\n
　初期ではhomebrewで入れたyt-dlpのパスになります。
## Setup

```bash
npm install
cp .env.example .env
cp config.example.json config.json
npm run prisma:migrate -- --name init
npm run register
npm run dev
```

`.env` に設定する値:

* `DISCORD_TOKEN`: Bot token
* `CLIENT_ID`: Discord application client ID
* `GUILD_ID`: 開発中にギルド単位でコマンド登録する場合のサーバーID
* `DATABASE_URL`: SQLiteの接続先。初期値は `file:./dev.db`

`config.json` に設定する値:

* `welcome.enabled`: ようこそメッセージのON/OFF
* `welcome.channelId`: ようこそメッセージ送信先チャンネルID
* `welcome.message`: ようこそメッセージ本文
* `logs.member.channelId`: 鯖参加/脱退ログ
* `logs.message.channelId`: メッセージ削除/編集ログ
* `logs.channel.channelId`: チャンネル/カテゴリ作成/削除/編集ログ
* `logs.role.channelId`: ロール作成/削除/編集/付与ログ
* `logs.voice.channelId`: VC参加/移動/退出、mute/unmute、deafen/undeafen、カメラ、画面共有ログ
* `logs.moderation.channelId`: BAN/KICK/TIMEOUTなど処罰関連ログ
* `logs.invite.channelId`: 招待リンク作成/削除ログ
* `logs.event.channelId`: イベント作成/編集/削除ログ
* `moderation.punishments`: Strike数ごとの自動処罰
* `moderation.strikeRoles`: Strike数ごとの自動付与ロールID
* `antiRaid`: 短時間連投、大量メンション、招待リンク、大量チャンネル/ロール作成の検知設定
* `voiceSystem.createChannelId`: 自動VC生成トリガーVC
* `voiceSystem.categoryId`: 生成VCのカテゴリID。空ならトリガーVCと同じカテゴリ
* `ticket.categoryId`: チケット作成先カテゴリID
* `ticket.supportRoleIds`: チケット閲覧を許可する対応ロールID配列
* `suggestion.channelId`: 意見箱送信先チャンネルID
* `suggestion.anonymous`: 意見箱の匿名ON/OFF

`welcome.message` では `{user}`、`{user.mention}`、`{user.name}`、`{user.tag}`、`{guild.name}`、`{guild.memberCount}` が使えます。設定ファイルは変更時に自動再読み込みされます。

コマンドを追加/変更した後は再登録が必要です。

```bash
npm run register

```

## Patches

本プロジェクトでは、依存ライブラリの軽微な修正を適用するために `patch-package` を導入しています。`npm install` 実行時に自動的に必要なパッチが適用されます。

## Commands

* `/config show`
* `/rolepanel create`
* `/rolepanel add-option`
* `/rolepanel post`
* `/rolepanel delete`
* `/rolepanel list`
* `/strike add`
* `/strike remove`
* `/strike set`
* `/strike check`
* `/strike history`
* `/warn`
* `/timeout`
* `/kick`
* `/ban`
* `/vc name`
* `/vc limit`
* `/vc status`
* `/vc lock`
* `/vc unlock`
* `/vc hide`
* `/vc show`
* `/ticket panel`
* `/ticket close`
* `/suggestion panel`

全体設計は [docs/design.md](https://github.com/ibutya/melt-bot/blob/master/docs/design.md) を参照。
