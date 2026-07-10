// `timemeter` コードブロックの描画（デイリー等への埋め込み）。
// UIモック（タイムメーター - UIモック.html の .tm-embed）のコンパクト版を踏襲する。
// 読み取り専用・モバイルでも動く（readDay を呼ぶだけで tracker 等には触らない）。
// obsidian は型のみ import する（実行時 import なし）。

import type { App } from "obsidian";
import { appColor } from "./appcolor";
import { t } from "./i18n";
import { readDay } from "./store";
import { durMin, fmtDur, toMin, type Session } from "./types";

/**
 * 埋め込みが読む値の最小インターフェース。
 * プラグインを直接 import すると循環参照になるため、必要な口だけ切り出す。
 */
export interface EmbedHost {
	app: App;
	dataFolder: string;
	isHidden(app: string): boolean;
}

const TODAY_TOKEN = "today";

/**
 * ブロック本文から `date: today|YYYY-MM-DD` を1行だけ拾う。
 * 該当行が無い/空/`today`/不正な日付は today にフォールバックする。
 */
export function parseEmbedDate(source: string, today: string): string {
	const line = source.split("\n").find((l) => /^\s*date\s*:/.test(l));
	if (!line) return today;
	const value = line.slice(line.indexOf(":") + 1).trim();
	if (value === "" || value === TODAY_TOKEN) return today;
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
	return today;
}

/** マーカー日の Session[] を読んで `.tm-embed` を描画する（host.isHidden で除外）。 */
export async function renderEmbed(el: HTMLElement, host: EmbedHost, dateStr: string): Promise<void> {
	el.empty();
	el.addClass("tm-embed");

	const sessions = await readDay(host.app, host.dataFolder, dateStr);
	const visible = sessions.filter((s) => !host.isHidden(s.app));

	const head = el.createDiv({ cls: "embed-head" });
	const totalMin = visible.reduce((sum, s) => sum + durMin(s), 0);
	head.createEl("b", { text: `⏱️ ${t("embed.header")} ${fmtDur(totalMin)}` });
	head.createSpan({ text: dateStr });

	if (visible.length === 0) {
		el.createDiv({ cls: "tm-empty", text: t("common.noRecords") });
		return;
	}

	renderEmbedBars(el.createDiv({ cls: "bars" }), visible);
	const tlWrap = el.createDiv({ cls: "tl-wrap" });
	renderEmbedTimeline(tlWrap.createDiv({ cls: "tl" }), visible);
}

/** モックの renderBars(compact=true) 相当: アプリ別ミニバー（⋯ボタン無し・読み取り専用）。 */
function renderEmbedBars(container: HTMLElement, sessions: Session[]): void {
	const totals = new Map<string, number>();
	for (const s of sessions) totals.set(s.app, (totals.get(s.app) ?? 0) + durMin(s));
	const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
	const max = sorted.length > 0 ? sorted[0][1] : 0;

	for (const [app, min] of sorted) {
		const row = container.createDiv({ cls: "bar-row" });
		row.createSpan({ cls: "nm", text: app });
		const track = row.createDiv({ cls: "track" });
		const fill = track.createDiv({ cls: "fill" });
		fill.style.width = `${max > 0 ? Math.max(3, (min / max) * 100) : 0}%`;
		fill.style.background = appColor(app);
		row.createSpan({ cls: "dur", text: fmtDur(min) });
	}
}

/** モックの renderTimeline 単帯版相当: 時刻順にアプリ色を並べた1本のタイムライン。 */
function renderEmbedTimeline(tl: HTMLElement, sessions: Session[]): void {
	let lo = Math.min(...sessions.map((s) => toMin(s.start)));
	let hi = Math.max(...sessions.map((s) => toMin(s.end)));
	lo = Math.floor(lo / 60) * 60;
	hi = Math.ceil(hi / 60) * 60;
	if (hi <= lo) hi = lo + 60;
	const span = hi - lo;

	for (const s of sessions) {
		const startMin = toMin(s.start);
		const endMin = toMin(s.end);
		const seg = tl.createDiv({ cls: "seg" });
		seg.style.left = `${((startMin - lo) / span) * 100}%`;
		seg.style.width = `${Math.max(0.6, ((endMin - startMin) / span) * 100)}%`;
		seg.style.background = appColor(s.app);
	}
}
