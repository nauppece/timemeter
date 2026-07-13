import { describe, expect, test } from "vitest";
import { appendManual, defaultManualStart, setNote } from "../src/quicklog";
import type { Session } from "../src/types";

const s = (start: string, end: string, app: string, note = ""): Session =>
	({ date: "2026-07-09", start, end, app, title: null, note, manual: false, away: false });

test("setNoteは該当キーの行だけ書き換える", () => {
	const out = setNote([s("09:00", "10:00", "Code", "古い")], "09:00|Code", "新しい");
	expect(out[0].note).toBe("新しい");
});

test("setNoteはキー不一致なら書き換えない", () => {
	const out = setNote([s("09:00", "10:00", "Code", "x")], "08:00|Slack", "y");
	expect(out[0].note).toBe("x");
});

test("setNoteは元配列を破壊しない（新しい配列/オブジェクトを返す）", () => {
	const orig = [s("09:00", "10:00", "Code", "古い")];
	const out = setNote(orig, "09:00|Code", "新しい");
	expect(orig[0].note).toBe("古い"); // 元は変わらない
	expect(out).not.toBe(orig); // 別配列
	expect(out[0]).not.toBe(orig[0]); // 書き換えた行は別オブジェクト
});

test("appendManualは手動行をstart順で差し込む", () => {
	const out = appendManual([s("09:00", "10:00", "Code")], "2026-07-09", "07:30", "08:10", "ランニング");
	expect(out[0]).toMatchObject({ app: "✍️ 手動", start: "07:30", note: "ランニング", manual: true, away: false });
	expect(out[1].app).toBe("Code");
});

test("defaultManualStartは直近セッションの終了時刻", () => {
	expect(defaultManualStart([s("09:00", "10:00", "Code")], "12:00")).toBe("10:00");
	expect(defaultManualStart([], "12:00")).toBe("11:30");
});

test("defaultManualStartのnow-30分は日付を跨いでも負にならない", () => {
	expect(defaultManualStart([], "00:10")).toBe("23:40");
});

test("defaultManualStartは複数セッションのうち最大endの行を使う（順不同でも）", () => {
	const sessions = [s("14:00", "15:00", "Code"), s("09:00", "10:00", "Chrome")];
	expect(defaultManualStart(sessions, "16:00")).toBe("15:00");
});
