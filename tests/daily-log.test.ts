import { describe, expect, test } from "vitest";
import { appendLineAtEnd, appendToDoneSection } from "../src/daily-log";

// 既定の追記先見出しは "## TimeMeter"。
const SAMPLE = [
	"---",
	"tags: [デイリー]",
	"---",
	"# 7/11 (土)",
	"",
	"## TimeMeter",
	"- 既存の作業",
	"",
	"## 📝 メモ",
	"- なし",
].join("\n");

describe("appendToDoneSection", () => {
	test("既定見出し(## TimeMeter)のセクション末尾（次見出しの前）に追記する", () => {
		const out = appendToDoneSection(SAMPLE, "- Code: バグ修正");
		const lines = out.split("\n");
		const headIdx = lines.indexOf("## TimeMeter");
		const memoIdx = lines.indexOf("## 📝 メモ");
		const addedIdx = lines.indexOf("- Code: バグ修正");
		expect(addedIdx).toBeGreaterThan(headIdx);
		expect(addedIdx).toBeLessThan(memoIdx);
		expect(lines.indexOf("- 既存の作業")).toBe(addedIdx - 1);
		expect(out).toContain("## 📝 メモ\n- なし");
	});

	test("空のセクションでは見出し直後に入る", () => {
		const content = ["# 日", "", "## TimeMeter", "", "## メモ"].join("\n");
		const out = appendToDoneSection(content, "- Chrome: 調べもの");
		const lines = out.split("\n");
		expect(lines[lines.indexOf("## TimeMeter") + 1]).toBe("- Chrome: 調べもの");
	});

	test("見出しが無ければ見出しごと作成して末尾に追記する", () => {
		const out = appendToDoneSection("# タイトル\n\n本文\n", "- X: y");
		expect(out).toContain("本文");
		// 末尾に "## TimeMeter" セクションが作られ、その下に line が入る。
		expect(out.endsWith("## TimeMeter\n- X: y\n")).toBe(true);
	});

	test("見出しに空文字を指定するとファイル末尾に line だけ追記する", () => {
		const out = appendToDoneSection(SAMPLE, "- X: y", "");
		expect(out.endsWith("- X: y\n")).toBe(true);
		expect(out).not.toContain("## TimeMeter\n- X: y"); // 見出しは作らない
		const lines = out.split("\n");
		expect(lines.indexOf("- X: y")).toBeGreaterThan(lines.indexOf("## 📝 メモ"));
	});

	test("カスタム見出しがあればその下に入る", () => {
		const content = ["# 日", "", "## Log", "", "## メモ"].join("\n");
		const out = appendToDoneSection(content, "- A: 1", "## Log");
		const lines = out.split("\n");
		expect(lines[lines.indexOf("## Log") + 1]).toBe("- A: 1");
	});

	test("複数回追記すると同じセクションに積み上がる", () => {
		let out = appendToDoneSection(SAMPLE, "- A: 1");
		out = appendToDoneSection(out, "- B: 2");
		expect(out.indexOf("- A: 1")).toBeLessThan(out.indexOf("- B: 2"));
	});

	test("空文字列に追記すると見出しごと作成する", () => {
		expect(appendToDoneSection("", "- X: y")).toBe("\n## TimeMeter\n- X: y\n");
	});
});

describe("appendLineAtEnd", () => {
	test("末尾に改行付きで追記する", () => {
		expect(appendLineAtEnd("# メモ\n本文", "- A: 1")).toBe("# メモ\n本文\n- A: 1\n");
	});
	test("末尾が改行なら二重にしない", () => {
		expect(appendLineAtEnd("本文\n", "- A: 1")).toBe("本文\n- A: 1\n");
	});
	test("空文字列でも追記できる", () => {
		expect(appendLineAtEnd("", "- A: 1")).toBe("- A: 1\n");
	});
});
