# KUMO-WATASHI

スマートフォンやPC間でファイルを一時的に転送するWebアプリケーション。ファイルは永続保存せず、
Transfer Sessionを作成して短時間(既定3分)だけクラウド上に保持する。QRコードまたはワンタイムコードで
Uploader(送信側)からDownloader(受信側)へ一方向にファイルを転送する。詳細な仕様は
[docs/spec.md](docs/spec.md) を参照。

Vite+モノレポ構成で、`apps/backend`, `apps/frontend`, `packages/utils` からなる。`apps/backend` は
Hono API(Cloudflare Workersへのデプロイ、またはNode.jsサーバーとして単体でも動作)、`apps/frontend`
はVue 3 + Vuetify 4のクライアントで、Hono RPC(型付きリクエスト/レスポンス、手動での型共有パッケージ不要)
を通じてbackendと通信する。`packages/utils` は両者で共有するランタイム非依存のコードを保持する。

## Development

- Check everything is ready:

```bash
vp run ready
```

- Run all tests:

```bash
vp run -r test
```

- Build everything:

```bash
vp run -r build
```

## packages/utils

- Run format/lint/type checks:

```bash
vp run utils#check
```

- Run the tests:

```bash
vp run utils#test
```

## apps/backend

Deployable to Cloudflare Workers or as a standalone Node.js server. Pick the runtime section(s) a given project needs.

Script naming: no suffix = common (runtime-agnostic) or Cloudflare Workers, `:node` suffix = Node.js.

### Common

- Run format/lint/type checks:

```bash
vp run backend#check
```

- Run the tests:

```bash
vp run backend#test
```

### Cloudflare Workers

- Debug locally:

```bash
vp run backend#dev
```

- Build (dry-run bundle):

```bash
vp run backend#build
```

- Deploy:

```bash
vp run backend#deploy
```

- Regenerate Workers binding types:

```bash
vp run backend#cf-typegen
```

### Node.js

- Debug locally (hot reload):

```bash
vp run backend#dev:node
```

- Build:

```bash
vp run backend#build:node
```

- Run the built bundle:

```bash
vp run backend#start:node
```

## apps/frontend

- Run format/lint/type checks:

```bash
vp run frontend#check
```

- Run the tests:

```bash
vp run frontend#test
```

- Run the dev server:

```bash
vp run frontend#dev
```

- Build:

```bash
vp run frontend#build
```

- Preview the production build:

```bash
vp run frontend#preview
```
