import { describe, expect, test } from "vitest";
import { aggregate } from "../src/aggregator";

const T0 = new Date("2026-07-09T00:00:00").getTime();
const p = (hm: string, app: string, idleSec = 0, title: string | null = null) => {
	const [h, m] = hm.split(":").map(Number);
	return { ts: T0 + (h * 60 + m) * 60000, app, title, idleSec };
};
const OPT = { afkSec: 180, gapMin: 3, laps: [] as number[] };

test("同一アプリの連続pollは1セッションに結合される", () => {
	// 注: ブリーフ原文は3件目が p("09:10", ...) だったが、OPT.gapMin=3 のもとでは
	// 直前 poll (09:00) との間隔が10分となり、test3で検証しているギャップ分割ルール
	// (3分超で分割) と矛盾し、この2つのテストは両立不可能だった。
	// テスト名・コメントの意図（連続＝短い間隔で結合）と AFK テストの
	// コメント慣習（間隔○分なので結合されたまま）に合わせ、09:01（1分間隔）の
	// タイポと判断し修正済み。
	const s = aggregate([p("09:00", "Code"), p("09:00", "Code"), p("09:01", "Code")], OPT);
	expect(s).toHaveLength(1);
	expect(s[0]).toMatchObject({ start: "09:00", end: "09:01", app: "Code" });
});
test("アプリが変わるとセッションが分かれる", () => {
	const s = aggregate([p("09:00", "Code"), p("09:05", "Chrome"), p("09:06", "Chrome")], OPT);
	expect(s.map(x => x.app)).toEqual(["Code", "Chrome"]);
});
test("ギャップ3分超で分割される", () => {
	const s = aggregate([p("09:00", "Code"), p("09:02", "Code"), p("09:10", "Code")], OPT);
	expect(s).toHaveLength(2);
});
test("AFKのpollは除外される", () => {
	const s = aggregate([p("09:00", "Code"), p("09:01", "Code", 300), p("09:02", "Code")], OPT);
	expect(s).toHaveLength(1); // AFK poll は存在しない扱い（間隔2分なので結合されたまま）
});
test("ラップ時刻でセッションが強制分割される", () => {
	const s = aggregate([p("09:00", "Code"), p("09:02", "Code")], { ...OPT, laps: [T0 + 9 * 3600000 + 60000] });
	expect(s).toHaveLength(2);
});
test("titleは最頻出の非null値", () => {
	const s = aggregate([p("09:00", "Code", 0, "a.ts"), p("09:01", "Code", 0, "b.ts"), p("09:02", "Code", 0, "b.ts")], OPT);
	expect(s[0].title).toBe("b.ts");
});
