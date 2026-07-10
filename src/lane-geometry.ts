// 時系列レーンの位置計算（純関数）。obsidian を import しない（テストから直接使える）。
// view-sidebar の renderLanes から抽出し、ズーム対応で共有する。

import { toMin, type Session } from "./types";

export interface LaneRange {
	lo: number; // 表示下限（分・毎時に丸め）
	hi: number; // 表示上限（分・毎時に丸め）
	span: number; // hi - lo（>0 を保証）
}

/**
 * セッション群から時系列レーンの表示レンジを求める。
 * start の最小・end の最大を毎時に丸め、span が 0 以下なら 60 分に補正する。
 * sessions は 1 件以上ある前提（呼び出し側が空を弾く）。
 */
export function laneRange(sessions: Session[]): LaneRange {
	let lo = Math.min(...sessions.map((s) => toMin(s.start)));
	let hi = Math.max(...sessions.map((s) => toMin(s.end)));
	lo = Math.floor(lo / 60) * 60;
	hi = Math.ceil(hi / 60) * 60;
	if (hi <= lo) hi = lo + 60;
	return { lo, hi, span: hi - lo };
}

export interface SegPos {
	leftPct: number;
	widthPct: number;
}

/**
 * セグメントの left%/width% を返す（内側要素＝span 全体を 100% とした比率）。
 * width は視認性のため minWidthPct を下限にする。
 */
export function segPos(
	startMin: number,
	endMin: number,
	lo: number,
	span: number,
	minWidthPct = 0.6,
): SegPos {
	const leftPct = ((startMin - lo) / span) * 100;
	const widthPct = Math.max(minWidthPct, ((endMin - startMin) / span) * 100);
	return { leftPct, widthPct };
}

/**
 * 時刻目盛り/ラベルの刻み（分）。ビューポートに見える範囲 span/zoom を基準に、
 * ラベルが密になりすぎないよう段階的に選ぶ（120/60/30/15 分）。
 */
export function tickStepMin(span: number, zoom = 1): number {
	const shown = span / Math.max(1, zoom);
	if (shown > 480) return 120;
	if (shown > 240) return 60;
	if (shown > 120) return 30;
	return 15;
}

/**
 * ズーム変更時に「ビューポート中央の時刻」を保つための新しい scrollLeft を返す。
 * 内側幅が prev→next に変わっても中央位置の比率を維持し、[0, next-viewport] にクランプする。
 */
export function centerAnchoredScrollLeft(
	prevScrollLeft: number,
	prevInnerW: number,
	nextInnerW: number,
	viewportW: number,
): number {
	if (prevInnerW <= 0) return 0;
	const centerRatio = (prevScrollLeft + viewportW / 2) / prevInnerW;
	const next = centerRatio * nextInnerW - viewportW / 2;
	const max = Math.max(0, nextInnerW - viewportW);
	return Math.max(0, Math.min(next, max));
}
