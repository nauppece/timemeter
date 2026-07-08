import { Platform, Plugin } from "obsidian";
import { aggregate } from "./src/aggregator";
import { writeDay } from "./src/store";
import { Tracker, type TrackerState } from "./src/tracker";
import { DEFAULT_SETTINGS, type Poll, type TimemeterSettings } from "./src/types";

const AGGREGATE_INTERVAL_MS = 60 * 1000;

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

/** 今日のローカル日付を "YYYY-MM-DD" にする */
function todayStr(): string {
	const d = new Date();
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default class TimeMeterPlugin extends Plugin {
	settings: TimemeterSettings = DEFAULT_SETTINGS;
	tracker: Tracker | null = null;
	trackerState: TrackerState = "rec";
	polls: Poll[] = [];
	laps: number[] = [];

	async onload() {
		await this.loadSettings();

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

	onunload() {
		// onunload は await できないため、fire-and-forget でベストエフォート実行する
		void this.aggregateNow();
		this.tracker?.stop();
	}

	async aggregateNow(): Promise<void> {
		const sessions = aggregate(this.polls, {
			afkSec: this.settings.afkThresholdSec,
			gapMin: this.settings.mergeGapMin,
			laps: this.laps,
		});
		await writeDay(this.app, this.settings.dataFolder, todayStr(), sessions);
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
