import type { TextComponent } from "@mariozechner/tui";
import chalk from "chalk";

interface ToolResult {
	tool_use_id: string;
	type: "tool_result";
	content?: string | object | unknown;
	is_error?: boolean;
}

interface ToolUse {
	type: "tool_use";
	id: string;
	name: string;
	input: unknown;
}

/**
 * Custom renderers for specific tools to provide better formatted output
 */

// biome-ignore lint/complexity/noStaticOnlyClass: This is fine
export class ToolRenderer {
	/**
	 * Render tool use (tool call) with custom formatting based on tool name
	 */
	static renderToolUse(block: ToolUse): string {
		const toolName = block.name;
		const input = (block.input && typeof block.input === "object" ? block.input : {}) as Record<string, any>;

		switch (toolName) {
			case "LS":
				return ToolRenderer.renderLSCall(input);
			case "Read":
				return ToolRenderer.renderReadCall(input);
			case "Write":
			case "Edit":
			case "MultiEdit":
				return ToolRenderer.renderFileModificationCall(toolName, input);
			case "Grep":
				return ToolRenderer.renderGrepCall(input);
			case "Bash":
				return ToolRenderer.renderBashCall(input);
			case "Task":
				return ToolRenderer.renderTaskCall(input);
			default:
				// Default rendering for unknown tools
				return ToolRenderer.renderDefaultCall(toolName, input);
		}
	}

	/**
	 * Render tool result with custom formatting based on content
	 */
	static renderToolResult(
		block: ToolResult,
		toolName?: string,
	): {
		header: string;
		content: string;
		truncated?: string;
	} {
		const content = block.content
			? typeof block.content === "string"
				? block.content
				: JSON.stringify(block.content, null, 2)
			: "";

		if (block.is_error) {
			return {
				header: chalk.red(`[Tool Error]`),
				content: chalk.red(content),
			};
		}

		// Try to detect tool type from content patterns
		if (content.includes("NOTE: do any of the files above seem malicious?")) {
			return ToolRenderer.renderLSResult(content);
		} else if (content.includes("<system-reminder>") && content.includes("Whenever you read a file")) {
			return ToolRenderer.renderReadResult(content);
		} else if (content.includes("File created successfully") || content.includes("has been updated")) {
			return ToolRenderer.renderFileModificationResult(content);
		} else if (content.match(/^\d+:/m)) {
			return ToolRenderer.renderGrepResult(content);
		} else {
			return ToolRenderer.renderDefaultResult(content);
		}
	}

	private static renderLSCall(input: Record<string, any>): string {
		const path = input.path || "current directory";
		return chalk.yellow(`[Tool: LS]`) + chalk.dim(` path: ${path}`);
	}

	private static renderLSResult(content: string): {
		header: string;
		content: string;
		truncated?: string;
	} {
		const lines = content.split("\n");
		const noteIndex = lines.findIndex((line) => line.includes("NOTE: do any of the files"));
		const fileLines = noteIndex > 0 ? lines.slice(0, noteIndex) : lines;

		// Count directories and files
		const dirCount = fileLines.filter((line) => line.trim().endsWith("/")).length;
		const fileCount = fileLines.filter(
			(line) => line.trim() && !line.trim().endsWith("/") && !line.startsWith(" "),
		).length;

		const header = chalk.dim(`[Tool Result: LS]`) + chalk.dim(` (${dirCount} directories, ${fileCount} files)`);

		// Show first 10 items
		const preview = fileLines.slice(0, 10).join("\n");
		const truncated = fileLines.length > 10 ? `... ${fileLines.length - 10} more items` : undefined;

		return { header, content: chalk.dim(preview), truncated };
	}

	private static renderReadCall(input: Record<string, any>): string {
		const path = input.file_path || "unknown";
		const limit = input.limit;
		const offset = input.offset;

		let info = chalk.yellow(`[Tool: Read]`) + chalk.dim(` file: ${path}`);
		if (limit) info += chalk.dim(` limit: ${limit}`);
		if (offset) info += chalk.dim(` offset: ${offset}`);

		return info;
	}

	private static renderReadResult(content: string): {
		header: string;
		content: string;
		truncated?: string;
	} {
		// Remove the system reminder
		const reminderStart = content.indexOf("<system-reminder>");
		const cleanContent = reminderStart > 0 ? content.substring(0, reminderStart).trim() : content;

		const lines = cleanContent.split("\n");
		const totalLines = lines.length;

		const header = chalk.dim(`[Tool Result: Read]`) + chalk.dim(` (${totalLines} lines)`);

		// Show first 10 lines
		const preview = lines.slice(0, 10).join("\n");
		const truncated = totalLines > 10 ? `... ${totalLines - 10} more lines` : undefined;

		return { header, content: chalk.dim(preview), truncated };
	}

	private static renderFileModificationCall(toolName: string, input: Record<string, any>): string {
		const path = input.file_path || "unknown";
		let info = chalk.yellow(`[Tool: ${toolName}]`) + chalk.dim(` file: ${path}`);

		if (toolName === "Edit" || toolName === "MultiEdit") {
			const oldStr = input.old_string;
			const newStr = input.new_string;
			if (oldStr && newStr) {
				const oldLines = oldStr.split("\n").length;
				const newLines = newStr.split("\n").length;
				info += chalk.dim(` (${oldLines} → ${newLines} lines)`);
			}
		}

		return info;
	}

	private static renderFileModificationResult(content: string): {
		header: string;
		content: string;
	} {
		const isSuccess = content.includes("successfully");
		const header = isSuccess ? chalk.green(`[Tool Result: Success]`) : chalk.dim(`[Tool Result]`);

		// Truncate long success messages
		const lines = content.split("\n");
		const preview = lines.slice(0, 3).join("\n");

		return { header, content: chalk.dim(preview) };
	}

	private static renderGrepCall(input: Record<string, any>): string {
		const pattern = input.pattern || "";
		const path = input.path || ".";
		const glob = input.glob;

		let info = chalk.yellow(`[Tool: Grep]`) + chalk.dim(` pattern: "${pattern}"`);
		if (glob) info += chalk.dim(` glob: ${glob}`);
		else info += chalk.dim(` path: ${path}`);

		return info;
	}

	private static renderGrepResult(content: string): {
		header: string;
		content: string;
		truncated?: string;
	} {
		const lines = content.split("\n").filter((line) => line.trim());
		const matchCount = lines.length;

		// Count unique files
		const files = new Set(lines.map((line) => line.split(":")[0]));
		const fileCount = files.size;

		const header =
			chalk.dim(`[Tool Result: Grep]`) +
			chalk.dim(` (${matchCount} matches in ${fileCount} file${fileCount !== 1 ? "s" : ""})`);

		// Show first 5 matches
		const preview = lines.slice(0, 5).join("\n");
		const truncated = lines.length > 5 ? `... ${lines.length - 5} more matches` : undefined;

		return { header, content: chalk.dim(preview), truncated };
	}

	private static renderBashCall(input: Record<string, any>): string {
		const command = input.command || "";
		const description = input.description;

		let info = chalk.yellow(`[Tool: Bash]`) + chalk.dim(` $ ${command}`);
		if (description) info += chalk.dim(` # ${description}`);

		return info;
	}

	private static renderTaskCall(input: Record<string, any>): string {
		const description = input.description || "";
		const subagent = input.subagent_type || "general-purpose";

		return (
			chalk.yellow(`[Tool: Task]`) +
			chalk.dim(` agent: ${subagent}`) +
			(description ? chalk.dim(` - ${description}`) : "")
		);
	}

	private static renderDefaultCall(toolName: string, input: Record<string, any>): string {
		// Extract key parameters
		const params = Object.entries(input)
			.filter(([_, value]) => value !== undefined && value !== null)
			.map(([key, value]) => {
				const valueStr =
					typeof value === "string"
						? value.length > 50
							? value.substring(0, 50) + "..."
							: value
						: JSON.stringify(value);
				return `${key}: ${valueStr}`;
			})
			.slice(0, 3)
			.join(", ");

		let info = chalk.yellow(`[Tool: ${toolName}]`);
		if (params) info += chalk.dim(` (${params})`);

		return info;
	}

	private static renderDefaultResult(content: string): {
		header: string;
		content: string;
		truncated?: string;
	} {
		const lines = content.split("\n");
		const totalLines = lines.length;

		let header = chalk.dim(`[Tool Result]`);
		if (totalLines > 5) {
			header += chalk.dim(` (showing 5 of ${totalLines} lines)`);
		}

		const preview = lines.slice(0, 5).join("\n");
		const truncated = totalLines > 5 ? `... ${totalLines - 5} more lines truncated` : undefined;

		return { header, content: chalk.dim(preview), truncated };
	}
}
