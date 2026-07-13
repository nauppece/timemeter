import { describe, expect, test } from "vitest";
import { appendLineAtEnd, appendToDoneSection } from "../src/daily-log";

const SAMPLE = [
	"---",
	"tags: [デイリー]",
	"---",
	"# 7/11 (土)",
	"",
	"## ✅ やったこと",
	"- 既存の作業",
	"",
	"## 📝 メモ",
	"- なし",
].join("\n");

describe("appendToDoneSection", () => {
	test("やったこと セクションの末尾（次見出しの前）に追記する", () => {
		const out = appendToDoneSection(SAMPLE, "- Code: バグ修正");
		const lines = out.split("\n");
		const doneIdx = lines.indexOf("## ✅ やったこと");
		const memoIdx = lines.indexOf("## 📝 メモ");
		expect(lines).toContain("- Code: バグ修正");
		// 追記行は やったこと と メモ の間にある
		const addedIdx = lines.indexOf("- Code: バグ修正");
		expect(addedIdx).toBeGreaterThan(doneIdx);
		expect(addedIdx).toBeLessThan(memoIdx);
		// 既存の作業の直後
		expect(lines.indexOf("- 既存の作業")).toBe(addedIdx - 1);
		// メモの中身は変わらない
		expect(out).toContain("## 📝 メモ\n- なし");
	});

	test("空のセクションでは見出し直後に入る", () => {
		const content = ["# 日", "", "## ✅ やったこと", "", "## 📝 メモ"].join("\n");
		const out = appendToDoneSection(content, "- Chrome: 調べもの");
		const lines = out.split("\n");
		expect(lines[lines.indexOf("## ✅ やったこと") + 1]).toBe("- Chrome: 調べもの");
	});

	test("複数回追記すると行が増える", () => {
		let out = appendToDoneSection(SAMPLE, "- A: 1");
		out = appendToDoneSection(out, "- B: 2");
		expect(out).toContain("- A: 1");
		expect(out).toContain("- B: 2");
		expect(out.indexOf("- A: 1")).toBeLessThan(out.indexOf("- B: 2"));
	});

	test("見出しが無ければファイル末尾に追記する", () => {
		const out = appendToDoneSection("# タイトル\n\n本文\n", "- X: y");
		expect(out.endsWith("- X: y\n")).toBe(true);
		expect(out).toContain("本文");
	});

	test("見出しに空文字を指定するとファイル末尾に追記する", () => {
		const out = appendToDoneSection(SAMPLE, "- X: y", "");
		expect(out.endsWith("- X: y\n")).toBe(true);
		// やったこと 欄には入らない（末尾に落ちる）。
		const lines = out.split("\n");
		expect(lines.indexOf("- X: y")).toBeGreaterThan(lines.indexOf("## 📝 メモ"));
	});

	test("カスタム見出しを指定するとその下に入る", () => {
		const content = ["# 日", "", "## Log", "", "## メモ"].join("\n");
		const out = appendToDoneSection(content, "- A: 1", "## Log");
		const lines = out.split("\n");
		expect(lines[lines.indexOf("## Log") + 1]).toBe("- A: 1");
	});

	test("空文字列に追記できる", () => {
		expect(appendToDoneSection("", "- X: y")).toBe("- X: y\n");
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
