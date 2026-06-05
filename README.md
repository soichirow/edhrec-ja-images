# EDHREC Japanese Card Images

EDHREC、Scryfall Tagger、Scryfall 検索結果のカード画像を、Scryfall にある日本語版画像へ自動で差し替えるユーザースクリプトです。

EDHREC で統率者デッキを見ながら、日本語名でカードを確認したり、カード名をコピーして Excel やスプレッドシートへ貼り付けたりしやすくします。

非公式ツールです。EDHREC、Scryfall とは関係ありません。

## インストール

1. Tampermonkey または Violentmonkey をインストールする
2. Greasy Fork のページを開く
3. `Install this script` を押す
4. Tampermonkey の確認画面でインストールする
5. EDHREC を開く

Greasy Fork:

```text
https://greasyfork.org/ja/scripts/580860-edhrec-japanese-card-image-replacer
```

GitHub Raw から直接入れる場合:

```text
https://raw.githubusercontent.com/soichirow/edhrec-ja-images/main/userscript/edhrec-ja-images.user.js
```

GitHub Raw から入れた場合も、スクリプト内の `@downloadURL` / `@updateURL` は同じ URL を指します。
Tampermonkey の更新確認で、このファイルの最新版を取りに行けます。

## 更新

Tampermonkey の管理画面で、このスクリプトの更新確認を実行してください。

GitHub Raw 版を使っている場合は、次の URL をもう一度開くと最新版を入れ直せます。

```text
https://raw.githubusercontent.com/soichirow/edhrec-ja-images/main/userscript/edhrec-ja-images.user.js
```

現在のバージョン:

```text
2026-06-05.3
```

## できること

- EDHREC、Scryfall Tagger、Scryfall 検索結果のカード画像を日本語版画像へ差し替え
- 両面カードは、裏面画像なら裏面の日本語画像を表示
- 日本語版が見つからないカードは英語通常版を表示
- 特殊アートやショーケース系の画像をなるべく避ける
- Scryfall の個別ページを開く
- 晴れる屋、BIG MAGIC、シングルスター、東京MTG、メルカリで検索する
- 日本語カード名をコピーする
- お気に入り登録する
- お気に入り一覧をまとめてコピーする

## 表示について

英語画像を消して待つのではなく、EDHREC の元画像を表示したまま、準備できたカードから日本語画像へ差し替えます。

一度取得した結果はブラウザにキャッシュされるので、同じカードは次回以降に表示されやすくなります。

## 使い方

EDHREC、Scryfall Tagger、または Scryfall 検索結果のページを開くだけで動きます。

差し替えたカード画像の下に、小さな操作バーが出ます。
EDHREC では操作バーは価格行の下に入り、EDHREC 本来のカード名や synergy などの表示はその下に続きます。

```text
Scryfall / 晴 / BM / SS / 東 / メ / コピー / ★
```

`コピー` は日本語カード名をコピーします。

`★` はお気に入り登録です。右下のお気に入りボタンから一覧を開けます。

## うまく動かないとき

- Tampermonkey でスクリプトが有効か確認する
- EDHREC、Scryfall Tagger、または Scryfall 検索結果のページを再読み込みする
- 広告ブロッカーなどが `api.scryfall.com` を止めていないか確認する
- Chrome の Console に次の表示があるか確認する

```text
[EDHREC JA Images] version 2026-06-05.3
```

一部のカードは、日本語版画像が Scryfall にないことがあります。その場合は英語画像のまま、または英語通常版になります。

## 開発者向け

実装方針、Scryfall API への配慮、テスト方法は次にまとめています。

```text
docs/implementation.md
```

## License

MIT License. See [LICENSE](LICENSE).
