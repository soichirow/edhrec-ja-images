# EDHREC Japanese Card Images

EDHREC のカード画像を、Scryfall にある日本語印刷版の画像へ自動で差し替えるユーザースクリプトです。

EDHRECで統率者デッキを見ながら、日本語名でカードを確認・コピー・お気に入り管理したい人向けです。

> This is an unofficial userscript. It is not affiliated with EDHREC or Scryfall.

## Quick Install

一番簡単な方法は Greasy Fork からのインストールです。

1. Tampermonkey または Violentmonkey を入れる
2. Greasy Fork の公開ページを開く
3. `Install this script` を押す
4. Tampermonkey の確認画面でインストールする
5. `https://edhrec.com/` を開く

```text
Greasy Fork: https://greasyfork.org/ja/scripts/580860-edhrec-japanese-card-image-replacer
```

GitHub Rawから直接インストールする場合は、次のURLを開いてください。

```text
https://raw.githubusercontent.com/soichirow/edhrec-ja-images/main/userscript/edhrec-ja-images.user.js
```

## Features

- EDHREC上のカード画像をScryfallの日本語印刷版画像へ差し替え
- スクロール前からカードリンクを先読みしてScryfall検索を進める
- 先読みで見つけた日本語画像URLをブラウザキャッシュへ読み込む
- 日本語画像が見つかるまではEDHRECの元画像をそのまま表示
- 差し替えたカードの日本語名をカード下部に表示
- 日本語名クリックでScryfallページを開く
- `コピー` ボタンで日本語名をコピー
- `★` ボタンでお気に入り登録
- 晴れる屋、BIG MAGIC、シングルスター、東京MTG、メルカリへの検索リンクを表示
- 右下のお気に入りパネルで登録カードを一覧管理
- お気に入り一覧をまとめてコピーしてExcelやスプレッドシートへ貼り付け
- 読み仮名つき日本語名をコピーしやすい表記へ整形
- 特殊アート、ショーケース、ボーダーレス、拡張アート、プロモ系画像を避ける
- 取得結果をブラウザの `localStorage` に7日間キャッシュ

読み仮名の整形例:

```text
ファイレクシアの変（へん）形（けい）者（しゃ）
↓
ファイレクシアの変形者
```

## Usage

EDHRECの統率者ページやカードページを開くと、カード画像が順番に日本語版へ差し替わります。

差し替え済みカードの下部には小さな操作バーが表示されます。

- 日本語名: Scryfallを開く
- コピー: 日本語名をクリップボードへコピー
- ★: お気に入りに追加/解除

右下の `★ お気に入り` ボタンを押すと、お気に入りパネルが開きます。`全部コピー` を押すと、日本語カード名を改行区切りでまとめてコピーできます。

## API And Rate Limits

このスクリプトはブラウザからScryfall APIへ問い合わせます。

Scryfall公式FAQでは、`api.scryfall.com` へのアクセスを10リクエスト/秒未満に抑えること、`Accept` や `User-Agent` などの適切なヘッダーを使うこと、`429 Too Many Requests` を無視しないことが案内されています。

このスクリプトでは次の対策を入れています。

- API呼び出しは直列キューで実行
- リクエスト間隔は `110ms` 以上、最大約 `9.09 req/sec`
- `Accept: application/json` を明示
- `429 Too Many Requests` では `Retry-After` を見て追加待機
- 同じカード名への同時リクエストは1つに統合
- 検索結果は7日間キャッシュ
- 1回のスキャンで先読みするカード数は最大80件
- 1回のスキャンで画像を先読みするカード数は最大40件
- キャッシュの最大件数は800件

メルカリへのリンクは通常の検索リンクです。アフィリエイトリンクを使う場合は、メルカリアンバサダーの規約とガイドラインに従い、自分が管理する媒体で、必要なPR表記を添えて利用してください。

ブラウザ上で動くユーザースクリプトなので、`User-Agent` はブラウザ標準のものを使います。Node.jsやサーバーで同じ仕組みを作る場合は、アプリ名と連絡先が分かる `User-Agent` を別途設定してください。

## Storage

ブラウザの `localStorage` に次のデータを保存します。

- Scryfall検索結果キャッシュ: `edhrec-ja-image-cache-v1`
- お気に入りカード一覧: `edhrec-ja-image-favorites-v1`

外部サーバーへお気に入り情報を送信する機能はありません。

## Troubleshooting

### 画像が差し替わらない

- Tampermonkey/Violentmonkeyでスクリプトが有効になっているか確認する
- ページを再読み込みする
- 対象URLが `https://edhrec.com/*` または `https://www.edhrec.com/*` か確認する
- そのカードに日本語印刷版が存在するかScryfallで確認する
- ブラウザ拡張や広告ブロッカーが `api.scryfall.com` への通信を止めていないか確認する

### 一部のカードだけ英語のまま

Scryfallに日本語印刷版がないカード、または通常アート寄りの日本語画像が見つからないカードは、EDHRECの元表示を残します。

### レイアウトが崩れる

カード下部の操作バーはカード内に重ねて表示する設計です。EDHREC側のHTML構造が大きく変わった場合は、Issueで対象ページURLを共有してください。

## Project Structure

```text
.
├── userscript/
│   └── edhrec-ja-images.user.js
├── tests/
│   └── edhrec-ja-images.test.js
├── fixtures/
│   └── layout-test.html
├── docs/
│   └── note-edhrec-japanese-card-image-replacer.md
├── README.md
├── LICENSE
└── package.json
```

## Development

Requirements:

- Node.js
- npm

Run tests:

```powershell
npm test
```

Syntax check:

```powershell
node --check userscript\edhrec-ja-images.user.js
```

Local layout fixture:

```powershell
python -m http.server 8769 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8769/fixtures/layout-test.html
```

## Release Flow

GitHubを正本にして、Greasy Fork側をGitHub Raw URLから同期する運用を想定しています。

1. `userscript/edhrec-ja-images.user.js` を編集する
2. メタ情報の `@version` を上げる
3. `npm test` を実行する
4. commitしてGitHubへpushする
5. Greasy Fork側で同期する

Greasy Fork 同期元URL:

```text
https://raw.githubusercontent.com/soichirow/edhrec-ja-images/main/userscript/edhrec-ja-images.user.js
```

GitHubリポジトリ作成後の初回push例:

```powershell
gh repo create soichirow/edhrec-ja-images --public --source . --remote origin --push
```

## Note Article

公開用のNote記事ドラフトは次にあります。

```text
docs/note-edhrec-japanese-card-image-replacer.md
```

Greasy Fork公開後、記事内の `[ここにGreasy ForkのURLを入れる]` を実際のURLに差し替えてください。

## License

MIT License. See [LICENSE](LICENSE).
