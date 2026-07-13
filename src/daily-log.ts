// デイリーノートの「やったこと」セクションへ1行追記する純関数。
// obsidian をインポートしない（テストから直接 import できるようにするため）。
// 実際の vault I/O（app.vault.process 配線）は main.ts 側で行う。

const DONE_HEADING = "## ✅ やったこと";

/**
 * `## ✅ やったこと` セクションの末尾（そのセクション内の最後の非空行の直後）に line を
 * 追記した新しい本文を返す。見出しが無ければファイル末尾に追記する。
 * マーカー外・他セクションの既存本文は保持し、重複追記は許容する（毎回1行増える）。
 */
export function appendToDoneSection(content: string, line: string, heading = DONE_HEADING): string {
	const lines = content.split("\n");
	const hIdx = lines.findIndex((l) => l.trim() === heading);

	if (hIdx === -1) {
		const sep = content === "" || content.endsWith("\n") ? "" : "\n";
		return `${content}${sep}${line}\n`;
	}

	// 次の "## " 見出し（無ければファイル末尾）までがこの見出しのセクション。
	let endIdx = lines.length;
	for (let i = hIdx + 1; i < lines.length; i++) {
		if (lines[i].startsWith("## ")) {
			endIdx = i;
			break;
		}
	}

	// セクション内の最後の非空行の直後に挿入（次見出し前の空行は保つ）。
	let insertAt = hIdx + 1;
	for (let i = hIdx + 1; i < endIdx; i++) {
		if (lines[i].trim() !== "") insertAt = i + 1;
	}

	lines.splice(insertAt, 0, line);
	return lines.join("\n");
}

/** ファイル末尾に line を1行追記する（デイリー以外の追記先で使う）。末尾改行を1つに整える。 */
export function appendLineAtEnd(content: string, line: string): string {
	const sep = content === "" || content.endsWith("\n") ? "" : "\n";
	return `${content}${sep}${line}\n`;
}
