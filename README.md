# Soma — サークルタスクボード

サークル部員のタスク進捗を管理・共有するためのタスク共有アプリ。

![screenshot](docs/screenshot.png)

## 機能

- 📋 **カンバンボード** — 未着手 / 進行中 / 完了 の3カラム。カード上でステータス変更
- ✏️ **タスク管理** — タイトル・説明・担当部員・期限を設定。期限切れは赤色表示
- 👥 **部員管理** — 部員の追加・削除
- 📊 **進捗サマリ** — 部員ごとの担当タスク数・完了率
- 🔍 **フィルタ** — 担当者で絞り込み

## 起動方法

```bash
npm install
npm run dev
```

http://localhost:3000 を開く。データは `data/soma.db`（SQLite）に自動保存されます。

## 技術構成

- Next.js 15 (App Router) + TypeScript + Tailwind CSS v4
- better-sqlite3（単一プロセスで完結、外部DB不要）

## API

| Method | Path | 説明 |
|---|---|---|
| GET / POST | `/api/members` | 部員一覧 / 追加 |
| DELETE | `/api/members/:id` | 部員削除（担当タスクは未割当に戻る） |
| GET / POST | `/api/tasks` | タスク一覧（`?assigneeId=` `?status=` で絞り込み）/ 作成 |
| PATCH / DELETE | `/api/tasks/:id` | タスク更新（部分更新可）/ 削除 |
| GET | `/api/stats` | 部員別の担当数・完了数 |

フィールドは snake_case（`assignee_id`, `due_date`）。`status` は `todo` / `doing` / `done`。

## 開発

```bash
npm test        # vitest（データ層・APIエラーマッピング）
npm run lint    # eslint
npm run build   # 本番ビルド
```

## 注意

- 認証はありません（部内利用のMVP想定）。インターネットに公開する場合は認証の導入を検討してください。
