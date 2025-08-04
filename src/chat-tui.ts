import { homedir } from "node:os";
import { join } from "node:path";
import {
	CombinedAutocompleteProvider,
	Container,
	MarkdownComponent,
	TextComponent,
	TextEditor,
	TUI,
	WhitespaceComponent,
} from "@mariozechner/tui";
import chalk from "chalk";
import { Claude, patchClaudeBinary } from "./claude.js";
import type { SDKMessage, SDKResultMessage } from "./index.js";
import { ToolRenderer } from "./tool-renderers.js";

class LoadingAnimation extends TextComponent {
	private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	private currentFrame = 0;
	private intervalId: NodeJS.Timeout | null = null;
	private ui: TUI | null = null;

	constructor(ui: TUI) {
		super("", { bottom: 1 });
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
	constructor(msg: SDKResultMessage) {
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

	// Patch Claude binary automatically on startup
	patchClaudeBinary();

	// Get initial prompt
	const initialPrompt = process.argv[2];
	const configDir = join(homedir(), ".ccwrap");

	// Initialize Claude
	console.log(chalk.dim("Initializing Claude..."));
	const claude = new Claude([], {
		...process.env,
		CLAUDE_CONFIG_DIR: configDir,
		CLAUDE_CODE_ENTRYPOINT: "sdk-ts",
	});

	const ui = new TUI();
	const header = new TextComponent(chalk.bold("Claude Code SDK Chat"), { bottom: 1 });
	const chatContainer = new Container();
	const loadingContainer = new Container();

	// Show basic info at the top
	const systemInfo = new TextComponent(
		`${chalk.gray("─".repeat(80))}\n` +
			`${chalk.blue("Config:")} ${chalk.dim(configDir)}\n` +
			`${chalk.blue("Working Directory:")} ${chalk.dim(process.cwd())}\n` +
			`${chalk.gray("─".repeat(80))}\n\n` +
			`${chalk.dim("Type /help for commands or start chatting with Claude")}\n` +
			`${chalk.dim("Press Escape to interrupt Claude while processing")}`,
		{ bottom: 1 },
	);

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
	ui.addChild(systemInfo);
	ui.addChild(chatContainer);
	ui.addChild(loadingContainer);
	ui.addChild(editor);
	ui.setFocus(editor);

	let currentLoadingAnimation: LoadingAnimation | null = null;
	let isProcessing = false;
	let currentQueryGenerator: AsyncGenerator<SDKMessage> | null = null;

	// Set up global key handler for Escape
	ui.onGlobalKeyPress = (data: string): boolean => {
		// Intercept Escape key when Claude is processing
		if (data === "\x1b" && isProcessing) {
			try {
				// Send interrupt request (synchronous now)
				claude.interrupt();

				// Show success feedback
				chatContainer.addChild(new TextComponent(chalk.yellow("[Processing interrupted]"), { bottom: 1 }));
				ui.requestRender();
			} catch (error) {
				// Show error feedback
				chatContainer.addChild(
					new TextComponent(
						chalk.red(`[Interrupt failed: ${error instanceof Error ? error.message : String(error)}]`),
						{
							bottom: 1,
						},
					),
				);
				ui.requestRender();
			}

			// Don't forward to editor
			return false;
		}

		// Forward all other keys
		return true;
	};

	// Function to process a query
	async function processQuery(prompt: string) {
		// Mark as processing
		isProcessing = true;
		editor.disableSubmit = true;

		// Show loading animation
		currentLoadingAnimation = new LoadingAnimation(ui);
		loadingContainer.addChild(currentLoadingAnimation);
		ui.requestRender();

		try {
			currentQueryGenerator = claude.query(prompt);

			for await (const event of currentQueryGenerator) {
				const msgType = event.type;
				switch (msgType) {
					case "assistant": {
						const assistantEvent = event;
						for (const block of assistantEvent.message.content) {
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
						// Handle tool results
						const userEvent = event;
						if (userEvent.parent_tool_use_id) {
							// This is a subagent message - ignore for now
							break;
						}

						// Regular user messages contain tool results
						for (const block of userEvent.message.content) {
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
						if (currentLoadingAnimation !== null) {
							currentLoadingAnimation.stop();
							loadingContainer.clear();
							currentLoadingAnimation = null;
						}

						// Add result message
						const resultMsg = new ResultMessage(event);
						chatContainer.addChild(resultMsg);
						ui.requestRender();
						break;
					}

					default:
						// Ignore other message types
						break;
				}
			}
		} catch (error) {
			// Remove loading animation on error
			if (currentLoadingAnimation !== null) {
				currentLoadingAnimation.stop();
				loadingContainer.clear();
				currentLoadingAnimation = null;
			}

			// Show error
			chatContainer.addChild(
				new TextComponent(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`), {
					bottom: 1,
				}),
			);
			ui.requestRender();
		} finally {
			// Mark as no longer processing
			isProcessing = false;
			editor.disableSubmit = false;
			currentQueryGenerator = null;
		}
	}

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
					claude.stop();
					ui.stop();
					process.exit(0);
					return;
			}
		}

		// Add user message to chat
		chatContainer.addChild(new TextComponent(chalk.green("You")));
		chatContainer.addChild(new MarkdownComponent(text));
		chatContainer.addChild(new WhitespaceComponent(1));

		// Process the query
		processQuery(text);
	};

	// Handle Ctrl+C
	process.on("SIGINT", () => {
		if (currentLoadingAnimation) {
			currentLoadingAnimation.stop();
		}
		claude.stop();
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

		// Process the query
		processQuery(initialPrompt);
	}
}

main().catch(console.error);
