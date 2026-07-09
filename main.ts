import { Platform, Plugin, type WorkspaceLeaf } from "obsidian";
import { aggregate, localDateStr } from "./src/aggregator";
import { writeDay } from "./src/store";
import { Tracker, type TrackerState } from "./src/tracker";
import { DEFAULT_SETTINGS, type Poll, type Session, type TimemeterSettings } from "./src/types";
import { TimemeterView, VIEW_TYPE_TIMEMETER, type TimemeterHost } from "./src/view-sidebar";

const AGGREGATE_INTERVAL_MS = 60 * 1000;

/** 今日のローカル日付を "YYYY-MM-DD" にする（aggregator の localDateStr と同じ定義を再利用） */
function todayStr(): string {
	return localDateStr(Date.now());
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

		this.addRibbonIcon("clock", "タイムメーター", () => {
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

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
