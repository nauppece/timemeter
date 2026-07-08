// ポーリングループ・状態機械。
// obsidian への依存は Platform のみ（実行時ガード）。window.setInterval を使う。

import { Platform } from "obsidian";
import { getFrontmostApp, getIdleSec, getWindowTitle } from "./detect";
import type { Poll } from "./types";

export type TrackerState = "rec" | "afk" | "pause" | "err";

const MAX_CONSECUTIVE_FAILURES = 3;

export class Tracker {
	private intervalMs: number;
	private afkSec: number;
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
		onPoll: (p: Poll) => void,
		onState: (s: TrackerState) => void,
	) {
		this.intervalMs = intervalSec * 1000;
		this.afkSec = afkSec;
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
			const idleSec = await getIdleSec();
			if (idleSec >= this.afkSec) {
				this.setState("afk");
				return;
			}

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

			this.setState("rec");
			this.onPoll({ ts: now, app, title, idleSec });
		} finally {
			this.ticking = false;
		}
	}
}
