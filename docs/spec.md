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
アップロードするためには「Googleでログイン」が必要。

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

UploaderとDownloaderの役割を固定することで、UI・API・認可モデルを単純化する。

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

| Uploader       | Downloader     | 主な参加方法               |
| -------------- | -------------- | -------------------------- |
| スマートフォン | スマートフォン | QR / コード                |
| スマートフォン | PC             | QR / コード                |
| PC             | スマートフォン | QR / コード                |
| PC             | PC             | コードを推奨、QRも利用可能 |

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
       有効期限N分経過
```

重要なのは、

- 作成日時
- 有効期限
- アクセス認証
- ファイル一覧
- 期限切れ処理

である。

---

# 5. Transfer Sessionの有効期限

Transfer Sessionの有効期限は、作成からN分とする。

```text
created_at
     │
     │ N minutes
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

Googleアカウント情報を使った永続的なユーザー管理（Userテーブル等でのプロフィール管理）は行わない。  
Google ID TokenをWorkerで検証し、短時間のみ有効な認証セッションを発行する。  
認証済みメールアドレスはログに記録する（詳細は8章を参照）。これはユーザー管理のためではなく、運営者が利用状況を把握するためである。

---

# 8. Googleユーザー情報の保持

## 8.1 D1（永続データベース）

Transfer SessionおよびFileのメタデータ以外の永続テーブルは作成しない。以下の情報はD1に保存しない。

- 氏名
- プロフィール画像
- Googleアカウント情報全般

本サービスの本質は一時的なファイル転送であり、Googleアカウントに紐づくユーザープロフィールを蓄積するデータベースを持たないことが目的である（24章参照）。

## 8.2 ログ（アプリケーションログ）

本サービスは小規模な運用を想定しており、運営者自身が「自分が使用しているのか」「利用を許可した第三者が使用しているのか」「許可していないユーザーが無断で使用しているのか」をログから即座に判別できる必要がある。

そのため、認証済みメールアドレスは**匿名化せずそのままログに記録する**。Googleの`sub`をHMAC等で匿名化する処理は行わない。

ログの保存期間は運用ポリシーとして別途定める（32章参照）。ログは障害解析・不正利用対策・利用状況把握のために保持するものであり、D1上の永続的なユーザープロフィールとは扱いが異なる。

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
Transfer Session作成時など、悪用されやすい操作を中心にTurnstileを適用する。  
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

初期値例：

```text
1 Transferあたり最大ファイル数: 5
1ファイルあたり最大サイズ: 100MB
1 Transferあたり最大合計サイズ: 500MB
Transfer TTL: 1分
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
英字4文字 + 数字4文字（順序はランダム）
合計8文字
```

英字4文字は8文字中のランダムな位置に出現する（先頭固定ではない）。これは、コードの構造（どの桁が英字か）が常に一定だと推測材料を与えてしまうためである。  
表示時には4文字ごとに区切る（区切り位置は文字種とは無関係の表示上のグルーピング）。

例：

```text
4A7T-R3C9
```

入力時はハイフンを省略してもよい。

```text
4A7TR3C9
```

内部では正規化して同一コードとして扱う。

---

# 14. ワンタイムコードの文字集合

英字・数字のいずれも、互いに誤読しやすい文字は使用しない。  
以下の誤読しやすい組み合わせを避ける。

```text
I / 1
O / 0
S / 5
B / 8
G / 6
Z / 2
```

最終的な文字集合：

```text
英字（20種類）: ACDEFHJKLMNPQRTUVWXY
数字（4種類）:   3479
```

英字側は I, O, S, B, G, Z を除外し、数字側は 0, 1, 2, 5, 6, 8 を除外する。両方の文字集合を定数として定義し、生成時はそれ以外の文字を使用しない。

---

# 15. ワンタイムコードのエントロピー

8文字中どの4文字が英字になるかもランダムであるため、組み合わせ数は

```text
C(8,4) × 20⁴ × 4⁴
= 70 × 160,000 × 256
= 2,867,200,000
```

となり、約28.7億通りの組み合わせとなる。

ただし、ワンタイムコード単体を強固な秘密情報とはみなさない。  
以下を組み合わせて安全性を確保する。

```text
ワンタイムコード
      +
N分TTL
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
│       K7M4-X9Q8         │
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
│     │ K7M4X9Q8    │     │
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
│   [ ファイルを送る ]      │
│                          │
│   [ ファイルを受け取る ]   │
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
│       K7M4-X9Q8          │
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

DownloaderでTransfer Sessionへ参加する。

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

# 23. D1データモデル

以下のテーブルを基本とする。

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

# 24. ユーザー管理

永続的なUserテーブルは作成しない。

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
N分で終了
```

このサービスの本質はユーザー管理ではなく、一時的なファイル転送であるためである。

---

# 25. 認証セッション

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

# 26. API構成

Cloudflare Workers + Honoを利用する。

想定API：

```text
POST /api/auth/google
```

Google ID Tokenを検証し、短時間の認証セッションを発行する。

```text
POST /api/client-id
```

Downloader用の匿名なクライアントIDを発行する（IP単位でRate Limit）。ワンタイムコード入力のRate Limitキーとして利用する。

```text
POST /api/transfers
```

Uploader用のTransfer Sessionを作成する。Turnstileトークンを検証する。

```text
POST /api/transfers/:id/files
```

Uploader用のファイルをアップロードする（ファイル本体を含むmultipartリクエスト）。

```text
GET /api/transfers/join/:secret
```

DownloaderがQRのTransfer Secretを利用してTransfer Sessionへ参加する。

```text
POST /api/transfers/join
```

DownloaderがワンタイムコードでTransfer Sessionへ参加する。クライアントIDとIPの組でRate Limitする。

```text
GET /api/transfers/:id
```

DownloaderがTransfer Sessionの状態・メタデータを取得する。

```text
GET /api/transfers/:id/files
```

DownloaderがTransfer Session内のファイル一覧を取得する。

```text
GET /api/transfers/:id/files/:fileId/download
```

Downloaderがファイル本体をダウンロードする。

```text
POST /api/transfers/:id/extend
```

Uploaderが自分のTransfer Sessionの有効期限を延長する。

```text
DELETE /api/transfers/:id
```

Uploaderが自分のTransfer Sessionを即座に削除する。

# 27. フロントエンド構成

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

# 28. バックエンド構成

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

# 29. Cloudflare構成

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
```

期限切れTransfer Sessionの物理削除にCloudflare Workers Cronは使用しない。Free PlanのCronはリクエストあたりのCPU時間制限が厳しく、削除件数が不定な一括削除処理には向かないためである。  
代わりに、通常のリクエスト処理の中でD1上のリースロック（1行のロックレコード）を奪い合い、獲得したリクエストだけが期限切れセッションの削除を実行する（他のリクエストは待たずにそのまま処理を続ける）「日和見的（opportunistic）クリーンアップ」を採用する。  
論理的な期限切れ判定（`expires_at`確認）はWorker側で毎回行うため、物理削除が多少遅延してもアクセス拒否には影響しない（5.1章参照）。

```text
Workers（各リクエスト内）
    │
    ├── D1のリースロックを取得できたら
    │       │
    │       ▼
    │   期限切れSessionをD1・R2から削除
    │       │
    │       ▼
    │   ロック解放
    │
    └── 取得できなければ何もせず次へ
```

利用サービス：

- Cloudflare Workers
- Cloudflare D1（Transfer Session・ファイルメタデータに加え、Rate Limitカウンターとクリーンアップ用リースロックも保持する）
- Cloudflare R2
- Cloudflare Turnstile

---

# 30. 無料枠を前提としたサービス

Cloudflareの無料枠内で構築する。

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

ファイルを1分程度しか保持しないため、R2のストレージ使用量を抑えやすい。  
利用量が増えた場合は各サービスの利用量・制限を確認しながら有料プランへ移行する。

---

# 31. セキュリティ原則

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

## Session

- 短時間で失効させる
- Cookie利用時はHttpOnly / Secure / SameSiteを適切に設定する

---

# 32. プライバシー設計

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
N分後に終了
```

とする。  
ファイルはTransfer Sessionの有効期限経過後に削除する。

ログについては、障害解析・不正利用対策・利用状況把握に必要な情報を保持し、保存期間を別途定義する。認証済みメールアドレスもこれに含まれ、匿名化は行わない（8.2章参照）。これはD1に永続的なユーザープロフィールを持たないという方針（8.1章、24章）とは別の話であり、「プロフィール管理をしない」ことと「運営者が利用状況をログで追跡できる」ことは両立する。

---
