# TimeMeter: 国際化・アプリ除外・時系列ズーム 設計

作成日: 2026-07-10
ブランチ: `feat/i18n-exclude-zoom`

3つの独立した機能を追加する。

- **A. 国際化（日英切替）** — UI 文言を日英で切り替え可能にする。既定は英語。
- **B. アプリ除外** — 特定アプリ（LINE 等）を時系列・合計から完全に消す（記録は残す）。
- **C. 時系列ズーム** — 時系列レーンを段階ズーム＋横スクロールできるようにする。

---

## A. 国際化（i18n）

### 方式
- 新規 `src/i18n.ts` に文字列辞書と翻訳関数を置く。obsidian を import しない（テストから直接使える）。
  ```ts
  export type Lang = "en" | "ja";
  const STRINGS: Record<Lang, Record<string, string>> = { en: {...}, ja: {...} };
  let current: Lang = "en";
  export function setLang(l: Lang): void { current = l; }
  export function getLang(): Lang { return current; }
  // params は {n} 形式の単純置換
  export function t(key: string, params?: Record<string, string | number>): string;
  ```
- 未知キーは `en` へフォールバックし、それも無ければキー文字列をそのまま返す。
- 言語は **モジュールレベルの可変状態**で持つ（プラグインは単一インスタンスのため）。各モジュールは描画時に `t()` を呼ぶので、`setLang()` ＋再描画でライブ反映される。

### 設定
- `TimemeterSettings` に `lang: Lang` を追加。`DEFAULT_SETTINGS.lang = "en"`。
- `loadSettings()` の直後に `setLang(this.settings.lang)` を呼ぶ。
- 設定タブに言語ドロップダウン（English / 日本語）を追加。変更時: `settings.lang` 保存 → `setLang()` → 開いている View を再ビルド＋ステータスバー再描画（ライブ反映）。

### ライブ反映と要リロードの制約
- **ライブ反映**: パネル内 UI・通知（Notice）・設定タブ・ステータスバー。
  - View は `build()` を1度だけ実行して要素参照を保持する設計。言語変更時は `TimemeterView.rebuild()`（`build()` 相当を再実行し `refresh()`）を公開し、`main.ts` が全ての開いている View に対して呼ぶ。
- **要リロード（Obsidian 仕様の制約・README とコード両方に明記）**:
  - コマンドパレットの項目名・リボンのツールチップは `addCommand`/`addRibbonIcon` 登録時の言語で固定。言語変更後は次回プラグインリロードで反映。
  - `manifest.json` の `name` は静的。**英語 `TimeMeter` に固定**（プラグイン一覧は常に英語表記）。`description` も英語主体に更新。

### 対象文字列
- `main.ts`: リボンツールチップ、コマンド名（登録時の言語）、全 Notice。
- `settings.ts`: 全ラベル・説明・見出し。
- `view-sidebar.ts`: 状態ラベル（記録中/AFK/一時停止/権限エラー）、NOW/今日合計/クイック入力プレースホルダ、サブタブ（合計/時系列）、タブ（今日/日別/月）、日別ナビ、月見出し（`YYYY年M月` ↔ `Month YYYY`）、曜日ヘッダー、コンテキストメニュー、ツールチップ、空メッセージ、キャプション、バッジ（`残り N件` ↔ `N left`）。
- `statusbar.ts`: 待機中/今日/分。
- `embed.ts`: 埋め込みヘッダー（`タイムメーター` ラベル）、`記録なし`。
- `nippou.ts`: callout ヘッダー（`タイムメーター下書き`）、`その他`。
- 日付・曜日: `WEEKDAY`（Sun..Sat は共通）と月表示・曜日ヘッダーを言語で選択。

### 対象外（今回スコープ外・明記）
- 日報挿入先の見出しアンカー `## ✅ やったこと` は**ユーザーのデイリーテンプレ由来のためそのまま**（プラグインの UI 文言ではない）。デイリーノートのファイル名フォーマットも現状維持。

---

## B. アプリ除外（表示から完全に消す）

既存の `AppRule.hidden` を流用する（新フラグは追加しない）。

### 変更点
- `view-sidebar.ts` `renderBars`: 現在は非表示アプリを幅0の `—` 行として描画している。これを**行ごと描画しない**ように変更（`sorted` を `!isHidden` で絞る）。時系列レーン・今日合計・月ヒートマップ・日報は既に除外済みなので変更不要。
  - `visMax` は既に可視のみから算出しているため、絞り込み後も同じ結果。
- `settings.ts` 「アプリ別ルール」セクションを整理:
  - **除外中のアプリを上にまとめて**表示（除外中 → 通常、各グループ内はアプリ名順）。
  - 「表示」トグルのツールチップ/文言を「時系列・合計から除外」の意味が伝わるものに（i18n キー化）。
  - 除外はここでいつでも解除可能。記録データ（`.md`）は保持されるため過去も復活する。
- View 内の ⋯／右クリックメニューの「非表示にする」はそのまま。消した後の再表示は設定から行う（メニュー文言もその旨に合わせて i18n 化）。

---

## C. 時系列ズーム＋横スクロール

`view-sidebar.ts` `renderLanes` を作り替える。今日タブ・日別タブで共通利用（ズーム状態は各タブ独立）。

### レイアウト
- 全体を `.lane-scroll`（`overflow-x: auto`）で包み、内側 `.lane-scroll-inner` の幅を `100% * zoom` にする。
  - 既存の `left% / width%`（`(min-lo)/span*100`）計算は内側要素基準でそのまま使える（ロジック温存）。
  - アプリ名列 `nm` は各行で `position: sticky; left: 0`（背景付き）で左に固定し、レーンだけ横スクロール。
  - 時刻ヘッダー `lane-hours` も同じスクローラ内に入れ、単一スクロールで自動同期。
- 時刻ラベルは絶対配置に変更し、目盛り（tick）位置と揃える。

### ズーム操作（＋／−ボタン）
- レーン上部に小コントロール: `−` `{zoom}x` `+`。段階は `[1, 2, 3, 4]`。
- `+`/`−` で段階を1つ変え、`renderLanes` を再描画。上下限で無効化。
- ズーム変更時は**中央の時刻を保つ**よう `scrollLeft` を再計算（再描画後に設定）。
- ズーム状態はビューインスタンスの `this.zoom`（今日）/`this.dayZoom`（日別）に保持。**保存はしない**（開き直すと 1x）。

### スクロール
- ネイティブ横スクロール（トラックパッド・Shift+ホイール・スクロールバー）。
- ドラッグでのパン（`.lane-scroll` に pointerdown/move で `scrollLeft` を動かす grab カーソル）を付与。

### 目盛り密度
- ズーム段階に応じて時刻ラベル/目盛りの刻みを調整（例: 実効 px/分が広いほど 30 分・15 分刻みへ）。純関数 `tickStepMin(span, zoom, innerWidthPx)` に切り出す。

### 純関数の切り出し（テスト対象）
- `src/lane-geometry.ts`（新規, obsidian 非依存）:
  - `laneRange(sessions): { lo, hi, span }` — 現在 `renderLanes` 内にある lo/hi/span 計算を抽出。
  - `segPos(startMin, endMin, lo, span): { leftPct, widthPct }`。
  - `tickStepMin(spanMin): number`（＋ズーム考慮版）。
  - `centerAnchoredScrollLeft(prevScrollLeft, prevInnerW, nextInnerW, viewportW): number` — 中央時刻保持。
- `renderLanes` はこれらを使うだけにする。`embed.ts` の同等計算も可能なら共有（任意・スコープ拡大しない範囲で）。

---

## テスト方針（既存踏襲: 純関数のみ・UI は手動）
- `tests/i18n.test.ts`（新規）: `en`/`ja` のキー集合が一致すること（parity）。`t()` のフォールバックと `{n}` 置換。
- `tests/lane-geometry.test.ts`（新規）: `laneRange` / `segPos` / `tickStepMin` / `centerAnchoredScrollLeft` の値検証。
- 既存 `nippou.test.ts` / `statusbar.test.ts`: JA を検証している箇所は `beforeEach(() => setLang("ja"))` で言語固定。あわせて英語側の1ケースを追加。
- `embed.test.ts` は `parseEmbedDate` のみ検証で影響なし。

## 触るファイル
- 新規: `src/i18n.ts`, `src/lane-geometry.ts`, `tests/i18n.test.ts`, `tests/lane-geometry.test.ts`
- 改修: `src/types.ts`, `main.ts`, `src/settings.ts`, `src/view-sidebar.ts`, `src/statusbar.ts`, `src/nippou.ts`, `src/embed.ts`, `styles.css`, `manifest.json`, `README.md`
- テスト調整: `tests/nippou.test.ts`, `tests/statusbar.test.ts`

## 検証
- `npm test`（vitest）が緑。
- `npm run build`（`tsc -noEmit` ＋ esbuild）が通る。
- 手動 e2e: 言語切替のライブ反映、除外アプリがバー/レーン/合計から消えること、ズーム＋スクロール＋名前列固定の動作。
