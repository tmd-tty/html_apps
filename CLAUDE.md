# html_apps

## 最優先ルール: アウトバウンド通信の禁止

このリポジトリのアプリは、絶対に外部へ通信してはならない。利便性や機能要件を理由にした例外は認めない。通信が必要そうな要望を受けた場合は、実装せずにユーザーへ確認する。

### 禁止事項

- `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`WebRTC`、`navigator.sendBeacon` の使用
- CDN、Google Fonts、外部の画像・動画・音声・スクリプト・CSS の読み込み
- `<iframe>`、`<form action>`、Service Worker、Web App Manifest の使用
- アナリティクスやエラー収集などの計測
- 外部 URL へのリンクや `window.open`(クリックで通信が発生するため)

### 必須事項

すべての HTML の `<head>` の先頭に、次の CSP を入れる。ブラウザ側でも通信を遮断するための保険であり、緩めてはならない。

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'">
```

画像やフォントが必要なら data URI で HTML に埋め込むか、システムフォントを使う。データの保存はブラウザ内(`localStorage` など)か、ユーザーが File System Access API で明示的に選んだローカルフォルダに留める。

ライブラリが必要なら CDN は使わず、ビルド時に HTML の中へ埋め込む。要件に「CDN 可」とあっても、このルールを優先する。ユーザーの文書に含まれる外部 URL は、画像の読み込みやリンクの遷移をせず、文字列として扱う。

### 完成時の確認

アプリの作成・変更後は、次を確認する。

- 上記の CSP があり、緩められていないこと
- 自作コードに禁止事項に当たる処理がないこと。`http://` `https://` は、XML 名前空間や文字列処理など通信に使わないものだけが残っていること
- 埋め込んだライブラリは内部に URL や通信 API を含むことがあるため、実ブラウザで全リクエストを記録し、外部への通信が0件であることを確かめること
