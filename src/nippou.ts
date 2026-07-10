// 日報下書き生成の純粋関数。
// obsidian をインポートしない（テストから直接 import できるようにするため）。

import { t } from "./i18n";
import { durMin, fmtDur, toMin, type Session } from "./types";

interface NoteLine {
	start: string;
	end: string;
	app: string;
	note: string;
}

/** 説明ありセッションを時刻順に整形し、隣接する同一 note を結合する */
function buildNoteLines(sessions: Session[]): NoteLine[] {
	const sorted = [...sessions].sort((a, b) => toMin(a.start) - toMin(b.start));
	const lines: NoteLine[] = [];
	for (const s of sorted) {
		const prev = lines[lines.length - 1];
		if (prev && prev.note === s.note && prev.end === s.start) {
			prev.end = s.end;
			continue;
		}
		lines.push({ start: s.start, end: s.end, app: s.app, note: s.note });
	}
	return lines;
}

/** 説明なしセッションをアプリ別に合計し、降順の「その他」行にまとめる（無ければ null） */
function buildOtherLine(sessions: Session[]): string | null {
	if (sessions.length === 0) return null;
	const totals = new Map<string, number>();
	for (const s of sessions) {
		totals.set(s.app, (totals.get(s.app) ?? 0) + durMin(s));
	}
	const parts = [...totals.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([app, min]) => `${app} ${fmtDur(min)}`);
	return `- ${t("nippou.other")}: ${parts.join(", ")}`;
}

/**
 * 日報下書きの行配列を組み立てる。
 * - 説明あり: `- HH:MM–HH:MM app — note`（隣接・同一 note は結合）
 * - 説明なし: 末尾に1行「その他: app1 Xm, app2 Ym, …」（合計降順）
 * - 説明ありが無ければその他のみ、両方無ければ []。
 */
export function buildNippou(sessions: Session[]): string[] {
	const withNote = sessions.filter((s) => s.note.length > 0);
	const withoutNote = sessions.filter((s) => s.note.length === 0);

	const lines = buildNoteLines(withNote).map(
		(l) => `- ${l.start}–${l.end} ${l.app} — ${l.note}`,
	);

	const otherLine = buildOtherLine(withoutNote);
	if (otherLine) lines.push(otherLine);

	return lines;
}

// ---- デイリーノートへの callout 挿入（純粋関数）。 ----
// daily-embed.ts の insertTimemeterBlock と同じ方針: obsidian をインポートしない、
// マーカー外の既存本文は一切変更しない、二重挿入を検出したら null を返す。

const TARGET_HEADING = "## ✅ やったこと";

/** 現在言語の callout ヘッダー行。 */
function calloutHeader(): string {
	return t("nippou.calloutHeader");
}

/** ファイル内に既に日報下書き callout があるか（二重挿入防止用・現在言語のヘッダーで判定）。 */
export function hasNippouCallout(content: string): boolean {
	return content.includes(calloutHeader());
}

/**
 * `## ✅ やったこと` セクションの末尾（次の `## ` 見出しの直前、無ければファイル末尾）に
 * 日報下書き callout を挿入した新しい本文を返す。
 * `## ✅ やったこと` 見出し自体が無ければファイル末尾に追記する。
 * 既に callout がある場合は null を返す（＝呼び出し側は何もしない・Notice のみ）。
 * マーカー外の既存本文は一切変更しない（挿入のみ）。
 */
export function insertNippouCallout(content: string, draftLines: string[]): string | null {
	if (hasNippouCallout(content)) return null;

	const calloutBlock = [calloutHeader(), ...draftLines.map((l) => `> ${l}`)].join("\n");

	const lines = content.split("\n");
	const headingIdx = lines.findIndex((l) => l.trim() === TARGET_HEADING);

	if (headingIdx === -1) {
		const withTrailingNl = content.endsWith("\n") ? content : `${content}\n`;
		return `${withTrailingNl}\n${calloutBlock}\n`;
	}

	// 次の "## " 見出し（無ければファイル末尾）の直前に挿入する
	let endIdx = lines.length;
	for (let i = headingIdx + 1; i < lines.length; i++) {
		if (lines[i].startsWith("## ")) {
			endIdx = i;
			break;
		}
	}

	const before = lines.slice(0, endIdx);
	const after = lines.slice(endIdx);

	// 直前が既に空行なら重ねて空行を足さない（二重空行を避ける）。
	if (before.length > 0 && before[before.length - 1].trim() !== "") {
		before.push("");
	}

	const result = [...before, calloutBlock];
	// 次見出しがある場合のみ間に空行を1つ入れる（EOF の場合は不要）。
	if (after.length > 0) {
		result.push("");
	}
	return [...result, ...after].join("\n");
}
