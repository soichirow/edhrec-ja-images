# EDHREC Japanese Card Images

EDHREC のカード画像を、Scryfall にある日本語印刷版の画像へ自動で差し替えるユーザースクリプトです。

## インストール

一番簡単な方法は Greasy Fork からのインストールです。

- Greasy Fork: 公開後にURLを追加
- ソース: `userscript/edhrec-ja-images.user.js`

GitHub Rawから直接インストールする場合は、次のURLを使います。

```text
https://raw.githubusercontent.com/soichirow/edhrec-ja-images/main/userscript/edhrec-ja-images.user.js
```

## できること

- EDHREC 上にすでに表示されているカード画像を日本語版画像へ差し替える
- ページ内のカードリンクを先読みして、スクロール前からScryfall検索を進める
- 差し替えたカードの日本語名をScryfallリンクとして表示する
- 日本語名の横にコピー用ボタンを表示する
- 日本語名の横にお気に入りボタンを表示し、右下パネルで一覧管理できる
- お気に入り一覧から日本語名をまとめてコピーできる
- 日本語名に含まれる読み仮名は除去する。例: `ファイレクシアの変（へん）形（けい）者（しゃ）` は `ファイレクシアの変形者`
- 特殊アート、ショーケース、ボーダーレス、拡張アート、プロモ系画像は避ける
- Scryfall に日本語印刷版がないカードは EDHREC の元表示を残す
- 取得結果をブラウザの `localStorage` に 7 日間キャッシュする
- お気に入りはブラウザの `localStorage` に保存する

## 使い方

1. Tampermonkey または Violentmonkey をブラウザに入れる
2. Greasy ForkまたはGitHub Rawからスクリプトをインストールする
3. Tampermonkeyの確認画面でインストールする
4. `https://edhrec.com/` のカードページや統率者ページを開く
5. ページ内のカード画像が日本語版に差し替わることを確認する

## 仕組み

カード名から Scryfall API を検索し、`lang:ja` の印刷版が見つかった場合に `normal` サイズの画像 URL を使います。API呼び出しは110ms間隔の直列キューに入れ、同じカード名の重複リクエストはまとめます。`Accept: application/json` を明示し、`429 Too Many Requests` では `Retry-After` を見て追加で待ちます。取得結果は7日間 `localStorage` に保存します。候補が複数ある場合は通常アート寄りの印刷版だけを採用します。

## 注意

- Scryfall に日本語画像がないカードは差し替わりません。
- EDHREC 側の HTML 構造が大きく変わると、カード名の抽出が一部失敗する可能性があります。
- ブラウザから `api.scryfall.com` へカード名を問い合わせます。
- Scryfall APIの負荷を下げるため、先読みは1回のスキャンにつき最大80件に制限しています。

## 開発

```powershell
npm test
```

## 公開・更新

GitHubを正本にして、Greasy Fork側を同期させる運用を想定しています。

1. `userscript/edhrec-ja-images.user.js` を編集する
2. `@version` を上げる
3. `npm test` を実行する
4. `git commit` して GitHub に push する
5. Greasy Fork の同期元に GitHub Raw URL を設定する

Greasy Fork 同期元URL:

```text
https://raw.githubusercontent.com/soichirow/edhrec-ja-images/main/userscript/edhrec-ja-images.user.js
```
