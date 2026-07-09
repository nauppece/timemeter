// 右サイドバーのビュー（レイアウトA・「今日」タブ本実装）。
// UIモック（タイムメーター - UIモック.html の .ob .sb-* 一式）の見た目・挙動を踏襲する。
// 日別/月タブは Task 8b で中身を実装するため、この版では空のプレースホルダのみ用意する。

import { type App, ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import { localDateStr } from "./aggregator";
import { QuickLogModal } from "./quicklog-modal";
import { readDay } from "./store";
import type { TrackerState } from "./tracker";
import { durMin, fmtDur, type Session, sessionKey, toMin } from "./types";

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
	togglePause(): void;
	openSettings(): void;
	setCurrentNote(text: string): Promise<void>;
	setSegmentNote(date: string, key: string, text: string): Promise<void>;
	isHidden(app: string): boolean;
	toggleHidden(app: string): void;
	getCaptureTitle(app: string): boolean;
	toggleCaptureTitle(app: string): void;
}

const STATE_LABEL: Record<TrackerState, string> = {
	rec: "記録中",
	afk: "AFK",
	pause: "一時停止",
	err: "権限エラー",
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

type SubtabName = "bars" | "lanes";
type TabName = "today" | "day" | "month";

export class TimemeterView extends ItemView {
	private host: TimemeterHost;

	// ── ヘッダー
	private pillLabelEl: HTMLElement | null = null;
	private pauseBtnEl: HTMLButtonElement | null = null;
	private errbarEl: HTMLElement | null = null;

	// ── ライブブロック
	private nowDotEl: HTMLElement | null = null;
	private nowAppEl: HTMLElement | null = null;
	private nowMinEl: HTMLElement | null = null;
	private nowSecEl: HTMLElement | null = null;
	private nowSubAfkEl: HTMLElement | null = null;
	private nowSubPauseEl: HTMLElement | null = null;
	private todayTotalValEl: HTMLElement | null = null;
	private quickInputEl: HTMLInputElement | null = null;

	// ── サブタブ（合計/時系列）
	private subtabBarsBtn: HTMLButtonElement | null = null;
	private subtabLanesBtn: HTMLButtonElement | null = null;
	private badgeEl: HTMLElement | null = null;
	private barsEl: HTMLElement | null = null;
	private lanesEl: HTMLElement | null = null;
	private activeSubtab: SubtabName = "bars";

	// ── 下部タブ（今日/日別/月）
	private todayTabBtn: HTMLButtonElement | null = null;
	private dayTabBtn: HTMLButtonElement | null = null;
	private monthTabBtn: HTMLButtonElement | null = null;
	private viewTodayEl: HTMLElement | null = null;
	private viewDayEl: HTMLElement | null = null;
	private viewMonthEl: HTMLElement | null = null;
	private activeTab: TabName = "today";

	// ── コンテキストメニュー・ツールチップ
	private ctxmenuEl: HTMLElement | null = null;
	private ctxHideBtn: HTMLButtonElement | null = null;
	private ctxCaptureBtn: HTMLButtonElement | null = null;
	private ctxSettingsBtn: HTMLButtonElement | null = null;
	private ctxApp: string | null = null;
	private tipEl: HTMLElement | null = null;

	// ── 状態
	private currentDate = "";
	private liveSessionKey: string | null = null;

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
		return "hourglass";
	}

	async onOpen(): Promise<void> {
		this.build();
		this.updateLive();
		await this.refresh();

		// ライブ数字（状態ピル・経過分・秒）は 1 秒ごと。
		this.registerInterval(window.setInterval(() => this.updateLive(), 1000));
		// データ（合計/時系列/バッジ）は開いた時＋約20秒ごと＋各編集後。
		this.registerInterval(window.setInterval(() => void this.refresh(), 20000));

		// コンテキストメニューは外側クリックで閉じる。
		this.registerDomEvent(document, "click", (ev) => {
			if (this.ctxmenuEl && !this.ctxmenuEl.contains(ev.target as Node)) {
				this.ctxmenuEl.removeClass("open");
			}
		});
	}

	/** DOM の骨組みを 1 度だけ作り、更新対象の要素参照を保持する。 */
	private build(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("tm-view");

		// ── sb-head: 状態ピル・一時停止/再開・設定
		const head = root.createDiv({ cls: "sb-head" });
		const pill = head.createDiv({ cls: "pill" });
		pill.createSpan({ cls: "dot" });
		this.pillLabelEl = pill.createSpan({ text: STATE_LABEL.rec });
		head.createDiv({ cls: "spacer" });
		this.pauseBtnEl = head.createEl("button", { cls: "iconbtn", text: "⏸" });
		this.pauseBtnEl.setAttr("aria-label", "一時停止/再開");
		this.pauseBtnEl.addEventListener("click", () => this.host.togglePause());
		const settingsBtn = head.createEl("button", { cls: "iconbtn", text: "⚙︎" });
		settingsBtn.setAttr("aria-label", "設定");
		settingsBtn.addEventListener("click", () => this.host.openSettings());

		// ── errbar: 権限エラー時のみ表示
		this.errbarEl = root.createDiv({ cls: "errbar" });
		this.errbarEl.appendText("⚠️ オートメーション権限が未許可のため記録できません。");
		const errLink = this.errbarEl.createEl("a", { text: "設定方法を見る" });
		errLink.addEventListener("click", () => this.host.openSettings());
		this.errbarEl.style.display = "none";

		const body = root.createDiv({ cls: "sb-body" });

		// ── view-today
		this.viewTodayEl = body.createDiv({ cls: "view on" });
		this.buildTodayView(this.viewTodayEl);

		// ── view-day / view-month（8b でプレースホルダを置き換える）
		this.viewDayEl = body.createDiv({ cls: "view" });
		this.viewDayEl.createDiv({
			cls: "view-placeholder",
			text: "日別タブは次のアップデートで実装予定です。",
		});
		this.viewMonthEl = body.createDiv({ cls: "view" });
		this.viewMonthEl.createDiv({
			cls: "view-placeholder",
			text: "月タブは次のアップデートで実装予定です。",
		});

		// ── sb-tabs
		const tabs = root.createDiv({ cls: "sb-tabs" });
		this.todayTabBtn = tabs.createEl("button", { cls: "on", text: "今日" });
		this.dayTabBtn = tabs.createEl("button", { text: "日別" });
		this.monthTabBtn = tabs.createEl("button", { text: "月" });
		this.todayTabBtn.addEventListener("click", () => this.selectTab("today"));
		this.dayTabBtn.addEventListener("click", () => this.selectTab("day"));
		this.monthTabBtn.addEventListener("click", () => this.selectTab("month"));

		// ── コンテキストメニュー・ツールチップ（root 直下に置き、絶対配置の基準を root にする）
		this.ctxmenuEl = root.createDiv({ cls: "ctxmenu" });
		this.ctxHideBtn = this.ctxmenuEl.createEl("button", { text: "👁 非表示にする" });
		this.ctxCaptureBtn = this.ctxmenuEl.createEl("button", { text: "🏷 タイトル取込を OFF にする" });
		this.ctxmenuEl.createDiv({ cls: "sep" });
		this.ctxSettingsBtn = this.ctxmenuEl.createEl("button", { text: "⚙︎ 設定でまとめて管理…" });
		this.ctxHideBtn.addEventListener("click", () => {
			if (this.ctxApp) this.host.toggleHidden(this.ctxApp);
			this.ctxmenuEl?.removeClass("open");
			void this.refresh();
		});
		this.ctxCaptureBtn.addEventListener("click", () => {
			if (this.ctxApp) this.host.toggleCaptureTitle(this.ctxApp);
			this.ctxmenuEl?.removeClass("open");
			void this.refresh();
		});
		this.ctxSettingsBtn.addEventListener("click", () => {
			this.ctxmenuEl?.removeClass("open");
			this.host.openSettings();
		});

		this.tipEl = root.createDiv({ cls: "tip" });
	}

	/** 「今日」タブの中身（ライブブロック・サブタブ・合計/時系列）を組み立てる。 */
	private buildTodayView(container: HTMLElement): void {
		// ── live ブロック
		const live = container.createDiv({ cls: "live" });
		live.createDiv({ cls: "now-label", text: "NOW" });
		const nowApp = live.createDiv({ cls: "now-app" });
		this.nowDotEl = nowApp.createSpan({ cls: "appdot" });
		this.nowAppEl = nowApp.createEl("b", { text: "—" });
		const nowElapsed = live.createDiv({ cls: "now-elapsed" });
		this.nowMinEl = nowElapsed.createSpan({ text: "—" });
		nowElapsed.createEl("small", { text: "分" });
		this.nowSecEl = nowElapsed.createEl("small", { cls: "now-sec" });
		this.nowSubAfkEl = live.createDiv({ cls: "now-sub afk", text: "💤 無操作 — 記録を停止中" });
		this.nowSubPauseEl = live.createDiv({ cls: "now-sub pause", text: "⏸ 一時停止中 — 再開までは記録しません" });
		const total = live.createDiv({ cls: "today-total" });
		total.createSpan({ cls: "lbl", text: "今日合計" });
		this.todayTotalValEl = total.createSpan({ cls: "val", text: "0m" });

		this.quickInputEl = live.createEl("input", { cls: "quick-input", type: "text" });
		this.quickInputEl.placeholder = "いま何してる？ Enterで記録";
		this.quickInputEl.addEventListener("keydown", (ev: KeyboardEvent) => {
			if (ev.key !== "Enter") return;
			ev.preventDefault();
			const value = this.quickInputEl?.value ?? "";
			const trimmed = value.trim();
			if (!trimmed) return;
			void (async () => {
				await this.host.setCurrentNote(trimmed);
				if (this.quickInputEl) this.quickInputEl.value = "";
				await this.refresh();
				new Notice("メモを記録しました");
			})();
		});

		container.createEl("hr", { cls: "rule" });

		// ── サブタブ（合計/時系列）＋ 未記入バッジ
		const subtabsRow = container.createDiv({ cls: "subtabs-row" });
		const subtabs = subtabsRow.createDiv({ cls: "subtabs" });
		this.subtabBarsBtn = subtabs.createEl("button", { cls: "on", text: "合計" });
		this.subtabLanesBtn = subtabs.createEl("button", { text: "時系列" });
		this.subtabBarsBtn.addEventListener("click", () => this.selectSubtab("bars"));
		this.subtabLanesBtn.addEventListener("click", () => this.selectSubtab("lanes"));
		this.badgeEl = subtabsRow.createSpan({ cls: "fillin-badge" });
		this.badgeEl.style.display = "none";

		this.barsEl = container.createDiv({ cls: "bars subview on" });
		this.lanesEl = container.createDiv({ cls: "lanes subview" });

		container.createDiv({
			cls: "tl-cap",
			text: "ホバーで詳細 / クリックで説明を追記（📝＝説明あり）",
		});
	}

	private selectSubtab(which: SubtabName): void {
		this.activeSubtab = which;
		this.subtabBarsBtn?.toggleClass("on", which === "bars");
		this.subtabLanesBtn?.toggleClass("on", which === "lanes");
		this.barsEl?.toggleClass("on", which === "bars");
		this.lanesEl?.toggleClass("on", which === "lanes");
	}

	private selectTab(name: TabName): void {
		this.activeTab = name;
		this.todayTabBtn?.toggleClass("on", name === "today");
		this.dayTabBtn?.toggleClass("on", name === "day");
		this.monthTabBtn?.toggleClass("on", name === "month");
		this.viewTodayEl?.toggleClass("on", name === "today");
		this.viewDayEl?.toggleClass("on", name === "day");
		this.viewMonthEl?.toggleClass("on", name === "month");
	}

	/** 1 秒ごと: 状態ピル・一時停止ボタン・errbar・経過分秒・AFK/一時停止サブ行を更新する（I/O なし）。 */
	private updateLive(): void {
		const state = this.host.getState();
		this.contentEl.setAttr("data-state", state);
		if (this.pillLabelEl) this.pillLabelEl.setText(STATE_LABEL[state]);
		if (this.pauseBtnEl) this.pauseBtnEl.setText(state === "pause" ? "▶" : "⏸");
		if (this.errbarEl) this.errbarEl.style.display = state === "err" ? "block" : "none";

		const app = this.host.getCurrentApp();
		const start = this.host.getCurrentStart();
		if (this.nowAppEl) this.nowAppEl.setText(app ?? "—");
		if (this.nowDotEl) this.nowDotEl.style.background = app ? appColor(app) : "transparent";

		// 経過分秒は記録中（rec）のときだけ更新する。AFK/一時停止/エラー中は最後に
		// 表示していた値のまま止め、CSS の減光（opacity）だけで「止まっている」ことを示す。
		if (state === "rec" && app && start != null) {
			const elapsedMs = Date.now() - start;
			const wholeMin = Math.max(0, Math.floor(elapsedMs / 60000));
			const sec = Math.floor((elapsedMs % 60000) / 1000);
			this.nowMinEl?.setText(String(wholeMin));
			this.nowSecEl?.setText(`${String(sec).padStart(2, "0")}秒`);
		} else if (!app) {
			// 現在アプリが無い（モバイル／トラッカー未起動）: プレースホルダのまま。
			this.nowMinEl?.setText("—");
			this.nowSecEl?.setText("");
		}

		if (this.quickInputEl) {
			const enabled = !!app;
			this.quickInputEl.disabled = !enabled;
			this.quickInputEl.placeholder = enabled
				? "いま何してる？ Enterで記録"
				: "記録中のアプリがありません";
		}
	}

	/**
	 * データ更新: host.aggregateNow() で現行セッションを実体化してから当日ファイルを読み直し、
	 * 今日合計・合計バー・時系列レーン・未記入バッジを描き直す。
	 */
	private async refresh(): Promise<void> {
		await this.host.aggregateNow();
		this.currentDate = localDateStr(Date.now());
		const sessions = await readDay(this.host.app, this.host.dataFolder, this.currentDate);

		const app = this.host.getCurrentApp();
		this.liveSessionKey = app ? this.pickLatestKey(sessions, app) : null;

		this.updateTodayTotal(sessions);
		this.renderBars(sessions);
		this.renderLanes(sessions);
		this.updateBadge(sessions);
	}

	/** 非手動・app 一致の中で start が最大（＝最新）のセッションキーを返す（時系列の「live」表示用）。 */
	private pickLatestKey(sessions: Session[], app: string): string | null {
		let best: Session | null = null;
		for (const s of sessions) {
			if (s.manual || s.app !== app) continue;
			if (!best || toMin(s.start) > toMin(best.start)) best = s;
		}
		return best ? sessionKey(best) : null;
	}

	private updateTodayTotal(sessions: Session[]): void {
		const total = sessions.reduce((sum, s) => sum + (this.host.isHidden(s.app) ? 0 : durMin(s)), 0);
		this.todayTotalValEl?.setText(fmtDur(total));
	}

	private updateBadge(sessions: Session[]): void {
		if (!this.badgeEl) return;
		const count = sessions.filter((s) => !s.manual && !this.host.isHidden(s.app) && s.note.trim() === "").length;
		if (count > 0) {
			this.badgeEl.setText(`残り ${count}件`);
			this.badgeEl.style.display = "inline-flex";
		} else {
			this.badgeEl.setText("");
			this.badgeEl.style.display = "none";
		}
	}

	/** モックの renderBars 準拠: アプリ別合計バー。hidden 行は幅0・"—"・薄色、⋯/右クリックでコンテキストメニュー。 */
	private renderBars(sessions: Session[]): void {
		const bars = this.barsEl;
		if (!bars) return;
		bars.empty();

		const totals = new Map<string, number>();
		for (const s of sessions) {
			totals.set(s.app, (totals.get(s.app) ?? 0) + durMin(s));
		}
		const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
		if (sorted.length === 0) {
			bars.createDiv({ cls: "tm-empty", text: "まだ記録がありません" });
			return;
		}

		let visMax = 0;
		for (const [app, min] of sorted) {
			if (!this.host.isHidden(app) && min > visMax) visMax = min;
		}

		for (const [app, min] of sorted) {
			const hidden = this.host.isHidden(app);
			const row = bars.createDiv({ cls: hidden ? "bar-row hidden-app" : "bar-row" });
			row.createSpan({ cls: "nm", text: app });
			const track = row.createDiv({ cls: "track" });
			const fill = track.createDiv({ cls: "fill" });
			fill.style.width = hidden ? "0%" : `${visMax > 0 ? Math.max(3, (min / visMax) * 100) : 0}%`;
			fill.style.background = appColor(app);
			row.createSpan({ cls: "dur", text: hidden ? "—" : fmtDur(min) });
			const more = row.createEl("button", { cls: "more", text: "⋯" });
			more.setAttr("title", "クイック操作");
			more.addEventListener("click", (ev) => {
				ev.stopPropagation();
				this.openCtx(ev as MouseEvent, app);
			});
			row.addEventListener("contextmenu", (ev) => {
				ev.preventDefault();
				this.openCtx(ev as MouseEvent, app);
			});
		}
	}

	/** モックの renderLanes 準拠: アプリごとのレーンに時刻でセグメントを置く。 */
	private renderLanes(sessions: Session[]): void {
		const lanes = this.lanesEl;
		if (!lanes) return;
		lanes.empty();

		if (sessions.length === 0) {
			lanes.createDiv({ cls: "tm-empty", text: "まだ記録がありません" });
			return;
		}

		const visible = sessions.filter((s) => !this.host.isHidden(s.app));
		const base = visible.length > 0 ? visible : sessions;
		let lo = Math.min(...base.map((s) => toMin(s.start)));
		let hi = Math.max(...base.map((s) => toMin(s.end)));
		lo = Math.floor(lo / 60) * 60;
		hi = Math.ceil(hi / 60) * 60;
		if (hi <= lo) hi = lo + 60;
		const span = hi - lo;

		const hoursEl = lanes.createDiv({ cls: "lane-hours" });
		const step = span > 480 ? 120 : 60;
		for (let m = lo; m <= hi; m += step) {
			hoursEl.createSpan({ text: `${Math.floor(m / 60)}時` });
		}

		const totals = new Map<string, number>();
		for (const s of visible) totals.set(s.app, (totals.get(s.app) ?? 0) + durMin(s));
		const apps = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a);

		if (apps.length === 0) {
			lanes.createDiv({ cls: "tm-empty", text: "表示中のアプリがありません" });
			return;
		}

		for (const app of apps) {
			const row = lanes.createDiv({ cls: "lane-row" });
			const nm = row.createSpan({ cls: "nm", text: app });
			nm.setAttr("title", app);
			const lane = row.createDiv({ cls: "lane" });
			for (let m = lo + 60; m < hi; m += 60) {
				const tick = lane.createDiv({ cls: "tick" });
				tick.style.left = `${((m - lo) / span) * 100}%`;
			}
			for (const s of visible) {
				if (s.app !== app) continue;
				const isLive = sessionKey(s) === this.liveSessionKey;
				const hasNote = s.note.trim().length > 0;
				const startMin = toMin(s.start);
				const endMin = toMin(s.end);
				const cls = ["seg"];
				if (hasNote) cls.push("note");
				if (isLive) cls.push("live");
				const seg = lane.createDiv({ cls: cls.join(" ") });
				seg.style.left = `${((startMin - lo) / span) * 100}%`;
				seg.style.width = `${Math.max(0.6, ((endMin - startMin) / span) * 100)}%`;
				seg.style.background = appColor(app);
				this.attachTip(seg, s, isLive);
				// 穴埋め: note が空の非手動セグメントはクリックで簡易入力を開く。
				if (!s.manual && !hasNote) {
					seg.addClass("fillable");
					seg.setAttr("title", "クリックで説明を追記");
					seg.addEventListener("click", (ev) => {
						ev.stopPropagation();
						this.openFillIn(s);
					});
				}
			}
		}
	}

	/** モックの attachTip 準拠: セグメントに hover で詳細ツールチップを出す。 */
	private attachTip(seg: HTMLElement, s: Session, isLive: boolean): void {
		const tip = this.tipEl;
		const root = this.contentEl;
		if (!tip) return;
		seg.addEventListener("mouseenter", () => {
			tip.empty();
			tip.createEl("b", { text: s.app + (isLive ? "（記録中）" : "") });
			const rng = tip.createDiv({ cls: "rng" });
			rng.setText(`${s.start} – ${isLive ? "現在" : s.end}（${fmtDur(durMin(s))}）`);
			if (s.title) tip.createDiv({ cls: "ttl", text: s.title });
			if (s.note) tip.createDiv({ cls: "nt", text: s.note });
			tip.style.display = "block";
			const segR = seg.getBoundingClientRect();
			const rootR = root.getBoundingClientRect();
			let x = segR.left - rootR.left + segR.width / 2 - tip.offsetWidth / 2;
			x = Math.max(8, Math.min(x, rootR.width - tip.offsetWidth - 8));
			tip.style.left = `${x}px`;
			tip.style.top = `${segR.top - rootR.top - tip.offsetHeight - 8}px`;
		});
		seg.addEventListener("mouseleave", () => {
			tip.style.display = "none";
		});
	}

	/** モックの openCtx 準拠: ⋯/右クリックでコンテキストメニューを開く。 */
	private openCtx(ev: MouseEvent, app: string): void {
		const ctx = this.ctxmenuEl;
		const root = this.contentEl;
		if (!ctx) return;
		this.ctxApp = app;
		const hidden = this.host.isHidden(app);
		this.ctxHideBtn?.setText(hidden ? `👁 「${app}」を再表示する` : `👁 「${app}」を非表示にする`);
		const capture = this.host.getCaptureTitle(app);
		this.ctxCaptureBtn?.setText(capture ? "🏷 タイトル取込を OFF にする" : "🏷 タイトル取込を ON にする");
		ctx.addClass("open");
		const rootR = root.getBoundingClientRect();
		const x = Math.max(4, Math.min(ev.clientX - rootR.left, rootR.width - 210));
		const y = Math.max(4, Math.min(ev.clientY - rootR.top, rootR.height - 140));
		ctx.style.left = `${x}px`;
		ctx.style.top = `${y}px`;
	}

	/** note が空のセグメントをクリックしたときの簡易入力（QuickLogModal 流用）。 */
	private openFillIn(session: Session): void {
		const label = `${session.app} ${session.start}–${session.end}`;
		new QuickLogModal(this.host.app, `${label} の説明を追記`, "何をしていましたか", (text) => {
			const trimmed = text.trim();
			if (!trimmed) return; // 空入力はキャンセル扱い（既存 note を空で消さない）
			void (async () => {
				await this.host.setSegmentNote(this.currentDate, sessionKey(session), trimmed);
				await this.refresh();
				new Notice("メモを記録しました");
			})();
		}).open();
	}
}
