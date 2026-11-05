# html_apps

## 最優先ルール: アウトバウンド通信の禁止

このリポジトリのアプリは、絶対に外部へ通信してはならない。利便性や機能要件を理由にした例外は認めない。通信が必要そうな要望を受けた場合は、実装せずにユーザーへ確認する。

### 禁止事項

- `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`WebRTC`、`navigator.sendBeacon` の使用
- Google Fonts、外部の画像・動画・音声・CSS の読み込み
- 下記の例外に当たらない外部スクリプトの読み込み
- `<iframe>`、`<form action>`、Service Worker、Web App Manifest の使用
- アナリティクスやエラー収集などの計測
- 外部 URL へのリンクや `window.open`(クリックで通信が発生するため)

### 必須事項

すべての HTML の `<head>` の先頭に、次の CSP を入れる。ブラウザ側でも通信を遮断するための保険であり、下記の例外を除いて緩めてはならない。

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'">
```

### 唯一の例外: CDN からの JavaScript の読み込み

ライブラリの JavaScript に限り、CDN(`cdn.jsdelivr.net`)から読み込んでよい。CSS、フォント、画像は対象外。次をすべて守る。

- URL のバージョンを固定する(`@latest` や範囲指定は不可)
- `<script>` に `integrity`(SHA-384)、`crossorigin="anonymous"`、`referrerpolicy="no-referrer"` を付ける
- CSP の `script-src` には、読み込むファイルの URL だけを完全な形で追加する。ホスト全体は許可しない
- `connect-src` などの他の項目は緩めない。ユーザーのデータは一切送信しない
- CDN に接続できないときは、真っ白にせず原因を画面に表示する

画像やフォントが必要なら data URI で HTML に埋め込むか、システムフォントを使う。データの保存はブラウザ内(`localStorage` など)か、ユーザーが File System Access API で明示的に選んだローカルフォルダに留める。

ユーザーの文書に含まれる外部 URL は、画像の読み込みやリンクの遷移をせず、文字列として扱う。

### 完成時の確認

アプリの作成・変更後は、次を確認する。

- 上記の CSP があり、緩められていないこと
- 自作コードに禁止事項に当たる処理がないこと。`http://` `https://` は、例外で許可した CDN の URL と、XML 名前空間や文字列処理など通信に使わないものだけが残っていること
- ライブラリは内部に URL や通信 API を含むことがあるため、実ブラウザで全リクエストを記録し、例外で許可した JavaScript の読み込み以外に外部への通信がないことを確かめること
