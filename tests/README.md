# テスト

各アプリを実際の Chrome で操作して確かめるテストです。テスト用のブラウザ操作ライブラリ(Playwright)はアプリには含まれず、アプリの通信の有無にも影響しません。

## 準備

Google Chrome をインストールしておきます。初回だけ、このフォルダで依存パッケージを入れます。

```sh
cd tests
npm install --ignore-scripts
```

## 実行

```sh
npm test                      # すべて実行
node run-all.mjs markdown     # ファイル名に markdown を含むテストだけ実行
node markdown-outline.test.mjs  # 1つだけ実行して詳細を見る
```

テストはアプリの HTML をそのまま読み込み、内部の関数を呼べるように起動直前だけフックを足します。フォルダの選択ダイアログは自動操作できないため、ブラウザ内のファイルシステム(OPFS)で代用しています。スクリーンショットなどの出力は OS の一時フォルダに保存します。

## テスト一覧

| ファイル | 対象 |
|:--|:--|
| `macro-schedule-undo.test.mjs` | Macro Schedule Editor の元に戻す・やり直す、未保存の内容の自動退避 |
| `macro-schedule-context-menu.test.mjs` | Macro Schedule Editor の右クリックメニューと複製 |
| `org-chart-basics.test.mjs` | Org Chart Editor の基本操作、保存、不正なファイル、PowerPoint 出力 |
| `org-chart-undo-fit.test.mjs` | Org Chart Editor の元に戻す・やり直す、全体表示、自動退避 |
| `markdown-outline.test.mjs` | Markdown Studio のアウトライン |
| `markdown-folding.test.mjs` | Markdown Studio の見出しの折りたたみ |
| `html-studio-editor.test.mjs` | HTML Studio のインデント、折り返し、新規作成の名前 |

PowerPoint 出力のテストは CDN から PptxGenJS を読み込むので、インターネット接続が必要です。
