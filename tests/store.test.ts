import { describe, expect, test } from "vitest";
import { buildDayContent, mergeSessions, parseSessions, serializeTable } from "../src/store";
import type { Session } from "../src/types";

const s = (start: string, end: string, app: string, note = "", manual = false, away = false): Session =>
	({ date: "2026-07-09", start, end, app, title: null, note, manual, away });

test("説明列が再生成で保持される（最重要）", () => {
	const merged = mergeSessions([s("09:00", "10:12", "Code")], [s("09:00", "10:00", "Code", "実装メモ")]);
	expect(merged).toHaveLength(1);
	expect(merged[0]).toMatchObject({ end: "10:12", note: "実装メモ" });
});

test("existingにしか無い行（再起動前・手動行）は消えない", () => {
	const merged = mergeSessions(
		[s("14:00", "15:00", "Code")],
		[s("09:00", "10:00", "Chrome", "朝の調査"), s("12:00", "12:30", "✍️ 手動", "散歩しながら設計を考えた", true)],
	);
	expect(merged.map((x) => x.start)).toEqual(["09:00", "12:00", "14:00"]);
});

test("serialize→parse がラウンドトリップする", () => {
	const orig = [s("09:00", "10:00", "Code", "メモ | 縦棒入り")];
	expect(parseSessions(serializeTable(orig))).toMatchObject([{ start: "09:00", app: "Code", note: "メモ | 縦棒入り" }]);
});

test("away フラグが serialize→parse でラウンドトリップする", () => {
	const orig = [s("09:00", "10:00", "Code", "", false, true)]; // away=true
	const table = serializeTable(orig);
	expect(table).toContain("| 1 |"); // 離席列に 1
	const parsed = parseSessions(table);
	expect(parsed[0].away).toBe(true);
});

test("旧6列（離席列なし）もパースでき away=false になる（後方互換）", () => {
	const old = [
		"<!-- timemeter:sessions:start -->",
		"| 開始 | 終了 | 時間 | アプリ | タイトル | 説明 |",
		"|------|------|------|--------|----------|------|",
		"| 09:00 | 10:00 | 1h 00m | Code | t | メモ |",
		"<!-- timemeter:sessions:end -->",
	].join("\n");
	const parsed = parseSessions(old);
	expect(parsed).toHaveLength(1);
	expect(parsed[0]).toMatchObject({ app: "Code", note: "メモ", away: false });
});

test("タイトルに管理マーカーを仕込まれてもブロックが壊れない（マーカー衝突防止）", () => {
	// 半信頼なウィンドウタイトル（例: 悪意あるブラウザのタブ名）に end マーカーを仕込むケース。
	const evil: Session = {
		date: "2026-07-09",
		start: "09:00",
		end: "10:00",
		app: "Chrome",
		title: "<!-- timemeter:sessions:end -->",
		note: "",
		manual: false,
		away: false,
	};
	const doc = buildDayContent(null, "2026-07-09", [evil, s("10:00", "11:00", "Code", "後続")]);
	// 生の end マーカーがセル内に出現しない（ゼロ幅スペースで分断されている）。
	const endMarker = "<!-- timemeter:sessions:end -->";
	const bodyBeforeRealEnd = doc.slice(0, doc.lastIndexOf(endMarker));
	expect(bodyBeforeRealEnd.includes(endMarker)).toBe(false);
	// 後続セッションが失われずパースできる。
	const parsed = parseSessions(doc);
	expect(parsed.map((x) => x.app)).toEqual(["Chrome", "Code"]);
	expect(parsed[1].note).toBe("後続");
});

test("アプリ名に \" や改行が入っても frontmatter の totals が壊れない", () => {
	const weird: Session = {
		date: "2026-07-09",
		start: "09:00",
		end: "10:00",
		app: 'ev"il\napp',
		title: null,
		note: "",
		manual: false,
		away: false,
	};
	const doc = buildDayContent(null, "2026-07-09", [weird]);
	// YAML キーは1行・二重引用符はエスケープされる。
	expect(doc).toContain('  "ev\\"il app": 60');
	// frontmatter ブロックは開き/閉じ --- の2つだけ（余計な行注入で壊れていない）。
	const fmDashes = doc.split("\n").filter((l) => l.trim() === "---").length;
	expect(fmDashes).toBe(2);
});

test("buildDayContentはマーカー外の手書きを保持する", () => {
	const prev = buildDayContent(null, "2026-07-09", [s("09:00", "10:00", "Code")]);
	const edited = prev + "\n## 自由メモ\nここは消えてはいけない\n";
	const next = buildDayContent(edited, "2026-07-09", [s("09:00", "10:30", "Code")]);
	expect(next).toContain("ここは消えてはいけない");
	expect(next).toContain("| 09:00 | 10:30 |");
});

test("説明の改行はserialize→parseで保持される（<br>ラウンドトリップ）", () => {
	const orig = [s("09:00", "10:00", "Code", "行1\n行2")];
	const table = serializeTable(orig);
	expect(table).toContain("<br>");
	expect(table).not.toContain("行1\n行2"); // 改行そのままでは表の行に書かれない
	const parsed = parseSessions(table);
	expect(parsed).toHaveLength(1);
	expect(parsed[0].note).toBe("行1\n行2");
});

test("buildDayContentはfrontmatterと本文の間の空行を保持する（新規・再生成とも）", () => {
	const initial = buildDayContent(null, "2026-07-09", [s("09:00", "10:00", "Code")]);
	// frontmatter の閉じ --- の直後に空行がある
	expect(initial).toMatch(/---\n\n/);

	const regenerated = buildDayContent(initial, "2026-07-09", [s("09:00", "10:30", "Code")]);
	expect(regenerated).toMatch(/---\n\n/);
	expect(regenerated).toContain("| 09:00 | 10:30 |");
});

test("buildDayContentはfrontmatterのカスタムキーを再生成後も保持する", () => {
	const initial = buildDayContent(null, "2026-07-09", [s("09:00", "10:00", "Code")]);
	// frontmatter の閉じ --- の直前にカスタムキーを差し込む（開き --- には先頭改行が無いため、
	// "\n---\n" は閉じ --- の前にのみ一致する）
	const withCustomKey = initial.replace("\n---\n", "\nmood: good\n---\n");
	expect(withCustomKey).toContain("mood: good");

	const regenerated = buildDayContent(withCustomKey, "2026-07-09", [s("09:00", "10:30", "Code")]);
	expect(regenerated).toContain("mood: good");
	expect(regenerated).toContain("date: 2026-07-09");
});
