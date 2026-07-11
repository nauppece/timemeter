# TimeMeter: 同時起動アプリの並行トラッキング 設計

作成日: 2026-07-11
ブランチ: `feat/i18n-exclude-zoom`（Task 12 に続けて実装）

## 背景・要望

従来は最前面アプリ1つだけを毎ポーリング記録していた。ユーザーは「デスクトップに開いている全アプリ（5〜6個の他ウィンドウ含む）で何が動いているかを全部反映したい」＝**同時作業も時間として残したい**。

ブレストで確認した合意:
- 「開いている全アプリに毎ポーリング時間を計上する」方式でよい（**合計が実時間を超えることを許容**）。
- タイトルは**最前面のみ**取得（背景アプリは null）。
- AFK 中は従来どおり記録しない。
- 元に戻せるよう設定トグルを用意する。

## 変更点

### 検出 `src/detect.ts`
- `getVisibleApps(): Promise<string[]>` を追加。`osascript` で `every process whose visible is true` を取得しカンマ分割。失敗時 `[]`。

### トラッカー `src/tracker.ts`
- コンストラクタに `captureAllApps: boolean` を追加。
- tick で、非AFK・最前面取得成功後に記録対象集合を決める:
  - `captureAllApps` = true: `getVisibleApps()` ∪ {最前面}。
  - false: {最前面} のみ。
- 各アプリぶん `onPoll` を発行。タイトルは最前面アプリのみ、背景アプリは `null`。
- `currentApp`/`currentStart`（NOW・経過分・ステータスバー・記録中ハイライト）は引き続き**最前面**を指す。
- `getVisibleApps` 失敗時は最前面のみにフォールバック。

### 集計 `src/aggregator.ts`
- **アプリ別に分割してからセッション化**する（`groupAppPolls` を抽出）。同時刻に複数アプリの poll が来るため、時刻順1本のストリームでは正しくまとまらない。
- 各アプリ内で 日跨ぎ・`mergeGapMin`・ラップ・AFK除外 を従来どおり適用。アプリ間で時間帯が重なるセッションが並ぶ。
- 出力を `date → start → app` で安定ソート。
- 既存テストは同一アプリを非隣接に挟むケースが無かったため全て不変。並行ケースのテストを追加。

### 設定・型・配線
- `TimemeterSettings.captureAllApps`（既定 **true**）。`main.ts` の Tracker 生成2箇所（onload / restartTracker）に渡す。
- 設定タブにトグル追加（変更で `restartTracker()`）。i18n キー `set.captureAll.*`。

## 非対象・留意
- 合計が実時間を超えるのは仕様（README に明記）。Finder 等の常駐アプリは除外機能（Task 12）で消す運用。
- poll バッファはアプリ数ぶん増えるが、10秒間隔・当日 prune・O(n log n) 集計で許容範囲。

## 検証
- `npm test` 67 緑（aggregator に並行3ケース追加）、`tsc`/esbuild クリーン。
- `osascript` で可視アプリ一覧取得を実機確認済み。
- 実機 E2E（並行記録が時系列・合計に重なって出るか／トグル OFF で最前面のみ）は手動。
