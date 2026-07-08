// OS 検出処理（macOS のみ）。
// Platform.isDesktopApp が false（モバイル）なら即座に null/0 を返し、
// child_process は関数内でのみ require する（トップレベル require はモバイルビルドを壊す）。

import { Platform } from "obsidian";

// @types/node を追加せずに済ませるためのアンビエント宣言（型のみ・実行時の top-level require ではない）。
declare function require(id: string): { execFile: (...args: unknown[]) => void };

function execFileAsync(cmd: string, args: string[]): Promise<string> {
	const { execFile } = require("child_process");
	return new Promise((resolve, reject) => {
		execFile(cmd, args, { timeout: 5000 }, (err: Error | null, stdout: string) => {
			if (err) {
				reject(err);
				return;
			}
			resolve(stdout);
		});
	});
}

/** 最前面アプリ名を取得する。失敗（権限未許可等）時は null */
export async function getFrontmostApp(): Promise<string | null> {
	if (!Platform.isDesktopApp) return null;
	try {
		const out = await execFileAsync("osascript", [
			"-e",
			'tell application "System Events" to get name of first process whose frontmost is true',
		]);
		const name = out.trim();
		return name.length > 0 ? name : null;
	} catch {
		return null;
	}
}

/** 最前面ウィンドウのタイトルを取得する（ベストエフォート）。失敗時（-1719 含む）は null */
export async function getWindowTitle(): Promise<string | null> {
	if (!Platform.isDesktopApp) return null;
	try {
		const out = await execFileAsync("osascript", [
			"-e",
			'tell application "System Events" to tell (first process whose frontmost is true) to get value of attribute "AXTitle" of window 1',
		]);
		const title = out.trim();
		return title.length > 0 ? title : null;
	} catch {
		return null;
	}
}

/** アイドル秒数を取得する。失敗時は 0 */
export async function getIdleSec(): Promise<number> {
	if (!Platform.isDesktopApp) return 0;
	try {
		const out = await execFileAsync("ioreg", ["-c", "IOHIDSystem"]);
		const m = out.match(/"HIDIdleTime"\s*=\s*(\d+)/);
		if (!m) return 0;
		const ns = Number(m[1]);
		if (!Number.isFinite(ns)) return 0;
		return Math.floor(ns / 1_000_000_000);
	} catch {
		return 0;
	}
}
