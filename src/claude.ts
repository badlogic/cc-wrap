import { type ChildProcess, execSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface, type Interface } from "node:readline";
import type {
	SDKAssistantMessage,
	SDKResultMessage,
	SDKSystemMessage,
	SDKUserMessage,
} from "@anthropic-ai/claude-code";

export function patchClaudeBinary(): void {
	const claudePath = getClaudePath();

	// Create backup
	const backupPath = `${claudePath}.backup`;
	if (!existsSync(backupPath)) {
		copyFileSync(claudePath, backupPath);
	}

	// Read the Claude binary
	const content = readFileSync(claudePath, "utf8");

	// Multiple patterns to match different variations of anti-debugging checks
	const patterns = [
		// Standard pattern: if(PF5())process.exit(1);
		/if\([A-Za-z0-9_$]+\(\)\)process\.exit\(1\);/g,
		// With spaces: if (PF5()) process.exit(1);
		/if\s*\([A-Za-z0-9_$]+\(\)\)\s*process\.exit\(1\);/g,
		// Different exit codes: if(PF5())process.exit(2);
		/if\([A-Za-z0-9_$]+\(\)\)process\.exit\(\d+\);/g,
	];

	let patchedContent = content;
	let patched = false;

	for (const pattern of patterns) {
		const newContent = patchedContent.replace(pattern, "if(false)process.exit(1);");
		if (newContent !== patchedContent) {
			patchedContent = newContent;
			patched = true;
		}
	}

	if (!patched) {
		// Already patched or no pattern found
		return;
	}

	// Write patched version
	writeFileSync(claudePath, patchedContent);
}

export function getClaudePath(): string {
	// First try which (in PATH)
	try {
		const claudePath = execSync("which claude", { encoding: "utf8" }).trim();
		if (claudePath) return claudePath;
	} catch {
		// which failed, continue searching
	}

	// Check common locations including the claude local installation
	const locations = [
		join(homedir(), ".claude/local/claude"),
		join(homedir(), ".npm-global/bin/claude"),
		"/usr/local/bin/claude",
		join(homedir(), ".local/bin/claude"),
		join(homedir(), "node_modules/.bin/claude"),
		join(homedir(), ".yarn/bin/claude"),
	];

	for (const path of locations) {
		if (existsSync(path)) {
			return path;
		}
	}

	// Check if Node.js is installed
	try {
		execSync("which node", { encoding: "utf8" });
	} catch {
		throw new Error(
			"Claude Code requires Node.js, which is not installed.\n" +
				"Install Node.js from: https://nodejs.org/\n" +
				"\nAfter installing Node.js, install Claude Code:\n" +
				"  npm install -g @anthropic-ai/claude-code",
		);
	}

	// Node is installed but Claude not found
	throw new Error(
		"Claude Code not found. Install with:\n" +
			"  npm install -g @anthropic-ai/claude-code\n" +
			"\nIf already installed locally, try:\n" +
			'  export PATH="$HOME/node_modules/.bin:$PATH"',
	);
}

// Additional event types not in SDK but documented in claude-stream-json.md
export interface ControlRequestEvent {
	type: "control_request";
	request_id: string;
	request: {
		subtype: "interrupt";
	};
}

export interface ControlResponseEvent {
	type: "control_response";
	response: {
		request_id: string;
		subtype: "success" | "error";
		error?: string;
	};
}

// Type for control response handler
type ControlResponseHandler = (response: ControlResponseEvent["response"]) => void;

// Error event for internal use
interface ErrorEvent {
	type: "error";
	error: Error;
}

// Union type including SDK messages and additional event types
export type ClaudeEvent =
	| SDKSystemMessage
	| SDKAssistantMessage
	| SDKUserMessage
	| SDKResultMessage
	| ControlRequestEvent
	| ControlResponseEvent;

// Internal event type that includes error events
type InternalEvent = ClaudeEvent | ErrorEvent;

export class Claude {
	private process: ChildProcess;
	private rl: Interface;
	private sessionId: string = "";
	private currentHandler: ((event: InternalEvent) => void) | null = null;
	private error: Error | null = null;
	private pendingControlResponses = new Map<string, ControlResponseHandler>();
	private isInterrupted = false;

	constructor(args: string[], env: Record<string, string>) {
		// Always add required args for interactive mode
		const fullArgs = ["--output-format", "stream-json", "--input-format", "stream-json", "--verbose", ...args];

		this.process = spawn(getClaudePath(), fullArgs, {
			env: { ...process.env, ...env },
			stdio: ["pipe", "pipe", "pipe"],
		});

		this.rl = createInterface({ input: this.process.stdout! });

		this.rl.on("line", (line) => {
			try {
				const event = JSON.parse(line);

				// Handle control responses separately
				if (event.type === "control_response") {
					const handler = this.pendingControlResponses.get(event.response.request_id);
					if (handler) {
						this.pendingControlResponses.delete(event.response.request_id);
						handler(event.response);
					}
					return;
				}

				if (event.type === "system" && event.subtype === "init") {
					this.sessionId = event.session_id;
				}

				if (this.currentHandler) {
					this.currentHandler(event);
				}
			} catch {
				console.error("Failed to parse line:", line);
			}
		});

		// Handle process errors
		this.process.on("error", (err) => {
			this.error = new Error(`Claude process error: ${err.message}`);
			if (this.currentHandler) {
				// Send a fake error event
				this.currentHandler({ type: "error", error: this.error });
			}
		});

		this.process.on("exit", (code, _signal) => {
			if (this.isInterrupted) {
				// Process was interrupted by user
				this.error = new Error("Interrupted by user");
				if (this.currentHandler) {
					this.currentHandler({ type: "error", error: this.error });
				}
			} else if (code !== 0) {
				this.error = new Error(`Claude process exited with code ${code}`);
				if (this.currentHandler) {
					this.currentHandler({ type: "error", error: this.error });
				}
			}
		});
	}

	async *query(prompt: string): AsyncGenerator<ClaudeEvent> {
		if (this.currentHandler) {
			throw new Error("Query already in progress");
		}

		if (this.error) {
			throw this.error;
		}

		// Queue for this query
		const events: InternalEvent[] = [];
		let resolve: ((value: InternalEvent) => void) | null = null;
		let reject: ((error: Error) => void) | null = null;

		this.currentHandler = (event: InternalEvent) => {
			if (event.type === "error") {
				if (reject) {
					reject(event.error);
					reject = null;
				} else {
					// Store error to throw when we get to it
					events.push(event);
				}
			} else if (resolve) {
				resolve(event);
				resolve = null;
			} else {
				events.push(event);
			}
		};

		// Send user message
		const userMessage: SDKUserMessage = {
			type: "user",
			message: {
				role: "user",
				content: [{ type: "text", text: prompt }],
			},
			parent_tool_use_id: null,
			session_id: this.sessionId || "", // Will be set after init
		};

		this.process.stdin!.write(`${JSON.stringify(userMessage)}\n`);

		// Yield events
		try {
			while (true) {
				const event =
					events.shift() ||
					(await new Promise<InternalEvent>((res, rej) => {
						resolve = res;
						reject = rej;
					}));

				if (event.type === "error") {
					throw event.error;
				}

				yield event as ClaudeEvent;

				if (event.type === "result") {
					break;
				}
			}
		} finally {
			this.currentHandler = null;
			this.isInterrupted = false; // Reset for next query
		}
	}

	interrupt(): void {
		// Mark as interrupted
		this.isInterrupted = true;

		// Kill the process - this is what actually stops Claude
		if (this.process && !this.process.killed) {
			this.process.kill("SIGTERM");
		}
	}

	stop(): void {
		this.rl.close();
		this.process.kill();
	}
}
