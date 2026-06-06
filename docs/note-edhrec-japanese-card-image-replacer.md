# EDHRECのカード画像を日本語版で見やすくするTampermonkeyスクリプト

EDHRECは、統率者デッキを組むときに便利なサイトです。

採用されているカードや相性のよいカードを一気に見られます。ただ、表示されるカード名や画像は英語が中心です。

日本語名でデッキリストや買い物リストを作っていると、「このカード、日本語名なんだっけ？」を何度も調べることになります。

このスクリプトを入れると、EDHREC上のカード画像をできるだけ日本語版に差し替えます。カード名のコピーやショップ検索も、カード画像の下からすぐ使えます。

![EDHRECのカード一覧に日本語画像と操作バーが出ている画面](screenshots/edhrec-card-controls.png)

## できること

- EDHRECのカード画像を日本語版に差し替える
- 日本語カード名をコピーする
- 晴れる屋、BIG MAGIC、シングルスター、東京MTG、メルカリで探す
- 気になるカードをお気に入りに入れる
- お気に入りをまとめてコピーする

`全部コピー` を使うと、カード名が1行ずつコピーされます。ExcelやGoogleスプレッドシートに貼ると、縦に並ぶので買い物リストにしやすいです。

## インストール

1. Tampermonkeyを入れる: https://www.tampermonkey.net/
2. Greasy Forkのスクリプトページを開く: https://greasyfork.org/ja/scripts/580860-edhrec-japanese-card-image-replacer
3. `Install this script` を押す
4. Tampermonkeyの確認画面で `インストール` を押す
5. EDHRECを開く: https://edhrec.com/

## 使い方

EDHRECの統率者ページやカードページを開くだけで動きます。

画像が差し替わったカードには、画像の下に小さな操作バーが出ます。

- コピー: 日本語名をコピー
- ★: お気に入りに追加
- 晴 / BM / SS / 東 / メ: 各ショップやメルカリで検索

右下の `★ お気に入り` から、お気に入り一覧を開けます。

## 日本語画像がないカード

日本語版の画像が見つからないカードは、英語画像のまま表示されることがあります。

その場合でも、コピーや検索ボタンはできるだけ使えるようにしています。

## うまく動かないとき

- Tampermonkeyでスクリプトが有効か確認する
- Greasy Forkの最新版を使う
- EDHRECを再読み込みする
- 広告ブロッカーなどで止まっていないか確認する

## まとめ

EDHRECは便利ですが、日本語名でカードを管理していると、英語名を調べ直す手間が出ます。

このスクリプトを入れると、EDHRECを見ながら日本語画像を確認し、カード名のコピーや検索までその場でできます。

日本語で統率者デッキを組みたい人向けの、小さな補助ツールです。

## リンク

- EDHREC: https://edhrec.com/
- Greasy Fork: https://greasyfork.org/ja/scripts/580860-edhrec-japanese-card-image-replacer
- Tampermonkey: https://www.tampermonkey.net/
- GitHub: https://github.com/soichirow/edhrec-ja-images
