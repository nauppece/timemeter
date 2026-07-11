// 軽量 i18n。obsidian を import しない（テストから直接使える）。
// 文字列は「フラットなドット区切りキー」で en/ja を持つ。描画時に t() を呼ぶ設計なので、
// setLang() ＋ 各 UI の再描画でライブ反映される（言語状態はモジュールレベルに保持）。

export type Lang = "en" | "ja";

export const LANGS: Lang[] = ["en", "ja"];

type Dict = Record<string, string>;

const EN: Dict = {
	// アプリ名・共通
	"app.name": "TimeMeter",
	"common.dash": "—",
	"common.noRecords": "No records",

	// ステータスバー
	"statusbar.waiting": "Waiting",
	"statusbar.recording": "{app} {n}min · Today {total}",
	"statusbar.idle": "{label} · Today {total}",
	"statusbar.ariaOpen": "TimeMeter: click to open panel",

	// リボン
	"ribbon.tooltip": "TimeMeter",

	// コマンド（登録時の言語で固定・変更は次回リロードで反映）
	"cmd.openView": "TimeMeter: open panel",
	"cmd.insertDailyEmbed": "TimeMeter: insert today's TimeMeter into daily note",
	"cmd.aggregateNow": "TimeMeter: aggregate now",
	"cmd.insertNippou": "TimeMeter: insert daily-report draft into daily note",
	"cmd.copyClaudePrompt": "TimeMeter: copy prompt for Claude",
	"cmd.noteCurrent": "TimeMeter: note current session",
	"cmd.manualLog": "TimeMeter: add manual log",
	"cmd.lap": "TimeMeter: lap (new task from here)",

	// 通知・モーダル
	"notice.noTrackedApp": "No app being tracked",
	"notice.currentSessionNotFound": "Current session not found",
	"notice.noteSaved": "Note saved",
	"notice.manualAdded": "Manual log added",
	"notice.lapRecorded": "Lap recorded",
	"notice.dailyNotFound": "Today's daily note not found",
	"notice.embedAlready": "TimeMeter is already inserted",
	"notice.embedInserted": "TimeMeter inserted",
	"notice.noDescribedSessions": "No sessions with a description",
	"notice.nippouAlready": "Daily-report draft is already inserted",
	"notice.nippouInserted": "Daily-report draft inserted",
	"notice.copied": "Copied",
	"notice.copyFailed": "Copy failed",
	"notice.dailyAppended": "Added to the daily note",
	"modal.noteForApp": 'Note for "{app}"',
	"modal.whatDoing": "What are you doing?",
	"modal.whatWereDoing": "What were you doing?",
	"modal.manualTitle": "Manual log: what were you doing?",
	"modal.manualPlaceholder": "e.g. Running",
	"modal.fillInTitle": "Add a note for {label}",
	"modal.save": "Save",
	"modal.add": "Add",
	"modal.dailyTitle": 'What were you doing in "{app}"?',
	"modal.dailyPlaceholder": "e.g. Researched the article",
	"prompt.claude":
		"For sessions with an empty description in `{path}`, infer the activity from the time range, app, and window title, and fill in the description column. Do not change descriptions that already exist.",

	// 状態ラベル
	"state.rec": "Recording",
	"state.afk": "AFK",
	"state.pause": "Paused",
	"state.err": "Permission error",

	// ヘッダー
	"head.pauseResume": "Pause / resume",
	"head.settings": "Settings",
	"err.noPermission": "Automation permission not granted — cannot record.",
	"err.howToSetUp": "See how to set up",

	// ライブブロック
	"live.now": "NOW",
	"live.min": "min",
	"live.secSuffix": "s",
	"live.idle": "Idle — recording paused",
	"live.paused": "Paused — not recording until resumed",
	"live.todayTotal": "Today total",
	"live.quickPlaceholder": "What are you doing? Enter to log",
	"live.quickDisabled": "No app being tracked",

	// サブタブ・タブ
	"subtab.bars": "Totals",
	"subtab.lanes": "Timeline",
	"tab.today": "Today",
	"tab.day": "Day",
	"tab.month": "Month",
	"day.totalPrefix": "Total ",
	"tl.caption": "Hover for details / click to add a note (underline = has note)",

	// 時系列（レーン）
	"lanes.emptyToday": "No records yet",
	"lanes.emptyDay": "No records for this day",
	"lanes.noVisibleApps": "No visible apps",
	"lanes.zoomAria": "Zoom timeline",
	"lanes.zoomIn": "Zoom in",
	"lanes.zoomOut": "Zoom out",
	"lanes.clickToNote": "Click to add a note",

	// 合計バー
	"bars.emptyToday": "No records yet",
	"bars.emptyDay": "No records for this day",
	"bars.more": "Quick actions",
	"bars.addToDaily": "Click to add to the daily note",

	// コンテキストメニュー
	"ctx.hide": 'Hide "{app}"',
	"ctx.show": 'Show "{app}" again',
	"ctx.manageInSettings": "Manage all in settings…",

	// ツールチップ・バッジ
	"tip.recording": " (recording)",
	"tip.now": "now",
	"badge.left": "{n} left",

	// 月
	"month.legendLess": "Less",
	"month.legendMore": "More (click a day to open Day)",

	// 設定
	"set.polling.name": "Polling interval (sec)",
	"set.polling.desc": "How often to detect the frontmost app",
	"set.afk.name": "AFK threshold (sec)",
	"set.afk.desc": "Treat as away (AFK) after this many seconds of no input",
	"set.merge.name": "Merge gap (min)",
	"set.merge.desc": "Merge into one session if the same app resumes within this many minutes",
	"set.captureAll.name": "Track all open apps",
	"set.captureAll.desc":
		"At each poll, record every app with a window open on the desktop, not only the frontmost one — so concurrent work is captured. Totals can exceed real time; exclude apps you don't care about in the per-app rules below. Off = frontmost app only.",
	"set.folder.name": "Data folder",
	"set.folder.desc": "Folder name where record Markdown files are stored",
	"set.statusbar.name": "Show status bar",
	"set.statusbar.desc": "Show tracking state in the status bar",
	"set.sidebar.name": "Open sidebar on startup",
	"set.sidebar.desc": "Automatically open the TimeMeter panel when Obsidian starts",
	"set.lang.name": "Language",
	"set.lang.desc": "Display language for the panel, notices, and settings (command names apply after the next reload)",
	"set.apps.heading": "Per-app rules",
	"set.apps.desc": "Show or exclude each detected app. Excluding an app removes it from the timeline and totals (records are kept).",
	"set.apps.none": "No apps observed yet.",
	"set.apps.excludedGroup": "Excluded (hidden from timeline & totals)",
	"set.apps.shownTip": "Shown — click to exclude",
	"set.apps.excludedTip": "Excluded — click to show",

	// 埋め込み・日報
	"embed.header": "TimeMeter",
	"nippou.calloutHeader": "> [!note] TimeMeter draft",
	"nippou.other": "Other",
};

const JA: Dict = {
	"app.name": "タイムメーター",
	"common.dash": "—",
	"common.noRecords": "記録なし",

	"statusbar.waiting": "待機中",
	"statusbar.recording": "{app} {n}分 ・ 今日 {total}",
	"statusbar.idle": "{label} ・ 今日 {total}",
	"statusbar.ariaOpen": "タイムメーター: クリックでパネルを開く",

	"ribbon.tooltip": "タイムメーター",

	"cmd.openView": "タイムメーター: パネルを開く",
	"cmd.insertDailyEmbed": "タイムメーター: デイリーに今日のタイムメーターを挿入",
	"cmd.aggregateNow": "タイムメーター: 今すぐ集計",
	"cmd.insertNippou": "タイムメーター: 日報の下書きをデイリーに挿入",
	"cmd.copyClaudePrompt": "タイムメーター: Claude 用プロンプトをコピー",
	"cmd.noteCurrent": "タイムメーター: 今のセッションにメモ",
	"cmd.manualLog": "タイムメーター: 手動ログを追加",
	"cmd.lap": "タイムメーター: ラップ（ここから別作業）",

	"notice.noTrackedApp": "記録中のアプリがありません",
	"notice.currentSessionNotFound": "現在のセッションが見つかりません",
	"notice.noteSaved": "メモを記録しました",
	"notice.manualAdded": "手動ログを追加しました",
	"notice.lapRecorded": "ラップしました",
	"notice.dailyNotFound": "今日のデイリーノートが見つかりません",
	"notice.embedAlready": "タイムメーターは既に挿入されています",
	"notice.embedInserted": "タイムメーターを挿入しました",
	"notice.noDescribedSessions": "説明のあるセッションがありません",
	"notice.nippouAlready": "日報の下書きは既に挿入されています",
	"notice.nippouInserted": "日報の下書きを挿入しました",
	"notice.copied": "コピーしました",
	"notice.copyFailed": "コピーに失敗しました",
	"notice.dailyAppended": "デイリーに追加しました",
	"modal.noteForApp": "「{app}」に一言メモ",
	"modal.whatDoing": "何をしていますか",
	"modal.whatWereDoing": "何をしていましたか",
	"modal.manualTitle": "手動ログ：何をしていましたか",
	"modal.manualPlaceholder": "例）ランニング",
	"modal.fillInTitle": "{label} の説明を追記",
	"modal.save": "記録する",
	"modal.add": "追加",
	"modal.dailyTitle": "「{app}」で何をしていた？",
	"modal.dailyPlaceholder": "例）記事のリサーチ",
	"prompt.claude":
		"`{path}` の説明が空のセッションについて、時間帯とアプリ・ウィンドウタイトルから内容を推測して説明列を埋めて。既にある説明は変更しないで。",

	"state.rec": "記録中",
	"state.afk": "AFK",
	"state.pause": "一時停止",
	"state.err": "権限エラー",

	"head.pauseResume": "一時停止/再開",
	"head.settings": "設定",
	"err.noPermission": "オートメーション権限が未許可のため記録できません。",
	"err.howToSetUp": "設定方法を見る",

	"live.now": "NOW",
	"live.min": "分",
	"live.secSuffix": "秒",
	"live.idle": "無操作 — 記録を停止中",
	"live.paused": "一時停止中 — 再開までは記録しません",
	"live.todayTotal": "今日合計",
	"live.quickPlaceholder": "いま何してる？ Enterで記録",
	"live.quickDisabled": "記録中のアプリがありません",

	"subtab.bars": "合計",
	"subtab.lanes": "時系列",
	"tab.today": "今日",
	"tab.day": "日別",
	"tab.month": "月",
	"day.totalPrefix": "合計 ",
	"tl.caption": "ホバーで詳細 / クリックで説明を追記（下線＝説明あり）",

	"lanes.emptyToday": "まだ記録がありません",
	"lanes.emptyDay": "この日の記録はありません",
	"lanes.noVisibleApps": "表示中のアプリがありません",
	"lanes.zoomAria": "時系列の拡大縮小",
	"lanes.zoomIn": "拡大",
	"lanes.zoomOut": "縮小",
	"lanes.clickToNote": "クリックで説明を追記",

	"bars.emptyToday": "まだ記録がありません",
	"bars.emptyDay": "この日の記録はありません",
	"bars.more": "クイック操作",
	"bars.addToDaily": "クリックでデイリーに追記",

	"ctx.hide": "「{app}」を非表示にする",
	"ctx.show": "「{app}」を再表示する",
	"ctx.manageInSettings": "設定でまとめて管理…",

	"tip.recording": "（記録中）",
	"tip.now": "現在",
	"badge.left": "残り {n}件",

	"month.legendLess": "少",
	"month.legendMore": "多（日クリックで日別へ）",

	"set.polling.name": "ポーリング間隔（秒）",
	"set.polling.desc": "最前面アプリを何秒おきに検知するか",
	"set.afk.name": "AFK しきい値（秒）",
	"set.afk.desc": "この秒数以上操作が無いと離席（AFK）とみなす",
	"set.merge.name": "結合ギャップ（分）",
	"set.merge.desc": "同じアプリの記録がこの分数以内に再開したら1つのセッションにまとめる",
	"set.captureAll.name": "開いている全アプリを記録",
	"set.captureAll.desc":
		"毎ポーリング、最前面だけでなくデスクトップにウィンドウを開いている全アプリを記録します（同時作業も残せます）。合計は実時間を超えることがあります。不要なアプリは下の「アプリ別ルール」で除外してください。OFF で最前面のみ。",
	"set.folder.name": "データフォルダ",
	"set.folder.desc": "記録先の Markdown ファイルを置くフォルダ名",
	"set.statusbar.name": "ステータスバー表示",
	"set.statusbar.desc": "ステータスバーに記録状態を表示する",
	"set.sidebar.name": "起動時にサイドバーを開く",
	"set.sidebar.desc": "Obsidian 起動時にタイムメーターのパネルを自動で開く",
	"set.lang.name": "言語",
	"set.lang.desc": "パネル・通知・設定の表示言語（コマンド名は次回リロードで反映）",
	"set.apps.heading": "アプリ別ルール",
	"set.apps.desc": "自動検知されたアプリごとに表示するか除外するかを切り替えます。除外すると時系列・合計から消えます（記録は残ります）。",
	"set.apps.none": "まだ観測されたアプリはありません。",
	"set.apps.excludedGroup": "除外中（時系列・合計から非表示）",
	"set.apps.shownTip": "表示中 — クリックで除外",
	"set.apps.excludedTip": "除外中 — クリックで表示",

	"embed.header": "タイムメーター",
	"nippou.calloutHeader": "> [!note] タイムメーター下書き",
	"nippou.other": "その他",
};

const STRINGS: Record<Lang, Dict> = { en: EN, ja: JA };

/** 月名（en）。ja は `{year}年{month}月` を組み立てるので不要。 */
const MONTH_EN = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

/** 曜日1文字/略称（0=日 .. 6=土）。dayLabel 用。 */
const WEEKDAY: Record<Lang, string[]> = {
	en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
	ja: ["日", "月", "火", "水", "木", "金", "土"],
};

/** 月グリッドの曜日ヘッダー（月曜始まり）。 */
const DOW_HEADER: Record<Lang, string[]> = {
	en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
	ja: ["月", "火", "水", "木", "金", "土", "日"],
};

let current: Lang = "en";

/** 言語ごとのキー一覧（parity テスト用）。 */
export function dictKeys(lang: Lang): string[] {
	return Object.keys(STRINGS[lang]);
}

export function setLang(l: Lang): void {
	current = l;
}

export function getLang(): Lang {
	return current;
}

/**
 * キーを現在言語で引く。`{name}` プレースホルダを params で置換する。
 * 未知キーは en → キー文字列の順にフォールバックする。
 */
export function t(key: string, params?: Record<string, string | number>): string {
	const raw = STRINGS[current][key] ?? STRINGS.en[key] ?? key;
	if (!params) return raw;
	return raw.replace(/\{(\w+)\}/g, (_m, name: string) =>
		name in params ? String(params[name]) : `{${name}}`,
	);
}

/** 曜日略称（0=日..6=土）を現在言語で返す。 */
export function weekdayLabel(dow: number): string {
	return WEEKDAY[current][dow];
}

/** 月グリッドの曜日ヘッダー配列（月曜始まり）を現在言語で返す。 */
export function dowHeaders(): string[] {
	return DOW_HEADER[current];
}

/** 月タイトル（en: "July 2026" / ja: "2026年7月"）。 */
export function monthTitle(year: number, month: number): string {
	if (current === "ja") return `${year}年${month}月`;
	return `${MONTH_EN[month - 1]} ${year}`;
}

/** 正時ラベル（en: "9:00" / ja: "9時"）。 */
export function hourLabel(hour: number): string {
	return current === "ja" ? `${hour}時` : `${hour}:00`;
}
