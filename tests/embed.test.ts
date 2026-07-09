import { describe, expect, test } from "vitest";
import { parseEmbedDate } from "../src/embed";

test("date行が無ければ today を返す", () => {
	expect(parseEmbedDate("", "2026-07-09")).toBe("2026-07-09");
});

test("date: today は today を返す", () => {
	expect(parseEmbedDate("date: today", "2026-07-09")).toBe("2026-07-09");
});

test("date: YYYY-MM-DD はその日付を返す", () => {
	expect(parseEmbedDate("date: 2026-01-02", "2026-07-09")).toBe("2026-01-02");
});

test("不正な値は today にフォールバックする", () => {
	expect(parseEmbedDate("date: hoge", "2026-07-09")).toBe("2026-07-09");
});

test("date: の値が空なら today", () => {
	expect(parseEmbedDate("date:   ", "2026-07-09")).toBe("2026-07-09");
});
