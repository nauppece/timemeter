// 設定タブ。追跡パラメータとアプリ別ルール（非表示・タイトル取込）を編集する。
// obsidian に実行時依存する（PluginSettingTab を継承する）ため、純粋関数とはファイルを分けてある。
// テスト対象外（UI 主体のため手動確認）。

import { App, PluginSettingTab, Setting } from "obsidian";
import type TimeMeterPlugin from "../main";
import { DEFAULT_SETTINGS } from "./types";

export class TimemeterSettingTab extends PluginSettingTab {
	private readonly plugin: TimeMeterPlugin;

	constructor(app: App, plugin: TimeMeterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const plugin = this.plugin;

		new Setting(containerEl)
			.setName("ポーリング間隔（秒）")
			.setDesc("最前面アプリを何秒おきに検知するか")
			.addSlider((slider) =>
				slider
					.setLimits(5, 60, 5)
					.setValue(plugin.settings.pollIntervalSec)
					.setDynamicTooltip()
					.onChange(async (value) => {
						plugin.settings.pollIntervalSec = value;
						await plugin.saveSettings();
						plugin.restartTracker();
					}),
			);

		new Setting(containerEl)
			.setName("AFK しきい値（秒）")
			.setDesc("この秒数以上操作が無いと離席（AFK）とみなす")
			.addSlider((slider) =>
				slider
					.setLimits(60, 600, 30)
					.setValue(plugin.settings.afkThresholdSec)
					.setDynamicTooltip()
					.onChange(async (value) => {
						plugin.settings.afkThresholdSec = value;
						await plugin.saveSettings();
						plugin.restartTracker();
					}),
			);

		new Setting(containerEl)
			.setName("結合ギャップ（分）")
			.setDesc("同じアプリの記録がこの分数以内に再開したら1つのセッションにまとめる")
			.addSlider((slider) =>
				slider
					.setLimits(1, 10, 1)
					.setValue(plugin.settings.mergeGapMin)
					.setDynamicTooltip()
					.onChange(async (value) => {
						plugin.settings.mergeGapMin = value;
						await plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("データフォルダ")
			.setDesc("記録先の Markdown ファイルを置くフォルダ名")
			.addText((text) =>
				text.setValue(plugin.settings.dataFolder).onChange(async (value) => {
					const trimmed = value.trim();
					plugin.settings.dataFolder = trimmed === "" ? DEFAULT_SETTINGS.dataFolder : trimmed;
					await plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("ステータスバー表示")
			.setDesc("ステータスバーに記録状態を表示する")
			.addToggle((toggle) =>
				toggle.setValue(plugin.settings.showStatusBar).onChange(async (value) => {
					plugin.settings.showStatusBar = value;
					await plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("起動時にサイドバーを開く")
			.setDesc("Obsidian 起動時にタイムメーターのパネルを自動で開く")
			.addToggle((toggle) =>
				toggle.setValue(plugin.settings.showSidebarOnStart).onChange(async (value) => {
					plugin.settings.showSidebarOnStart = value;
					await plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName("アプリ別ルール").setHeading();
		containerEl.createEl("p", {
			text: "自動検知されたアプリごとに、表示可否とタイトル取込を設定できます。",
			cls: "setting-item-description",
		});

		const appNames = Object.keys(plugin.settings.apps).sort();
		if (appNames.length === 0) {
			containerEl.createEl("p", { text: "まだ観測されたアプリはありません。" });
		} else {
			for (const name of appNames) {
				const rule = plugin.settings.apps[name];
				new Setting(containerEl)
					.setName(name)
					.addToggle((toggle) =>
						toggle
							.setTooltip("表示")
							.setValue(!rule.hidden)
							.onChange(async (value) => {
								rule.hidden = !value;
								await plugin.saveSettings();
							}),
					)
					.addToggle((toggle) =>
						toggle
							.setTooltip("タイトル取込")
							.setValue(rule.captureTitle)
							.onChange(async (value) => {
								rule.captureTitle = value;
								await plugin.saveSettings();
							}),
					);
			}
		}
	}
}
