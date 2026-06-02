# EDHRECのカード画像を日本語版に自動で差し替えるTampermonkeyスクリプトを作りました

EDHRECを見ながら統率者デッキを組んでいるとき、カード画像やカード名が英語のままだと、あとで日本語名を調べ直すのが地味に面倒です。

そこで、EDHREC上のカード画像をScryfallにある日本語印刷版の画像へ自動で差し替えるユーザースクリプトを作りました。

Chrome拡張として配布するのではなく、Tampermonkeyに貼って使う形です。ブラウザに拡張を1つ入れて、スクリプトを登録するだけで使えます。

## できること

- EDHRECのカード画像を、日本語印刷版の画像へ自動で差し替える
- 差し替えたカードの日本語名をカード下部に表示する
- 日本語名をクリックするとScryfallの該当ページを開ける
- `コピー` ボタンで日本語名をコピーできる
- `★` ボタンでお気に入り登録できる
- 右下のお気に入りパネルから、登録した日本語名をまとめてコピーできる
- Excelやスプレッドシートに貼りやすいように、1行1枚のカード名でコピーできる
- 読み仮名つきの日本語名は、コピー時に読みを取り除く

たとえばScryfall側で `ファイレクシアの変（へん）形（けい）者（しゃ）` のような表記が返ってきても、画面表示とコピーでは `ファイレクシアの変形者` になります。

## 使う前の注意

これはEDHRECやScryfallの公式機能ではありません。個人用のユーザースクリプトです。

EDHREC側のHTML構造が大きく変わると、一部のカードでうまく差し替わらない可能性があります。また、Scryfallに日本語印刷版の画像がないカードは、EDHRECの元画像のまま残ります。

カード画像やカード情報はScryfallのデータを利用しています。ScryfallのAPIに負荷をかけないよう、スクリプト側ではリクエスト間隔、キャッシュ、重複リクエスト防止を入れています。

Scryfall公式FAQでは、`api.scryfall.com` へのアクセスは10リクエスト/秒未満に抑えるよう案内されています。このスクリプトでは110msに1回以下、つまり最大でも約9.09リクエスト/秒程度になるようにしています。100msぴったりにすると境界ぎりぎりになりすぎるため、少しだけ余白を残しています。

また、ScryfallはAPIリクエストに適切な `User-Agent` と `Accept` ヘッダーを付けることも案内しています。このスクリプトはブラウザ上で動くため、`User-Agent` はブラウザ標準のものを使い、`Accept` は `application/json` を明示しています。もし同じ仕組みをサーバーやNode.jsで作る場合は、アプリ名や連絡先が分かる `User-Agent` を必ず設定してください。

## 導入方法

一番簡単なのは、Greasy Forkからインストールする方法です。

### いちばん簡単なインストール方法

1. Tampermonkeyを入れる  
   https://www.tampermonkey.net/
2. このスクリプトページを開く  
   [ここにGreasy ForkのURLを入れる]
3. `Install this script` を押す
4. Tampermonkeyの確認画面で `インストール` を押す
5. EDHRECを開く  
   https://edhrec.com/

これだけで使えます。

### 公開者向け: Greasy Forkへの投稿方法

Greasy Forkのアカウントを作ったら、次の手順で公開できます。

1. Greasy Forkにログインする
2. 画面上部またはメニューから `Submit a script` を開く
3. スクリプト入力欄に `edhrec-ja-images.user.js` の中身を丸ごと貼る
4. 表示された名前と説明を確認する
5. ライセンスが `MIT` になっていることを確認する
6. Adult content ではない設定のままにする
7. 公開する

スクリプトの先頭に次の情報を入れてあるので、Greasy Fork側で名前、説明、対象サイト、ライセンスが自動で読み取られます。

```js
// @name:ja      EDHREC 日本語カード画像差し替え
// @description:ja EDHREC のカード画像を Scryfall の日本語印刷版画像に差し替え、日本語名コピーとお気に入り管理を追加します
// @license      MIT
// @match        https://edhrec.com/*
// @match        https://www.edhrec.com/*
```

公開できたら、Note記事の `[ここにGreasy ForkのURLを入れる]` を実際の公開URLに差し替えてください。

### GitHubにも置く場合

Greasy Forkだけでも配布できますが、ソースコードや説明を残す場所としてGitHubにも置いておくと便利です。

おすすめは、GitHubを正本にして、Greasy Fork側をGitHubのRaw URLから同期させる運用です。

1. GitHubリポジトリに `edhrec-ja-images.user.js` を置く
2. Greasy Forkの同期元にGitHub Raw URLを設定する
3. 以後はGitHubにpushしてGreasy Forkへ同期する

今回の想定URLは次の形です。

```text
https://raw.githubusercontent.com/soichirow/edhrec-ja-images/main/userscript/edhrec-ja-images.user.js
```

Greasy Forkから配布する場合、スクリプト内にGitHub向けの `@downloadURL` や `@updateURL` を無理に入れる必要はありません。Greasy Fork上でコードを読める状態にしつつ、Greasy Forkの同期機能でGitHubから取り込むのが分かりやすいです。

### 手動インストールする場合

Greasy Forkが使えない場合は、手動でも入れられます。

#### 1. Tampermonkeyを入れる

まず、ブラウザにTampermonkeyを入れます。

- Tampermonkey公式サイト: https://www.tampermonkey.net/
- Chrome Web Store版: https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo

Chrome以外でも、Microsoft Edge、Firefox、SafariなどでTampermonkeyを使える場合があります。使っているブラウザに合わせて入れてください。

#### 2. スクリプトを入れる

スクリプト本体はこちらです。

[ここにGitHub RawまたはGistのURLを入れる]

`.user.js` のURLを開くと、Tampermonkeyのインストール画面が出る場合があります。その場合は `インストール` を押してください。

もしインストール画面が出ない場合は、次の手順で手動登録できます。

1. ブラウザ右上のTampermonkeyアイコンを押す
2. `新規スクリプトを追加` を押す
3. 最初から入っているサンプルコードを全部消す
4. スクリプト本体のコードを貼り付ける
5. 保存する

#### 3. EDHRECを開く

Tampermonkeyでスクリプトを有効にした状態で、EDHRECを開きます。

https://edhrec.com/

統率者ページやカードページで、カード画像が順番に日本語版へ差し替わっていきます。

## 使い方

カード画像が差し替わると、カード下部に小さな操作バーが出ます。

- 日本語名: クリックするとScryfallを開く
- コピー: 日本語名をクリップボードにコピーする
- ★: お気に入りに追加する

お気に入りに追加したカードは、画面右下の `★ お気に入り` ボタンから確認できます。

パネル内の `全部コピー` を押すと、お気に入りに入れたカード名をまとめてコピーできます。Excelやスプレッドシートに貼ると、1行ずつカード名が入ります。

## うまく動かないとき

まず、次を確認してください。

- Tampermonkeyでスクリプトが有効になっている
- 開いているページが `https://edhrec.com/` または `https://www.edhrec.com/` である
- ページを再読み込みしてみる
- ブラウザの拡張機能や広告ブロッカーが通信を止めていない
- そのカードに日本語印刷版が存在する

それでも動かない場合、EDHRECのページ構造が変わっている可能性があります。

## 実装の考え方

ここからは、どう作っているかの話です。

### Chrome拡張ではなくTampermonkeyにした理由

最初はChrome拡張として公開することも考えました。

ただ、Chrome Web Storeで公開するには、審査、権限設定、manifest、更新管理などが必要です。今回は個人がEDHREC上で使う小さな補助ツールなので、ユーザースクリプトとして配布するほうがシンプルです。

Tampermonkeyなら、対象ページでだけJavaScriptを動かせます。今回のスクリプトでは `@match` をEDHRECに限定しています。

```js
// @match        https://edhrec.com/*
// @match        https://www.edhrec.com/*
// @grant        none
// @run-at       document-idle
```

`@grant none` にしているので、特別なTampermonkey APIには依存せず、ブラウザ標準の `fetch` や `localStorage` を使っています。

### カード名を拾う

EDHREC上のカード画像やカードリンクから、英語カード名を取り出します。

主に次の情報を見ています。

- 画像の `alt`
- 画像の `title`
- カードリンクの `aria-label`
- カードリンクの `title`
- URLのslug

EDHRECにはカード以外のリンクやカテゴリ名も混ざるので、カード名として扱わないものは除外しています。

### Scryfall APIで日本語版を探す

英語カード名が取れたら、Scryfall APIに問い合わせます。

検索条件はざっくりいうと、次のような考え方です。

- 元の英語名に一致するカードを探す
- `lang:ja` の印刷版だけを見る
- 画像URLがあるものだけ採用する
- ショーケース、ボーダーレス、拡張アート、プロモ系などは避ける

特殊アートを避けているのは、EDHREC上で一覧として見るときに、通常版に近い画像のほうが視認しやすいからです。

### API制限への配慮

カード画像がたくさん並ぶページで、全カードを一気にScryfallへ問い合わせるとAPIに負荷がかかります。

そのため、このスクリプトでは次の対策を入れています。

- API呼び出しは直列キューに入れる
- リクエスト間隔は110ms以上空ける
- 同じカード名への同時リクエストは1つにまとめる
- `Accept: application/json` を明示する
- 取得結果は `localStorage` に7日間キャッシュする
- 1回のページスキャンで先読みするカード数は最大80件にする
- `429 Too Many Requests` が返ったら `Retry-After` を見て追加で待つ

これで、ページを開くたびに同じカードを何度も問い合わせることを避けています。

### スクロール前に先読みする

EDHRECはカード数が多いページもあります。

スクロールしてから初めて検索すると表示が遅く感じるので、ページ内にあるカードリンクを先に見つけて、少しずつScryfall検索を進めるようにしています。

ただし、先読みしすぎるとAPI負荷が上がるため、1回のスキャンで最大80件までに制限しています。

### レイアウトを壊さないUI

最初はカード画像の下に日本語名やボタンを追加する形も考えました。

でもEDHRECのカードグリッドはページによって幅や高さが変わるので、要素を普通に追加するとレイアウトが崩れやすくなります。

そこで、カードの中に絶対配置の小さな操作バーを重ねる形にしました。

- カードの高さを増やさない
- グリッドの行間を変えない
- 日本語名が長いときは省略表示する
- コピーとお気に入りは小さな丸ボタンにする

表示確認用のテストページでは、4枚のカードが同じ高さのまま並ぶことを確認しています。

### お気に入りとまとめコピー

お気に入りはブラウザの `localStorage` に保存しています。

保存しているのは主に次の情報です。

- 英語名
- 日本語名
- Scryfall URL
- 画像URL
- 登録時刻

右下のパネルでは新しく登録したものを上に表示します。

`全部コピー` を押すと、日本語名だけを改行区切りにしてコピーします。あとでExcelやGoogleスプレッドシートに貼りたいとき用です。

## まとめ

EDHRECは統率者デッキを考えるときにとても便利ですが、日本語カード名で管理したい人にとっては、英語名から日本語名へ変換する作業が少し手間です。

このスクリプトを入れると、EDHRECを見ながら日本語画像、日本語名、コピー、お気に入り管理までまとめてできます。

デッキを組むときの小さな手間が減るので、同じように日本語名でカード管理している人は試してみてください。

## 参考リンク

- EDHREC: https://edhrec.com/
- Scryfall: https://scryfall.com/
- Scryfall API FAQ: https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17
- Tampermonkey: https://www.tampermonkey.net/

## 公開前チェックリスト

Noteに貼る前に、次だけ差し替えてください。

- `[ここにGitHub RawまたはGistのURLを入れる]` を公開URLに差し替える
- 冒頭付近にスクリーンショットを1枚入れる
- スクリプトの配布URLが `.user.js` で終わっているか確認する
- 実際に新しいブラウザ環境でインストールできるか確認する
