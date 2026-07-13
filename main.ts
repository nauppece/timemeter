import { Notice, Platform, Plugin, type WorkspaceLeaf, moment } from "obsidian";
import { aggregate, localDateStr } from "./src/aggregator";
import { insertTimemeterBlock } from "./src/daily-embed";
import { appendLineAtEnd, appendToDoneSection } from "./src/daily-log";
import { type EmbedHost, parseEmbedDate, renderEmbed } from "./src/embed";
import { setLang, t } from "./src/i18n";
import { buildNippou, insertNippouCallout } from "./src/nippou";
import { appendManual, defaultManualStart, setNote } from "./src/quicklog";
import { QuickLogModal } from "./src/quicklog-modal";
import { TimemeterSettingTab } from "./src/settings";
import { renderStatusBarText } from "./src/statusbar";
import { readDay, writeDay } from "./src/store";
import { Tracker, type TrackerState } from "./src/tracker";
import {
	type AppRule,
	DEFAULT_SETTINGS,
	durMin,
	type Poll,
	sessionKey,
	type Session,
	type TimemeterSettings,
	toMin,
} from "./src/types";
import { TimemeterView, VIEW_TYPE_TIMEMETER, type TimemeterHost } from "./src/view-sidebar";

const DAILY_FOLDER = "デイリー";
const STATUS_BAR_LIVE_INTERVAL_MS = 1000;
const STATUS_BAR_TOTAL_INTERVAL_MS = 10 * 1000;

const AGGREGATE_INTERVAL_MS = 60 * 1000;

/** 今日のローカル日付を "YYYY-MM-DD" にする（aggregator の localDateStr と同じ定義を再利用） */
function todayStr(): string {
	return localDateStr(Date.now());
}

/** 現在時刻のローカル "HH:MM" */
function nowHmStr(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 当日セッションのうち「非手動・app一致」の中で start が最大（＝最新）のものを
 * 現行セッションとして選ぶ。noteCurrentSession（事前チェック）と setCurrentNote（書き込み）
 * の両方で使う共通ヘルパー（DRY化）。
 */
function pickCurrentTarget(list: Session[], app: string): Session | undefined {
	return [...list]
		.filter((s) => !s.manual && s.app === app)
		.sort((a, b) => toMin(a.start) - toMin(b.start))
		.pop();
}

export default class TimeMeterPlugin extends Plugin {
	settings: TimemeterSettings = DEFAULT_SETTINGS;
	tracker: Tracker | null = null;
	trackerState: TrackerState = "rec";
	polls: Poll[] = [];
	laps: number[] = [];
	aggregating = false;
	statusBarEl: HTMLElement | null = null;
	private todayTotalMin = 0;

	/**
	 * poll 経路の共通ハンドラ（onload / restartTracker で共有し、ロジックの重複を避ける）。
	 * 未知アプリは既定ルール（表示）で自動登録する。hidden はここでは使わない
	 * （poll は常にバッファする。表示側の反映は別タスク）。
	 */
	private handlePoll = (p: Poll) => {
		if (!this.settings.apps[p.app]) {
			this.settings.apps[p.app] = { hidden: false };
			void this.saveSettings();
		}
		this.polls.push(p);
	};

	async onload() {
		await this.loadSettings();
		setLang(this.settings.lang); // 以降のコマンド名・UI 文言は設定言語で組み立てる
		// 前回セッション中に貯まった laps のうち、当日分以外は起動時に捨てる。
		const today0 = todayStr();
		this.laps = this.laps.filter((l) => localDateStr(l) === today0);

		// 右サイドバーのビューを登録し、リボンアイコン／コマンドから開けるようにする。
		const plugin = this;
		const host: TimemeterHost = {
			app: this.app,
			get dataFolder() {
				return plugin.settings.dataFolder;
			},
			getState: () => plugin.trackerState,
			getCurrentApp: () => plugin.tracker?.currentApp ?? null,
			getCurrentStart: () => plugin.tracker?.currentStart ?? null,
			aggregateNow: () => plugin.aggregateNow(),
			togglePause: () => plugin.togglePause(),
			openSettings: () => plugin.openSettings(),
			setCurrentNote: (text) => plugin.setCurrentNote(text),
			setSegmentNote: (date, key, text) => plugin.setSegmentNote(date, key, text),
			appendDailyDone: (date, app, text) => plugin.appendDailyDone(date, app, text),
			appendToFile: (path, app, text) => plugin.appendToFile(path, app, text),
			dailyPath: (date) => plugin.dailyPathForDate(date),
			isHidden: (app) => plugin.isHidden(app),
			toggleHidden: (app) => plugin.toggleHidden(app),
		};
		this.registerView(VIEW_TYPE_TIMEMETER, (leaf) => new TimemeterView(leaf, host));

		this.addSettingTab(new TimemeterSettingTab(this.app, this));

		this.addRibbonIcon("hourglass", t("ribbon.tooltip"), () => {
			void this.activateView();
		});

		this.addCommand({
			id: "timemeter-open-view",
			name: t("cmd.openView"),
			callback: () => {
				void this.activateView();
			},
		});

		if (this.settings.showSidebarOnStart) {
			this.app.workspace.onLayoutReady(() => {
				void this.activateView();
			});
		}

		if (Platform.isDesktopApp) {
			this.tracker = new Tracker(
				this.settings.pollIntervalSec,
				this.settings.afkThresholdSec,
				this.settings.afkDetect,
				this.settings.captureAllApps,
				this.handlePoll,
				(s: TrackerState) => {
					this.trackerState = s;
				},
			);
			this.tracker.start((id) => this.registerInterval(id));

			this.registerInterval(
				window.setInterval(() => {
					void this.aggregateNow();
				}, AGGREGATE_INTERVAL_MS),
			);

			// ステータスバー（デスクトップのみ）。表示可否は settings.showStatusBar に追随する
			// （非表示設定でも要素自体は残し display だけ切り替える。refreshStatusBar 参照）。
			this.statusBarEl = this.addStatusBarItem();
			this.statusBarEl.addClass("tm-statusbar");
			this.statusBarEl.setAttr("aria-label", t("statusbar.ariaOpen"));
			this.statusBarEl.addEventListener("click", () => {
				void this.activateView();
			});
			this.refreshStatusBar();
			this.updateStatusBarLive();
			void this.updateStatusBarTotal();
			this.registerInterval(
				window.setInterval(() => this.updateStatusBarLive(), STATUS_BAR_LIVE_INTERVAL_MS),
			);
			this.registerInterval(
				window.setInterval(() => void this.updateStatusBarTotal(), STATUS_BAR_TOTAL_INTERVAL_MS),
			);
		}

		// `timemeter` コードブロック（デイリー等への埋め込み）。読み取り専用・モバイルでも動く。
		const embedHost: EmbedHost = {
			app: this.app,
			get dataFolder() {
				return plugin.settings.dataFolder;
			},
			isHidden: (app) => plugin.isHidden(app),
		};
		this.registerMarkdownCodeBlockProcessor("timemeter", (source, el) => {
			const dateStr = parseEmbedDate(source, todayStr());
			return renderEmbed(el, embedHost, dateStr);
		});

		this.addCommand({
			id: "timemeter-insert-daily-embed",
			name: t("cmd.insertDailyEmbed"),
			callback: () => {
				void this.insertDailyEmbed();
			},
		});

		this.addCommand({
			id: "timemeter-aggregate-now",
			name: t("cmd.aggregateNow"),
			callback: () => {
				void this.aggregateNow();
			},
		});

		this.addCommand({
			id: "timemeter-insert-nippou-draft",
			name: t("cmd.insertNippou"),
			callback: () => {
				void this.insertNippouDraft();
			},
		});

		this.addCommand({
			id: "timemeter-copy-claude-prompt",
			name: t("cmd.copyClaudePrompt"),
			callback: () => {
				void this.copyClaudePrompt();
			},
		});

		// クイックログ（タップ記録）: 3コマンド。
		this.addCommand({
			id: "timemeter-note-current",
			name: t("cmd.noteCurrent"),
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "T" }],
			// デスクトップかつ現在追跡中のアプリがある時だけコマンドパレット/ホットキーに出す。
			checkCallback: (checking: boolean) => {
				if (!Platform.isDesktopApp || !this.tracker?.currentApp) return false;
				if (!checking) {
					void this.noteCurrentSession();
				}
				return true;
			},
		});

		this.addCommand({
			id: "timemeter-manual-log",
			name: t("cmd.manualLog"),
			// モバイルでも動く（デスクトップ限定ガードを付けない）。
			callback: () => {
				void this.addManualLog();
			},
		});

		this.addCommand({
			id: "timemeter-lap",
			name: t("cmd.lap"),
			checkCallback: (checking: boolean) => {
				if (!Platform.isDesktopApp) return false;
				if (!checking) {
					void this.recordLap();
				}
				return true;
			},
		});
	}

	/**
	 * ポーリング間隔・AFK しきい値など Tracker のコンストラクタ引数に関わる設定が
	 * 変更されたときに呼ぶ。旧 Tracker を stop（内部で clearInterval）してから
	 * 新しい Tracker を作り直すため、二重ポーリングにはならない。
	 * onload で登録したインターバル自体は onunload まで registerInterval に残るが、
	 * clearInterval 済みのハンドルなので実害はない。
	 */
	restartTracker(): void {
		if (!Platform.isDesktopApp) return;
		this.tracker?.stop();
		this.tracker = new Tracker(
			this.settings.pollIntervalSec,
			this.settings.afkThresholdSec,
			this.settings.afkDetect,
			this.settings.captureAllApps,
			this.handlePoll,
			(s: TrackerState) => {
				this.trackerState = s;
			},
		);
		this.tracker.start((id) => this.registerInterval(id));
	}

	/**
	 * 「今のセッションにメモ」コマンドの本体。
	 * 現行セッションを堅牢に特定するため、tracker.currentStart からキーを機械生成しない
	 * （pickCurrentTarget が「非手動・app一致・start 最大」で選ぶ）。
	 * 実際の書き込みは setCurrentNote に委譲する（サイドバーのクイック入力と共通処理・DRY化）。
	 * ここではモーダルを開く前に「対象があるか」だけ先に確認し、無ければモーダルを開かない。
	 */
	async noteCurrentSession(): Promise<void> {
		await this.aggregateNow(); // 現行セッション行を当日ファイルに実体化
		const app = this.tracker?.currentApp;
		if (!app) {
			new Notice(t("notice.noTrackedApp"));
			return;
		}

		const folder = this.settings.dataFolder;
		const today = todayStr();
		if (!pickCurrentTarget(await readDay(this.app, folder, today), app)) {
			new Notice(t("notice.currentSessionNotFound"));
			return;
		}

		new QuickLogModal(this.app, t("modal.noteForApp", { app }), t("modal.whatDoing"), (text) => {
			const trimmed = text.trim();
			if (!trimmed) return; // 空入力はキャンセル扱い（既存 note を空で消さない）
			void (async () => {
				await this.setCurrentNote(trimmed);
				new Notice(t("notice.noteSaved"));
			})();
		}).open();
	}

	/**
	 * 現行セッションに note を書き込む共通処理（TimemeterHost.setCurrentNote の実体）。
	 * text が空、または対象セッションが見つからない場合は何もしない。
	 * 処理: aggregateNow → readDay(today) → pickCurrentTarget → setNote → writeDay。
	 * 書き込み直前に readDay し直すのは、背景集計（60秒インターバル）との競合を避けるため
	 * （事前スナップショットの他行 end/title が巻き戻るのを防ぐ）。
	 */
	async setCurrentNote(text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed) return;
		await this.aggregateNow();
		const app = this.tracker?.currentApp;
		if (!app) return;
		const folder = this.settings.dataFolder;
		const today = todayStr();
		const sessions = await readDay(this.app, folder, today);
		const target = pickCurrentTarget(sessions, app);
		if (!target) return;
		const updated = setNote(sessions, sessionKey(target), trimmed);
		await writeDay(this.app, folder, today, updated);
	}

	/**
	 * 指定セッション（date/key）に note を書き込む（TimemeterHost.setSegmentNote の実体）。
	 * 時系列レーンの「穴埋め」入力から呼ばれる。text が空なら何もしない。
	 */
	async setSegmentNote(date: string, key: string, text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed) return;
		const folder = this.settings.dataFolder;
		const sessions = await readDay(this.app, folder, date);
		const updated = setNote(sessions, key, trimmed);
		await writeDay(this.app, folder, date, updated);
	}

	/** 記録中/AFK → 一時停止、一時停止 → 再開。state 自体は次 tick で実測に基づき更新される。 */
	togglePause(): void {
		if (this.trackerState === "pause") {
			this.tracker?.resume();
		} else {
			this.tracker?.pause();
		}
	}

	/** プラグインの設定タブを開く。 */
	openSettings(): void {
		// biome-ignore lint: Obsidian の internal API（型定義に無い）にアクセスする。
		const setting = (this.app as any).setting;
		setting.open();
		setting.openTabById(this.manifest.id);
	}

	private appRule(app: string): AppRule {
		let rule = this.settings.apps[app];
		if (!rule) {
			rule = { hidden: false };
			this.settings.apps[app] = rule;
		}
		return rule;
	}

	isHidden(app: string): boolean {
		return this.settings.apps[app]?.hidden ?? false;
	}

	toggleHidden(app: string): void {
		const rule = this.appRule(app);
		rule.hidden = !rule.hidden;
		void this.saveSettings();
	}

	/** 「手動ログを追加」コマンドの本体。モバイルでも呼べる。 */
	async addManualLog(): Promise<void> {
		const folder = this.settings.dataFolder;
		const today = todayStr();
		const start = defaultManualStart(await readDay(this.app, folder, today), nowHmStr());

		new QuickLogModal(this.app, t("modal.manualTitle"), t("modal.manualPlaceholder"), (text) => {
			const trimmed = text.trim();
			if (!trimmed) return; // 空入力はキャンセル扱い
			void (async () => {
				// 書き込み直前に読み直して最新を base にする（背景集計との競合回避）。
				const sessions = await readDay(this.app, folder, today);
				const end = nowHmStr();
				const updated = appendManual(sessions, today, start, end, trimmed);
				await writeDay(this.app, folder, today, updated);
				new Notice(t("notice.manualAdded"));
			})();
		}).open();
	}

	/** 「ラップ（ここから別作業）」コマンドの本体。 */
	async recordLap(): Promise<void> {
		this.laps.push(Date.now());
		await this.persistLaps();
		await this.aggregateNow();
		new Notice(t("notice.lapRecorded"));
	}

	/** 右サイドバーにビューを出す（既にあれば再表示するだけ）。 */
	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_TIMEMETER)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: VIEW_TYPE_TIMEMETER, active: true });
		}
		if (leaf) workspace.revealLeaf(leaf);
	}

	/**
	 * 言語変更後にパネル内 UI・ステータスバーを即時反映する（設定タブの言語ドロップダウンから呼ぶ）。
	 * 開いている View を現在言語で作り直す。コマンド名・リボンのツールチップは Obsidian の仕様上
	 * 登録時の言語で固定のため、次回リロードまで旧言語のまま（README に明記）。
	 */
	refreshLanguage(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMEMETER)) {
			const view = leaf.view;
			if (view instanceof TimemeterView) view.rebuild();
		}
		this.updateStatusBarLive();
		if (this.statusBarEl) this.statusBarEl.setAttr("aria-label", t("statusbar.ariaOpen"));
	}

	/** 開いている全ての TimemeterView を再描画する（設定からアプリ除外を変えた後などに呼ぶ）。 */
	refreshOpenViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMEMETER)) {
			const view = leaf.view;
			if (view instanceof TimemeterView) view.refreshActive();
		}
	}

	/**
	 * settings.showStatusBar に合わせてステータスバー要素の表示/非表示を切り替える。
	 * 要素自体は onload 時（デスクトップのみ）に一度だけ作り、以降は display の切替のみ行う
	 * （設定タブのトグルからも呼べる）。モバイルでは statusBarEl が無いので何もしない。
	 */
	refreshStatusBar(): void {
		if (!this.statusBarEl) return;
		this.statusBarEl.style.display = this.settings.showStatusBar ? "" : "none";
	}

	/** 1秒ごと: 現在アプリ・経過分・状態だけを反映する（I/O なし・todayTotalMin はキャッシュ値を使う）。 */
	private updateStatusBarLive(): void {
		if (!this.statusBarEl) return;
		const plugin = this;
		this.statusBarEl.setText(
			renderStatusBarText({
				getState: () => plugin.trackerState,
				getCurrentApp: () => plugin.tracker?.currentApp ?? null,
				getCurrentStart: () => plugin.tracker?.currentStart ?? null,
				getTodayTotalMin: () => plugin.todayTotalMin,
			}),
		);
	}

	/** 約10秒ごと: 今日合計（hidden 除外）を readDay で読み直してキャッシュし、表示へ反映する。 */
	private async updateStatusBarTotal(): Promise<void> {
		const sessions = await readDay(this.app, this.settings.dataFolder, todayStr());
		this.todayTotalMin = sessions.reduce((sum, s) => sum + (this.isHidden(s.app) ? 0 : durMin(s)), 0);
		this.updateStatusBarLive();
	}

	/**
	 * 「デイリーに今日のタイムメーターを挿入」コマンドの本体。
	 * 対象は `デイリー/{今日, 英語曜日}.md`。既に timemeter ブロックがあれば何もしない
	 * （insertTimemeterBlock が null を返す）。app.vault.process で読み書きし、
	 * マーカー外の既存本文（やったこと欄など）は一切変更しない。
	 */
	async insertDailyEmbed(): Promise<void> {
		const path = this.todayDailyPath();
		const file = this.app.vault.getFileByPath(path);
		if (!file) {
			new Notice(t("notice.dailyNotFound"));
			return;
		}

		let alreadyPresent = false;
		await this.app.vault.process(file, (content) => {
			const next = insertTimemeterBlock(content, this.settings.dailyHeading);
			if (next === null) {
				alreadyPresent = true;
				return content;
			}
			return next;
		});

		new Notice(alreadyPresent ? t("notice.embedAlready") : t("notice.embedInserted"));
	}

	/**
	 * 今日のデイリーノートのパスを返す（`insertDailyEmbed` と同じ momentFn パターンを再利用）。
	 * obsidian の型定義上 moment は呼び出し可能型として解決されないため明示的にキャストする
	 * （実行時は Obsidian 本体が注入する本物の moment 関数なので問題なく呼べる）。
	 */
	private todayDailyPath(): string {
		return this.dailyPathForDate(todayStr());
	}

	/**
	 * Obsidian コア「デイリーノート」プラグインの folder/format を読む（内部API）。
	 * 未設定・取得失敗時は従来の既定（`デイリー` / `YYYY-MM-DD (ddd)`）にフォールバックする。
	 * これで vault ごとのデイリー設定に自動追随し、固定ハードコードを避ける。
	 */
	private dailyNotesConfig(): { folder: string; format: string } {
		const fallback = { folder: DAILY_FOLDER, format: "YYYY-MM-DD (ddd)" };
		try {
			// biome-ignore lint: Obsidian の internal API（型定義に無い）にアクセスする。
			const opts = (this.app as any).internalPlugins?.getPluginById?.("daily-notes")?.instance
				?.options;
			return {
				folder: (opts?.folder ?? "").trim() || fallback.folder,
				format: (opts?.format ?? "").trim() || fallback.format,
			};
		} catch {
			return fallback;
		}
	}

	/**
	 * "YYYY-MM-DD" から対応するデイリーノートのパスを返す。フォルダ・日付書式はコアの
	 * デイリーノート設定に追随する。曜日トークン（ddd）は既存ファイルに合わせ locale=en で組む。
	 */
	dailyPathForDate(dateStr: string): string {
		const { folder, format } = this.dailyNotesConfig();
		const momentFn = moment as unknown as (input?: string) => import("moment").Moment;
		const fileName = momentFn(dateStr).locale("en").format(format);
		return folder ? `${folder}/${fileName}.md` : `${fileName}.md`;
	}

	/**
	 * 合計バーのクリックから、そのアプリで何をしたかをデイリーの「やったこと」へ 1 行追記する
	 * （TimemeterHost.appendDailyDone の実体）。対象日は表示中の日付。行は `- {app}: {内容}`。
	 * デイリーノートが無い場合・空入力は何もしない（Notice のみ）。
	 */
	async appendDailyDone(date: string, app: string, text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed) return;
		const file = this.app.vault.getFileByPath(this.dailyPathForDate(date));
		if (!file) {
			new Notice(t("notice.dailyNotFound"));
			return;
		}
		const line = `- ${app}: ${trimmed}`;
		await this.app.vault.process(file, (content) =>
			appendToDoneSection(content, line, this.settings.dailyHeading),
		);
		new Notice(t("notice.dailyAppended"));
	}

	/**
	 * 追記先ドロップダウンで選んだデイリー以外のファイルに `- {app}: {内容}` を末尾追記する
	 * （TimemeterHost.appendToFile の実体）。ファイルが無い・空入力なら何もしない（Notice のみ）。
	 */
	async appendToFile(path: string, app: string, text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed) return;
		const file = this.app.vault.getFileByPath(path);
		if (!file) {
			new Notice(t("notice.fileNotFound"));
			return;
		}
		const line = `- ${app}: ${trimmed}`;
		await this.app.vault.process(file, (content) => appendLineAtEnd(content, line));
		new Notice(t("notice.appended"));
	}

	/**
	 * 「日報の下書きをデイリーに挿入」コマンドの本体。
	 * 当日 readDay → hidden 除外 → buildNippou で行配列を作り、今日のデイリーの
	 * `## ✅ やったこと` セクション末尾に callout として追記する（insertNippouCallout）。
	 * 行配列が空、デイリーが無い、既に callout がある場合はいずれも Notice のみで
	 * 既存本文を変更しない（データファイル タイムメーター/*.md はこのコマンドでは一切書き換えない）。
	 */
	async insertNippouDraft(): Promise<void> {
		const sessions = await readDay(this.app, this.settings.dataFolder, todayStr());
		// 離席（away）は無操作時間なので日報の下書きからは除外する。
		const visible = sessions.filter((s) => !this.isHidden(s.app) && !s.away);
		const draftLines = buildNippou(visible);
		if (draftLines.length === 0) {
			new Notice(t("notice.noDescribedSessions"));
			return;
		}

		const path = this.todayDailyPath();
		const file = this.app.vault.getFileByPath(path);
		if (!file) {
			new Notice(t("notice.dailyNotFound"));
			return;
		}

		let alreadyPresent = false;
		await this.app.vault.process(file, (content) => {
			const next = insertNippouCallout(content, draftLines, this.settings.dailyHeading);
			if (next === null) {
				alreadyPresent = true;
				return content;
			}
			return next;
		});

		new Notice(alreadyPresent ? t("notice.nippouAlready") : t("notice.nippouInserted"));
	}

	/**
	 * 「Claude 用プロンプトをコピー」コマンドの本体。
	 * 説明が空のセッションを Claude に埋めさせるためのプロンプト文をクリップボードへコピーする。
	 * データファイルは一切変更しない（コピーのみ）。
	 */
	async copyClaudePrompt(): Promise<void> {
		const date = localDateStr(Date.now());
		const prompt = t("prompt.claude", { path: `${this.settings.dataFolder}/${date}.md` });
		try {
			await navigator.clipboard.writeText(prompt);
			new Notice(t("notice.copied"));
		} catch {
			new Notice(t("notice.copyFailed"));
		}
	}

	onunload() {
		// onunload は await できないため、fire-and-forget でベストエフォート実行する
		void this.aggregateNow();
		this.tracker?.stop();
	}

	async aggregateNow(): Promise<void> {
		// 60秒インターバルと「今すぐ集計」コマンドが同時に走ると vault の
		// read-modify-write が競合するため、多重実行をガードする。
		if (this.aggregating) return;
		this.aggregating = true;
		try {
			const sessions = aggregate(this.polls, {
				afkSec: this.settings.afkThresholdSec,
				afkDetect: this.settings.afkDetect,
				gapMin: this.settings.mergeGapMin,
				laps: this.laps,
			});

			// sessions は日付をまたぐ場合があるので、日付ごとに分けてそれぞれの
			// 日付ファイルへ書き込む（日を跨いだまま単一日付に書くと過去日のデータが
			// 当日ファイルへ混入する）。
			const byDate = new Map<string, Session[]>();
			for (const session of sessions) {
				const existing = byDate.get(session.date);
				if (existing) {
					existing.push(session);
				} else {
					byDate.set(session.date, [session]);
				}
			}
			for (const [date, dateSessions] of byDate) {
				await writeDay(this.app, this.settings.dataFolder, date, dateSessions);
			}

			// 書き込み済みの過去日の poll は破棄し、当日分だけをバッファに残す。
			// 当日分を残すのは、進行中セッションの開始時刻を安定させるため
			// （store のマージは 開始|アプリ をキーにするので、同じ開始時刻を
			// 保ち続けないと再集計のたびに別セッション扱いになってしまう）。
			const today = todayStr();
			this.polls = this.polls.filter((p) => localDateStr(p.ts) === today);
		} finally {
			this.aggregating = false;
		}
	}

	/**
	 * 保存形は `{ settings, laps }`。laps 導入前の旧形式（settings がフラットに
	 * 保存されたデータ）も読めるように後方互換を持たせる。
	 */
	async loadSettings() {
		const data = await this.loadData();
		if (data && (data.settings || data.laps)) {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
			this.laps = data.laps ?? [];
		} else {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
			this.laps = [];
		}
	}

	async saveSettings() {
		await this.saveData({ settings: this.settings, laps: this.laps });
	}

	/** laps だけ変わったときの保存。保存形は saveSettings と共通。 */
	async persistLaps() {
		await this.saveSettings();
	}
}
