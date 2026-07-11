// 設定タブ。追跡パラメータとアプリ別ルール（表示/除外・タイトル取込）を編集する。
// obsidian に実行時依存する（PluginSettingTab を継承する）ため、純粋関数とはファイルを分けてある。
// テスト対象外（UI 主体のため手動確認）。

import { App, PluginSettingTab, Setting } from "obsidian";
import type TimeMeterPlugin from "../main";
import { type Lang, setLang, t } from "./i18n";
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
			.setName(t("set.lang.name"))
			.setDesc(t("set.lang.desc"))
			.addDropdown((dd) =>
				dd
					.addOption("en", "English")
					.addOption("ja", "日本語")
					.setValue(plugin.settings.lang)
					.onChange(async (value) => {
						plugin.settings.lang = value as Lang;
						setLang(plugin.settings.lang);
						await plugin.saveSettings();
						plugin.refreshLanguage();
						this.display(); // 設定タブ自身も新しい言語で描き直す
					}),
			);

		new Setting(containerEl)
			.setName(t("set.polling.name"))
			.setDesc(t("set.polling.desc"))
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
			.setName(t("set.afk.name"))
			.setDesc(t("set.afk.desc"))
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
			.setName(t("set.merge.name"))
			.setDesc(t("set.merge.desc"))
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
			.setName(t("set.captureAll.name"))
			.setDesc(t("set.captureAll.desc"))
			.addToggle((toggle) =>
				toggle.setValue(plugin.settings.captureAllApps).onChange(async (value) => {
					plugin.settings.captureAllApps = value;
					await plugin.saveSettings();
					plugin.restartTracker();
				}),
			);

		new Setting(containerEl)
			.setName(t("set.folder.name"))
			.setDesc(t("set.folder.desc"))
			.addText((text) =>
				text.setValue(plugin.settings.dataFolder).onChange(async (value) => {
					const trimmed = value.trim();
					plugin.settings.dataFolder = trimmed === "" ? DEFAULT_SETTINGS.dataFolder : trimmed;
					await plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(t("set.statusbar.name"))
			.setDesc(t("set.statusbar.desc"))
			.addToggle((toggle) =>
				toggle.setValue(plugin.settings.showStatusBar).onChange(async (value) => {
					plugin.settings.showStatusBar = value;
					await plugin.saveSettings();
					plugin.refreshStatusBar();
				}),
			);

		new Setting(containerEl)
			.setName(t("set.sidebar.name"))
			.setDesc(t("set.sidebar.desc"))
			.addToggle((toggle) =>
				toggle.setValue(plugin.settings.showSidebarOnStart).onChange(async (value) => {
					plugin.settings.showSidebarOnStart = value;
					await plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName(t("set.apps.heading")).setHeading();
		containerEl.createEl("p", {
			text: t("set.apps.desc"),
			cls: "setting-item-description",
		});

		const appNames = Object.keys(plugin.settings.apps).sort();
		if (appNames.length === 0) {
			containerEl.createEl("p", { text: t("set.apps.none") });
			return;
		}

		// 除外中（hidden）を上にまとめて表示し、状態が一目で分かるようにする。
		const excluded = appNames.filter((n) => plugin.settings.apps[n].hidden);
		const normal = appNames.filter((n) => !plugin.settings.apps[n].hidden);

		if (excluded.length > 0) {
			containerEl.createEl("p", {
				text: t("set.apps.excludedGroup"),
				cls: "setting-item-description tm-set-group",
			});
			for (const name of excluded) this.renderAppRule(containerEl, name);
		}
		for (const name of normal) this.renderAppRule(containerEl, name);
	}

	/** 1 アプリ分のルール行（表示/除外トグル・タイトル取込トグル）を描く。 */
	private renderAppRule(containerEl: HTMLElement, name: string): void {
		const plugin = this.plugin;
		const rule = plugin.settings.apps[name];
		new Setting(containerEl)
			.setName(name)
			.addToggle((toggle) =>
				toggle
					.setTooltip(t("set.apps.visibleTooltip"))
					.setValue(!rule.hidden)
					.onChange(async (value) => {
						rule.hidden = !value;
						await plugin.saveSettings();
						plugin.refreshOpenViews();
						this.display(); // 除外グループの並びを更新するため描き直す
					}),
			)
			.addToggle((toggle) =>
				toggle
					.setTooltip(t("set.apps.captureTooltip"))
					.setValue(rule.captureTitle)
					.onChange(async (value) => {
						rule.captureTitle = value;
						await plugin.saveSettings();
					}),
			);
	}
}
