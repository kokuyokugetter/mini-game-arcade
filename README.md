# ミニゲームアーケード

ブラウザで遊べる静的なミニゲーム集。

## 構成

- `index.html` — ゲーム一覧
- `assets/` — トップや複数ゲームで共有する素材・スタイル
- `games/<slug>/index.html` — 各ゲームの入口。ゲーム専用の JS・CSS・画像は同じフォルダに置く
- `.nojekyll` — GitHub Pages に静的ファイルをそのまま配信させる

## 公開方針

新規ゲームはこのモノリポで管理し、GitHub Pages の **プロジェクトサイト1つ**で公開する。ゲームごとにフォルダを分ければ、各ゲームを個別 URL で直接共有できる。標準ドメインを使い、リポジトリ名を `mini-game-arcade` にする場合の URL は以下のとおり。

| 共有先 | URL |
| --- | --- |
| アーケードのトップ | `https://<owner>.github.io/mini-game-arcade/` |
| 都道府県パズル | `https://<owner>.github.io/mini-game-arcade/games/pref-puzzle/` |
| ピアノ音当て | `https://<owner>.github.io/mini-game-arcade/games/piano-chords/` |
| 境界の魔王 | `https://<owner>.github.io/mini-game-arcade/games/bug-quest/` |
| リム・ブレイカー | `https://<owner>.github.io/mini-game-arcade/games/rim-breaker/` |
| スッキリ洗浄室 | `https://<owner>.github.io/mini-game-arcade/games/cleaning-room/` |
| コロコロ迷路 | `https://<owner>.github.io/mini-game-arcade/games/tilt-maze/` |
| パルス・ブリッジ | `https://<owner>.github.io/mini-game-arcade/games/pulse-bridge/` |

トップからは `./games/pref-puzzle/`、ゲームの入口からトップへは `../../` を使う。ゲーム内の素材も `./style.css` のような相対パスで参照する。先頭が `/` のパスはリポジトリ名の階層を飛ばすため、サイト内リンクには使わない。SNS や GitHub のリポジトリ概要欄には、公開後に確認したトップまたはゲーム個別の完全な URL を貼る。

独立したリリースや共同管理が必要なゲームは、別リポジトリの Pages で公開し、トップから `https://<owner>.github.io/<game-repo>/` へリンクできる。すでに公開 URL がある作品も同じ方法で掲載できる。

## 都道府県パズルの取り込み

`../pref-puzzle/dist/` を `games/pref-puzzle/` に同梱している。出典とライセンスはゲーム内の「地図・ライセンス」および同梱ライブラリに記載されている。更新時は元プロジェクトの配信用ファイルと差分を確認し、ゲーム一覧へ戻るリンク（`../../`）と効果音（`sound.js`、`app.js` のイベント連携）を引き継ぐ。

## ローカルで確認

Python 3 が入った環境で、リポジトリのルートから起動する。サーバーは自分の端末でのみアクセスでき、GitHub Pages と同じ `/mini-game-arcade/` 配下で確認できる。

```sh
python3 serve.py
```

ブラウザで [ゲーム一覧](http://127.0.0.1:8000/mini-game-arcade/) を開く。ゲーム追加時は、一覧からの遷移、個別 URL（例 [スッキリ洗浄室](http://127.0.0.1:8000/mini-game-arcade/games/cleaning-room/)）の直接アクセス、素材の読み込みを確認する。

ポート 8000 が使用中の場合は `python3 serve.py --port 8001` で起動し、表示された URL を開く。停止は起動したターミナルで `Ctrl+C`。

## GitHub Pages に公開する手順

1. GitHub に空の公開リポジトリ `mini-game-arcade` を作る。
2. `OWNER` を GitHub のユーザー名または組織名に置き換え、ローカルから push する。

   ```sh
   git remote add origin https://github.com/OWNER/mini-game-arcade.git
   git push -u origin main
   ```

3. GitHub の **Settings → Pages** を開き、**Deploy from a branch**、`main`、`/ (root)` を選んで保存する。
4. デプロイ後、Pages の **Visit site** でトップを開く。掲載済みゲームの個別 URL も確認し、共有するリンクを確定する。
5. 更新はローカルで確認してから `main` に反映し、push する。

[GitHub Pages の作成](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) · [公開ソースの設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
