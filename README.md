# EDHREC Japanese Card Images

EDHREC のカード画像を、Scryfall にある日本語印刷版の画像へ自動で差し替えるユーザースクリプトです。

統率者デッキを EDHREC で見ながら、日本語名でカードを確認したり、カード名をコピーして Excel やスプレッドシートへ貼り付けたり、ショップ検索へ進んだりしやすくします。

> This is an unofficial userscript. It is not affiliated with EDHREC or Scryfall.

## Quick Install

一番簡単な方法は Greasy Fork からのインストールです。

1. Tampermonkey または Violentmonkey をインストールする
2. Greasy Fork の公開ページを開く
3. `Install this script` を押す
4. Tampermonkey の確認画面でインストールする
5. `https://edhrec.com/` を開く

```text
Greasy Fork: https://greasyfork.org/ja/scripts/580860-edhrec-japanese-card-image-replacer
```

GitHub Raw から直接インストールする場合は、次の URL を開いてください。

```text
https://raw.githubusercontent.com/soichirow/edhrec-ja-images/main/userscript/edhrec-ja-images.user.js
```

## Update

Greasy Fork から入れた場合は、Tampermonkey の自動更新で新しい版を取得できます。

すぐ更新したい場合は、Tampermonkey の管理画面でこのスクリプトを開き、更新確認を実行してください。GitHub Raw 版を使っている場合は、インストール時と同じ Raw URL をもう一度開くと最新版のインストール画面が表示されます。

現在の userscript バージョン:

```text
2026-06-04.1
```

EDHREC のコンソールには次のように表示されます。

```text
[EDHREC JA Images] version 2026-06-04.1
```

## Features

- EDHREC 上のカード画像を Scryfall の日本語印刷版画像へ差し替え
- 初回ロード中は EDHREC の元画像を残し、読み込み画面を出さない
- 見えているカード画像を優先して検索し、スクロール前の先読みはあとで軽く実行
- 日本語印刷版が見つからないカードは、少し待ってから Scryfall の英語通常版へフォールバック
- Scryfall の個別カードページへのリンクを表示
- 晴れる屋、BIG MAGIC、シングルスター、東京MTG、メルカリへの検索リンクを表示
- コピーボタンで日本語カード名をコピー
- `★` ボタンでお気に入り登録
- 右下のお気に入りパネルで登録カードを一覧管理
- お気に入り一覧をまとめてコピーして Excel やスプレッドシートへ貼り付け可能
- 読み仮名つき日本語名をコピーしやすい表記へ整形
- 特殊アート、ショーケース、ボーダーレス、拡張アート、プロモ系画像をなるべく避ける
- 横長サムネイルやカード形状ではない画像は、レイアウト崩れを避けるため差し替え対象外
- 取得結果をブラウザの `localStorage` に 7 日間キャッシュ

読み仮名の整形例:

```text
ファイレクシアの変（へん）形（けい）者（しゃ）
-> ファイレクシアの変形者
```

## How It Looks

差し替え済みカードの画像下に、小さな操作バーが表示されます。

```text
画像
操作バー: Scryfall / 晴 / BM / SS / 東 / メ / コピー / ★
EDHREC 元の価格・synergy 表示
```

操作バーは画像の直後に置き、EDHREC 本来の価格や synergy 表示にかぶらないようにしています。画像と操作バーの間には少し余白を入れています。

## Speed

EDHREC 自体のページロードと画像ロードにも時間がかかります。初回表示では、Scryfall API が EDHREC 本体の画像読み込みより先に完了するとは限りません。

そのため、このスクリプトは「英語画像を消して待つ」のではなく、次の方針にしています。

- EDHREC の元画像をそのまま表示する
- 画面に見えているカードを先に Scryfall 検索する
- 日本語画像が準備できたら差し替える
- スクロール前のカードは、ブラウザが空いたタイミングで軽く先読みする
- 再訪時やスクロール後はキャッシュで速く表示する

初回のファーストビューでは EDHREC の元画像が先に見えることがあります。再訪時、同じページ内のスクロール後、または日本語画像 URL がブラウザキャッシュに入ったあとほど体感が速くなります。

## API And Rate Limits

このスクリプトはブラウザから Scryfall API へ問い合わせます。

Scryfall 公式 FAQ では、`api.scryfall.com` へのアクセスを 10 requests/sec 未満に抑えること、`429 Too Many Requests` を無視しないこと、必要なヘッダーを付けること、大量の単純 lookup では Bulk Data を使うことが案内されています。

参考:

- https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17
- https://scryfall.com/docs/api
- https://scryfall.com/docs/api/bulk-data

このスクリプトで入れている対策:

- API 呼び出しは直列キューで実行
- リクエスト間隔は `110ms` 以上、最大約 `9.09 req/sec`
- `Accept: application/json;q=0.9,*/*;q=0.8` を指定
- `429 Too Many Requests` では `Retry-After` を見て待機
- 一時的な通信失敗や 5xx 系エラーは指数バックオフで最大 2 回再試行
- 同じカード名への同時リクエストは 1 つにまとめる
- 画面に見えているカードを先に処理
- スクロール前の先読みは `requestIdleCallback` で後回し
- 先読みは日本語検索だけを行い、英語フォールバックを走らせない
- 日本語印刷版が見つからない表示中カードだけ、`900ms` 後に英語通常版検索へフォールバック
- 検索結果は 7 日間キャッシュ
- 1 回のスキャンで先読みするカードリンクは最大 80 件
- 1 回のスキャンで画像を先読みするカードは最大 40 件
- キャッシュの最大件数は 800 件

画像ファイルそのものは `cards.scryfall.io` から読み込まれます。Scryfall FAQ では、`*.scryfall.io` などのファイルドメインは API と同じ制限ではないと説明されています。ただし、過剰なアクセスにならないよう、このスクリプトでは画像先読み数にも上限を置いています。

メルカリへのリンクは通常の検索リンクです。アフィリエイトリンクを使う場合は、メルカリ側のプログラム規約、媒体表示ルール、PR 表記の要件を確認してください。

## Storage

ブラウザの `localStorage` に次のデータを保存します。

- Scryfall 検索結果キャッシュ: `edhrec-ja-image-cache-v2`
- お気に入りカード一覧: `edhrec-ja-image-favorites-v1`

お気に入り情報を外部サーバーへ送信する機能はありません。

## Troubleshooting

### 画像が差し替わらない

- Tampermonkey または Violentmonkey でスクリプトが有効になっているか確認する
- ページを再読み込みする
- 対象 URL が `https://edhrec.com/*` または `https://www.edhrec.com/*` か確認する
- ブラウザ拡張や広告ブロッカーが `api.scryfall.com` への通信を止めていないか確認する
- DevTools の Console に `[EDHREC JA Images] version ...` が出ているか確認する

### 一部のカードだけ英語画像のまま

日本語印刷版が Scryfall にないカード、または通常アート寄りの日本語画像が見つからないカードは、Scryfall の英語通常版へ差し替えます。

特殊アートしか見つからない場合も、読みやすさを優先して英語通常版を選ぶことがあります。

### レイアウトが崩れる

操作バーはカード画像の直後、EDHREC 元表示の手前に追加されます。横長サムネイルやカード形状ではない画像は、文字が潰れたり重なったりしやすいため差し替えません。

EDHREC 側の HTML 構造が大きく変わった場合は、Issue で対象ページ URL とスクリーンショットを共有してください。

## Project Structure

```text
.
|-- userscript/
|   `-- edhrec-ja-images.user.js
|-- tests/
|   |-- edhrec-ja-images.test.js
|   `-- e2e-layout.test.js
|-- fixtures/
|   `-- layout-test.html
|-- docs/
|   `-- note-edhrec-japanese-card-image-replacer.md
|-- README.md
|-- LICENSE
`-- package.json
```

## Development

Requirements:

- Node.js
- npm

Run tests:

```powershell
npm test
```

Run only unit/spec tests:

```powershell
npm run test:unit
```

Run only the real-browser layout E2E test:

```powershell
npm run test:e2e
```

The E2E test launches a local static server and a Chromium-family browser through the DevTools Protocol. If Edge or Chrome is installed in a non-standard path, set `E2E_BROWSER_PATH`.

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

GitHub を正本にして、Greasy Fork 側を GitHub Raw URL から同期する運用を想定しています。

1. `userscript/edhrec-ja-images.user.js` を編集する
2. メタ情報の `@version` を上げる
3. `npm test` を実行する
4. commit して GitHub へ push する
5. Greasy Fork 側で同期する

Greasy Fork 同期元 URL:

```text
https://raw.githubusercontent.com/soichirow/edhrec-ja-images/main/userscript/edhrec-ja-images.user.js
```

GitHub リポジトリ作成後の初回 push 例:

```powershell
gh repo create soichirow/edhrec-ja-images --public --source . --remote origin --push
```

## Note Article

公開用の Note 記事は次にあります。

```text
docs/note-edhrec-japanese-card-image-replacer.md
```

## License

MIT License. See [LICENSE](LICENSE).
