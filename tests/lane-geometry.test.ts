import { describe, expect, test } from "vitest";
import {
	centerAnchoredScrollLeft,
	laneRange,
	segPos,
	tickStepMin,
} from "../src/lane-geometry";
import type { Session } from "../src/types";

function s(start: string, end: string): Session {
	return { date: "2026-07-09", start, end, app: "X", title: null, note: "", manual: false, away: false };
}

describe("laneRange", () => {
	test("start 最小・end 最大を毎時に丸める", () => {
		expect(laneRange([s("09:20", "10:40"), s("10:40", "11:05")])).toEqual({
			lo: 540,
			hi: 720,
			span: 180,
		});
	});

	test("span が 0 以下になる場合は 60 分に補正する", () => {
		// 同一の毎時境界に丸められて hi <= lo になるケース。
		const r = laneRange([s("09:00", "09:00")]);
		expect(r.lo).toBe(540);
		expect(r.hi).toBe(600);
		expect(r.span).toBe(60);
	});
});

describe("segPos", () => {
	test("left%/width% を span 基準で返す", () => {
		const { leftPct, widthPct } = segPos(600, 660, 540, 180);
		expect(leftPct).toBeCloseTo((60 / 180) * 100);
		expect(widthPct).toBeCloseTo((60 / 180) * 100);
	});

	test("極小セグメントは minWidthPct を下限にする", () => {
		const { widthPct } = segPos(600, 601, 540, 1800);
		expect(widthPct).toBe(0.6);
	});
});

describe("tickStepMin", () => {
	test("見える範囲（span/zoom）で刻みが段階的に細かくなる", () => {
		expect(tickStepMin(600, 1)).toBe(120); // shown 600 > 480
		expect(tickStepMin(600, 2)).toBe(60); // shown 300 → 240<shown<=480
		expect(tickStepMin(600, 4)).toBe(30); // shown 150 → 120<shown<=240
		expect(tickStepMin(120, 2)).toBe(15); // shown 60 → <=120
	});
});

describe("centerAnchoredScrollLeft", () => {
	test("中央の位置比率を保つ", () => {
		// prev: inner 1000, viewport 200, scrollLeft 400 → center=500 → ratio 0.5
		// next: inner 2000 → center 1000 → scrollLeft 900
		expect(centerAnchoredScrollLeft(400, 1000, 2000, 200)).toBe(900);
	});

	test("下限 0 にクランプする", () => {
		// center=100, ratio=0.01, next=20-100=-80 → 0
		expect(centerAnchoredScrollLeft(0, 10000, 2000, 200)).toBe(0);
	});

	test("上限 next-viewport にクランプする", () => {
		// center=1000, ratio=1.0, next=1900 > max(1800) → 1800
		expect(centerAnchoredScrollLeft(900, 1000, 2000, 200)).toBe(1800);
	});

	test("prevInnerW が 0 なら 0", () => {
		expect(centerAnchoredScrollLeft(0, 0, 2000, 200)).toBe(0);
	});
});
