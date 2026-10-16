# Implementation Notes

この文書は、`userscript/edhrec-ja-images.user.js` を直す人向けの実装メモです。
ユーザー向けの説明は `README.md` と `docs/note-edhrec-japanese-card-image-replacer.md` に寄せています。

## 現在の表示仕様

- EDHRECのカード画像を、Scryfallの日本語印刷版画像へ差し替える
- Scryfall TaggerとScryfall検索結果のカード一覧でも、カード画像を日本語印刷版画像へ差し替える
- 日本語印刷版がない場合は、英語通常版へフォールバックする
- 両面カードは、EDHRECが裏面画像を出している場合に裏面を選ぶ
- ショーケース、拡張アート、ボーダーレス、プロモ系などはなるべく避ける
- 横長サムネイルやbattle/planar/scheme/vanguard系layoutは、文字つぶれ防止のため差し替えない
- 新UIのリンクなしメインカードにも画像差し替えと操作バーを提供する。旧UIの枠を持たない統率者画像は画像のみ差し替える

操作バーの基本順序は次です。

```text
カード画像
EDHREC本来の価格
追加操作バー
EDHREC本来のカード名、synergyなど
```

通常のカードリンクでは、操作バーをリンク内の画像直後へ入れます。
EDHREC固有の `Card_container` では、価格行が画像コンテナ内または画像を含む `lazyload-wrapper` 内にある場合は、その価格表示のまとまりの直後へ入れます。価格行が見つからない場合は、`CardImage_container` または画像を含む直下要素の直後へ入れます。
Scryfall系ページの `card-grid-item` では、固定比率のカードリンクとタグ行や周辺表示が重ならないように、操作バーをカードリンクの直後へ入れます。`https://scryfall.com/search?q=otag%3Amulti-land-ramp&unique=cards&utm_source=tagger` のような検索結果ページでは、`/card/{set}/{collector}` 形式のリンクから `https://api.scryfall.com/cards/{set}/{collector}/ja` を先に引き、日本語印刷版があれば名前検索を挟まずに差し替えます。
実サイトでは `Card_container` 自体がカードリンクになる場合と、`lazyload-wrapper` の内側に `CardImage_container` とカードリンクが入る場合があります。
このときは画像、価格行、操作バー、EDHREC本来のカード名やsynergy表示の順になることをE2Eで守ります。
同じカード枠に表面と裏面の画像が両方ある場合でも、操作バーは1つだけ表示します。
この順序を変えると、EDHREC本体のお気に入り表示や元のカード名と重なりやすくなるため、E2Eテストで守っています。

## 新UIの対応（2026-10-16）

- `card-images.edhrec.com/grid/` のカード画像を検出する。`art/` の背景・サムネイルは対象外。
- 空のaltではなく、画像の親要素にあるカード名を読む。画像URLのUUIDによる補完にも対応する。
- CSSモジュールのビルドごとに変わる接頭辞は固定せず、直下の`_faces`要素でカード枠を特定する。操作バーは同じ枠の`_prices`の直後、価格がない場合は`_faces`の直後に挿入する。
- DOM変更のスキャンを300ms単位でまとめ、追加したボタン内の変更は再スキャンの起点にしない。
- 画像要素が再利用されてsrcが変わった場合は、画像と操作バーを更新する。取得中に別の画像へ切り替わった場合は古い結果を適用しない。
- 正確な版指定のAPI通信が失敗した際は「日本語版なし」としてキャッシュしない。

## Scryfall APIへの配慮

Scryfall公式FAQでは、`api.scryfall.com` へのアクセスを10リクエスト/秒未満にすること、`429 Too Many Requests` を無視しないこと、必要ならbulk dataを使うこと、適切なHTTPヘッダを使うことが案内されています。

このスクリプトでは次を守ります。

- `REQUEST_GAP = 250` でAPI呼び出しを直列化し、通信開始の間隔を最低250ミリ秒にする（最大約4req/sec）
- Web LocksとlocalStorageが使える環境では、同一オリジンのタブ間でも通信間隔と429の待機時間を共有する。別オリジン・別ブラウザ・他の拡張機能との合算制御は行わない
- `pending` で同じカード名や同じScryfall IDの同時リクエストをまとめる
- `localStorage` に7日間キャッシュし、同じカードの再検索を減らす
- EDHRECではリンクの先読みを止め、IntersectionObserverで画面と前後300pxの画像のみ取得する
- Scryfall系の先読みは画像付きかつ画面近くのリンクに限定し、1回のスキャンで最大80件
- 1回のスキャンで画像を先読みする件数は最大40件
- `429` は `Retry-After` を読んで待つ。ヘッダがない場合は10秒待つ。同一ページで2回目の429を受けたら、待機キューも含めて追加のAPI通信を止める
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

## 保存データの安全性

保存済みデータは型とURLを検証してから利用する。画像はHTTPSの`cards.scryfall.io`、リンクはHTTPSの`scryfall.com`に限定し、ユーザー名・パスワードを含むURLは拒否する。不正なJSONや配列を保存レコードとして扱わない。文字列はtextContentで表示する。
