// ステータスバー表示（デスクトップのみ）。
// テキスト組み立ては純粋関数にして obsidian を実行時 import しない
// （HTMLElement への反映・クリック配線は main.ts 側が行う）。

import { t } from "./i18n";
import type { TrackerState } from "./tracker";
import { fmtDur } from "./types";

/**
 * ステータスバーが読む値の最小インターフェース。
 * プラグインを直接 import すると循環参照になるため、必要な口だけ切り出す。
 */
export interface StatusBarSource {
	getState(): TrackerState;
	getCurrentApp(): string | null;
	getCurrentStart(): number | null;
	getTodayTotalMin(): number;
}

/**
 * `{現在アプリ} {n}分 ・ 今日 {XhYm}` を組み立てる。
 * rec 状態でアプリ・開始時刻が揃っているときだけ経過分を出し、それ以外は「待機中」にする。
 * 文言は i18n（現在言語）に追随する。
 */
export function renderStatusBarText(source: StatusBarSource, now: number = Date.now()): string {
	const state = source.getState();
	const app = source.getCurrentApp();
	const start = source.getCurrentStart();
	const total = fmtDur(source.getTodayTotalMin());

	if (state !== "rec" || !app || start == null) {
		return t("statusbar.idle", { label: t("statusbar.waiting"), total });
	}

	const elapsedMin = Math.max(0, Math.floor((now - start) / 60000));
	return t("statusbar.recording", { app, n: elapsedMin, total });
}
