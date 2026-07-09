import { describe, expect, test } from "vitest";
import { hasTimemeterBlock, insertTimemeterBlock } from "../src/daily-embed";

const DAILY_SAMPLE = [
	"---",
	"tags: [デイリー]",
	"---",
	"# 7/9 (木)",
	"",
	"## 🎯 今日のフォーカス",
	"- ",
	"",
	"## ⏰ 締切・期限切れ",
	"```tasks",
	"not done",
	"```",
	"",
	"## ✅ やったこと",
	"- 何かやった",
	"",
	"## 📝 メモ",
	"- なし",
].join("\n");

test("見出しの直前に空行を挟んでブロックを挿入する", () => {
	const next = insertTimemeterBlock(DAILY_SAMPLE);
	expect(next).not.toBeNull();
	expect(next).toContain("```timemeter\ndate: today\n```\n\n## ✅ やったこと");
	// マーカー外の既存本文（やったこと欄・メモ欄）は保持される
	expect(next).toContain("- 何かやった");
	expect(next).toContain("## 📝 メモ");
	expect(next).toContain("- なし");
});

test("既に空行がある場合は空行を重ねない", () => {
	const next = insertTimemeterBlock(DAILY_SAMPLE) ?? "";
	const doubleBlankCount = (next.match(/\n\n\n/g) ?? []).length;
	expect(doubleBlankCount).toBe(0);
});

test("既にブロックがある場合は null を返す（二重挿入しない）", () => {
	const already = insertTimemeterBlock(DAILY_SAMPLE);
	expect(already).not.toBeNull();
	const twice = insertTimemeterBlock(already as string);
	expect(twice).toBeNull();
});

test("hasTimemeterBlock: 未挿入の本文では false", () => {
	expect(hasTimemeterBlock(DAILY_SAMPLE)).toBe(false);
});

test("見出しが無ければ末尾に追記する", () => {
	const content = "# タイトル\n\nなにかメモ\n";
	const next = insertTimemeterBlock(content);
	expect(next).not.toBeNull();
	expect(next).toContain("なにかメモ");
	expect(next).toContain("```timemeter\ndate: today\n```");
});
