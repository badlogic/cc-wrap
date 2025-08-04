import { type ChildProcess, spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import * as readline from "node:readline/promises";
import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-code";
import {
	CombinedAutocompleteProvider,
	Container,
	MarkdownComponent,
	TextComponent,
	TextEditor,
	TUI,
	WhitespaceComponent
} from "@mariozechner/tui";
import chalk from "chalk";
import { ToolRenderer } from "./tool-renderers.js";

class LoadingAnimation extends TextComponent {
	private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	private currentFrame = 0;
	private intervalId: NodeJS.Timeout | null = null;
	private ui: TUI | null = null;

	constructor(ui: TUI) {
		super("");
		this.ui = ui;
		this.start();
	}

	start() {
		this.updateDisplay();
		this.intervalId = setInterval(() => {
			this.currentFrame = (this.currentFrame + 1) % this.frames.length;
			this.updateDisplay();
		}, 80);
	}

	stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	private updateDisplay() {
		const frame = this.frames[this.currentFrame];
		this.setText(`${chalk.cyan(frame)} ${chalk.dim("Claude is thinking...")}`);
		if (this.ui) {
			this.ui.requestRender();
		}
	}
}

class ResultMessage extends TextComponent {
	constructor(msg: SDKMessage & { type: "result" }) {
		let text: string;
		if (msg.is_error) {
			text = chalk.red(`[Error] ${msg.subtype}`);
		} else {
			const usage = msg.usage;
			const inputTokens = usage.input_tokens;
			const outputTokens = usage.output_tokens;
			const cacheReadTokens = usage.cache_read_input_tokens || 0;
			const cacheWriteTokens = usage.cache_creation_input_tokens || 0;

			let usageStr = chalk.dim("[Complete] ");
			usageStr += chalk.dim(`Cost: $${msg.total_cost_usd.toFixed(4)}`);
			usageStr += chalk.dim(` | Input: ${inputTokens}`);
			if (cacheWriteTokens > 0) {
				usageStr += chalk.dim(` | Cache Write: ${cacheWriteTokens}`);
			}
			if (cacheReadTokens > 0) {
				usageStr += chalk.dim(` | Cache Read: ${cacheReadTokens}`);
			}
			usageStr += chalk.dim(` | Output: ${outputTokens}`);
			text = usageStr;
		}
		super(text, { bottom: 1 });
	}
}

async function main() {
	if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
		console.error(chalk.red("Error: No authentication found."));
		console.error(chalk.dim("Please set either ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN"));
		process.exit(1);
	}

	if (process.env.ANTHROPIC_API_KEY) {
		console.log("ANTHROPCIC_API_KEY is set, using it for authentication.");
	} else {
		console.log("CLAUDE_CODE_OAUTH_TOKEN is set, using it for authentication.");
	}

	const initialPrompt = process.argv[2];
	const configDir = join(homedir(), ".ccwrap");
	process.env.CLAUDE_CONFIG_DIR = configDir;

	const ui = new TUI();
	const header = new TextComponent(chalk.bold("Claude Code SDK Chat"), { bottom: 1 });
	const chatContainer = new Container();
	const loadingContainer = new Container();

	// Text editor with autocomplete
	const editor = new TextEditor();
	const autocompleteProvider = new CombinedAutocompleteProvider(
		[
			{ name: "help", description: "Show available commands" },
			{ name: "clear", description: "Clear chat history" },
			{ name: "exit", description: "Exit the chat" },
			{ name: "quit", description: "Exit the chat" },
		],
		process.cwd(),
	);
	editor.setAutocompleteProvider(autocompleteProvider);

	// Add components to UI
	ui.addChild(header);
	ui.addChild(chatContainer);
	ui.addChild(loadingContainer);
	ui.addChild(editor);
	ui.setFocus(editor);

	// Set up global key handler for Escape
	ui.onGlobalKeyPress = (data: string): boolean => {
		// Intercept Escape key when Claude is processing
		if (data === "\x1b" && isProcessing) {
			// Send interrupt request
			const requestId = `req_${++requestCounter}_${Math.random().toString(16).substring(2, 10)}`;
			const interruptRequest = {
				type: "control_request",
				request_id: requestId,
				request: {
					subtype: "interrupt",
				},
			};

			claudeProcess.stdin!.write(JSON.stringify(interruptRequest) + "\n");

			// Show feedback
			chatContainer.addChild(new TextComponent(chalk.yellow("[Interrupt requested]"), { bottom: 1 }));
			ui.requestRender();

			// Don't forward to editor
			return false;
		}

		// Forward all other keys
		return true;
	};

	// Start Claude process
	const claudeProcess: ChildProcess = spawn(
		"claude",
		["--print", "--output-format", "stream-json", "--input-format", "stream-json", "--verbose"],
		{
			env: {
				...process.env,
				CLAUDE_CONFIG_DIR: configDir,
			},
			stdio: ["pipe", "pipe", "pipe"],
		},
	);

	claudeProcess.on("error", (error) => {
		console.error(chalk.red("Failed to start Claude:"), error.message);
		ui.stop();
		process.exit(1);
	});

	const claudeOutput = readline.createInterface({
		input: claudeProcess.stdout!,
		crlfDelay: Infinity,
	});

	let isFirstSystemMessage = true;
	let sessionId = "";
	let currentLoadingAnimation: LoadingAnimation | null = null;
	let isProcessing = false;
	let requestCounter = 0;

	// Handle Claude output
	claudeOutput.on("line", (line) => {
		try {
			const data = JSON.parse(line);

			// Handle control responses separately
			if (data.type === "control_response") {
				const response = data.response;
				if (response.subtype === "success") {
					chatContainer.addChild(new TextComponent(chalk.green("[Interrupt successful]"), { bottom: 1 }));
				} else if (response.subtype === "error") {
					chatContainer.addChild(
						new TextComponent(chalk.red(`[Interrupt failed: ${response.error}]`), { bottom: 1 }),
					);
				}
				ui.requestRender();
				return;
			}

			const message: SDKMessage = data;
			switch (message.type) {
				case "system":
					if (message.subtype === "init" && isFirstSystemMessage) {
						isFirstSystemMessage = false;
						sessionId = message.session_id;
						const tools = message.tools.join(", ");
						const mcpServers = message.mcp_servers
							.map((s: { name: string; status: string }) => `${s.name} (${s.status})`)
							.join(", ");

						const systemInfo = new TextComponent(
							`${chalk.gray("─".repeat(80))}\n` +
								`${chalk.blue("Session:")} ${chalk.dim(sessionId)}\n` +
								`${chalk.blue("Model:")} ${chalk.white(message.model)}\n` +
								`${chalk.blue("Config:")} ${chalk.dim(configDir)}\n` +
								`${chalk.blue("Tools:")} ${chalk.dim(tools)}\n` +
								`${chalk.blue("MCP Servers:")} ${chalk.dim(mcpServers || "none")}\n` +
								`${chalk.gray("─".repeat(80))}\n\n` +
								`${chalk.dim("Type /help for commands or start chatting with Claude")}\n` +
								`${chalk.dim("Press Escape to interrupt Claude while processing")}`,
							{ bottom: 1 },
						);
						chatContainer.addChild(systemInfo);
						ui.requestRender();
					}
					break;

				case "assistant": {
					for (const block of message.message.content) {
						if (block.type === "text" && block.text) {
							chatContainer.addChild(new TextComponent(chalk.magenta("Claude")));
							chatContainer.addChild(new MarkdownComponent(block.text));
							chatContainer.addChild(new WhitespaceComponent(1));
						} else if (block.type === "tool_use") {
							// Use custom renderer for tool calls
							const toolInfo = ToolRenderer.renderToolUse(block);
							const toolMsg = new TextComponent(toolInfo, { bottom: 1 });
							chatContainer.addChild(toolMsg);
						}
					}
					ui.requestRender();
					break;
				}

				case "user": {
					// Handle tool results and subagent messages
					if (message.parent_tool_use_id) {
						// TODO This is a subagent message - ignore for now
						break;
					}

					// Regular user messages contain tool results
					for (const block of (message as SDKUserMessage).message.content) {
						if (typeof block === "object" && block.type === "tool_result") {
							// Use custom renderer for tool results
							const result = ToolRenderer.renderToolResult(block);
							chatContainer.addChild(new TextComponent(result.header));
							chatContainer.addChild(new TextComponent(result.content, { bottom: 1 }));

							if (result.truncated) {
								chatContainer.addChild(new TextComponent(chalk.dim(result.truncated), { bottom: 1 }));
							}
						}
					}
					ui.requestRender();
					break;
				}

				case "result": {
					// Remove loading animation when we get the result
					if (currentLoadingAnimation) {
						currentLoadingAnimation.stop();
						loadingContainer.clear();
						currentLoadingAnimation = null;
					}

					// Mark as no longer processing
					isProcessing = false;
					editor.disableSubmit = false;

					// Add result message
					const resultMsg = new ResultMessage(message);
					chatContainer.addChild(resultMsg);
					ui.requestRender();
					break;
				}
			}
		} catch (_error) {
			// Ignore parse errors
		}
	});

	claudeProcess.on("exit", (code) => {
		chatContainer.addChild(new TextComponent(chalk.dim(`Claude process exited with code ${code}`), { bottom: 1 }));
		ui.requestRender();
		setTimeout(() => {
			ui.stop();
			process.exit(code || 0);
		}, 2000);
	});

	// Handle user input
	editor.onSubmit = (text: string) => {
		text = text.trim();
		if (!text) return;

		// Don't allow submission while Claude is processing
		if (isProcessing) return;

		// Handle slash commands
		if (text.startsWith("/")) {
			const command = text.slice(1).toLowerCase();

			switch (command) {
				case "help": {
					const helpText = new TextComponent(
						`${chalk.blue("Available commands:")}\n` +
							`  ${chalk.cyan("/help")}  - Show this help\n` +
							`  ${chalk.cyan("/clear")} - Clear chat history\n` +
							`  ${chalk.cyan("/exit")}  - Exit the chat\n` +
							`  ${chalk.cyan("/quit")}  - Exit the chat`,
						{ bottom: 1 },
					);
					chatContainer.addChild(helpText);
					ui.requestRender();
					return;
				}

				case "clear":
					chatContainer.clear();
					ui.requestRender();
					return;

				case "exit":
				case "quit":
					claudeProcess.kill();
					ui.stop();
					process.exit(0);
					return;
			}
		}

		// Add user message to chat
		chatContainer.addChild(new TextComponent(chalk.green("You")));
		chatContainer.addChild(new MarkdownComponent(text));
		chatContainer.addChild(new WhitespaceComponent(1));

		// Show loading animation
		currentLoadingAnimation = new LoadingAnimation(ui);
		loadingContainer.addChild(currentLoadingAnimation);
		ui.requestRender();

		// Mark as processing
		isProcessing = true;
		editor.disableSubmit = true;

		// Send to Claude
		const userMessage: SDKUserMessage = {
			type: "user",
			message: {
				role: "user",
				content: [
					{
						type: "text",
						text: text,
					},
				],
			},
			parent_tool_use_id: null,
			session_id: sessionId,
		};

		claudeProcess.stdin!.write(`${JSON.stringify(userMessage)}\n`);
	};

	// Handle Ctrl+C
	process.on("SIGINT", () => {
		if (currentLoadingAnimation) {
			currentLoadingAnimation.stop();
		}
		claudeProcess.kill();
		ui.stop();
		process.exit(0);
	});

	// Start the UI
	ui.start();

	// Send initial prompt if provided
	if (initialPrompt) {
		// Add user message to chat
		chatContainer.addChild(new TextComponent(chalk.green("You")));
		chatContainer.addChild(new MarkdownComponent(initialPrompt));
		chatContainer.addChild(new WhitespaceComponent(1));

		// Show loading animation
		currentLoadingAnimation = new LoadingAnimation(ui);
		loadingContainer.addChild(currentLoadingAnimation);
		ui.requestRender();

		// Mark as processing
		isProcessing = true;
		editor.disableSubmit = true;

		// Send to Claude
		const userMessage: SDKUserMessage = {
			type: "user",
			message: {
				role: "user",
				content: [
					{
						type: "text",
						text: initialPrompt,
					},
				],
			},
			parent_tool_use_id: null,
			session_id: "", // Session ID will be set by Claude
		};

		claudeProcess.stdin!.write(`${JSON.stringify(userMessage)}\n`);
	}
}

main().catch(console.error);
