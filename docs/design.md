# Melt Bot Design

## Bot概要

自鯖向けオールインワン管理Bot。

目的:
- サーバー管理
- 荒らし対策
- VC管理
- コミュニティ運営支援

## 機能一覧

### Moderation

#### ログ
Discord上のチャンネルを用途別に分けて記録する。

ログカテゴリ:
- `member`: 鯖参加/脱退
- `message`: メッセージ削除/編集
- `channel`: チャンネル/カテゴリ追加/削除/編集
- `role`: ロール追加/削除/編集/付与
- `voice`: VC参加/移動/退出、mute/unmute、deafen/undeafen、カメラ起動/終了、画面共有開始/終了ログ
- `moderation`: BAN/KICK/TIMEOUT/Strike増減など処罰関連
- `invite`: 招待リンク作成/削除
- `event`: イベント作成/編集/削除

ログ送信先は `config.json` で設定する。

#### Strikeシステム
管理の中心機能。Strikeの増減、確認、履歴表示が可能。
```txt
/strike add @user [count] [reason]
/strike remove @user [count] [reason]
/strike set @user [count]
/strike check @user
/strike history @user
```

#### 自動処罰 & ロール付与

`config.json` に設定されたルールに基づき、Strike数に応じて自動処罰（警告、Timeout、Kick、Ban）を執行。同時に対応するStrikeロールを同期（古いロールを削除し、新しいロールを付与）する。

#### Strike減衰

30日間Strikeの増加がない場合、自動的にStrikeが `-1` 減衰する（最低値 `0`）。

#### 荒らし対策

短時間連投、大量メンション、Discord招待リンク、大量チャンネル/ロール作成を検知し、自動でStrike付与および処罰を行う。

### Community

#### ようこそメッセージ

ユーザー参加時に `config.json` で指定されたチャンネルへウェルカムメッセージを送信。

#### ロールパネル

ボタン式のロール付与パネル。`/rolepanel` コマンドで作成、選択肢の追加、投稿、削除、一覧表示を管理。

#### 意見箱

`/suggestion panel` で意見箱を設置。ユーザーがボタンを押すとモーダルが開き、入力された内容を設定されたチャンネルへ送信。匿名のON/OFF切り替えに対応。

#### チケット

問い合わせやサポート用の個別チャンネルをボタン一つで作成。対応完了後は運営以外非表示（クローズ）にでき、ログの保持や削除が可能。

### Voice System

#### 自動VC生成 & 削除

トリガーVC（➕ VC作成）に参加すると、ユーザー専用のTempVC（🎤 ユーザー名の部屋）を自動生成。VC内の人数が0人になった時点で自動削除。

#### VC管理

`/vc` コマンドを使用し、自分が所有するTempVCの名前変更、人数上限、ステータス、ロック/アンロック、表示/非表示をコントロール可能。

## データベース（Prisma Schema）

推奨技術であるPrisma（SQLite）のスキーマ設計。

```prisma
model GuildConfig {
  guildId             String  @id
  logChannelId        String?
  welcomeChannelId    String?
  suggestionChannelId String?
  ticketCategoryId    String?
  createVcChannelId   String?
  anonymousSuggestion Boolean @default(true)
}

model StrikeUser {
  guildId      String
  userId       String
  strikeCount  Int      @default(0)
  lastStrikeAt DateTime @updatedAt

  @@id([guildId, userId])
}

model StrikeHistory {
  id          Int      @id @default(autoincrement())
  guildId     String
  userId      String
  moderatorId String
  amount      Int
  reason      String?
  createdAt   DateTime @default(now())
}

model StrikeRule {
  guildId   String
  strike    Int
  action    String   // WARNING, TIMEOUT, KICK, BAN
  duration  Int?     // Timeoutの秒数
  roleId    String?

  @@id([guildId, strike])
}

model TempVC {
  guildId   String
  channelId String   @id
  ownerId   String
  createdAt DateTime @default(now())
}

model Ticket {
  ticketId  String   @id @default(uuid())
  guildId   String
  userId    String
  channelId String
  status    String   // OPEN, CLOSED
  createdAt DateTime @default(now())
}

model RolePanel {
  id          Int               @id @default(autoincrement())
  guildId     String
  channelId   String
  messageId   String
  title       String
  description String?
  createdById String
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
  options     RolePanelOption[]
}

model RolePanelOption {
  id        Int       @id @default(autoincrement())
  panelId   Int
  roleId    String
  label     String
  emoji     String?
  createdAt DateTime  @default(now())
  panel     RolePanel @relation(fields: [panelId], references: [id], onDelete: Cascade)
}

```

## 推奨技術

* Node.js
* Discord.js v14
* SQLite
* Prisma

## 開発ステータス

すべての基本フェーズの実装が完了しています。

* **Phase 1（DB・ログ・ロールパネル）**: 実装完了
* **Phase 2（Strike・荒らし対策）**: 実装完了（各種検知・自動処罰ロジック含む）
* **Phase 3（TempVC生成・VC管理）**: ~~実装完了（各種制御コマンド含む）~~※バグあり※
* **Phase 4（チケット・意見箱モーダル）**: 実装完了（クローズ後制御含む）
* **Phase 5（Web Dashboard等）**: 今後の拡張予定