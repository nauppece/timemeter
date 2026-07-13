// ポーリングループ・状態機械。
// obsidian への依存は Platform のみ（実行時ガード）。window.setInterval を使う。

import { Platform } from "obsidian";
import { getFrontmostApp, getIdleSec, getVisibleApps, getWindowTitle } from "./detect";
import type { Poll } from "./types";

export type TrackerState = "rec" | "afk" | "pause" | "err";

const MAX_CONSECUTIVE_FAILURES = 3;

export class Tracker {
	private intervalMs: number;
	private afkSec: number;
	private afkDetect: boolean;
	private captureAllApps: boolean;
	private onPoll: (p: Poll) => void;
	private onState: (s: TrackerState) => void;

	private intervalId: number | null = null;
	private _state: TrackerState = "rec";
	private _currentApp: string | null = null;
	private _currentStart: number | null = null;
	private consecutiveFailures = 0;
	private paused = false;
	private ticking = false;

	constructor(
		intervalSec: number,
		afkSec: number,
		afkDetect: boolean,
		captureAllApps: boolean,
		onPoll: (p: Poll) => void,
		onState: (s: TrackerState) => void,
	) {
		this.intervalMs = intervalSec * 1000;
		this.afkSec = afkSec;
		this.afkDetect = afkDetect;
		this.captureAllApps = captureAllApps;
		this.onPoll = onPoll;
		this.onState = onState;
	}

	get state(): TrackerState {
		return this._state;
	}

	get currentApp(): string | null {
		return this._currentApp;
	}

	get currentStart(): number | null {
		return this._currentStart;
	}

	start(registerInterval: (id: number) => number): void {
		if (!Platform.isDesktopApp) return;
		const id = window.setInterval(() => {
			void this.tick();
		}, this.intervalMs);
		this.intervalId = id;
		registerInterval(id);
	}

	stop(): void {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	pause(): void {
		this.paused = true;
		this.setState("pause");
	}

	resume(): void {
		// ここでは state を変えない。次の tick が実測値に基づき "rec"/"afk" へ遷移する。
		this.paused = false;
	}

	private setState(s: TrackerState): void {
		if (this._state === s) return;
		this._state = s;
		this.onState(s);
	}

	private async tick(): Promise<void> {
		if (!Platform.isDesktopApp) return;
		if (this.paused) return;
		// 前回の tick の非同期処理（getIdleSec/getFrontmostApp/getWindowTitle）が
		// 次のインターバルまでに解決しない場合、多重実行すると _currentApp/
		// _currentStart/consecutiveFailures が競合する。1本だけ実行させる。
		if (this.ticking) return;
		this.ticking = true;
		try {
			// 基本は AFK を無視して記録し続ける。無操作でも poll を落とさない
			// （＝開いている間は途切れず記録）。idleSec は poll に載せ、離席の色分けは
			// afkDetect が ON のときだけ aggregator / 状態表示で使う。
			const idleSec = await getIdleSec();

			const app = await getFrontmostApp();
			if (app === null) {
				this.consecutiveFailures++;
				if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
					this.setState("err");
				}
				return;
			}

			this.consecutiveFailures = 0;
			const title = await getWindowTitle();

			const now = Date.now();
			if (app !== this._currentApp) {
				// アプリが変わった（初回 poll では _currentApp が null なのでここに入る）
				this._currentStart = now;
			}
			this._currentApp = app;

			// afkDetect が ON かつしきい値以上の無操作なら「離席（afk）」表示。それ以外は記録中。
			this.setState(this.afkDetect && idleSec >= this.afkSec ? "afk" : "rec");

			// 記録対象アプリ集合を決める。captureAllApps ならデスクトップに開いている全アプリ、
			// そうでなければ最前面のみ。最前面は必ず含める（visible 取得失敗時のフォールバックも兼ねる）。
			let apps: string[];
			if (this.captureAllApps) {
				const visible = await getVisibleApps();
				const set = new Set(visible);
				set.add(app);
				apps = [...set];
			} else {
				apps = [app];
			}

			// タイトルは最前面アプリだけに付ける（背景アプリは null）。
			for (const a of apps) {
				this.onPoll({ ts: now, app: a, title: a === app ? title : null, idleSec });
			}
		} finally {
			this.ticking = false;
		}
	}
}
