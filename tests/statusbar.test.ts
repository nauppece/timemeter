import { describe, expect, test } from "vitest";
import { renderStatusBarText, type StatusBarSource } from "../src/statusbar";

function source(overrides: Partial<StatusBarSource>): StatusBarSource {
	return {
		getState: () => "rec",
		getCurrentApp: () => null,
		getCurrentStart: () => null,
		getTodayTotalMin: () => 0,
		...overrides,
	};
}

test("記録中でアプリ・開始時刻があれば経過分を表示する", () => {
	const now = 1_000_000;
	const start = now - 3 * 60_000; // 3分前
	const text = renderStatusBarText(
		source({ getState: () => "rec", getCurrentApp: () => "Code", getCurrentStart: () => start, getTodayTotalMin: () => 76 }),
		now,
	);
	expect(text).toBe("⏱ Code 3分 ・ 今日 1h 16m");
});

test("アプリが無ければ待機中表示", () => {
	const text = renderStatusBarText(source({ getCurrentApp: () => null }));
	expect(text).toContain("⏱ 待機中");
});

test("rec 以外の状態（afk等）では待機中表示", () => {
	const text = renderStatusBarText(
		source({ getState: () => "afk", getCurrentApp: () => "Code", getCurrentStart: () => 0 }),
	);
	expect(text).toContain("⏱ 待機中");
});
