import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setLang } from "../src/i18n";
import { buildNippou, hasNippouCallout, insertNippouCallout } from "../src/nippou";
import type { Session } from "../src/types";

// このファイルは日本語出力（その他 / callout ヘッダー）を検証するので ja に固定する。
beforeEach(() => setLang("ja"));
afterEach(() => setLang("en"));

const DAILY_SAMPLE = [
	"---",
	"tags: [デイリー]",
	"---",
	"# 7/9 (木)",
	"",
	"## ✅ やったこと",
	"- 何かやった",
	"",
	"## 📝 メモ",
	"- なし",
].join("\n");

const DRAFT_LINES = ["- 09:02–10:18 VS Code — 実装", "- その他: Chrome 21m, Slack 8m"];

/** テスト用セッション生成ヘルパ */
function s(start: string, end: string, app: string, note: string): Session {
	return { date: "2026-07-09", start, end, app, title: null, note, manual: false };
}

describe("buildNippou", () => {
	test("説明ありが2件で別内容なら2行になる", () => {
		const result = buildNippou([
			s("09:00", "10:00", "VS Code", "実装"),
			s("10:00", "10:30", "Chrome", "調査"),
		]);
		expect(result).toEqual([
			"- 09:00–10:00 VS Code — 実装",
			"- 10:00–10:30 Chrome — 調査",
		]);
	});

	test("連続する同一noteは結合され範囲が伸びる", () => {
		const result = buildNippou([
			s("09:00", "09:30", "VS Code", "実装"),
			s("09:30", "10:18", "Terminal", "実装"),
		]);
		expect(result).toEqual(["- 09:00–10:18 VS Code — 実装"]);
	});

	test("同一noteでも時間的に隣接していなければ結合しない", () => {
		const result = buildNippou([
			s("09:00", "09:30", "VS Code", "実装"),
			s("10:00", "10:30", "VS Code", "実装"),
		]);
		expect(result).toEqual([
			"- 09:00–09:30 VS Code — 実装",
			"- 10:00–10:30 VS Code — 実装",
		]);
	});

	test("説明なし複数はその他行に降順で集約される", () => {
		const result = buildNippou([
			s("09:00", "09:08", "Slack", ""),
			s("09:08", "09:29", "Chrome", ""),
		]);
		expect(result).toEqual(["- その他: Chrome 21m, Slack 8m"]);
	});

	test("説明ありと説明なしが混在する場合はその他行が末尾に付く", () => {
		const result = buildNippou([
			s("09:02", "10:18", "VS Code", "実装"),
			s("10:18", "10:39", "Chrome", ""),
			s("10:39", "10:47", "Slack", ""),
		]);
		expect(result).toEqual([
			"- 09:02–10:18 VS Code — 実装",
			"- その他: Chrome 21m, Slack 8m",
		]);
	});

	test("全て説明なしならその他行のみ", () => {
		const result = buildNippou([
			s("09:00", "09:08", "Slack", ""),
			s("09:08", "09:29", "Chrome", ""),
		]);
		expect(result).toEqual(["- その他: Chrome 21m, Slack 8m"]);
	});

	test("空入力なら空配列", () => {
		expect(buildNippou([])).toEqual([]);
	});
});

describe("insertNippouCallout", () => {
	test("やったこと セクションの末尾（次の見出しの直前）に callout を挿入する", () => {
		const next = insertNippouCallout(DAILY_SAMPLE, DRAFT_LINES);
		expect(next).not.toBeNull();
		expect(next).toContain(
			[
				"## ✅ やったこと",
				"- 何かやった",
				"",
				"> [!note] タイムメーター下書き",
				"> - 09:02–10:18 VS Code — 実装",
				"> - その他: Chrome 21m, Slack 8m",
				"",
				"## 📝 メモ",
			].join("\n"),
		);
		// マーカー外の既存本文は保持される
		expect(next).toContain("- 何かやった");
		expect(next).toContain("- なし");
	});

	test("既に callout がある場合は null を返す（二重挿入しない）", () => {
		const once = insertNippouCallout(DAILY_SAMPLE, DRAFT_LINES);
		expect(once).not.toBeNull();
		const twice = insertNippouCallout(once as string, DRAFT_LINES);
		expect(twice).toBeNull();
	});

	test("hasNippouCallout: 未挿入では false、挿入後は true", () => {
		expect(hasNippouCallout(DAILY_SAMPLE)).toBe(false);
		const next = insertNippouCallout(DAILY_SAMPLE, DRAFT_LINES) as string;
		expect(hasNippouCallout(next)).toBe(true);
	});

	test("やったこと 見出しが無ければファイル末尾に追記する", () => {
		const content = "# タイトル\n\nなにかメモ\n";
		const next = insertNippouCallout(content, DRAFT_LINES);
		expect(next).not.toBeNull();
		expect(next).toContain("なにかメモ");
		expect(next).toContain("> [!note] タイムメーター下書き");
	});

	test("次の見出しが無ければセクション末尾＝ファイル末尾に挿入する", () => {
		const content = ["# タイトル", "", "## ✅ やったこと", "- 何かやった"].join("\n");
		const next = insertNippouCallout(content, DRAFT_LINES) as string;
		expect(next).toContain("- 何かやった");
		expect(next).toContain("> [!note] タイムメーター下書き");
		expect(next.indexOf("- 何かやった")).toBeLessThan(next.indexOf("タイムメーター下書き"));
	});
});

describe("英語モード", () => {
	test("その他・callout ヘッダーが英語になる", () => {
		setLang("en");
		expect(buildNippou([s("09:00", "09:30", "Slack", "")])).toEqual(["- Other: Slack 30m"]);
		const next = insertNippouCallout(DAILY_SAMPLE, ["- x"]) as string;
		expect(next).toContain("> [!note] TimeMeter draft");
	});
});
