# KUMO-WATASHI 仕様書

## 1. 概要

KUMO-WATASHIは、スマートフォンやPC間でファイルを一時的に転送するWebアプリケーションである。

ファイルを永続保存するのではなく、Transfer Sessionを作成し、短時間だけクラウド上にファイルを保持する。

主な用途は以下である。

- スマートフォン → スマートフォン
- スマートフォン → PC
- PC → スマートフォン
- PC → PC
- 将来的には双方向転送にも対応可能とする

ファイルはTransfer Sessionの有効期限経過後に削除する。

---

# 2. 基本コンセプト

## 2.1 Uploader / Downloaderを分離する

アプリケーションはUploaderとDownloaderを明確に分離する。

トップページで利用者が、

- Uploader
- Downloader

のいずれかを選択する。

### Uploader

Uploaderは、ファイルをクラウドへアップロードし、相手がアクセスするためのQRコードまたはワンタイムコードを表示する機能に限定する。

```text
Uploader
   │
   ├── ファイル選択
   │
   ├── Cloudflare R2へアップロード
   │
   └── QRコード / ワンタイムコード表示
```

Uploaderはファイルをダウンロードしない。

### Downloader

Downloaderは、QRコードまたはワンタイムコードによってTransfer Sessionへ参加し、クラウド上のファイルをダウンロードする機能に限定する。

```text
Downloader
   │
   ├── QRコード読み取り
   │       または
   │   ワンタイムコード入力
   │
   ├── Transfer Session取得
   │
   ├── ファイル一覧表示
   │
   └── ファイルダウンロード
```

Downloaderはファイルをアップロードしない。

## 2.2 一方向のファイル転送

1つのTransfer Sessionは、

> UploaderからDownloaderへの一方向のファイル転送

を表す。

```text
Uploader
   │
   │ Upload
   ▼
Cloudflare R2
   │
   │ Download
   ▼
Downloader
```

UploaderとDownloaderの役割を固定することで、MVPではUI・API・認可モデルを単純化する。

将来的に双方向転送が必要になった場合は、別の仕様として拡張する。

## 2.3 アプリケーション構成

```text
                    KUMO-WATASHI
                         │
               ┌─────────┴─────────┐
               │                   │
          ┌────▼────┐         ┌────▼────┐
          │ Uploader│         │Downloader│
          └────┬────┘         └────┬────┘
               │                   │
               │ Upload            │ Download
               ▼                   │
          Transfer Session         │
               │                   │
               ▼                   │
              R2 ◄─────────────────┘
```

トップページではUploader / Downloaderを選択する。

---

# 2.4 トップページ

```text
┌──────────────────────────┐
│       KUMO-WATASHI       │
│                          │
│    ファイルを転送する     │
│                          │
│   [ ファイルを送る ]      │
│                          │
│   [ ファイルを受け取る ]  │
│                          │
└──────────────────────────┘
```

「ファイルを送る」を選択するとUploaderへ遷移する。

「ファイルを受け取る」を選択するとDownloaderへ遷移する。

# 3. 対応する転送パターン

UploaderとDownloaderを端末種別から独立させる。

| Uploader | Downloader | 主な参加方法 |
|---|---|---|
| スマートフォン | スマートフォン | QR / コード |
| スマートフォン | PC | QR / コード |
| PC | スマートフォン | QR / コード |
| PC | PC | コードを推奨、QRも利用可能 |

すべての組み合わせで同じTransfer Sessionモデルを利用する。

```text
Smartphone Uploader ──→ Smartphone Downloader
Smartphone Uploader ──→ PC Downloader
PC Uploader ──────────→ Smartphone Downloader
PC Uploader ──────────→ PC Downloader
```

QRコードを利用できる環境ではQRコードを利用する。

PC同士など、カメラでQRコードを読み取ることが難しい環境ではワンタイムコードを利用する。

# 4. Transfer Session

Transfer Sessionを本システムの中心となるドメインオブジェクトとする。

## 4.1 ライフサイクル

Uploaderがファイルをアップロードしてから、Downloaderがファイルを取得する一方向のライフサイクルとする。

```text
CREATED
   │
   ▼
UPLOADING
   │
   ▼
READY
   │
   ▼
DOWNLOADING
   │
   ▼
COMPLETED

          ┌─────────┐
          │ EXPIRED │
          └─────────┘
              ▲
              │
       有効期限3分経過
```

MVPでは状態管理を最小限にしてもよい。

重要なのは、

- 作成日時
- 有効期限
- アクセス認証
- ファイル一覧
- 期限切れ処理

である。

---

# 5. Transfer Sessionの有効期限

Transfer Sessionの有効期限は、作成から3分とする。

```text
created_at
     │
     │ 3 minutes
     ▼
expires_at
```

有効期限を過ぎたTransfer SessionへのアクセスはWorker側で拒否する。

期限切れ時はHTTP 410 Goneなどを利用する。

## 5.1 削除

有効期限経過後は、

- D1のTransfer Session
- D1のファイルメタデータ
- R2のファイル本体

を削除する。

ただし、物理削除処理が多少遅延しても、Worker側ではexpires_atを確認して即座にアクセス拒否する。

したがって、

> 論理的な有効期限

と

> 物理的な削除

を分離する。

Cloudflare Workers Cron等を利用して定期的に期限切れデータを削除する。

---

# 6. Transfer Sessionの作成

Uploaderが「ファイルを送る」を選択するとTransfer Sessionを作成する。

```text
Uploader
  │
  ▼
Google認証
  │
  ▼
Turnstile検証
  │
  ▼
Transfer Session作成
  │
  ├── ファイルアップロード
  │
  ├── QRコード生成
  │
  └── ワンタイムコード生成
```

---

# 7. 認証・不正利用対策

## 7.1 Google Login

Googleアカウントによる認証を利用する。

目的はユーザー管理ではなく、

> 不特定多数からの無制限な利用を抑制するための利用者確認

である。

Googleアカウント情報を使った永続的なユーザー管理は行わない。

Google ID TokenをWorkerで検証し、短時間のみ有効な認証セッションを発行する。

---

# 8. Googleユーザー情報の保持

原則として以下の情報は永続保存しない。

- 氏名
- メールアドレス
- プロフィール画像
- Googleアカウント情報

不正利用対策のためGoogleの`sub`を利用する場合でも、必要最小限の期間・情報だけを保持する。

Googleの`sub`そのものをデータベースに保存するのではなく、必要に応じてサーバー側秘密鍵を利用したHMAC等による匿名化識別子を利用する。

---

# 9. Turnstile

Cloudflare TurnstileをBot対策として利用する。

基本フロー：

```text
Browser
   │
   │ Turnstile token
   ▼
Worker
   │
   │ Siteverify
   ▼
Cloudflare
```

Turnstileの検証は必ずサーバー側で行う。

MVPではTransfer Session作成時など、悪用されやすい操作を中心にTurnstileを適用する。

将来的にはリスクベースで適用範囲を調整する。

---

# 10. Rate Limit

Google認証だけでは不正利用を完全には防止できないため、複数の単位でRate Limitを設定する。

対象例：

- IPアドレス
- Google認証識別子
- 認証セッション
- Transfer Session
- ワンタイムコード入力

特にワンタイムコード入力には総当たり攻撃対策としてRate Limitを必須とする。

---

# 11. ファイル制限

Transfer Session単位でファイル数・ファイルサイズを制限する。

MVPの初期値例：

```text
1 Transferあたり最大ファイル数: 20
1ファイルあたり最大サイズ: 100MB
1 Transferあたり最大合計サイズ: 500MB
Transfer TTL: 3分
```

実際の値は運用状況を見て調整する。

---

# 12. QRコード

Transfer Session作成時に暗号学的に安全な乱数からTransfer Secretを生成する。

例：

```text
256bit random secret
```

QRコードにはTransfer Secretを含むURLを格納する。

例：

```text
https://example.com/t/<transfer-secret>
```

Transfer Secretは十分なエントロピーを持つランダム値とする。

D1にはSecretそのものを保存せず、ハッシュ値等を保存する。

---

# 13. ワンタイムコード

QRコードを利用できない場合の参加方法として、人間が入力できるワンタイムコードを提供する。

## 13.1 コード仕様

```text
英字2文字 + 数字6文字
合計8文字
```

表示時には4文字ごとに区切る。

例：

```text
K7M4-29Q8
```

入力時はハイフンを省略してもよい。

```text
K7M429Q8
```

内部では正規化して同一コードとして扱う。

---

# 14. ワンタイムコードの文字集合

英字は数字との誤読可能性が低い文字に限定する。

候補：

```text
ABCDEFGHJKMNPQRSTUVWXYZ
```

以下のような誤読しやすい組み合わせを避ける。

```text
I / 1
O / 0
S / 5
B / 8
G / 6
Z / 2
```

最終的な文字集合は、実際のUIフォントで視認性を確認した上で確定する。

---

# 15. ワンタイムコードのエントロピー

例えば英字24種類と数字10種類の場合、

```text
24² × 10⁶
= 576,000,000
```

となり、約5.76億通りの組み合わせとなる。

ただし、ワンタイムコード単体を強固な秘密情報とはみなさない。

以下を組み合わせて安全性を確保する。

```text
ワンタイムコード
      +
3分TTL
      +
入力回数制限
      +
IP Rate Limit
      +
Transfer単位Rate Limit
```

---

# 16. QR TokenとJoin Codeは分離する

QR用のSecretと、人間が入力するJoin Codeは別物として扱う。

```text
Transfer Session
│
├── secret_hash
│     └── QR用
│
├── join_code_hash
│     └── 人間入力用
│
├── created_at
├── expires_at
└── status
```

QR用Secretは256bit程度の強いランダム値を使用する。

Join Codeは人間が入力しやすい短いコードとし、Rate Limitで保護する。

---

# 17. PC-PCのUX

PC同士ではQRコードをカメラに表示して読み取らせることが難しいため、ワンタイムコードを推奨する。

送信側：

```text
┌─────────────────────────┐
│       ファイルを転送      │
│                         │
│       K7M4-29Q8         │
│                         │
│  このコードを相手に入力   │
│                         │
│       残り 02:41         │
└─────────────────────────┘
```

受信側：

```text
┌─────────────────────────┐
│      転送に参加する       │
│                         │
│     ┌─────────────┐     │
│     │ K7M429Q8    │     │
│     └─────────────┘     │
│                         │
│       [参加する]         │
└─────────────────────────┘
```

---

# 18. QRとコードの関係

同じTransfer Sessionに対して、

```text
             Transfer Session
                    │
          ┌─────────┴─────────┐
          │                   │
       QR Token           Join Code
          │                   │
      URLアクセス          コード入力
          │                   │
          └─────────┬─────────┘
                    │
             Session参加
```

という関係にする。

QRとコードで別々の転送処理を実装しない。

---

# 19. アプリケーションUI

トップ画面は端末種別を意識させない。

```text
┌──────────────────────────┐
│                          │
│       KUMO-WATASHI       │
│                          │
│     ファイルを送る・受け取る │
│                          │
│   [ 転送を開始する ]       │
│                          │
│   [ QRを読み取る ]         │
│                          │
│   [ コードで参加する ]      │
│                          │
└──────────────────────────┘
```

---

# 20. 転送開始画面

Transfer Session作成後、QRとコードの両方を表示する。

```text
┌──────────────────────────┐
│       相手を招待          │
│                          │
│       K7M4-29Q8          │
│                          │
│       QRコード           │
│      ██████████          │
│      ██████████          │
│                          │
│  QRまたはコードで参加できます │
│                          │
│       残り 02:58          │
└──────────────────────────┘
```

QRを利用できる場合はQRを利用し、PC-PCなどではコード入力を利用する。

---

# 21. Transfer Sessionへの参加

DownloaderのみがTransfer Sessionへ参加する。

## QRの場合

```text
Downloader
    │
    ▼
QR読み取り
    │
    ▼
Transfer Secret取得
    │
    ▼
Worker
    │
    ├── Secret検証
    ├── 有効期限確認
    └── Session確認
    │
    ▼
Transfer Session参加
    │
    ▼
ファイル一覧取得
```

## コードの場合

```text
Downloader
    │
    ▼
コード入力
    │
    ▼
Worker
    │
    ├── Code検証
    ├── Rate Limit
    ├── 有効期限確認
    └── Session確認
    │
    ▼
Transfer Session参加
    │
    ▼
ファイル一覧取得
```

UploaderはQRまたはワンタイムコードを利用してTransfer Sessionへ参加する必要はない。

# 22. ファイル転送

ファイル転送は一方向とする。

```text
Uploader
   │
   │ Upload
   ▼
Cloudflare R2
   │
   │ Download
   ▼
Downloader
```

D1にはTransfer Sessionおよびファイルメタデータのみを保存し、ファイル本体はR2に保存する。

Uploaderはアップロードのみ、Downloaderはダウンロードのみを行う。

# 23. R2へのアップロード

可能な限りWorkerをファイル転送経路にせず、R2への直接アップロードを利用する。

```text
Browser
   │
   │ 1. Upload URL要求
   ▼
Worker
   │
   │ 2. 認証・権限確認
   ▼
Presigned URL
   │
   │ 3. PUT
   ▼
R2
```

これによりWorkerのリクエストボディ制限やCPU負荷を抑える。

---

# 24. R2からのダウンロード

ダウンロードも、可能であれば短時間有効なPresigned URLを利用する。

```text
Browser
   │
   │ Download要求
   ▼
Worker
   │
   ├── Session確認
   ├── File確認
   └── 有効期限確認
   │
   ▼
短時間有効なDownload URL
   │
   ▼
R2
```

Presigned URL自体もBearer Tokenとして扱い、必要以上に長い有効期限を設定しない。

---

# 25. D1データモデル

MVPでは以下のテーブルを基本とする。

## transfer_sessions

```text
id
secret_hash
join_code_hash
status
created_at
expires_at
```

## transfer_files

```text
id
transfer_id
r2_key
filename
content_type
size
created_at
```

必要になった場合のみ、端末情報や接続情報を追加する。

---

# 26. ユーザー管理

永続的なUserテーブルはMVPでは作成しない。

```text
Google Account
      │
      ▼
短時間の認証
      │
      ▼
Transfer Session
      │
      ▼
3分で終了
```

このサービスの本質はユーザー管理ではなく、一時的なファイル転送であるためである。

---

# 27. 認証セッション

Google ID TokenをWorkerで検証後、短時間有効な認証セッションを発行する。

Cookieを利用する場合は、

```text
HttpOnly
Secure
SameSite
```

等のセキュリティ属性を適切に設定する。

認証セッションの有効期限はTransfer Sessionより長くしてもよいが、長期間保持しない。

例：

```text
Authentication Session: 10分
Transfer Session:        3分
```

具体的な値は実装時に調整する。

---

# 28. API構成

Cloudflare Workers + Honoを利用する。

想定API：

```text
POST /api/auth/google
```

Google ID Tokenを検証し、短時間の認証セッションを発行する。

```text
POST /api/transfers
```

Uploader用のTransfer Sessionを作成する。

```text
POST /api/transfers/:id/files
```

Uploader用のアップロード対象ファイル登録・Upload URL発行などを行う。

```text
GET /api/transfers/join/:token
```

DownloaderがQRのTransfer Secretを利用してTransfer Sessionへ参加する。

```text
POST /api/transfers/join
```

DownloaderがワンタイムコードでTransfer Sessionへ参加する。

```text
GET /api/transfers/:id
```

DownloaderがTransfer Sessionの状態・メタデータを取得する。

```text
GET /api/transfers/:id/files
```

DownloaderがTransfer Session内のファイル一覧を取得する。

```text
POST /api/files/:id/download
```

Downloader用のダウンロードURLを発行する。

# 29. フロントエンド構成

Vue 3 + Composition API + TypeScriptを利用する。

```text
apps/
└── web/
    ├── pages/
    │   ├── Home.vue
    │   ├── Uploader.vue
    │   └── Downloader.vue
    │
    ├── components/
    │   ├── QrCode.vue
    │   ├── QrScanner.vue
    │   ├── FilePicker.vue
    │   ├── FileList.vue
    │   └── TransferProgress.vue
    │
    └── composables/
        ├── useUploader.ts
        ├── useDownloader.ts
        ├── useTransfer.ts
        ├── useUpload.ts
        └── useDownload.ts
```

## Uploader

Uploaderは以下の機能のみ提供する。

- ファイル選択
- ファイルアップロード
- アップロード進捗表示
- QRコード表示
- ワンタイムコード表示
- Transfer Sessionの残り時間表示

Uploaderではダウンロード機能を提供しない。

## Downloader

Downloaderは以下の機能のみ提供する。

- QRコード読み取り
- ワンタイムコード入力
- Transfer Sessionへの参加
- ファイル一覧表示
- ファイルダウンロード
- ダウンロード進捗表示
- Transfer Sessionの残り時間表示

Downloaderではアップロード機能を提供しない。

# 30. バックエンド構成

```text
apps/
└── backend/
    ├── src/
    │   ├── routes/
    │   │   ├── auth.ts
    │   │   ├── uploader.ts
    │   │   └── downloader.ts
    │   │
    │   ├── services/
    │   │   ├── google-auth.ts
    │   │   ├── turnstile.ts
    │   │   ├── transfer.ts
    │   │   ├── upload.ts
    │   │   ├── download.ts
    │   │   └── rate-limit.ts
    │   │
    │   └── repositories/
    │       ├── transfer.ts
    │       └── file.ts
    │
    └── wrangler.toml
```

Uploader APIとDownloader APIを責務として分離する。

ただし、Transfer Session・File Metadata・認証などの共通ドメインロジックは共有する。

# 31. Cloudflare構成

```text
Internet
    │
    ▼
Cloudflare
    │
    ▼
Workers
    │
    ├───────────────┐
    │               │
    ▼               ▼
   D1               R2
metadata         file body
    │
    │
    ▼
Cron
cleanup
```

利用サービス：

- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Cloudflare Turnstile
- Cloudflare Workers Cron
- 必要に応じてCloudflare Rate Limiting等

---

# 32. 無料枠を前提としたMVP

MVPでは可能な限りCloudflareの無料枠内で構築する。

主な構成：

```text
Vue 3
   │
   ▼
Cloudflare Workers
   │
   ├── Google Login
   ├── Turnstile
   ├── Rate Limit
   └── Transfer API
          │
          ├── D1
          │
          └── R2
```

ファイルを3分程度しか保持しないため、R2のストレージ使用量を抑えやすい。

利用量が増えた場合は各サービスの利用量・制限を確認しながら有料プランへ移行する。

---

# 33. セキュリティ原則

## Transfer Secret

- 暗号学的に安全な乱数を利用する
- 十分なエントロピーを確保する
- D1にはSecretそのものを保存しない

## Join Code

- 推測しやすい固定値を使用しない
- ランダム生成する
- 入力回数を制限する
- IP単位のRate Limitを設定する
- Transfer Sessionの有効期限を確認する

## R2

- R2 Bucketを直接公開しない
- Workerでアクセス権を確認する
- Presigned URLは短時間のみ有効とする

## Session

- 短時間で失効させる
- Cookie利用時はHttpOnly / Secure / SameSiteを適切に設定する

---

# 34. プライバシー設計

本サービスはファイル転送を目的とし、ユーザーの永続的なプロフィール管理を行わない。

原則として、

```text
Google Account
      │
      ▼
一時的な利用者確認
      │
      ▼
Transfer Session
      │
      ▼
3分後に終了
```

とする。

ファイルはTransfer Sessionの有効期限経過後に削除する。

ログについては、障害解析・不正利用対策に必要な情報だけを保持し、保存期間を別途定義する。

---

# 35. MVPの優先順位

## Phase 1

Uploader / Downloaderによる基本的な一方向ファイル転送。

```text
Google Login
   ↓
Uploader
   ↓
Transfer作成
   ↓
ファイルUpload
   ↓
QR表示
   ↓
Downloader
   ↓
QR参加
   ↓
ファイルDownload
   ↓
3分TTL
```

## Phase 2

ワンタイムコード。

```text
Uploader
   ↓
QR + Join Code
   ↓
Downloader
   ↓
コード入力
   ↓
Transfer参加
   ↓
Download
```

## Phase 3

セキュリティ強化。

```text
Turnstile
Rate Limit
File Size Limit
File Count Limit
Total Size Limit
```

## Phase 4

UX改善。

```text
転送進捗
複数ファイル
ドラッグ＆ドロップ
スマホ向けUI改善
```

Uploader / Downloaderの責務分離はMVPから維持する。

# 36. 将来的な拡張

現在のMVPではUploader → Downloaderの一方向転送に限定する。

将来的には以下を検討できる。

- 複数端末によるダウンロード
- 転送進捗のリアルタイム通知
- ファイル単位の削除
- 転送完了通知
- QRコード再表示
- Transfer Sessionの手動終了
- WebSocket / Durable Objectsによるリアルタイム通知
- PWA化
- Capacitorによるネイティブアプリ化
- 双方向転送

ただし、双方向転送を導入する場合はUploader / Downloaderの責務やTransfer Sessionの状態モデルを再設計する。

MVPではWebSocketやDurable Objectsなどを導入せず、HTTP API + pollingを基本とする。

# 37. 最終アーキテクチャ

```text
                         Google
                           │
                           │ Authentication
                           ▼
                    ┌──────────────┐
                    │   Browser    │
                    │ Vue 3 SPA    │
                    └──────┬───────┘
                           │
                    ┌──────┴──────┐
                    │             │
                    ▼             ▼
               ┌─────────┐   ┌────────────┐
               │ Uploader│   │ Downloader │
               └────┬────┘   └──────┬─────┘
                    │               │
               Upload│               │Download
                    │               │
                    ▼               │
                 Transfer Session   │
                    │               │
                    ▼               │
               ┌───────────┐        │
               │    R2     │◄───────┘
               │ File Body │
               └───────────┘
                    ▲
                    │
              Metadata
                    │
               ┌────┴────┐
               │   D1    │
               └─────────┘

                 Cloudflare Workers
                       │
             ┌─────────┼─────────┐
             │         │         │
            Auth    Transfer   Access
                       API      Control
             │         │
          Turnstile   Rate Limit
```

## 転送フロー

```text
Uploader
   │
   ├── Google Login
   ├── Turnstile
   │
   ▼
Transfer Session作成
   │
   ▼
R2へファイルUpload
   │
   ├── QR Code
   └── One-Time Code
          │
          ▼
      Downloader
          │
          ├── QR Scan
          │      または
          └── Code Input
                 │
                 ▼
          Transfer Session参加
                 │
                 ▼
            File Download
                 │
                 ▼
              3分経過
                 │
                 ▼
               Delete
```

---

# 38. 設計上の重要な判断

本システムでは以下を基本方針とする。

1. **UploaderとDownloaderをアプリとして分離する**
2. **トップページでUploader / Downloaderを選択する**
3. **UploaderはファイルアップロードとQR / ワンタイムコード表示に限定する**
4. **DownloaderはQR / ワンタイムコードによる参加とファイルダウンロードに限定する**
5. **Transfer Sessionをドメインの中心とする**
6. **端末種別によってTransfer Sessionの処理を分けない**
7. **QRとワンタイムコードは同じTransfer Sessionへの参加方法として扱う**
8. **QR用SecretとJoin Codeは別の認証情報とする**
9. **PC-PCではワンタイムコードを推奨する**
10. **Google Loginはユーザー管理ではなく利用者確認・悪用抑制のために利用する**
11. **TurnstileとRate Limitを組み合わせる**
12. **R2はファイル本体、D1はメタデータに限定する**
13. **ファイルは3分程度の短時間のみ保持する**
14. **有効期限による論理削除と物理削除を分離する**
15. **MVPではUploader → Downloaderの一方向転送とする**
16. **MVPではHTTP API + pollingを基本とし、複雑なリアルタイム基盤を導入しない**
17. **可能な限りCloudflare無料枠でMVPを構築する**

# 38. 設計上の重要な判断

本システムでは以下を基本方針とする。

1. **UploaderとDownloaderをアプリとして分離しない**
2. **Transfer Sessionをドメインの中心とする**
3. **端末種別によって処理を分けない**
4. **QRとワンタイムコードは同じTransfer Sessionへの参加方法として扱う**
5. **QR用SecretとJoin Codeは別の認証情報とする**
6. **PC-PCではワンタイムコードを推奨する**
7. **Google Loginはユーザー管理ではなく利用者確認・悪用抑制のために利用する**
8. **TurnstileとRate Limitを組み合わせる**
9. **R2はファイル本体、D1はメタデータに限定する**
10. **ファイルは3分程度の短時間のみ保持する**
11. **有効期限による論理削除と物理削除を分離する**
12. **MVPではHTTP API + pollingを基本とし、複雑なリアルタイム基盤を導入しない**
13. **可能な限りCloudflare無料枠でMVPを構築する**
