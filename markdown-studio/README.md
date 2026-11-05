# Markdown Studio

ローカルフォルダのファイルを直接編集する Markdown エディタです。`markdown-studio.html` を Chrome または Edge で開くだけで使えます(Windows / Mac)。インストールもサーバーも不要で、通信は一切しません。

Firefox と Safari はフォルダの読み書きに必要な File System Access API に対応していないため、使えません。

## ファイル構成

| パス | 内容 |
|:--|:--|
| `markdown-studio.html` | 配布物。これ1つで動く |
| `src/index.html` | アプリ本体のソース |
| `vendor/` | HTML に埋め込むライブラリ |
| `build.mjs` | `src` と `vendor` から配布物を生成する |

`src/index.html` を変更したら、次のコマンドで配布物を作り直します。

```sh
node build.mjs
```

## 外部 URL の扱い

Markdown に外部の画像やリンクを書いても通信は発生しません。プレビューでは、外部画像は URL を示す枠で表示し、外部リンクは開けないようにしています。

## PDF 出力

各ページを A4 240dpi 相当の画像にして PDF を生成します。そのため PDF 内の文字は選択や検索ができません。

## 埋め込みライブラリ

| ライブラリ | バージョン | ライセンス |
|:--|:--|:--|
| marked | 18.1.3 | MIT |
| DOMPurify | 3.4.17 | MPL-2.0 OR Apache-2.0 |
| highlight.js | 11.12.0 | BSD-3-Clause |
| Mermaid | 12.3.0 | MIT |
