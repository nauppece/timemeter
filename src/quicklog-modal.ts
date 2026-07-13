// クイックログ用の 1 行テキスト入力モーダル。
// obsidian に実行時依存する（Modal を継承する）ため、純粋関数（./quicklog）とは
// ファイルを分けてある。テスト対象外。

import { Modal, type App } from "obsidian";
import { t } from "./i18n";

/** 追記先などの選択肢を入力欄の上に出すためのピッカー設定。 */
export interface ModalPicker {
	label: string;
	options: { value: string; label: string }[];
	initial: string;
}

/** 1行テキスト入力、Enter/ボタンで確定して onSubmit(text, pickerValue) */
export class QuickLogModal extends Modal {
	private readonly promptText: string;
	private readonly placeholder: string;
	private readonly onSubmit: (text: string, pickerValue: string) => void;
	private readonly submitLabel: string;
	private readonly picker: ModalPicker | null;
	private inputEl: HTMLInputElement | null = null;
	private selectEl: HTMLSelectElement | null = null;
	private submitted = false;

	constructor(
		app: App,
		promptText: string,
		placeholder: string,
		onSubmit: (text: string, pickerValue: string) => void,
		submitLabel: string = t("modal.save"),
		picker: ModalPicker | null = null,
	) {
		super(app);
		this.promptText = promptText;
		this.placeholder = placeholder;
		this.onSubmit = onSubmit;
		this.submitLabel = submitLabel;
		this.picker = picker;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("p", { text: this.promptText });

		// 追記先などのピッカー（指定時のみ）。入力欄の上に「ラベル＋select」を出す。
		if (this.picker) {
			const row = contentEl.createDiv({ cls: "tm-modal-picker" });
			row.createSpan({ cls: "lbl", text: this.picker.label });
			const select = row.createEl("select");
			for (const opt of this.picker.options) {
				select.createEl("option", { value: opt.value, text: opt.label });
			}
			select.value = this.picker.initial;
			this.selectEl = select;
		}

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
		const pickerValue = this.selectEl?.value ?? "";
		this.close();
		this.onSubmit(value, pickerValue);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
