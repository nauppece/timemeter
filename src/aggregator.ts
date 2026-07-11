// Poll[] → Session[] への集計ロジック。純粋関数（obsidian に依存しない）。

import type { Poll, Session } from "./types";

export interface AggregateOptions {
	afkSec: number;
	gapMin: number;
	laps: number[]; // epoch ms 昇順
}

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

/** ts のローカル日付を "YYYY-MM-DD" にする */
export function localDateStr(ts: number): string {
	const d = new Date(ts);
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** ts のローカル時刻を "HH:MM" にする（秒以下は切り捨て） */
function localHmStr(ts: number): string {
	const d = new Date(ts);
	return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** グループ内の最頻出の非null title（同数の場合は先に現れた方を採用） */
function mostFrequentTitle(group: Poll[]): string | null {
	const counts = new Map<string, number>();
	for (const poll of group) {
		if (poll.title != null) {
			counts.set(poll.title, (counts.get(poll.title) ?? 0) + 1);
		}
	}
	let best: string | null = null;
	let bestCount = 0;
	for (const [title, count] of counts) {
		if (count > bestCount) {
			bestCount = count;
			best = title;
		}
	}
	return best;
}

function buildSession(group: Poll[], endsOnDayBoundary: boolean): Session {
	const first = group[0];
	const last = group[group.length - 1];
	return {
		date: localDateStr(first.ts),
		start: localHmStr(first.ts),
		end: endsOnDayBoundary ? "24:00" : localHmStr(last.ts),
		app: first.app,
		title: mostFrequentTitle(group),
		note: "",
		manual: false,
	};
}

/**
 * 単一アプリの poll 列（時刻昇順）を、日跨ぎ・gap・ラップで区切ってセッション化し out に積む。
 * 同時起動アプリの並行トラッキングでは、アプリごとにこの関数を呼ぶ（アプリ間で時間帯が重なる）。
 */
function groupAppPolls(polls: Poll[], opts: AggregateOptions, out: Session[]): void {
	const gapMs = opts.gapMin * 60 * 1000;
	const laps = opts.laps;
	let group: Poll[] = [];

	for (const poll of polls) {
		if (group.length === 0) {
			group.push(poll);
			continue;
		}
		const prev = group[group.length - 1];

		const dayChanged = localDateStr(prev.ts) !== localDateStr(poll.ts);
		const gapExceeded = poll.ts - prev.ts > gapMs;
		const lapBetween = laps.some((l) => l > prev.ts && l <= poll.ts);

		if (dayChanged || gapExceeded || lapBetween) {
			out.push(buildSession(group, dayChanged));
			group = [poll];
		} else {
			group.push(poll);
		}
	}
	if (group.length > 0) {
		out.push(buildSession(group, false));
	}
}

export function aggregate(polls: Poll[], opts: AggregateOptions): Session[] {
	// ① AFK poll を除外し、時刻昇順に。
	const kept = polls
		.filter((p) => p.idleSec < opts.afkSec)
		.slice()
		.sort((a, b) => a.ts - b.ts);

	// ② アプリ別に分割してからセッション化する。
	//    同時刻に複数アプリの poll が来る（並行トラッキング）ため、時刻順の1本のストリームで
	//    「連続する同じアプリ」を数えると交互に並んで正しくまとまらない。アプリごとに分ける。
	const byApp = new Map<string, Poll[]>();
	for (const poll of kept) {
		const list = byApp.get(poll.app);
		if (list) list.push(poll);
		else byApp.set(poll.app, [poll]);
	}

	const sessions: Session[] = [];
	for (const appPolls of byApp.values()) {
		groupAppPolls(appPolls, opts, sessions);
	}

	// ③ 重なりセッションの並びを決定的にするため date→start→app で安定ソートする。
	sessions.sort(
		(a, b) =>
			a.date.localeCompare(b.date) ||
			a.start.localeCompare(b.start) ||
			a.app.localeCompare(b.app),
	);
	return sessions;
}
