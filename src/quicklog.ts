// クイックログ（タップ記録）の純粋関数。
// obsidian をインポートしない（テストから直接 import できるようにするため）。
// Modal 等の obsidian 依存クラスは ./quicklog-modal に分離してある
// （obsidian パッケージは型定義のみで実行時エントリを持たないため、
// ここで実行時 import すると、この関数だけを使うテストも解決に失敗する）。

import { MANUAL_APP, fromMin, sessionKey, toMin, type Session } from "./types";

/** 該当キーの行だけ note を書き換えて新配列を返す。キー不一致なら無変更（同一配列内容）。 */
export function setNote(sessions: Session[], key: string, note: string): Session[] {
	return sessions.map((s) => (sessionKey(s) === key ? { ...s, note } : s));
}

/** ✍️ 手動 行を作って start 昇順で差し込んだ新配列を返す。 */
export function appendManual(sessions: Session[], date: string, start: string, end: string, note: string): Session[] {
	const manual: Session = { date, start, end, app: MANUAL_APP, title: null, note, manual: true, away: false };
	return [...sessions, manual].sort((a, b) => toMin(a.start) - toMin(b.start));
}

/** 手動ログの既定開始時刻。sessions が空でなければ最終行(最大end)の end、空なら nowHM の30分前("HH:MM")。 */
export function defaultManualStart(sessions: Session[], nowHM: string): string {
	if (sessions.length > 0) {
		const last = sessions.reduce((a, b) => (toMin(b.end) > toMin(a.end) ? b : a));
		return last.end;
	}
	const min = (((toMin(nowHM) - 30) % 1440) + 1440) % 1440;
	return fromMin(min);
}
