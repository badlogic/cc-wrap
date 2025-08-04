import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as readline from "node:readline/promises";
import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-code";

export interface ClaudeOptions {
	configDir?: string;
	workingDir?: string;
	sessionId?: string;
	verbose?: boolean;
}

export interface ClaudeInitInfo {
	sessionId: string;
	model: string;
	tools: string[];
	mcpServers: Array<{ name: string; status: string }>;
	apiKeySource: string;
}

export class Claude {
	private process: ChildProcess | null = null;
	private rl: readline.Interface | null = null;
	private options: ClaudeOptions;
	private initInfo: ClaudeInitInfo | null = null;
	private requestCounter = 0;

	constructor(options: ClaudeOptions = {}) {
		this.options = {
			verbose: true,
			...options,
		};
	}

	/**
	 * Start an interactive Claude session
	 */
	async startInteractive(): Promise<ClaudeInitInfo> {
		const args = ["--output-format", "stream-json", "--input-format", "stream-json"];
		if (this.options.verbose) args.push("--verbose");
		if (this.options.sessionId) args.push("--session", this.options.sessionId);

		await this.startProcess(args);
		return this.initInfo!;
	}

	/**
	 * Send a single prompt and get the response
	 */
	async sendPrompt(prompt: string): Promise<ClaudeInitInfo> {
		const args = ["--print", prompt, "--output-format", "stream-json"];
		if (this.options.verbose) args.push("--verbose");
		if (this.options.sessionId) args.push("--session", this.options.sessionId);

		await this.startProcess(args);
		
		// Wait for init message
		for await (const message of this.messages()) {
			if (message.type === "system" && message.subtype === "init") {
				break;
			}
		}
		
		return this.initInfo!;
	}

	/**
	 * Send a message in interactive mode
	 */
	async sendMessage(text: string): Promise<void> {
		if (!this.process || !this.initInfo) {
			throw new Error("Not in interactive mode. Call startInteractive() first.");
		}

		const message: SDKUserMessage = {
			type: "user",
			message: {
				role: "user",
				content: [{ type: "text", text }],
			},
			parent_tool_use_id: null,
			session_id: this.initInfo.sessionId,
		};

		this.process.stdin!.write(`${JSON.stringify(message)}\n`);
	}

	/**
	 * Send an interrupt request
	 */
	async interrupt(): Promise<void> {
		if (!this.process) {
			throw new Error("No active Claude process");
		}

		const requestId = `req_${++this.requestCounter}_${Math.random().toString(16).substring(2, 10)}`;
		const interruptRequest = {
			type: "control_request",
			request_id: requestId,
			request: { subtype: "interrupt" },
		};

		this.process.stdin!.write(`${JSON.stringify(interruptRequest)}\n`);
	}

	/**
	 * Listen for Claude events
	 */
	on(event: "message", listener: (message: SDKMessage) => void): this;
	on(event: "error", listener: (error: Error) => void): this;
	on(event: "exit", listener: (code: number | null) => void): this;
	on(_event: string, _listener: (...args: any[]) => void): this {
		// Store listeners internally
		return this;
	}

	/**
	 * Get a stream of messages
	 */
	async *messages(): AsyncGenerator<SDKMessage> {
		if (!this.rl) {
			throw new Error("No active Claude process");
		}

		for await (const line of this.rl) {
			try {
				const data = JSON.parse(line);

				// Skip control responses
				if (data.type === "control_response") {
					continue;
				}

				const message: SDKMessage = data;

				// Capture init info
				if (message.type === "system" && message.subtype === "init") {
					this.initInfo = {
						sessionId: message.session_id,
						model: message.model,
						tools: message.tools,
						mcpServers: message.mcp_servers || [],
						apiKeySource: message.apiKeySource,
					};
				}

				yield message;
			} catch (_error) {
				// Ignore parse errors
			}
		}
	}

	/**
	 * Stop the Claude process
	 */
	stop(): void {
		if (this.process) {
			this.process.kill();
			this.process = null;
		}
		if (this.rl) {
			this.rl.close();
			this.rl = null;
		}
	}

	private async startProcess(args: string[]): Promise<void> {
		const env: Record<string, string | undefined> = { ...process.env };
		if (this.options.configDir) {
			env.CLAUDE_CONFIG_DIR = this.options.configDir;
		}

		// Create stderr file
		const stderrPath = join(tmpdir(), `claude-stderr-${Date.now()}.log`);
		const stderrStream = createWriteStream(stderrPath);

		this.process = spawn("claude", args, {
			env,
			cwd: this.options.workingDir,
			stdio: ["pipe", "pipe", "pipe"],
		});

		this.process.stderr!.pipe(stderrStream);

		this.process.on("error", (error) => {
			throw new Error(`Failed to start Claude: ${error.message}`);
		});

		this.rl = readline.createInterface({
			input: this.process.stdout!,
			crlfDelay: Infinity,
		});
	}
}

/**
 * Fluent API helper
 */
export function claude(options?: ClaudeOptions): Claude {
	return new Claude(options);
}
