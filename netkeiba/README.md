# netkeiba 用 Tampermonkey スクリプト

`netkeiba` ディレクトリ配下には、JRA/地方競馬向けの Tampermonkey スクリプトを収録しています。Chrome + Tampermonkey を使って [README.md](../README.md) に記載した手順で拡張機能をインストールしてから、下記のスクリプトを GitHub 上の Raw リンク経由で追加してください。

## ticketPreviewJra.user.js

- 対象ページ: `https://race.netkeiba.com/race/shutuba.html*` および `https://race.netkeiba.com/odds/index.html*`
- 出走馬リストの横に「馬券プレビュー」パネルを挿入し、単勝～三連単までの各券種をチェックボックスで指定できます。
- 出力ボタンで選択内容を整形してコピーできるため、馬券購入前にサクッとプレビューを共有したいときに便利です。

## timeComparisonJra.user.js

- 対象ページ: JRA の出馬表/オッズページ (netkeiba.com)
- 出馬表を解析して各馬の過去レースタイムやマークをまとめ、選択したレース種別や距離ごとの平均タイムと対比します。
- GM_xmlhttpRequest を使って HTML を取得し、jquery UI＋Bootstrap を利用したモーダル/テーブルで表示する高度な比較ツールです。

## timeComparisonNar.user.js

- 対象ページ: 地方競馬 (nar.netkeiba.com) の出馬表/オッズページ
- JRA 用スクリプトと同様の UI/機能を提供しつつ、地方独自の開催場・API からオッズと履歴を取得します。

各スクリプトの Raw URL へアクセスすると自動的に Tampermonkey のインストール画面に移動するので、[README.md](../README.md) に書いた通り Raw ボタン経由で追加してください。必要であればスクリプトをダウンロードして `.user.js` ファイルとして保存し、ダッシュボードのファイルインポートでも登録できます。
