import { Plugin } from "obsidian";

export default class TimeMeterPlugin extends Plugin {
	async onload() {
		console.log("timemeter loaded");
	}

	onunload() {}
}
