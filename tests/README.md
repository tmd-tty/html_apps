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
| `markdown-editor.test.mjs` | Markdown Studio のリストと表の補完、整形、リンク、チェックボックス、保存、ファイル操作、検索、テンプレート、フォルダ名でMDを作成、画像の貼り付け |
| `markdown-preview-export.test.mjs` | Markdown Studio のプレビュー、危険な入力の無害化、外部リンク、表示モード、PDF と Word の出力、許可した通信だけであること |
| `html-studio-security.test.mjs` | HTML Studio のプレビューの安全性(スクリプトを実行しない、外部へ通信しない、CSS を漏らさない)と PDF 出力 |
| `macro-schedule-tabs-drag.test.mjs` | Macro Schedule Editor のタブを閉じるときの確認、開き直したときの巻き戻り防止、端のドラッグと取り消し、◆ のドラッグ、古い形式のファイル |
| `macro-schedule-exports.test.mjs` | Macro Schedule Editor の出力の中身(PowerPoint のスライド分割・長期間・色・はみ出し、Excel のセル固定位置・結合セル・色・印刷設定) |
| `org-chart-export.test.mjs` | Org Chart Editor の PowerPoint の中身(リーダーの目印、備考、色、別スライドの案内、文字の大きさ、はみ出し) |
| `markdown-safety.test.mjs` | Markdown Studio の前回フォルダの復元(権限の再要求)、チェックボックスの対応ずれ防止 |
| `markdown-word.test.mjs` | Markdown Studio の Word 出力の中身(見出しスタイル、自動番号、表、画像、リンク、コード) |
| `pdf-pagination.test.mjs` | Markdown Studio と HTML Studio の PDF のページ分割(はみ出し、表の見出し行、見出しの残り、リストの番号、ブロックの分割) |
| `file-protocol.test.mjs` | 5つのアプリを `file://` で開いたときの起動、CSP、起動時の通信 |
| `windows-shortcuts.test.mjs` | 5つのアプリを Windows として開いたときのショートカット(Ctrl キー、日本語配列の記号キー、IME がオンのとき) |
| `macro-schedule-core.test.mjs` | Macro Schedule Editor の画面、入力、1行に複数の項目、ドラッグ、保存と読み込み、タブ、PowerPoint と Excel の出力 |
| `macro-schedule-undo.test.mjs` | Macro Schedule Editor の元に戻す・やり直す、未保存の内容の自動退避 |
| `macro-schedule-context-menu.test.mjs` | Macro Schedule Editor の右クリックメニューと複製 |
| `org-chart-basics.test.mjs` | Org Chart Editor の基本操作、保存、不正なファイル、PowerPoint 出力 |
| `org-chart-undo-fit.test.mjs` | Org Chart Editor の元に戻す・やり直す、全体表示、自動退避 |
| `diagram-studio.test.mjs` | Diagram Studio の図形の追加・移動・大きさの変更、線でつなぐ、やりとりするデータ、文字の編集、元に戻す、保存と不正なファイル、SVG / PNG の書き出しと表示、通信がないこと |
| `markdown-outline.test.mjs` | Markdown Studio のアウトライン |
| `markdown-folding.test.mjs` | Markdown Studio の見出しの折りたたみ |
| `html-studio-editor.test.mjs` | HTML Studio のインデント、折り返し、新規作成の名前 |

Markdown Studio、HTML Studio、PowerPoint 出力、Word 出力のテストは、CDN からライブラリを読み込むので、インターネット接続が必要です。

ショートカットは、Mac では `⌘`、それ以外では `Ctrl` で押します。テストは Mac の Chrome で確認しています。
