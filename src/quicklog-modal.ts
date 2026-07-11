// クイックログ用の 1 行テキスト入力モーダル。
// obsidian に実行時依存する（Modal を継承する）ため、純粋関数（./quicklog）とは
// ファイルを分けてある。テスト対象外。

import { Modal, type App } from "obsidian";
import { t } from "./i18n";

/** 1行テキスト入力、Enter/ボタンで確定して onSubmit(text) */
export class QuickLogModal extends Modal {
	private readonly promptText: string;
	private readonly placeholder: string;
	private readonly onSubmit: (text: string) => void;
	private readonly submitLabel: string;
	private inputEl: HTMLInputElement | null = null;
	private submitted = false;

	constructor(
		app: App,
		promptText: string,
		placeholder: string,
		onSubmit: (text: string) => void,
		submitLabel: string = t("modal.save"),
	) {
		super(app);
		this.promptText = promptText;
		this.placeholder = placeholder;
		this.onSubmit = onSubmit;
		this.submitLabel = submitLabel;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("p", { text: this.promptText });

		const input = contentEl.createEl("input", { type: "text" });
		input.style.width = "100%";
		input.placeholder = this.placeholder;
		input.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				this.submit();
			}
		});
		this.inputEl = input;

		const buttonRow = contentEl.createDiv();
		buttonRow.style.marginTop = "0.75em";
		buttonRow.style.textAlign = "right";
		const button = buttonRow.createEl("button", { text: this.submitLabel });
		button.addEventListener("click", () => this.submit());

		window.setTimeout(() => input.focus(), 0);
	}

	private submit(): void {
		if (this.submitted) return;
		this.submitted = true;
		const value = this.inputEl?.value ?? "";
		this.close();
		this.onSubmit(value);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
