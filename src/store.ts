// Markdown 直列化・パース・マージ・vault I/O。
// 純粋関数（serializeTable/parseSessions/mergeSessions/buildDayContent）は
// obsidian を実行時に import しない（テストから直接 import できるようにするため）。
// I/O 関数（writeDay/readDay）でのみ obsidian の型を使う（type-only import なので
// トランスパイル後に実行時 import は残らない）。

import type { App } from "obsidian";
import { MANUAL_APP, MARKER_END, MARKER_START, durMin, fmtDur, sessionKey, toMin, type Session } from "./types";

const HEADER_ROW = "| 開始 | 終了 | 時間 | アプリ | タイトル | 説明 |";
const SEP_ROW = "|------|------|------|--------|----------|------|";
const MANAGED_FM_KEYS = new Set(["date", "total_min", "totals"]);

/** テーブルセル内の `|` は `\|` に、改行は `<br>` にエスケープする */
function escapeCell(raw: string): string {
	return raw.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

/** エスケープされた `|` (`\|`) を区切りと誤認しない行分割 */
function splitRow(line: string): string[] {
	let trimmed = line.trim();
	if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
	if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);

	const cells: string[] = [];
	let cur = "";
	for (let i = 0; i < trimmed.length; i++) {
		const ch = trimmed[i];
		if (ch === "\\" && trimmed[i + 1] === "|") {
			cur += "|";
			i++;
			continue;
		}
		if (ch === "|") {
			cells.push(cur.trim());
			cur = "";
			continue;
		}
		cur += ch;
	}
	cells.push(cur.trim());
	return cells;
}

/** マーカーを含むセッション表ブロックを組み立てる */
export function serializeTable(sessions: Session[]): string {
	const rows = sessions.map((s) => {
		const dur = fmtDur(durMin(s));
		const cells = [
			s.start,
			s.end,
			dur,
			escapeCell(s.app),
			escapeCell(s.title ?? ""),
			escapeCell(s.note),
		];
		return `| ${cells.join(" | ")} |`;
	});
	return [MARKER_START, HEADER_ROW, SEP_ROW, ...rows, MARKER_END].join("\n");
}

/** frontmatter の `date: ...` を拾う（無ければ ""） */
function extractDate(content: string): string {
	const m = content.match(/^date:\s*"?([^"\n]+?)"?\s*$/m);
	return m ? m[1].trim() : "";
}

/** マーカー内の表を Session[] にパースする（マーカーが無ければ []） */
export function parseSessions(content: string): Session[] {
	const startIdx = content.indexOf(MARKER_START);
	const endIdx = content.indexOf(MARKER_END);
	if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return [];

	const date = extractDate(content);
	const block = content.slice(startIdx + MARKER_START.length, endIdx);
	const lines = block
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.startsWith("|"));

	// lines[0] = ヘッダー行, lines[1] = 区切り行, 以降がデータ行
	const dataLines = lines.slice(2);

	const sessions: Session[] = [];
	for (const line of dataLines) {
		const cells = splitRow(line);
		if (cells.length !== 6) continue; // 列数が合わない行は無視（防御的）
		const [start, end, , app, titleRaw, noteRaw] = cells;
		if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) continue; // 壊れた行は無視
		const title = titleRaw === "" ? null : titleRaw;
		const note = noteRaw.replace(/<br>/g, "\n");
		sessions.push({ date, start, end, app, title, note, manual: app === MANUAL_APP });
	}
	return sessions;
}

/**
 * fresh と existing の和集合を start 昇順で返す。
 * key = sessionKey（開始|アプリ）。両方にある行は fresh の end/title を採用し、
 * note は existing 優先（fresh.note が空のとき）。existing にしか無い行はそのまま残す。
 * NEVER drop an existing row.
 */
export function mergeSessions(fresh: Session[], existing: Session[]): Session[] {
	const freshMap = new Map(fresh.map((s) => [sessionKey(s), s] as const));
	const existingMap = new Map(existing.map((s) => [sessionKey(s), s] as const));
	const keys = new Set<string>([...freshMap.keys(), ...existingMap.keys()]);

	const merged: Session[] = [];
	for (const key of keys) {
		const f = freshMap.get(key);
		const e = existingMap.get(key);
		if (f && e) {
			merged.push({ ...f, note: f.note.length > 0 ? f.note : e.note });
		} else if (f) {
			merged.push(f);
		} else if (e) {
			merged.push(e);
		}
	}
	merged.sort((a, b) => toMin(a.start) - toMin(b.start));
	return merged;
}

function computeTotals(sessions: Session[]): { totalMin: number; totals: Map<string, number> } {
	let totalMin = 0;
	const totals = new Map<string, number>();
	for (const s of sessions) {
		const d = durMin(s);
		totalMin += d;
		totals.set(s.app, (totals.get(s.app) ?? 0) + d);
	}
	return { totalMin, totals };
}

/** date/total_min/totals の frontmatter 行を組み立てる */
function buildManagedFmLines(date: string, totalMin: number, totals: Map<string, number>): string[] {
	const lines = [`date: ${date}`, `total_min: ${totalMin}`, "totals:"];
	for (const [app, min] of totals) {
		lines.push(`  "${app}": ${min}`);
	}
	return lines;
}

interface FmBlock {
	key: string | null; // トップレベルキー名（無ければ null＝空行など）
	lines: string[];
}

/** frontmatter の生テキストをトップレベルキー単位のブロックに分割する */
function parseFmBlocks(fmLines: string[]): FmBlock[] {
	const blocks: FmBlock[] = [];
	let i = 0;
	while (i < fmLines.length) {
		const line = fmLines[i];
		if (line.trim() === "") {
			blocks.push({ key: null, lines: [line] });
			i++;
			continue;
		}
		if (/^\S/.test(line)) {
			const key = line.split(":")[0].trim();
			const raw = [line];
			i++;
			while (i < fmLines.length && /^\s/.test(fmLines[i]) && fmLines[i].trim() !== "") {
				raw.push(fmLines[i]);
				i++;
			}
			blocks.push({ key, lines: raw });
			continue;
		}
		blocks.push({ key: null, lines: [line] });
		i++;
	}
	return blocks;
}

/** 既存 frontmatter の他フィールドは保持したまま date/total_min/totals だけ差し替える */
function rebuildFrontmatterLines(existingFmLines: string[] | null, date: string, sessions: Session[]): string[] {
	const { totalMin, totals } = computeTotals(sessions);
	const managedLines = buildManagedFmLines(date, totalMin, totals);
	if (existingFmLines === null) return managedLines;

	const blocks = parseFmBlocks(existingFmLines);
	const managedIdx = blocks.findIndex((b) => b.key !== null && MANAGED_FM_KEYS.has(b.key));
	const kept = blocks.filter((b) => !(b.key !== null && MANAGED_FM_KEYS.has(b.key)));

	let insertAt = 0;
	if (managedIdx !== -1) {
		insertAt = blocks.slice(0, managedIdx).filter((b) => !(b.key !== null && MANAGED_FM_KEYS.has(b.key))).length;
	}

	const result: string[] = [];
	kept.forEach((b, idx) => {
		if (idx === insertAt) result.push(...managedLines);
		result.push(...b.lines);
	});
	if (insertAt >= kept.length) result.push(...managedLines);
	return result;
}

/** 先頭の `---\n...\n---` frontmatter とそれ以降の本文に分割する（無ければ null） */
function splitFrontmatter(content: string): { fm: string[]; body: string } | null {
	if (!content.startsWith("---")) return null;
	const lines = content.split("\n");
	if (lines[0].trim() !== "---") return null;
	let endIdx = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === "---") {
			endIdx = i;
			break;
		}
	}
	if (endIdx === -1) return null;
	return { fm: lines.slice(1, endIdx), body: lines.slice(endIdx + 1).join("\n") };
}

/**
 * マーカーブロックとフロントマターの date/total_min/totals のみを再生成する。
 * マーカー外のテキスト・他のフロントマターフィールドは一切変更しない。
 * prev が null なら新規ファイルを組み立てる。
 */
export function buildDayContent(prev: string | null, date: string, sessions: Session[]): string {
	const table = serializeTable(sessions);

	if (prev === null) {
		const { totalMin, totals } = computeTotals(sessions);
		const fmLines = buildManagedFmLines(date, totalMin, totals);
		return ["---", ...fmLines, "---", "", `# ${date} タイムメーター`, "", table, ""].join("\n");
	}

	const split = splitFrontmatter(prev);
	const fmLines = rebuildFrontmatterLines(split ? split.fm : null, date, sessions);
	const body = split ? split.body : prev;

	const startIdx = body.indexOf(MARKER_START);
	const endIdx = body.indexOf(MARKER_END);
	let newBody: string;
	if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
		newBody = body.slice(0, startIdx) + table + body.slice(endIdx + MARKER_END.length);
	} else {
		// マーカーが無い本文（想定外）には末尾に追加する
		newBody = `${body}${body.endsWith("\n") ? "" : "\n"}\n${table}\n`;
	}

	// body は元々 splitFrontmatter で切り出す際に、閉じ "---" と body の間の
	// 改行1文字がセパレータとして消費されているため、ここで明示的に復元する。
	return `---\n${fmLines.join("\n")}\n---\n${newBody}`;
}

// ---- vault I/O（obsidian 依存はここだけ） ----

function dayPath(folder: string, date: string): string {
	return `${folder}/${date}.md`;
}

/** 指定日の既存セッションを読む（ファイルが無ければ []） */
export async function readDay(app: App, folder: string, date: string): Promise<Session[]> {
	const file = app.vault.getFileByPath(dayPath(folder, date));
	if (!file) return [];
	const content = await app.vault.read(file);
	return parseSessions(content);
}

/** 既存を読み → merge → 書き込み。merged を返す */
export async function writeDay(app: App, folder: string, date: string, fresh: Session[]): Promise<Session[]> {
	const path = dayPath(folder, date);
	const file = app.vault.getFileByPath(path);

	let prevRaw: string | null = null;
	let existing: Session[] = [];
	if (file) {
		prevRaw = await app.vault.read(file);
		existing = parseSessions(prevRaw);
	}

	const merged = mergeSessions(fresh, existing);
	const nextContent = buildDayContent(prevRaw, date, merged);

	if (file) {
		await app.vault.process(file, () => nextContent);
	} else {
		if (!app.vault.getFolderByPath(folder)) {
			await app.vault.createFolder(folder);
		}
		await app.vault.create(path, nextContent);
	}

	return merged;
}
