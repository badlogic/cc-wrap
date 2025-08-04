import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { Claude } from "../src/claude.js";
import type { SDKMessage } from "@anthropic-ai/claude-code";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("Claude interrupt handling", () => {
	let claude: Claude;
	let tempConfigDir: string;

	// Check for auth before running tests
	if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
		console.error("Error: Either CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY must be set to run tests");
		process.exit(1);
	}

	beforeEach(() => {
		// Create temporary config directory for isolation
		tempConfigDir = mkdtempSync(join(tmpdir(), "claude-test-"));
		
		// Create Claude instance with isolated config
		const env = {
			...process.env,
			CLAUDE_CONFIG_DIR: tempConfigDir
		};
		
		claude = new Claude([], env as Record<string, string>);
	});

	afterEach(() => {
		// Clean up
		if (claude) {
			claude.stop();
		}
		
		// Remove temporary config directory
		if (tempConfigDir) {
			rmSync(tempConfigDir, { recursive: true, force: true });
		}
	});

	test("should handle interrupt and allow subsequent queries", async () => {
		// First query that we'll interrupt
		const firstQueryGen = claude.query("Tell me a very long story about dragons");
		const firstMessages: SDKMessage[] = [];
		let interrupted = false;

		try {
			// Collect some messages then interrupt
			for await (const message of firstQueryGen) {
				firstMessages.push(message);
				console.log("Received message:", message);

				// Interrupt after receiving initial messages
				if (firstMessages.length >= 2 && !interrupted) {
					interrupted = true;
					claude.interrupt();
					// Continue iterating to properly handle the interrupt
				}
			}
		} catch (error) {
			// We expect an error due to interrupt, but it should not be permanent
			assert.ok(error instanceof Error, "Expected an error from interrupt");
		}

		// Verify we got interrupted
		assert.ok(interrupted, "Should have interrupted the first query");
		assert.ok(firstMessages.length >= 2, "Should have received some messages before interrupt");

		// Small delay to ensure process cleanup
		await new Promise(resolve => setTimeout(resolve, 100));

		// Now try a second query - this should work without throwing
		const secondQueryGen = claude.query("What is 2 + 2?");
		const secondMessages: SDKMessage[] = [];
		let gotResult = false;

		// This should not throw an error
		for await (const message of secondQueryGen) {
			secondMessages.push(message);
			if (message.type === "result") {
				gotResult = true;
			}
		}

		// Verify second query completed successfully
		assert.ok(gotResult, "Second query should complete with a result");
		assert.ok(secondMessages.length > 0, "Should receive messages from second query");

		// Look for the answer in the messages
		const hasAnswer = secondMessages.some(msg => {
			if (msg.type === "assistant" && msg.message.content) {
				return msg.message.content.some(c => 
					c.type === "text" && 
					"text" in c &&
					(c.text.includes("4") || c.text.includes("four"))
				);
			}
			return false;
		});
		assert.ok(hasAnswer, "Second query should produce the correct answer");
	});

	test("should preserve session across interrupt", async () => {
		// First query to establish session
		const firstQueryGen = claude.query("Remember that my favorite color is blue");
		let sessionId: string | undefined;

		for await (const message of firstQueryGen) {
			if (message.type === "result") {
				// Session should be established
				break;
			}
		}

		// Interrupt to force process recreation
		claude.interrupt();

		// Small delay to ensure process cleanup
		await new Promise(resolve => setTimeout(resolve, 100));

		// Second query should remember the session
		const secondQueryGen = claude.query("What is my favorite color?");
		const messages: SDKMessage[] = [];

		for await (const message of secondQueryGen) {
			messages.push(message);
		}

		// Check if Claude remembers the color (session preservation)
		const remembersColor = messages.some(msg => {
			if (msg.type === "assistant" && msg.message.content) {
				return msg.message.content.some(c => 
					c.type === "text" && 
					"text" in c &&
					c.text.toLowerCase().includes("blue")
				);
			}
			return false;
		});

		assert.ok(remembersColor, "Session should be preserved across interrupt");
	});

	test("should handle multiple interrupts gracefully", async () => {
		// Test multiple interrupt cycles
		for (let i = 0; i < 3; i++) {
			const queryGen = claude.query(`Query number ${i + 1}`);
			let messageCount = 0;

			try {
				for await (const message of queryGen) {
					messageCount++;
					if (messageCount >= 2) {
						claude.interrupt();
					}
				}
			} catch (error) {
				// Expected due to interrupt
				assert.ok(error instanceof Error);
			}

			// Small delay between attempts
			await new Promise(resolve => setTimeout(resolve, 50));
		}

		// Final query should still work
		const finalGen = claude.query("Final query: what is 1 + 1?");
		let gotFinalResult = false;

		for await (const message of finalGen) {
			if (message.type === "result") {
				gotFinalResult = true;
			}
		}

		assert.ok(gotFinalResult, "Should handle multiple interrupts and still work");
	});
});