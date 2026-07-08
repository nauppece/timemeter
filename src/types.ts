// 共有型・定数・純粋なヘルパー関数。
// obsidian をインポートしない（テストから直接 import できるようにするため）。

export interface Poll {
	ts: number;
	app: string;
	title: string | null;
	idleSec: number;
}

export interface Session {
	date: string; // "YYYY-MM-DD"
	start: string; // "HH:MM"（ローカル）
	end: string; // "HH:MM"、日跨ぎ分割の末尾のみ "24:00" を許す
	app: string;
	title: string | null;
	note: string; // 説明列。空は ""
	manual: boolean; // ✍️ 手動行
}

export interface AppRule {
	hidden: boolean;
	captureTitle: boolean;
}

export interface TimemeterSettings {
	pollIntervalSec: number; // 10
	afkThresholdSec: number; // 180
	mergeGapMin: number; // 3
	dataFolder: string; // "タイムメーター"
	apps: Record<string, AppRule>;
	showStatusBar: boolean;
	showSidebarOnStart: boolean;
}

export const DEFAULT_SETTINGS: TimemeterSettings = {
	pollIntervalSec: 10,
	afkThresholdSec: 180,
	mergeGapMin: 3,
	dataFolder: "タイムメーター",
	apps: {},
	showStatusBar: true,
	showSidebarOnStart: true,
};

export const MANUAL_APP = "✍️ 手動";
export const MARKER_START = "<!-- timemeter:sessions:start -->";
export const MARKER_END = "<!-- timemeter:sessions:end -->";

/** "10:30" → 630 */
export function toMin(hm: string): number {
	const [h, m] = hm.split(":").map(Number);
	return h * 60 + m;
}

/** 630 → "10:30"（1440 → "24:00"） */
export function fromMin(m: number): string {
	const h = Math.floor(m / 60);
	const mm = m % 60;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(h)}:${pad(mm)}`;
}

/** toMin(end) - toMin(start) */
export function durMin(s: Session): number {
	return toMin(s.end) - toMin(s.start);
}

/** 76 → "1h 16m" / 44 → "44m" */
export function fmtDur(min: number): string {
	const h = Math.floor(min / 60);
	const mm = min % 60;
	if (h === 0) {
		return `${mm}m`;
	}
	return `${h}h ${String(mm).padStart(2, "0")}m`;
}

/** `${s.start}|${s.app}` */
export function sessionKey(s: Session): string {
	return `${s.start}|${s.app}`;
}
