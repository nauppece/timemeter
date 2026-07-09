// ステータスバー表示（デスクトップのみ）。
// テキスト組み立ては純粋関数にして obsidian を実行時 import しない
// （HTMLElement への反映・クリック配線は main.ts 側が行う）。

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

/** 記録中でない/アプリ無しのときの穏当な表示。 */
const WAITING_LABEL = "⏱ 待機中";

/**
 * `⏱ {現在アプリ} {n}分 ・ 今日 {XhYm}` を組み立てる。
 * rec 状態でアプリ・開始時刻が揃っているときだけ経過分を出し、それ以外は「待機中」にする。
 */
export function renderStatusBarText(source: StatusBarSource, now: number = Date.now()): string {
	const state = source.getState();
	const app = source.getCurrentApp();
	const start = source.getCurrentStart();
	const total = fmtDur(source.getTodayTotalMin());

	if (state !== "rec" || !app || start == null) {
		return `${WAITING_LABEL} ・ 今日 ${total}`;
	}

	const elapsedMin = Math.max(0, Math.floor((now - start) / 60000));
	return `⏱ ${app} ${elapsedMin}分 ・ 今日 ${total}`;
}
