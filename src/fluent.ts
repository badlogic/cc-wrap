import type { SDKResultMessage } from "@anthropic-ai/claude-code";
import { Claude, type ClaudeEvent } from "./claude.js";

export class ClaudeCodeBuilder {
	private claude: Claude | null = null;
	private lastSessionId: string | null = null;
	private currentPrompt: string | null = null;
	private currentQuery: AsyncGenerator<ClaudeEvent> | null = null;

	// Configuration state
	private args: string[] = [];
	private env: Record<string, string>;
	private lastArgsKey: string | null = null;

	constructor(env?: Record<string, string>) {
		this.env = env || (process.env as Record<string, string>);
	}

	prompt(text: string): this {
		this.currentPrompt = text;
		return this;
	}

	sessionId(id: string): this {
		this.updateArgs("--session", id);
		return this;
	}

	workingDirectory(dir: string): this {
		this.updateArgs("--cwd", dir);
		return this;
	}

	model(model: string): this {
		this.updateArgs("--model", model);
		return this;
	}

	private updateArgs(flag: string, value: string): void {
		// Remove any existing instance of this flag
		const newArgs = this.args.filter((arg, i) => !(arg === flag && i + 1 < this.args.length));
		newArgs.push(flag, value);
		this.args = newArgs;
	}

	private getArgsKey(): string {
		return this.args.join("|");
	}

	private needsNewProcess(): boolean {
		const currentArgsKey = this.getArgsKey();
		return this.lastArgsKey !== currentArgsKey;
	}

	private ensureProcess(): void {
		if (!this.claude || this.needsNewProcess()) {
			// Stop old process if exists
			if (this.claude) {
				this.claude.stop();
			}

			// If we have a previous session, pass it along
			const args = [...this.args];
			if (this.lastSessionId && !args.includes("--session")) {
				args.push("--resume", this.lastSessionId);
			}

			// Create new process
			this.claude = new Claude(args, this.env);
			this.lastArgsKey = this.getArgsKey();
		}
	}

	async *stream(): AsyncGenerator<ClaudeEvent> {
		if (!this.currentPrompt) {
			throw new Error("No prompt set. Call .prompt() first.");
		}

		this.ensureProcess();

		// Track session ID from init event
		let seenInit = false;

		// Store the generator so we can access it for interrupt
		this.currentQuery = this.claude!.query(this.currentPrompt);

		try {
			for await (const event of this.currentQuery) {
				if (!seenInit && event.type === "system" && event.subtype === "init") {
					seenInit = true;
					this.lastSessionId = event.session_id;
				}
				yield event;
			}
		} finally {
			// Reset state after completion
			this.currentPrompt = null;
			this.currentQuery = null;
		}
	}

	async execute(): Promise<ClaudeEvent[]> {
		const events: ClaudeEvent[] = [];
		for await (const event of this.stream()) {
			events.push(event);
		}
		return events;
	}

	async text(): Promise<string> {
		const events = await this.execute();
		const resultEvent = events.find((e) => e.type === "result") as SDKResultMessage | undefined;
		if (resultEvent && resultEvent.subtype === "success") {
			return resultEvent.result || "";
		}
		return "";
	}

	async result(): Promise<SDKResultMessage> {
		const events = await this.execute();
		const resultEvent = events.find((e) => e.type === "result") as SDKResultMessage | undefined;
		if (!resultEvent) {
			throw new Error("No result event found");
		}
		return resultEvent;
	}

	interrupt(): void {
		if (!this.claude) {
			throw new Error("No active Claude instance to interrupt");
		}

		this.claude.interrupt();
	}

	stop(): void {
		if (this.claude) {
			this.claude.stop();
			this.claude = null;
			this.currentQuery = null;
		}
	}
}

export const ClaudeCode = {
	create(env?: Record<string, string>): ClaudeCodeBuilder {
		return new ClaudeCodeBuilder(env);
	},
};
