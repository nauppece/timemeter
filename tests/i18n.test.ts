import { afterEach, describe, expect, test } from "vitest";
import { dictKeys, hourLabel, monthTitle, setLang, t, weekdayLabel } from "../src/i18n";

// 各テスト後に既定（en）へ戻す（モジュールレベルの言語状態が他テストへ漏れないように）。
afterEach(() => setLang("en"));

describe("キーの整合（parity）", () => {
	test("en と ja のキー集合が完全に一致する", () => {
		const en = [...dictKeys("en")].sort();
		const ja = [...dictKeys("ja")].sort();
		expect(ja).toEqual(en);
	});
});

describe("t()", () => {
	test("現在言語で引く", () => {
		setLang("ja");
		expect(t("state.rec")).toBe("記録中");
		setLang("en");
		expect(t("state.rec")).toBe("Recording");
	});

	test("{name} プレースホルダを置換する", () => {
		setLang("en");
		expect(t("badge.left", { n: 3 })).toBe("3 left");
		expect(t("ctx.hide", { app: "LINE" })).toBe('👁 Hide "LINE"');
	});

	test("params に無いプレースホルダはそのまま残す", () => {
		setLang("en");
		expect(t("badge.left")).toBe("{n} left");
	});

	test("未知キーはキー文字列を返す", () => {
		expect(t("no.such.key")).toBe("no.such.key");
	});
});

describe("日付系ヘルパ", () => {
	test("weekdayLabel は言語で切り替わる（0=日）", () => {
		setLang("en");
		expect(weekdayLabel(0)).toBe("Sun");
		setLang("ja");
		expect(weekdayLabel(0)).toBe("日");
	});

	test("monthTitle は言語で書式が変わる", () => {
		setLang("en");
		expect(monthTitle(2026, 7)).toBe("July 2026");
		setLang("ja");
		expect(monthTitle(2026, 7)).toBe("2026年7月");
	});

	test("hourLabel は言語で書式が変わる", () => {
		setLang("en");
		expect(hourLabel(9)).toBe("9:00");
		setLang("ja");
		expect(hourLabel(9)).toBe("9時");
	});
});
