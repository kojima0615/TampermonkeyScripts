# TampermonkeyScripts

## Chrome で Tampermonkey スクリプトを実行する手順

1. Google Chrome を開き、[Tampermonkey](https://www.tampermonkey.net/) 拡張機能をインストールします。
2. 拡張機能アイコンをクリックし、「ダッシュボード」を選択します。
3. ダッシュボード右上の **「ユーティリティ」＞「開発者モードを有効にする」** をオンにしておきます。これにより、ローカルスクリプトの読み込みや手動インストールが可能になります。

## スクリプトのインストール

1. GitHub リポジトリで目的の `.user.js` ファイル（例: [ticketPreviewJra.user.js](https://github.com/kojima0615/TampermonkeyScripts/blob/main/src/ticketPreviewJra.user.js) や [timeComparisonJra.user.js](https://github.com/kojima0615/TampermonkeyScripts/blob/main/src/timeComparisonJra.user.js)）を開き、右上の **「Raw」** ボタンをクリックすると、そのまま Tampermonkey のインストール画面へ移動します。
2. 表示された Tampermonkey のインストール画面で内容とメタ情報を確認し、**「インストール」** をクリックすれば登録完了です。
3. 対象ページをリロードするとスクリプトが実行されるようになります。

## 開発時の補足

- スクリプトをローカルで管理している場合、ダッシュボードの **「ファイルをインポート」** から `.user.js` を読み込む方法が最も簡単です。
- 開発中にスクリプトを差し替えたいときは、GitHub の `Raw` リンクを再度インストールするか、Tampermonkey のエディタで直接上書きしてください。
- 動作確認時は Chrome のデベロッパーツールと Tampermonkey のログを併用すると、エラー原因や動作タイミングが把握しやすくなります。
