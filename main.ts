import { Notice, Platform, Plugin, type WorkspaceLeaf } from "obsidian";
import { aggregate, localDateStr } from "./src/aggregator";
import { appendManual, defaultManualStart, setNote } from "./src/quicklog";
import { QuickLogModal } from "./src/quicklog-modal";
import { readDay, writeDay } from "./src/store";
import { Tracker, type TrackerState } from "./src/tracker";
import { DEFAULT_SETTINGS, type Poll, sessionKey, type Session, type TimemeterSettings, toMin } from "./src/types";
import { TimemeterView, VIEW_TYPE_TIMEMETER, type TimemeterHost } from "./src/view-sidebar";

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

export default class TimeMeterPlugin extends Plugin {
	settings: TimemeterSettings = DEFAULT_SETTINGS;
	tracker: Tracker | null = null;
	trackerState: TrackerState = "rec";
	polls: Poll[] = [];
	laps: number[] = [];
	aggregating = false;

	async onload() {
		await this.loadSettings();
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
		};
		this.registerView(VIEW_TYPE_TIMEMETER, (leaf) => new TimemeterView(leaf, host));

		this.addRibbonIcon("hourglass", "タイムメーター", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "timemeter-open-view",
			name: "タイムメーター: パネルを開く",
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
				(p: Poll) => {
					this.polls.push(p);
				},
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
		}

		this.addCommand({
			id: "timemeter-aggregate-now",
			name: "タイムメーター: 今すぐ集計",
			callback: () => {
				void this.aggregateNow();
			},
		});

		// クイックログ（タップ記録）: 3コマンド。
		this.addCommand({
			id: "timemeter-note-current",
			name: "タイムメーター: 今のセッションにメモ",
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
			name: "タイムメーター: 手動ログを追加",
			// モバイルでも動く（デスクトップ限定ガードを付けない）。
			callback: () => {
				void this.addManualLog();
			},
		});

		this.addCommand({
			id: "timemeter-lap",
			name: "タイムメーター: ラップ（ここから別作業）",
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
	 * 「今のセッションにメモ」コマンドの本体。
	 * 現行セッションを堅牢に特定するため、tracker.currentStart からキーを機械生成しない。
	 * セッションの start は「グループ先頭 poll の HH:MM」で、AFK ギャップにより同一アプリでも
	 * start が currentStart と一致しない場合があるため、当日セッションのうち
	 * 「非手動・app一致」の中で start が最大（＝最新）のものを対象とする。
	 */
	async noteCurrentSession(): Promise<void> {
		await this.aggregateNow(); // 現行セッション行を当日ファイルに実体化
		const app = this.tracker?.currentApp;
		if (!app) {
			new Notice("記録中のアプリがありません");
			return;
		}

		const folder = this.settings.dataFolder;
		const today = todayStr();
		// 現行セッションを app 一致で最新 start のものとして選ぶヘルパ。
		const pickTarget = (list: Session[]) =>
			[...list]
				.filter((s) => !s.manual && s.app === app)
				.sort((a, b) => toMin(a.start) - toMin(b.start))
				.pop();
		if (!pickTarget(await readDay(this.app, folder, today))) {
			new Notice("現在のセッションが見つかりません");
			return;
		}

		new QuickLogModal(this.app, `「${app}」に一言メモ`, "何をしていますか", (text) => {
			const trimmed = text.trim();
			if (!trimmed) return; // 空入力はキャンセル扱い（既存 note を空で消さない）
			void (async () => {
				// 書き込み直前に読み直す。モーダルを開いている間に背景集計が走ると
				// 事前スナップショットの他行 end/title が巻き戻るため、最新を base にする。
				const sessions = await readDay(this.app, folder, today);
				const target = pickTarget(sessions);
				if (!target) {
					new Notice("現在のセッションが見つかりません");
					return;
				}
				const updated = setNote(sessions, sessionKey(target), trimmed);
				await writeDay(this.app, folder, today, updated);
				new Notice("メモを記録しました");
			})();
		}).open();
	}

	/** 「手動ログを追加」コマンドの本体。モバイルでも呼べる。 */
	async addManualLog(): Promise<void> {
		const folder = this.settings.dataFolder;
		const today = todayStr();
		const start = defaultManualStart(await readDay(this.app, folder, today), nowHmStr());

		new QuickLogModal(this.app, "手動ログ：何をしていましたか", "例）ランニング", (text) => {
			const trimmed = text.trim();
			if (!trimmed) return; // 空入力はキャンセル扱い
			void (async () => {
				// 書き込み直前に読み直して最新を base にする（背景集計との競合回避）。
				const sessions = await readDay(this.app, folder, today);
				const end = nowHmStr();
				const updated = appendManual(sessions, today, start, end, trimmed);
				await writeDay(this.app, folder, today, updated);
				new Notice("手動ログを追加しました");
			})();
		}).open();
	}

	/** 「ラップ（ここから別作業）」コマンドの本体。 */
	async recordLap(): Promise<void> {
		this.laps.push(Date.now());
		await this.persistLaps();
		await this.aggregateNow();
		new Notice("ラップしました");
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
