# Analysis: Multiple Prompt Support for chat-tui.ts

## Current chat-tui.ts Architecture

### Command Line Arguments Handling
- **Location**: Line 92 in the `main()` function
- **Current behavior**: Only accepts a single argument (`process.argv[2]`) as an initial prompt
- **Usage**: If provided, this prompt is automatically sent to Claude when the app starts (lines 343-351)

### Main Prompt Loop
The main prompt loop is event-driven and managed by the TUI library:
- **Entry point**: The `TextEditor` component handles user input via the `onSubmit` callback (lines 280-327)
- **Flow**: 
  1. User types in the editor and presses Enter
  2. `editor.onSubmit` is triggered with the input text
  3. Input is processed through command handling or sent to Claude
  4. UI is updated with responses

### User Input Processing
User input processing happens in the `editor.onSubmit` callback (lines 280-327):
- Trims whitespace and ignores empty input
- Prevents submission while Claude is processing
- Handles slash commands (starting with "/")
- Displays user message in chat
- Calls `processQuery()` for regular messages

### Exit Commands (/quit, /exit) Handling
Exit commands are handled in the slash command processing section (lines 311-316):
- Recognizes both "/exit" and "/quit" commands
- Calls `claude.stop()` to terminate the Claude process
- Calls `ui.stop()` to stop the TUI
- Calls `process.exit(0)` to terminate the application

### Overall Flow from Start to End
**Initialization Phase** (lines 81-141):
1. Check for authentication (API key or OAuth token)
2. Patch Claude binary automatically
3. Extract initial prompt from command line arguments
4. Initialize Claude instance with configuration
5. Set up TUI components (header, chat container, editor, etc.)
6. Configure autocomplete provider with available commands

**Runtime Phase** (lines 142-351):
1. Set up global key handlers (Escape for interruption)
2. Define `processQuery()` function for handling Claude interactions
3. Set up `editor.onSubmit` for user input processing
4. Set up SIGINT handler for Ctrl+C
5. Start the UI
6. Process initial prompt if provided

**Query Processing Flow** (`processQuery` function, lines 177-277):
1. Mark as processing and disable editor
2. Show loading animation
3. Call `claude.query(prompt)` to get async generator
4. Iterate through events:
   - "assistant": Display Claude's text and tool use
   - "user": Display tool results
   - "result": Show completion status and usage
5. Handle errors and cleanup
6. Re-enable editor when done

## Multiple Arguments and Sequential Execution Patterns

### Current State
- The project does not currently have any CLI tools that handle multiple arguments in a sequential manner
- Each tool call is single-purpose
- chat-tui.ts currently accepts only a single prompt via `process.argv[2]`

### Existing Sequential Patterns

**Fluent API Sequential Pattern:**
- The `ClaudeCodeBuilder` demonstrates the best pattern for sequential operations
- **Key method:** `execute()` and `stream()` handle single queries, but the builder can be reused
- **Session continuity:** The builder maintains `lastSessionId` to continue conversations

**Sequential Execution Example from Fluent API docs:**
```typescript
const session = ClaudeCode.create()
  .sessionId("my-conversation-123")
  .model("opus");

// Execute multiple queries with same config
await session.prompt("Analyze package.json").execute();
await session.prompt("Update dependencies").execute();
```

**Chat TUI Sequential Pattern:**
- The `processQuery()` function handles individual prompts
- Sequential execution happens through user interaction, not programmatically
- Uses `for await (const event of currentQueryGenerator)` pattern for streaming

### Best Practices for Array Processing Found

1. **Tool Renderers Array Processing** (`tool-renderers.ts`):
   ```typescript
   const files = new Set(lines.map((line) => line.split(":")[0]));
   Object.entries(input)
     .filter(([_, value]) => value !== undefined && value !== null)
     .map(([key, value]) => { /* process */ })
     .slice(0, 3)
   ```

2. **Parallel Processing Pattern** (from fluent-api.md):
   ```typescript
   const files = ['README.md', 'package.json', 'tsconfig.json'];
   const analyses = await Promise.all(
     files.map(file => 
       ClaudeCode.create()
         .prompt(`Summarize ${file}`)
         .text()
     )
   );
   ```

3. **Sequential Event Processing**:
   ```typescript
   for await (const event of builder.stream()) {
     // Process each event sequentially
   }
   ```

## Claude Process Management

### Process Creation and Management
- The `Claude` class creates processes through Node.js `spawn()`
- Arguments include `--output-format stream-json`, `--input-format stream-json`, and `--verbose`
- Communication via stdin/stdout pipes with readline interface
- Automatic session ID tracking from initial system event

### Message Flow
Messages are sent as JSON-serialized `SDKUserMessage` objects:
```typescript
const userMessage: SDKUserMessage = {
  type: "user",
  message: {
    role: "user",
    content: [{ type: "text", text: prompt }],
  },
  parent_tool_use_id: null,
  session_id: this.sessionId || "",
};
this.process.stdin!.write(`${JSON.stringify(userMessage)}\n`);
```

### Response Processing
- Responses come as streaming JSON events via stdout
- Event types: `system`, `assistant`, `user`, `result`
- Each line is parsed as JSON and yielded through an AsyncGenerator
- Processing ends when a `result` event is received

### Multiple Sequential Prompts Support
**The same Claude process CAN handle multiple sequential prompts:**
- Tracks session state with `sessionId`
- Prevents concurrent queries but allows sequential ones
- Resets `currentHandler` after each query completes
- The process stays alive between queries
- Session IDs are automatically captured and tracked
- Conversation history is maintained within the Claude process

## Implementation Approach

Based on the codebase patterns, multiple prompts should be implemented by:

1. **Extending argument parsing** from `process.argv[2]` to `process.argv.slice(2)`
2. **Sequential processing** of prompts using a for loop with await
3. **Reusing the same Claude instance** for all prompts to maintain context
4. **Checking for `<EXIT>` string** to terminate early
5. **Maintaining the same UI patterns** for each prompt/response cycle

Key files to modify:
- `/Users/badlogic/workspaces/ccwrap/src/chat-tui.ts` - Main implementation
- Modify initialization flow to handle multiple prompts sequentially
- Add support for `<EXIT>` prompt to terminate the process