# ミニゲームアーケード

ブラウザで遊べる静的なミニゲーム集。最初の掲載候補は、別プロジェクトの都道府県パズル。以降のゲームは追加時に決める。

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
| 都道府県パズルを同梱した場合 | `https://<owner>.github.io/mini-game-arcade/games/pref-puzzle/` |

トップからは `./games/pref-puzzle/`、ゲームの入口からトップへは `../../` を使う。ゲーム内の素材も `./style.css` のような相対パスで参照する。先頭が `/` のパスはリポジトリ名の階層を飛ばすため、サイト内リンクには使わない。SNS や GitHub のリポジトリ概要欄には、公開後に確認したトップまたはゲーム個別の完全な URL を貼る。

独立したリリースや共同管理が必要なゲームは、別リポジトリの Pages で公開し、トップから `https://<owner>.github.io/<game-repo>/` へリンクできる。すでに公開 URL がある作品も同じ方法で掲載できる。

## 都道府県パズルの取り込み

手元の `../pref-puzzle/` には静的配信用の `dist/` がある。同梱する場合は、出典と同梱ライブラリのライセンス表記を引き継ぎ、`dist/` の中身を `games/pref-puzzle/` に配置する。ローカルで起動と操作を確認してから、トップの準備中表示を「遊ぶ」リンクに切り替える。同梱版を更新するときは、元プロジェクトから配信用ファイルを取り直す。

## ローカルで確認

リポジトリの1つ上のフォルダを配信すると、GitHub Pages と同様に `/mini-game-arcade/` 配下でパスを確認できる。

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory ..
```

ブラウザで `http://127.0.0.1:8000/mini-game-arcade/` を開く。ゲーム追加時は一覧からの遷移、個別 URL の直接アクセス、素材の読み込みを確認する。

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
