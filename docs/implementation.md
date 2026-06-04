# Implementation Notes

この文書は、`userscript/edhrec-ja-images.user.js` を直す人向けの実装メモです。
ユーザー向けの説明は `README.md` と `docs/note-edhrec-japanese-card-image-replacer.md` に寄せています。

## 現在の表示仕様

- EDHRECのカード画像を、Scryfallの日本語印刷版画像へ差し替える
- Scryfall Taggerのカードタグ一覧でも、カード画像を日本語印刷版画像へ差し替える
- 日本語印刷版がない場合は、英語通常版へフォールバックする
- 両面カードは、EDHRECが裏面画像を出している場合に裏面を選ぶ
- ショーケース、拡張アート、ボーダーレス、プロモ系などはなるべく避ける
- 横長サムネイルやbattle/planar/scheme/vanguard系layoutは、文字つぶれ防止のため差し替えない
- ページ上部の統率者画像のようにカードリンクがない画像は、画像だけ差し替えて操作バーは出さない

操作バーの基本順序は次です。

```text
カード画像
追加操作バー
EDHREC本来のカード名、価格、synergyなど
```

通常のカードリンクでは、操作バーをリンク内の画像直後へ入れます。
EDHREC固有の `Card_container` では、`CardImage_container` または画像を含む直下要素の直後へ入れます。
Scryfall Taggerの `card-grid-item` では、固定比率のカードリンクとタグ行が重ならないように、操作バーをカードリンクの直後へ入れます。
実サイトでは `Card_container` 自体がカードリンクになる場合と、`lazyload-wrapper` の内側に `CardImage_container` とカードリンクが入る場合があります。
このときは内側の `CardImage_container` ではなく、カード直下の `lazyload-wrapper` の直後へ操作バーを入れることをE2Eで守ります。
この順序を変えると、EDHREC本体のお気に入り表示や元のカード名と重なりやすくなるため、E2Eテストで守っています。

## Scryfall APIへの配慮

Scryfall公式FAQでは、`api.scryfall.com` へのアクセスを10リクエスト/秒未満にすること、`429 Too Many Requests` を無視しないこと、必要ならbulk dataを使うこと、適切なHTTPヘッダを使うことが案内されています。

このスクリプトでは次を守ります。

- `REQUEST_GAP = 110` でAPI呼び出しを直列化し、理論上の上限を約9.09req/secにする
- `pending` で同じカード名や同じScryfall IDの同時リクエストをまとめる
- `localStorage` に7日間キャッシュし、同じカードの再検索を減らす
- 1回のスキャンで先読みするカードリンクは最大80件
- 1回のスキャンで画像を先読みする件数は最大40件
- `429` は `Retry-After` を読んで待つ
- 5xxや一時的な通信失敗は最大2回まで遅延再試行する
- `Accept: application/json;q=0.9,*/*;q=0.8` を付ける

ブラウザ上のユーザースクリプトなので、`User-Agent` はブラウザ標準のものを使います。
同じロジックをサーバーやNode.jsへ移す場合は、アプリ名や連絡先が分かる `User-Agent` を別途設定してください。

参考:

```text
https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17
```

## 保存データ

ブラウザの `localStorage` にだけ保存します。

```text
edhrec-ja-image-cache-v2
edhrec-ja-image-favorites-v1
```

お気に入り情報を外部サーバーへ送信する処理はありません。

## JSDocの方針

JSDocは全関数に機械的に付けず、壊れやすい境界に付けます。

- Scryfallレスポンスから作る `CardHit`
- ふりがな除去
- 両面カードのface選択
- 通常アート判定
- APIのthrottle/retry境界
- 画面外カードのprefetch
- 画像差し替え本体
- 操作バーの挿入位置
- お気に入り保存とパネル描画

コメントは「何をしているか」よりも、「なぜその制約が必要か」を優先します。

## 検証コマンド

```powershell
node --check userscript\edhrec-ja-images.user.js
node --test tests\edhrec-ja-images.test.js
npm run test:e2e
npm test
```

この環境では、サンドボックス内のNodeテストが `spawn EPERM` になることがあります。
その場合は権限つきで同じコマンドを再実行してください。
