// 右サイドバーのビュー（レイアウトA・第1版）。
// この版は読み取り専用: 状態ピル＋現在アプリのライブ表示＋今日のアプリ別合計バー。
// タップ記録（クイック入力）・時系列レーン・日別/月タブは Task 7/8 で追加する。

import { type App, ItemView, type WorkspaceLeaf } from "obsidian";
import { localDateStr } from "./aggregator";
import { readDay } from "./store";
import type { TrackerState } from "./tracker";
import { durMin, fmtDur } from "./types";

export const VIEW_TYPE_TIMEMETER = "timemeter-sidebar";

/**
 * ビューがプラグイン本体から読む値の最小インターフェース。
 * プラグインを直接 import すると循環参照になるため、必要な口だけ切り出す。
 */
export interface TimemeterHost {
	app: App;
	dataFolder: string;
	getState(): TrackerState;
	getCurrentApp(): string | null;
	getCurrentStart(): number | null;
	aggregateNow(): Promise<void>;
}

const STATE_LABEL: Record<TrackerState, string> = {
	rec: "記録中",
	afk: "AFK",
	pause: "一時停止",
	err: "権限エラー",
};

const STATE_COLOR: Record<TrackerState, string> = {
	rec: "#3fb950",
	afk: "#8b949e",
	pause: "#d29922",
	err: "#f85149",
};

// アプリ名の文字列ハッシュから安定して色を選ぶための 12 色パレット。
const PALETTE = [
	"#e06c75",
	"#61afef",
	"#98c379",
	"#e5c07b",
	"#c678dd",
	"#56b6c2",
	"#d19a66",
	"#e39ac6",
	"#5c9e6b",
	"#c0a9e0",
	"#519ab5",
	"#b58900",
];

export function appColor(name: string): string {
	let h = 0;
	for (let i = 0; i < name.length; i++) {
		h = (h * 31 + name.charCodeAt(i)) >>> 0;
	}
	return PALETTE[h % PALETTE.length];
}

export class TimemeterView extends ItemView {
	private host: TimemeterHost;

	// ライブ更新で書き換える要素の参照。
	private pillDotEl: HTMLElement | null = null;
	private pillLabelEl: HTMLElement | null = null;
	private nowDotEl: HTMLElement | null = null;
	private nowAppEl: HTMLElement | null = null;
	private nowMinEl: HTMLElement | null = null;
	private todayTotalEl: HTMLElement | null = null;
	private barsEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, host: TimemeterHost) {
		super(leaf);
		this.host = host;
	}

	getViewType(): string {
		return VIEW_TYPE_TIMEMETER;
	}

	getDisplayText(): string {
		return "タイムメーター";
	}

	getIcon(): string {
		return "clock";
	}

	async onOpen(): Promise<void> {
		this.build();
		this.updateLive();
		await this.loadTotals();

		// ライブ数字は 1 秒ごと、合計リストは 15 秒ごとに更新する。
		this.registerInterval(window.setInterval(() => this.updateLive(), 1000));
		this.registerInterval(window.setInterval(() => void this.loadTotals(), 15000));
	}

	/** DOM の骨組みを 1 度だけ作り、更新対象の要素参照を保持する。 */
	private build(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("tm-view");

		// ── ヘッダー: 状態ピル ＋ 更新ボタン
		const header = root.createDiv({ cls: "tm-header" });
		const pill = header.createDiv({ cls: "tm-pill" });
		this.pillDotEl = pill.createSpan({ cls: "tm-dot" });
		this.pillLabelEl = pill.createSpan({ cls: "tm-pill-label", text: STATE_LABEL.rec });

		const refresh = header.createEl("button", { cls: "tm-refresh", text: "⟳" });
		refresh.setAttr("aria-label", "今すぐ集計して更新");
		refresh.addEventListener("click", () => {
			void (async () => {
				await this.host.aggregateNow();
				await this.loadTotals();
			})();
		});

		// ── ライブブロック: 現在アプリと連続分数、今日合計
		const live = root.createDiv({ cls: "tm-live" });
		live.createDiv({ cls: "tm-now-label", text: "NOW" });
		const nowRow = live.createDiv({ cls: "tm-now-row" });
		this.nowDotEl = nowRow.createSpan({ cls: "tm-dot tm-now-dot" });
		this.nowAppEl = nowRow.createSpan({ cls: "tm-now-app", text: "—" });
		this.nowMinEl = live.createDiv({ cls: "tm-now-min", text: "0m" });
		this.todayTotalEl = live.createDiv({ cls: "tm-today", text: "今日 合計 0m" });

		// ── 合計セクション（アプリ別バー）
		const totals = root.createDiv({ cls: "tm-totals" });
		totals.createDiv({ cls: "tm-section-title", text: "合計（今日）" });
		this.barsEl = totals.createDiv({ cls: "tm-bars" });

		// ── まだ無い機能の注記
		root.createDiv({
			cls: "tm-note",
			text: "※ タップ記録・時系列・日別/月は次のアップデートで追加予定",
		});
	}

	/** 1 秒ごと: 状態ピルと現在アプリの連続分数を更新（I/O なし）。 */
	private updateLive(): void {
		const state = this.host.getState();
		if (this.pillDotEl) this.pillDotEl.style.background = STATE_COLOR[state];
		if (this.pillLabelEl) this.pillLabelEl.setText(STATE_LABEL[state]);

		const app = this.host.getCurrentApp();
		const start = this.host.getCurrentStart();
		if (this.nowAppEl) this.nowAppEl.setText(app ?? "—");
		if (this.nowDotEl) {
			this.nowDotEl.style.background = app ? appColor(app) : "transparent";
		}
		if (this.nowMinEl) {
			const min = app && start != null ? Math.floor((Date.now() - start) / 60000) : 0;
			this.nowMinEl.setText(fmtDur(min));
		}
	}

	/** 15 秒ごと＋更新ボタン: 今日のファイルを読み、アプリ別合計バーを描き直す。 */
	private async loadTotals(): Promise<void> {
		const today = localDateStr(Date.now());
		const sessions = await readDay(this.host.app, this.host.dataFolder, today);

		const totals = new Map<string, number>();
		for (const s of sessions) {
			totals.set(s.app, (totals.get(s.app) ?? 0) + durMin(s));
		}
		const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
		const totalMin = sorted.reduce((sum, [, m]) => sum + m, 0);
		const maxMin = sorted.length > 0 ? sorted[0][1] : 0;

		if (this.todayTotalEl) this.todayTotalEl.setText(`今日 合計 ${fmtDur(totalMin)}`);

		const bars = this.barsEl;
		if (!bars) return;
		bars.empty();
		if (sorted.length === 0) {
			bars.createDiv({ cls: "tm-empty", text: "まだ記録がありません" });
			return;
		}
		for (const [app, min] of sorted) {
			const row = bars.createDiv({ cls: "tm-bar-row" });
			row.createSpan({ cls: "tm-bar-name", text: app });
			const track = row.createDiv({ cls: "tm-bar-track" });
			const fill = track.createDiv({ cls: "tm-bar-fill" });
			fill.style.width = maxMin > 0 ? `${Math.round((min / maxMin) * 100)}%` : "0%";
			fill.style.background = appColor(app);
			row.createSpan({ cls: "tm-bar-val", text: fmtDur(min) });
		}
	}
}
