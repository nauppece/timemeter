// アプリ色の純粋関数。obsidian をインポートしない
// （view-sidebar.ts と embed.ts の両方から使うため切り出してある）。

// アプリ名の文字列ハッシュから安定して色を選ぶための 12 色パレット。
export const PALETTE = [
	"#e06c75",
	"#61afef",
	"#98c379",
	"#e5c07b",
	"#c678dd",
	"#56b6c2",
	"#d19a66",
	"#e39ac6",
	"#5c9e6b",
	"#c0a9e0",
	"#519ab5",
	"#b58900",
];

export function appColor(name: string): string {
	let h = 0;
	for (let i = 0; i < name.length; i++) {
		h = (h * 31 + name.charCodeAt(i)) >>> 0;
	}
	return PALETTE[h % PALETTE.length];
}
