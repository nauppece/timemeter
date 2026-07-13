// 右サイドバーのビュー（レイアウトA・「今日」「日別」「月」タブ本実装）。
// UIモック（タイムメーター - UIモック.html の .ob .sb-* 一式）の見た目・挙動を踏襲する。

import { type App, ItemView, Notice, setIcon, type WorkspaceLeaf } from "obsidian";
import { localDateStr } from "./aggregator";
import { appColor } from "./appcolor";
import { dowHeaders, hourLabel, monthTitle, t, weekdayLabel } from "./i18n";
import {
	centerAnchoredScrollLeft,
	laneRange,
	segPos,
	tickStepMin,
} from "./lane-geometry";
import { type ModalPicker, QuickLogModal } from "./quicklog-modal";
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
	appendDailyDone(date: string, app: string, text: string): Promise<void>;
	appendToFile(path: string, app: string, text: string): Promise<void>;
	dailyPath(date: string): string;
	isHidden(app: string): boolean;
	toggleHidden(app: string): void;
}

/** 追記先ドロップダウンで「デイリー」を表す特別値（実ファイルパスと衝突しない）。 */
const TARGET_DAILY = "__daily__";
/** 追記先ピッカーで「このセッションの説明列（データファイル）」を表す特別値。 */
const TARGET_SESSION = "__session__";

/** 状態ラベルを現在言語で返す。 */
function stateLabel(state: TrackerState): string {
	return t(`state.${state}`);
}

/** ズーム段階（1x〜4x）。時系列レーンの横方向拡大に使う。 */
const ZOOM_LEVELS = [1, 2, 3, 4];

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" を UTC 解釈させず、常にローカル日付として Date にする（TZ ズレ回避）。 */
function parseLocalDate(dateStr: string): Date {
	const [y, m, d] = dateStr.split("-").map(Number);
	return new Date(y, m - 1, d);
}

/** dateStr の delta 日後（負なら前）を "YYYY-MM-DD" で返す。 */
function addDays(dateStr: string, delta: number): string {
	const d = parseLocalDate(dateStr);
	d.setDate(d.getDate() + delta);
	return localDateStr(d.getTime());
}

/** "YYYY-MM-DD (Wed)" 形式のラベル（曜日は現在言語）。 */
function dayLabel(dateStr: string): string {
	const d = parseLocalDate(dateStr);
	return `${dateStr} (${weekdayLabel(d.getDay())})`;
}

type SubtabName = "bars" | "lanes";
type TabName = "today" | "day" | "month";

/** renderLanes に渡す表示コンテキスト（日別/今日で異なる date・ライブ強調・保存後コールバック・ズーム状態を渡す）。 */
interface LanesOpts {
	date: string;
	liveKey: string | null;
	allowFillIn: boolean;
	onSaved: () => Promise<void>;
	emptyMessage?: string;
	getZoom: () => number;
	setZoom: (z: number) => void;
}

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

	// ── 日別 view
	private dayPrevBtn: HTMLButtonElement | null = null;
	private dayNextBtn: HTMLButtonElement | null = null;
	private dayLabelEl: HTMLElement | null = null;
	private dayTotalValEl: HTMLElement | null = null;
	private daySubtabBarsBtn: HTMLButtonElement | null = null;
	private daySubtabLanesBtn: HTMLButtonElement | null = null;
	private dayBarsEl: HTMLElement | null = null;
	private dayLanesEl: HTMLElement | null = null;
	private dayActiveSubtab: SubtabName = "bars";
	private dayViewDate: string = localDateStr(Date.now() - 24 * 60 * 60 * 1000);

	// ── 月 view
	private monthTitleEl: HTMLElement | null = null;
	private monthGridEl: HTMLElement | null = null;
	private monthLg1El: HTMLElement | null = null;
	private monthLg2El: HTMLElement | null = null;
	private monthLg3El: HTMLElement | null = null;

	// ── コンテキストメニュー・ツールチップ
	private ctxmenuEl: HTMLElement | null = null;
	private ctxHideBtn: HTMLButtonElement | null = null;
	private ctxHideIconEl: HTMLElement | null = null;
	private ctxHideLabelEl: HTMLElement | null = null;
	private ctxSettingsBtn: HTMLButtonElement | null = null;
	private ctxApp: string | null = null;
	private tipEl: HTMLElement | null = null;

	// ── 状態
	private currentDate = "";
	private liveSessionKey: string | null = null;

	// ── 時系列ズーム（今日/日別で独立・セッション内のみ保持。開き直すと 1x）
	private zoom = 1;
	private dayZoom = 1;

	constructor(leaf: WorkspaceLeaf, host: TimemeterHost) {
		super(leaf);
		this.host = host;
	}

	getViewType(): string {
		return VIEW_TYPE_TIMEMETER;
	}

	getDisplayText(): string {
		return t("app.name");
	}

	/** 言語変更時に DOM を現在言語で作り直す（onOpen 登録のインターバルはそのまま流用）。 */
	rebuild(): void {
		this.build();
		this.updateLive();
		void this.refresh();
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
		this.pillLabelEl = pill.createSpan({ text: stateLabel("rec") });
		head.createDiv({ cls: "spacer" });
		this.pauseBtnEl = head.createEl("button", { cls: "iconbtn" });
		setIcon(this.pauseBtnEl, "pause");
		this.pauseBtnEl.setAttr("aria-label", t("head.pauseResume"));
		this.pauseBtnEl.addEventListener("click", () => this.host.togglePause());
		const settingsBtn = head.createEl("button", { cls: "iconbtn" });
		setIcon(settingsBtn, "settings");
		settingsBtn.setAttr("aria-label", t("head.settings"));
		settingsBtn.addEventListener("click", () => this.host.openSettings());

		// ── errbar: 権限エラー時のみ表示
		this.errbarEl = root.createDiv({ cls: "errbar" });
		setIcon(this.errbarEl.createSpan({ cls: "err-ic" }), "alert-triangle");
		this.errbarEl.appendText(` ${t("err.noPermission")} `);
		const errLink = this.errbarEl.createEl("a", { text: t("err.howToSetUp") });
		errLink.addEventListener("click", () => this.host.openSettings());
		this.errbarEl.style.display = "none";

		const body = root.createDiv({ cls: "sb-body" });

		// ── view-today
		this.viewTodayEl = body.createDiv({ cls: "view on" });
		this.buildTodayView(this.viewTodayEl);

		// ── view-day / view-month
		this.viewDayEl = body.createDiv({ cls: "view" });
		this.buildDayView(this.viewDayEl);
		this.viewMonthEl = body.createDiv({ cls: "view" });
		this.buildMonthView(this.viewMonthEl);

		// ── sb-tabs
		const tabs = root.createDiv({ cls: "sb-tabs" });
		this.todayTabBtn = tabs.createEl("button", { cls: "on", text: t("tab.today") });
		this.dayTabBtn = tabs.createEl("button", { text: t("tab.day") });
		this.monthTabBtn = tabs.createEl("button", { text: t("tab.month") });
		this.todayTabBtn.addEventListener("click", () => this.selectTab("today"));
		this.dayTabBtn.addEventListener("click", () => this.selectTab("day"));
		this.monthTabBtn.addEventListener("click", () => this.selectTab("month"));

		// ── コンテキストメニュー・ツールチップ（root 直下に置き、絶対配置の基準を root にする）
		this.ctxmenuEl = root.createDiv({ cls: "ctxmenu" });
		this.ctxHideBtn = this.ctxmenuEl.createEl("button", { cls: "ctxitem" });
		this.ctxHideIconEl = this.ctxHideBtn.createSpan({ cls: "ctx-ic" });
		this.ctxHideLabelEl = this.ctxHideBtn.createSpan();
		this.ctxmenuEl.createDiv({ cls: "sep" });
		this.ctxSettingsBtn = this.ctxmenuEl.createEl("button", { cls: "ctxitem" });
		setIcon(this.ctxSettingsBtn.createSpan({ cls: "ctx-ic" }), "settings");
		this.ctxSettingsBtn.createSpan({ text: t("ctx.manageInSettings") });
		this.ctxHideBtn.addEventListener("click", () => {
			if (this.ctxApp) this.host.toggleHidden(this.ctxApp);
			this.ctxmenuEl?.removeClass("open");
			this.refreshActive();
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
		live.createDiv({ cls: "now-label", text: t("live.now") });
		const nowApp = live.createDiv({ cls: "now-app" });
		this.nowDotEl = nowApp.createSpan({ cls: "appdot" });
		this.nowAppEl = nowApp.createEl("b", { text: t("common.dash") });
		const nowElapsed = live.createDiv({ cls: "now-elapsed" });
		this.nowMinEl = nowElapsed.createSpan({ text: t("common.dash") });
		nowElapsed.createEl("small", { text: t("live.min") });
		this.nowSecEl = nowElapsed.createEl("small", { cls: "now-sec" });
		this.nowSubAfkEl = live.createDiv({ cls: "now-sub afk", text: t("live.idle") });
		this.nowSubPauseEl = live.createDiv({ cls: "now-sub pause", text: t("live.paused") });
		const total = live.createDiv({ cls: "today-total" });
		total.createSpan({ cls: "lbl", text: t("live.todayTotal") });
		this.todayTotalValEl = total.createSpan({ cls: "val", text: "0m" });

		this.quickInputEl = live.createEl("input", { cls: "quick-input", type: "text" });
		this.quickInputEl.placeholder = t("live.quickPlaceholder");
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
				new Notice(t("notice.noteSaved"));
			})();
		});

		container.createEl("hr", { cls: "rule" });

		// ── サブタブ（合計/時系列）＋ 未記入バッジ
		const subtabsRow = container.createDiv({ cls: "subtabs-row" });
		const subtabs = subtabsRow.createDiv({ cls: "subtabs" });
		this.subtabBarsBtn = subtabs.createEl("button", { cls: "on", text: t("subtab.bars") });
		this.subtabLanesBtn = subtabs.createEl("button", { text: t("subtab.lanes") });
		this.subtabBarsBtn.addEventListener("click", () => this.selectSubtab("bars"));
		this.subtabLanesBtn.addEventListener("click", () => this.selectSubtab("lanes"));
		this.badgeEl = subtabsRow.createSpan({ cls: "fillin-badge" });
		this.badgeEl.style.display = "none";

		this.barsEl = container.createDiv({ cls: "bars subview on" });
		this.lanesEl = container.createDiv({ cls: "lanes subview" });

		container.createDiv({
			cls: "tl-cap",
			text: t("tl.caption"),
		});
	}

	/**
	 * 追記先モーダルに渡すピッカー設定を作る。デイリー＋最近使ったファイル（最近開いた順）。
	 * withSessionNote=true のときは先頭に「このセッションの説明」（データファイルの説明列）を足し、
	 * それを既定選択にする（時系列セグメントからの入力用）。バー/セグメントのクリックごとに組み直す。
	 */
	private buildTargetPicker(date: string, withSessionNote = false): ModalPicker {
		const options: { value: string; label: string }[] = [];
		if (withSessionNote) options.push({ value: TARGET_SESSION, label: t("target.sessionNote") });
		options.push({ value: TARGET_DAILY, label: t("target.daily") });
		for (const path of this.recentMdFiles(this.host.dailyPath(date))) {
			const base = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
			options.push({ value: path, label: base });
		}
		return {
			label: t("target.label"),
			options,
			initial: withSessionNote ? TARGET_SESSION : TARGET_DAILY,
		};
	}

	/** 最近開いた .md ファイル（新しい順・存在するもの・デイリーは除外）を最大10件返す。 */
	private recentMdFiles(excludePath: string): string[] {
		const app = this.host.app;
		const out: string[] = [];
		for (const p of app.workspace.getLastOpenFiles()) {
			if (p === excludePath) continue;
			if (!p.toLowerCase().endsWith(".md")) continue;
			if (!app.vault.getFileByPath(p)) continue;
			out.push(p);
			if (out.length >= 10) break;
		}
		return out;
	}

	/** 「日別」タブの中身（◀/▶ ナビ・合計・合計/時系列サブタブ）を組み立てる。 */
	private buildDayView(container: HTMLElement): void {
		const nav = container.createDiv({ cls: "daynav" });
		this.dayPrevBtn = nav.createEl("button", { cls: "navbtn", text: "◀" });
		this.dayLabelEl = nav.createEl("b");
		this.dayNextBtn = nav.createEl("button", { cls: "navbtn", text: "▶" });
		this.dayPrevBtn.addEventListener("click", () => this.shiftDay(-1));
		this.dayNextBtn.addEventListener("click", () => this.shiftDay(1));

		const totalRow = container.createDiv({ cls: "day-total" });
		totalRow.appendText(t("day.totalPrefix"));
		this.dayTotalValEl = totalRow.createEl("b", { text: "0m" });

		container.createEl("hr", { cls: "rule" });

		const subtabs = container.createDiv({ cls: "subtabs" });
		this.daySubtabBarsBtn = subtabs.createEl("button", { cls: "on", text: t("subtab.bars") });
		this.daySubtabLanesBtn = subtabs.createEl("button", { text: t("subtab.lanes") });
		this.daySubtabBarsBtn.addEventListener("click", () => this.selectDaySubtab("bars"));
		this.daySubtabLanesBtn.addEventListener("click", () => this.selectDaySubtab("lanes"));

		this.dayBarsEl = container.createDiv({ cls: "bars subview on" });
		this.dayLanesEl = container.createDiv({ cls: "lanes subview" });
	}

	/** 「月」タブの中身（ヒートマップ・凡例）を組み立てる。 */
	private buildMonthView(container: HTMLElement): void {
		const month = container.createDiv({ cls: "month" });
		this.monthTitleEl = month.createDiv({ cls: "m-title" });
		this.monthGridEl = month.createDiv({ cls: "m-grid" });
		const legend = month.createDiv({ cls: "m-legend" });
		legend.appendText(`${t("month.legendLess")} `);
		legend.createEl("i", { attr: { style: "background:var(--background-modifier-border)" } });
		this.monthLg1El = legend.createEl("i");
		this.monthLg2El = legend.createEl("i");
		this.monthLg3El = legend.createEl("i");
		legend.appendText(` ${t("month.legendMore")}`);
	}

	private selectSubtab(which: SubtabName): void {
		this.activeSubtab = which;
		this.subtabBarsBtn?.toggleClass("on", which === "bars");
		this.subtabLanesBtn?.toggleClass("on", which === "lanes");
		this.barsEl?.toggleClass("on", which === "bars");
		this.lanesEl?.toggleClass("on", which === "lanes");
	}

	private selectDaySubtab(which: SubtabName): void {
		this.dayActiveSubtab = which;
		this.daySubtabBarsBtn?.toggleClass("on", which === "bars");
		this.daySubtabLanesBtn?.toggleClass("on", which === "lanes");
		this.dayBarsEl?.toggleClass("on", which === "bars");
		this.dayLanesEl?.toggleClass("on", which === "lanes");
	}

	/** タブ切替。日別/月は開いた時に初めてデータを読み込む（今日タブの20秒ポーリングでは読まない）。 */
	private selectTab(name: TabName): void {
		this.activeTab = name;
		this.todayTabBtn?.toggleClass("on", name === "today");
		this.dayTabBtn?.toggleClass("on", name === "day");
		this.monthTabBtn?.toggleClass("on", name === "month");
		this.viewTodayEl?.toggleClass("on", name === "today");
		this.viewDayEl?.toggleClass("on", name === "day");
		this.viewMonthEl?.toggleClass("on", name === "month");
		if (name === "day") void this.refreshDayView();
		if (name === "month") void this.refreshMonth();
	}

	/** コンテキストメニュー操作（非表示/タイトル取込トグル）の後、現在アクティブなタブだけを再描画する。
	 *  設定タブからのアプリ除外変更でも呼ばれる（refreshOpenViews 経由）。 */
	refreshActive(): void {
		if (this.activeTab === "today") void this.refresh();
		else if (this.activeTab === "day") void this.refreshDayView();
		else if (this.activeTab === "month") void this.refreshMonth();
	}

	/** 1 秒ごと: 状態ピル・一時停止ボタン・errbar・経過分秒・AFK/一時停止サブ行を更新する（I/O なし）。 */
	private updateLive(): void {
		const state = this.host.getState();
		this.contentEl.setAttr("data-state", state);
		if (this.pillLabelEl) this.pillLabelEl.setText(stateLabel(state));
		if (this.pauseBtnEl) setIcon(this.pauseBtnEl, state === "pause" ? "play" : "pause");
		if (this.errbarEl) this.errbarEl.style.display = state === "err" ? "block" : "none";

		const app = this.host.getCurrentApp();
		const start = this.host.getCurrentStart();
		if (this.nowAppEl) this.nowAppEl.setText(app ?? t("common.dash"));
		if (this.nowDotEl) this.nowDotEl.style.background = app ? appColor(app) : "transparent";

		// 経過分秒は記録中（rec）のときだけ更新する。AFK/一時停止/エラー中は最後に
		// 表示していた値のまま止め、CSS の減光（opacity）だけで「止まっている」ことを示す。
		if (state === "rec" && app && start != null) {
			const elapsedMs = Date.now() - start;
			const wholeMin = Math.max(0, Math.floor(elapsedMs / 60000));
			const sec = Math.floor((elapsedMs % 60000) / 1000);
			this.nowMinEl?.setText(String(wholeMin));
			this.nowSecEl?.setText(`${String(sec).padStart(2, "0")}${t("live.secSuffix")}`);
		} else if (!app) {
			// 現在アプリが無い（モバイル／トラッカー未起動）: プレースホルダのまま。
			this.nowMinEl?.setText(t("common.dash"));
			this.nowSecEl?.setText("");
		}

		if (this.quickInputEl) {
			const enabled = !!app;
			this.quickInputEl.disabled = !enabled;
			this.quickInputEl.placeholder = enabled
				? t("live.quickPlaceholder")
				: t("live.quickDisabled");
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
		this.renderBars(this.barsEl, sessions, t("bars.emptyToday"), this.currentDate);
		this.renderLanes(this.lanesEl, sessions, {
			date: this.currentDate,
			liveKey: this.liveSessionKey,
			allowFillIn: true,
			onSaved: () => this.refresh(),
			emptyMessage: t("lanes.emptyToday"),
			getZoom: () => this.zoom,
			setZoom: (z) => {
				this.zoom = z;
			},
		});
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

	/** ◀/▶: dayViewDate を ±1 日する。未来日（今日より後）へは進めない。 */
	private shiftDay(delta: number): void {
		const todayStr = localDateStr(Date.now());
		let candidate = addDays(this.dayViewDate, delta);
		if (candidate > todayStr) candidate = todayStr;
		this.dayViewDate = candidate;
		void this.refreshDayView();
	}

	/** 「日別」タブを開いた時／◀▶操作時に、その日のセッションを読み直して描画する。 */
	private async refreshDayView(): Promise<void> {
		const todayStr = localDateStr(Date.now());
		if (this.dayViewDate === todayStr) {
			// 今日を表示中なら、進行中のセッションを実体化してから読む（今日タブと同様に最新化）。
			await this.host.aggregateNow();
		}
		const sessions = await readDay(this.host.app, this.host.dataFolder, this.dayViewDate);

		if (this.dayLabelEl) this.dayLabelEl.setText(dayLabel(this.dayViewDate));
		if (this.dayNextBtn) this.dayNextBtn.disabled = this.dayViewDate >= todayStr;

		const total = sessions.reduce((sum, s) => sum + (this.host.isHidden(s.app) ? 0 : durMin(s)), 0);
		this.dayTotalValEl?.setText(fmtDur(total));

		const app = this.host.getCurrentApp();
		const liveKey = this.dayViewDate === todayStr && app ? this.pickLatestKey(sessions, app) : null;

		this.renderBars(this.dayBarsEl, sessions, t("bars.emptyDay"), this.dayViewDate);
		this.renderLanes(this.dayLanesEl, sessions, {
			date: this.dayViewDate,
			liveKey,
			allowFillIn: true,
			onSaved: () => this.refreshDayView(),
			emptyMessage: t("lanes.emptyDay"),
			getZoom: () => this.dayZoom,
			setZoom: (z) => {
				this.dayZoom = z;
			},
		});
	}

	/** 「月」タブを開いた時、今月の各日を readDay で読んで合計分のヒートマップを組み立てる。 */
	private async refreshMonth(): Promise<void> {
		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth() + 1; // 1-12
		const todayStr = localDateStr(Date.now());
		this.monthTitleEl?.setText(monthTitle(year, month));

		const daysInMonth = new Date(year, month, 0).getDate();
		const dateStrs: string[] = [];
		for (let d = 1; d <= daysInMonth; d++) {
			dateStrs.push(`${year}-${pad2(month)}-${pad2(d)}`);
		}

		const sessionsPerDay = await Promise.all(
			dateStrs.map((ds) =>
				readDay(this.host.app, this.host.dataFolder, ds).catch(() => [] as Session[]),
			),
		);
		const totals = sessionsPerDay.map((sess) =>
			sess.reduce((sum, s) => sum + (this.host.isHidden(s.app) ? 0 : durMin(s)), 0),
		);

		let maxTotal = 0;
		for (let i = 0; i < dateStrs.length; i++) {
			if (dateStrs[i] <= todayStr && totals[i] > maxTotal) maxTotal = totals[i];
		}

		this.renderMonthGrid(year, month, dateStrs, totals, maxTotal, todayStr);

		const heatColor = (pct: number): string =>
			`color-mix(in srgb, var(--interactive-accent) ${pct}%, var(--background-modifier-border))`;
		if (this.monthLg1El) this.monthLg1El.style.background = heatColor(30);
		if (this.monthLg2El) this.monthLg2El.style.background = heatColor(55);
		if (this.monthLg3El) this.monthLg3El.style.background = heatColor(80);
	}

	/** 月グリッドの中身（月曜始まりオフセット＋各日セル）を描く。 */
	private renderMonthGrid(
		year: number,
		month: number,
		dateStrs: string[],
		totals: number[],
		maxTotal: number,
		todayStr: string,
	): void {
		const grid = this.monthGridEl;
		if (!grid) return;
		grid.empty();

		for (const d of dowHeaders()) grid.createDiv({ cls: "dow", text: d });

		// 日曜=0 の getDay() を月曜始まりのオフセットに変換
		const firstDow = new Date(year, month - 1, 1).getDay();
		const offset = (firstDow + 6) % 7;
		for (let i = 0; i < offset; i++) grid.createDiv({ cls: "m-cell empty" });

		const levelPct = [30, 55, 80];
		for (let d = 1; d <= dateStrs.length; d++) {
			const ds = dateStrs[d - 1];
			const cell = grid.createDiv({ cls: "m-cell" });
			cell.setText(String(d));
			if (ds === todayStr) cell.addClass("today");

			if (ds > todayStr) {
				cell.addClass("future");
				continue;
			}

			const total = totals[d - 1];
			let level = 0;
			if (total > 0 && maxTotal > 0) {
				const pct = total / maxTotal;
				level = pct <= 1 / 3 ? 1 : pct <= 2 / 3 ? 2 : 3;
			}
			if (level > 0) {
				cell.style.background = `color-mix(in srgb, var(--interactive-accent) ${levelPct[level - 1]}%, var(--background-modifier-border))`;
			}
			cell.setAttr("title", `${ds} — ${total > 0 ? fmtDur(total) : t("common.noRecords")}`);
			cell.addEventListener("click", () => {
				this.dayViewDate = ds;
				this.selectTab("day");
			});
		}
	}

	private updateBadge(sessions: Session[]): void {
		if (!this.badgeEl) return;
		// 離席（away）は無操作時間なので説明を促さない（バッジのカウントから除外）。
		const count = sessions.filter(
			(s) => !s.manual && !s.away && !this.host.isHidden(s.app) && s.note.trim() === "",
		).length;
		if (count > 0) {
			this.badgeEl.setText(t("badge.left", { n: count }));
			this.badgeEl.style.display = "inline-flex";
		} else {
			this.badgeEl.setText("");
			this.badgeEl.style.display = "none";
		}
	}

	/** アプリ別合計バー。除外（hidden）アプリは行ごと描画しない（時系列・合計から完全に消す）。
	 *  行クリックで「デイリーに追記」モーダル、⋯/右クリックでコンテキストメニュー。
	 *  今日/日別タブ共通で使う（container・追記先の date を呼び出し側から渡す）。 */
	private renderBars(
		bars: HTMLElement | null,
		sessions: Session[],
		emptyMessage = t("bars.emptyToday"),
		date = "",
	): void {
		if (!bars) return;
		bars.empty();

		const totals = new Map<string, number>();
		for (const s of sessions) {
			if (this.host.isHidden(s.app)) continue; // 除外アプリは合計に含めない・行も出さない
			totals.set(s.app, (totals.get(s.app) ?? 0) + durMin(s));
		}
		const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
		if (sorted.length === 0) {
			bars.createDiv({ cls: "tm-empty", text: emptyMessage });
			return;
		}

		const visMax = sorted[0][1]; // 降順なので先頭が最大

		for (const [app, min] of sorted) {
			const row = bars.createDiv({ cls: "bar-row clickable" });
			if (date) {
				row.setAttr("title", t("bars.addToDaily"));
				row.addEventListener("click", () => this.openBarAdd(app, date));
			}
			row.createSpan({ cls: "nm", text: app });
			const track = row.createDiv({ cls: "track" });
			const fill = track.createDiv({ cls: "fill" });
			fill.style.width = `${visMax > 0 ? Math.max(3, (min / visMax) * 100) : 0}%`;
			fill.style.background = appColor(app);
			row.createSpan({ cls: "dur", text: fmtDur(min) });
			const more = row.createEl("button", { cls: "more" });
			setIcon(more, "more-horizontal");
			more.setAttr("title", t("bars.more"));
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

	/** アプリごとのレーンに時刻でセグメントを置く。段階ズーム（＋/−）＋横スクロールに対応。
	 *  内側 `.lane-scroll-inner` の幅を zoom 倍にし、既存の left%/width% 計算はそのまま流用する。
	 *  アプリ名列（nm）は sticky で左に固定。今日/日別タブ共通（zoom 状態は opts 経由で各タブ独立）。 */
	private renderLanes(lanes: HTMLElement | null, sessions: Session[], opts: LanesOpts): void {
		if (!lanes) return;
		lanes.empty();

		if (sessions.length === 0) {
			lanes.createDiv({ cls: "tm-empty", text: opts.emptyMessage ?? t("lanes.emptyToday") });
			return;
		}

		const visible = sessions.filter((s) => !this.host.isHidden(s.app));
		const totals = new Map<string, number>();
		for (const s of visible) totals.set(s.app, (totals.get(s.app) ?? 0) + durMin(s));
		const apps = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a);

		if (apps.length === 0) {
			lanes.createDiv({ cls: "tm-empty", text: t("lanes.noVisibleApps") });
			return;
		}

		const { lo, hi, span } = laneRange(visible);

		// 表示中のズーム段階（保存値が段階外なら 1x に丸める）。
		const zoom = ZOOM_LEVELS.includes(opts.getZoom()) ? opts.getZoom() : 1;
		const idx = ZOOM_LEVELS.indexOf(zoom);

		// ── ズームバー（− / {z}x / +）
		const zoombar = lanes.createDiv({ cls: "lane-zoombar" });
		const zoutBtn = zoombar.createEl("button", { cls: "zbtn", text: "−" });
		zoutBtn.setAttr("aria-label", t("lanes.zoomOut"));
		zoombar.createSpan({ cls: "zlabel", text: `${zoom}x` });
		const zinBtn = zoombar.createEl("button", { cls: "zbtn", text: "+" });
		zinBtn.setAttr("aria-label", t("lanes.zoomIn"));
		zoutBtn.disabled = idx <= 0;
		zinBtn.disabled = idx >= ZOOM_LEVELS.length - 1;

		// ── 横スクロールコンテナ（内側を zoom 倍幅にしてはみ出しをスクロールで見る）
		const scrollEl = lanes.createDiv({ cls: "lane-scroll" });
		const inner = scrollEl.createDiv({ cls: "lane-scroll-inner" });
		inner.style.width = `${zoom * 100}%`;

		// ズーム変更: 再描画前後で中央の時刻を保つよう scrollLeft を引き継ぐ。
		const applyZoom = (nextZoom: number) => {
			const viewportW = scrollEl.clientWidth;
			const prevScrollLeft = scrollEl.scrollLeft;
			const prevInnerW = inner.scrollWidth;
			opts.setZoom(nextZoom);
			this.renderLanes(lanes, sessions, opts);
			const newScroll = lanes.querySelector<HTMLElement>(".lane-scroll");
			const newInner = newScroll?.querySelector<HTMLElement>(".lane-scroll-inner");
			if (newScroll && newInner) {
				newScroll.scrollLeft = centerAnchoredScrollLeft(
					prevScrollLeft,
					prevInnerW,
					newInner.scrollWidth,
					viewportW,
				);
			}
		};
		zoutBtn.addEventListener("click", () => {
			if (idx > 0) applyZoom(ZOOM_LEVELS[idx - 1]);
		});
		zinBtn.addEventListener("click", () => {
			if (idx < ZOOM_LEVELS.length - 1) applyZoom(ZOOM_LEVELS[idx + 1]);
		});
		this.attachDragPan(scrollEl);

		const step = tickStepMin(span, zoom);
		const hourText = (m: number): string => {
			const h = Math.floor(m / 60);
			const mm = m % 60;
			return mm === 0 && step >= 60 ? hourLabel(h) : `${h}:${pad2(mm)}`;
		};

		// ── 時刻ヘッダー（nm 幅ぶんの spacer ＋ 絶対配置ラベル。レーンと同じ flex:1 で整列）
		const hoursEl = inner.createDiv({ cls: "lane-hours" });
		hoursEl.createDiv({ cls: "lane-hours-spacer" });
		const hoursTrack = hoursEl.createDiv({ cls: "lane-hours-track" });
		for (let m = lo; m <= hi; m += step) {
			const lab = hoursTrack.createSpan({ cls: "hlabel", text: hourText(m) });
			lab.style.left = `${((m - lo) / span) * 100}%`;
			if (m + step > hi) lab.style.transform = "translateX(-100%)"; // 右端ラベルは内側に寄せる
		}

		for (const app of apps) {
			const row = inner.createDiv({ cls: "lane-row" });
			const nm = row.createSpan({ cls: "nm", text: app });
			nm.setAttr("title", app);
			const lane = row.createDiv({ cls: "lane" });
			for (let m = lo + step; m < hi; m += step) {
				const tick = lane.createDiv({ cls: "tick" });
				tick.style.left = `${((m - lo) / span) * 100}%`;
			}
			for (const s of visible) {
				if (s.app !== app) continue;
				const isLive = sessionKey(s) === opts.liveKey;
				const hasNote = s.note.trim().length > 0;
				const { leftPct, widthPct } = segPos(toMin(s.start), toMin(s.end), lo, span);
				const cls = ["seg"];
				if (hasNote) cls.push("note");
				if (isLive) cls.push("live");
				if (s.away) cls.push("away"); // 離席（AFK検知ON）は薄色で表示
				const seg = lane.createDiv({ cls: cls.join(" ") });
				seg.style.left = `${leftPct}%`;
				seg.style.width = `${widthPct}%`;
				seg.style.background = appColor(app);
				this.attachTip(seg, s, isLive);
				// 穴埋め: note が空の非手動・非離席セグメントはクリックで簡易入力を開く（許可時のみ）。
				if (opts.allowFillIn && !s.manual && !s.away && !hasNote) {
					seg.addClass("fillable");
					seg.setAttr("title", t("lanes.clickToNote"));
					seg.addEventListener("click", (ev) => {
						ev.stopPropagation();
						this.openFillIn(s, opts.date, opts.onSaved);
					});
				}
			}
		}
	}

	/**
	 * 時系列スクローラのドラッグでのパン（横移動）。セグメント上の pointerdown は無視して
	 * 穴埋めクリックを優先する。4px 以上動いて初めてパン扱いにする（クリックと区別）。
	 * ハンドラは毎回作り直す scrollEl に付けるので、再描画で古いものは GC される（蓄積しない）。
	 */
	private attachDragPan(scrollEl: HTMLElement): void {
		let down = false;
		let moved = false;
		let startX = 0;
		let startScroll = 0;
		scrollEl.addEventListener("pointerdown", (ev) => {
			if (ev.button !== 0) return;
			if ((ev.target as HTMLElement).closest(".seg")) return; // セグメントはクリック優先
			down = true;
			moved = false;
			startX = ev.clientX;
			startScroll = scrollEl.scrollLeft;
			scrollEl.setPointerCapture(ev.pointerId);
		});
		scrollEl.addEventListener("pointermove", (ev) => {
			if (!down) return;
			const dx = ev.clientX - startX;
			if (!moved && Math.abs(dx) < 4) return;
			moved = true;
			scrollEl.addClass("grabbing");
			scrollEl.scrollLeft = startScroll - dx;
		});
		const end = (ev: PointerEvent) => {
			if (!down) return;
			down = false;
			scrollEl.removeClass("grabbing");
			try {
				scrollEl.releasePointerCapture(ev.pointerId);
			} catch {
				/* capture 済みでない場合は無視 */
			}
		};
		scrollEl.addEventListener("pointerup", end);
		scrollEl.addEventListener("pointercancel", end);
	}

	/** モックの attachTip 準拠: セグメントに hover で詳細ツールチップを出す。 */
	private attachTip(seg: HTMLElement, s: Session, isLive: boolean): void {
		const tip = this.tipEl;
		const root = this.contentEl;
		if (!tip) return;
		seg.addEventListener("mouseenter", () => {
			tip.empty();
			tip.createEl("b", { text: s.app + (isLive ? t("tip.recording") : "") });
			const rng = tip.createDiv({ cls: "rng" });
			const awaySuffix = s.away ? ` · ${t("tip.away")}` : "";
			rng.setText(`${s.start} – ${isLive ? t("tip.now") : s.end} (${fmtDur(durMin(s))})${awaySuffix}`);
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
		if (this.ctxHideIconEl) setIcon(this.ctxHideIconEl, hidden ? "eye" : "eye-off");
		this.ctxHideLabelEl?.setText(hidden ? t("ctx.show", { app }) : t("ctx.hide", { app }));
		ctx.addClass("open");
		const rootR = root.getBoundingClientRect();
		const x = Math.max(4, Math.min(ev.clientX - rootR.left, rootR.width - 210));
		const y = Math.max(4, Math.min(ev.clientY - rootR.top, rootR.height - 140));
		ctx.style.left = `${x}px`;
		ctx.style.top = `${y}px`;
	}

	/**
	 * 合計バーのクリックから、そのアプリで何をしたかを入力し、モーダル内の「追記先」セレクトで
	 * 選んだファイル（デイリー or 最近使ったファイル）に追記するモーダルを開く。
	 */
	private openBarAdd(app: string, date: string): void {
		new QuickLogModal(
			this.host.app,
			t("modal.dailyTitle", { app }),
			t("modal.dailyPlaceholder"),
			(text, target) => {
				const trimmed = text.trim();
				if (!trimmed) return; // 空入力はキャンセル扱い
				if (target === TARGET_DAILY) void this.host.appendDailyDone(date, app, trimmed);
				else void this.host.appendToFile(target, app, trimmed);
			},
			t("modal.add"),
			this.buildTargetPicker(date),
		).open();
	}

	/**
	 * note が空のセグメントをクリックしたときの簡易入力（QuickLogModal 流用）。今日/日別タブ共通。
	 * 追記先ピッカーで「このセッションの説明（既定）／デイリー／最近使ったファイル」を選べる。
	 */
	private openFillIn(session: Session, date: string, onSaved: () => Promise<void>): void {
		const app = session.app;
		const label = `${app} ${session.start}–${session.end}`;
		new QuickLogModal(
			this.host.app,
			t("modal.fillInTitle", { label }),
			t("modal.whatWereDoing"),
			(text, target) => {
				const trimmed = text.trim();
				if (!trimmed) return; // 空入力はキャンセル扱い（既存 note を空で消さない）
				void (async () => {
					if (target === TARGET_SESSION) {
						await this.host.setSegmentNote(date, sessionKey(session), trimmed);
						await onSaved();
						new Notice(t("notice.noteSaved"));
					} else if (target === TARGET_DAILY) {
						await this.host.appendDailyDone(date, app, trimmed);
					} else {
						await this.host.appendToFile(target, app, trimmed);
					}
				})();
			},
			t("modal.save"),
			this.buildTargetPicker(date, true),
		).open();
	}
}
