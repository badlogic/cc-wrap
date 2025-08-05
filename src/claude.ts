import { type ChildProcess, spawn } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-code";
import { getClaudePath } from "@mariozechner/cc-antidebug";

// Error event for internal use
interface ErrorEvent {
	type: "error";
	error: Error;
}

// Internal event type that includes error events
type InternalEvent = SDKMessage | ErrorEvent;

export class Claude {
	private process!: ChildProcess;
	private rl!: Interface;
	private sessionId: string = "";
	private currentHandler: ((event: InternalEvent) => void) | null = null;
	private error: Error | null = null;
	private isInterrupted = false;
	private needsRecreation = false;
	private args: string[];
	private env: Record<string, string>;

	constructor(args: string[], env: Record<string, string>) {
		// Store args for recreation
		this.args = args;
		this.env = env;

		// Spawn initial process
		this.spawnProcess();
	}

	private spawnProcess(): void {
		// Preserve session by adding resume flag if we have a session
		const argsWithSession = [...this.args];
		if (this.sessionId && !argsWithSession.includes("--session") && !argsWithSession.includes("--resume")) {
			argsWithSession.push("--resume", this.sessionId);
		}

		// Always add required args for interactive mode
		const fullArgs = [
			"--output-format",
			"stream-json",
			"--input-format",
			"stream-json",
			"--verbose",
			...argsWithSession,
		];

		this.process = spawn(getClaudePath(), fullArgs, {
			env: { ...process.env, ...this.env },
			stdio: ["pipe", "pipe", "pipe"],
		});

		this.rl = createInterface({ input: this.process.stdout! });

		this.rl.on("line", (line) => {
			try {
				const event = JSON.parse(line);

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
				// Mark for recreation instead of setting permanent error
				this.needsRecreation = true;
				// Send error event to stop the async generator
				if (this.currentHandler) {
					this.currentHandler({ type: "error", error: new Error("Interrupted by user") });
				}
			} else if (code !== 0) {
				this.error = new Error(`Claude process exited with code ${code}`);
				if (this.currentHandler) {
					this.currentHandler({ type: "error", error: this.error });
				}
			}
		});
	}

	async *query(prompt: string): AsyncGenerator<SDKMessage> {
		if (this.currentHandler) {
			throw new Error("Query already in progress");
		}

		// Check if process needs recreation (from interrupt)
		if (this.needsRecreation) {
			// Stop old process if exists
			if (this.process && !this.process.killed) {
				this.rl.close();
				this.process.kill();
			}

			// Clear error state and recreate
			this.error = null;
			this.needsRecreation = false;
			this.isInterrupted = false;

			// Respawn process with session preservation
			this.spawnProcess();
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

				yield event as SDKMessage;

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
		// Mark as interrupted and needs recreation
		this.isInterrupted = true;
		this.needsRecreation = true;

		// Kill the process - this is what actually stops Claude
		if (this.process && !this.process.killed) {
			this.process.kill("SIGTERM");
			this.rl.close();
		}
	}

	stop(): void {
		this.rl.close();
		this.process.kill();
	}
}
