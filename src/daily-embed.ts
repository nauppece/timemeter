// デイリーノートへの `timemeter` 埋め込みブロック挿入（純粋関数）。
// obsidian をインポートしない（テストから直接 import できるようにするため）。
// 実際の vault I/O（app.vault.process 配線）は main.ts 側で行う。

const BLOCK_LINES = ["```timemeter", "date: today", "```"];
const TARGET_HEADING = "## ✅ やったこと";

/** ファイル内に既に `timemeter` コードブロックがあるか（二重挿入防止用）。 */
export function hasTimemeterBlock(content: string): boolean {
	return /```timemeter\b/.test(content);
}

/**
 * `## ✅ やったこと` 見出しの直前（空行を挟んで）に timemeter ブロックを挿入した
 * 新しい本文を返す。見出しが無ければファイル末尾に追記する。
 * 既にブロックがある場合は null を返す（＝呼び出し側は何もしない・Notice のみ）。
 * マーカー外の既存本文は一切変更しない（見出し行より前後の並びを保つだけ）。
 */
export function insertTimemeterBlock(content: string): string | null {
	if (hasTimemeterBlock(content)) return null;

	const lines = content.split("\n");
	const idx = lines.findIndex((l) => l.trim() === TARGET_HEADING);

	if (idx === -1) {
		const withTrailingNl = content.endsWith("\n") ? content : `${content}\n`;
		return `${withTrailingNl}\n${BLOCK_LINES.join("\n")}\n`;
	}

	const before = lines.slice(0, idx);
	const after = lines.slice(idx);
	// 直前が既に空行なら重ねて空行を足さない（二重空行を避ける）。
	if (before.length > 0 && before[before.length - 1].trim() !== "") {
		before.push("");
	}
	return [...before, ...BLOCK_LINES, "", ...after].join("\n");
}
