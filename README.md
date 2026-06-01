# EDHREC Japanese Card Images

EDHREC のカード画像を、Scryfall にある日本語印刷版の画像へ自動で差し替えるユーザースクリプトです。

## できること

- EDHREC 上にすでに表示されているカード画像を日本語版画像へ差し替える
- Scryfall に日本語印刷版がないカードは EDHREC の元表示を残す
- 取得結果をブラウザの `localStorage` に 7 日間キャッシュする

## 使い方

1. Tampermonkey または Violentmonkey をブラウザに入れる
2. `userscript/edhrec-ja-images.user.js` を開く
3. 中身を新しいユーザースクリプトとして登録する
4. `https://edhrec.com/` のカードページや統率者ページを開く
5. ページ内のカード画像が日本語版に差し替わることを確認する

## 仕組み

カード名から Scryfall API を検索し、`lang:ja` の印刷版が見つかった場合に `normal` サイズの画像 URL を使います。カード名が EDHREC の URL slug からしか取れない場合は、Scryfall の fuzzy lookup を経由して同じ Oracle ID の日本語版を探します。

## 注意

- Scryfall に日本語画像がないカードは差し替わりません。
- EDHREC 側の HTML 構造が大きく変わると、カード名の抽出が一部失敗する可能性があります。
- ブラウザから `api.scryfall.com` へカード名を問い合わせます。

## 開発

```powershell
npm test
```
