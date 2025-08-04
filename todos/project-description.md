# Project: ccwrap

TypeScript API wrapper for Claude Code CLI that provides a clean, type-safe interface for both one-shot and conversational interactions with Claude.

## Features
- Fluent Builder API with method chaining for configuring Claude interactions
- Stream-first design with async iterators for real-time processing
- Session management for persistent conversational contexts
- Automatic binary patching to bypass anti-debugging checks
- Custom tool renderers for better formatted output
- Interactive terminal UI with markdown rendering
- Multiple prompt support for sequential command-line processing with visual queue display

## Tech Stack
- TypeScript (primary language)
- Node.js with ES modules
- @anthropic-ai/claude-code SDK
- Biome for linting/formatting
- Husky for git hooks
- Custom TUI library for terminal interface

## Structure
- src/: TypeScript source files
  - index.ts: Main entry point and exports
  - claude.ts: Core Claude process management
  - fluent.ts: Fluent API builder pattern
  - chat-tui.ts: Terminal UI interface
  - tool-renderers.ts: Tool output formatting
- dist/: Compiled JavaScript output
- docs/: API documentation
- test/: Test directory (currently empty)

## Architecture
- Process Layer: Manages Claude binary subprocess with stream-json protocol
- Fluent API Layer: Builder pattern wrapping core functionality
- UI Layer: Terminal-based chat interface
- Rendering Layer: Formats tool calls and results

## Commands
- Build: npm run build
- Test: (no tests configured yet)
- Lint: npm run check
- Dev/Run: npm run dev
- Chat TUI: node dist/chat-tui.js
  - Single prompt: node dist/chat-tui.js "What is 2+2?"
  - Multiple prompts: node dist/chat-tui.js "First question" "Second question" "<EXIT>"
  - Use <EXIT> to terminate after queued prompts complete

## Testing
No testing framework currently configured. Test directory exists at /test/. Recommended to use Node.js built-in test runner with TypeScript.