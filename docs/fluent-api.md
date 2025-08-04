# CCWrap Fluent API Design

This document outlines the fluent API design for ccwrap, a TypeScript wrapper for Claude Code CLI that provides a clean, type-safe interface for both one-shot and conversational interactions.

## Core Design Principles

1. **Builder Pattern**: Fluent configuration with method chaining
2. **Reusability**: Builders can be reused for multiple queries with same configuration
3. **Type Safety**: Full TypeScript types with discriminated unions for events
4. **Stream-First**: All operations return async iterators for real-time processing
5. **Unified Interface**: Same API pattern for both one-shot and conversational use

## API Overview

```typescript
import { ClaudeCode } from 'ccwrap';

// Basic one-shot query
for await (const event of ClaudeCode.create().prompt("What is 2+2?").stream()) {
  console.log(event);
}

// Reusable configuration
const assistant = ClaudeCode.create()
  .model("opus")
  .allowTools(["Read", "Write"])
  .permissionMode("acceptEdits");

// Execute multiple queries with same config
await assistant.prompt("Analyze package.json").execute();
await assistant.prompt("Update dependencies").execute();
```

## Complete API Reference

### Builder Creation

```typescript
// Create a new builder instance
const builder = ClaudeCode.create(options?: {
  claudePath?: string;           // Path to claude binary (auto-detected if not provided)
  deleteSessionOnExit?: boolean; // Clean up session files on exit (default: false)
  env?: Record<string, string>;  // Additional environment variables
});
```

### Configuration Methods

All configuration methods return `this` for chaining:

```typescript
interface ClaudeCodeBuilder {
  // Set the prompt (required before execution)
  prompt(text: string): this;

  // Session management
  sessionId(id: string): this;           // Use specific session ID
  resumeSession(id: string): this;       // Resume existing session
  continueLastSession(): this;           // Continue most recent session

  // Model selection
  model(model: "opus" | "sonnet" | string): this;
  fallbackModel(model: string): this;

  // Tool configuration
  allowTools(tools: string[]): this;     // e.g., ["Read", "Write", "Bash(git:*)"]
  denyTools(tools: string[]): this;      // e.g., ["Bash", "Write"]

  // Permission modes
  permissionMode(mode: "default" | "acceptEdits" | "bypassPermissions" | "plan"): this;
  dangerouslySkipPermissions(): this;    // Bypass ALL permissions (use with caution)

  // System prompt customization
  systemPrompt(prompt: string): this;
  appendSystemPrompt(prompt: string): this;

  // Directory access
  addDirectories(...dirs: string[]): this;
  workingDirectory(dir: string): this;

  // MCP configuration
  mcpConfig(config: string | object): this;
  strictMcpConfig(): this;

  // Settings
  settings(path: string): this;
  maxTurns(turns: number): this;
  maxThinkingTokens(tokens: number): this;

  // Output control
  verbose(): this;
  debug(): this;

  // Timeout
  timeout(ms: number): this;
}
```

### Execution Methods

```typescript
// Stream events as they arrive (recommended)
async *stream(): AsyncGenerator<ClaudeEvent>;

// Collect all events into array
async execute(): Promise<ClaudeEvent[]>;

// Get just the final response text
async text(): Promise<string>;

// Get final result with metadata
async result(): Promise<ResultEvent>;
```

## Usage Examples

### 1. Simple One-Shot Query

```typescript
import { ClaudeCode } from 'ccwrap';

// Minimal usage
const response = await ClaudeCode.create()
  .prompt("What is the capital of France?")
  .text();

console.log(response); // "Paris"
```

### 2. Streaming with Event Processing

```typescript
const builder = ClaudeCode.create()
  .prompt("Analyze all TypeScript files in this project")
  .allowTools(["Glob", "Read"]);

for await (const event of builder.stream()) {
  switch (event.type) {
    case 'system':
      if (event.subtype === 'init') {
        console.log('Session started:', event.session_id);
      }
      break;

    case 'assistant':
      // Handle assistant messages
      for (const content of event.message.content) {
        if (content.type === 'text') {
          console.log('Claude:', content.text);
        } else if (content.type === 'tool_use') {
          console.log('Using tool:', content.name);
        }
      }
      break;

    case 'user':
      // Handle tool results
      for (const content of event.message.content) {
        if (content.type === 'tool_result' && content.is_error) {
          console.error('Tool error:', content.content);
        }
      }
      break;

    case 'result':
      console.log('Total cost:', event.total_cost_usd);
      console.log('Duration:', event.duration_ms, 'ms');
      break;
  }
}
```

### 3. Conversational Session

```typescript
// Create a reusable session configuration
const session = ClaudeCode.create()
  .sessionId("my-conversation-123")
  .model("opus")
  .allowTools(["Read", "Write", "Edit"]);

// First message
console.log("User: Analyze the package.json file");
for await (const event of session.prompt("Analyze the package.json file").stream()) {
  if (event.type === 'assistant') {
    const text = event.message.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');
    if (text) console.log("Claude:", text);
  }
}

// Follow-up message (reuses session)
console.log("\nUser: Now update the version to 1.0.0");
for await (const event of session.prompt("Now update the version to 1.0.0").stream()) {
  if (event.type === 'assistant') {
    const text = event.message.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');
    if (text) console.log("Claude:", text);
  }
}
```

### 4. Parallel Processing

```typescript
// Process multiple files in parallel
const files = ['README.md', 'package.json', 'tsconfig.json'];

const analyses = await Promise.all(
  files.map(file => 
    ClaudeCode.create()
      .prompt(`Summarize the contents of ${file}`)
      .allowTools(["Read"])
      .text()
  )
);

analyses.forEach((analysis, i) => {
  console.log(`\n${files[i]}:`, analysis);
});
```

### 5. Advanced Configuration

```typescript
const builder = ClaudeCode.create({ 
  deleteSessionOnExit: true,
  env: { CUSTOM_VAR: 'value' }
})
  .model("opus")
  .fallbackModel("sonnet")
  .allowTools(["Read", "Write", "Edit", "Bash(git:*)"])
  .denyTools(["Bash(rm:*)", "Bash(sudo:*)"])
  .permissionMode("acceptEdits")
  .appendSystemPrompt("Always write concise, well-commented code")
  .workingDirectory("/Users/me/project")
  .addDirectories("/Users/me/data", "/Users/me/configs")
  .timeout(60000)
  .verbose();

// Execute complex task
const result = await builder
  .prompt("Refactor all TypeScript files to use modern syntax")
  .execute();

// Process results
const toolUses = result.filter(e => 
  e.type === 'assistant' && 
  e.message.content.some(c => c.type === 'tool_use')
);

console.log(`Claude used ${toolUses.length} tools`);
```

### 6. Error Handling

```typescript
try {
  const result = await ClaudeCode.create()
    .prompt("Do something complex")
    .timeout(30000)
    .execute();

  // Check if operation succeeded
  const finalEvent = result[result.length - 1];
  if (finalEvent.type === 'result' && finalEvent.is_error) {
    console.error('Operation failed:', finalEvent.result);
  }

} catch (error) {
  if (error.code === 'CLAUDE_NOT_FOUND') {
    console.error('Claude Code is not installed');
  } else if (error.code === 'TIMEOUT') {
    console.error('Operation timed out');
  } else if (error.code === 'PROCESS_ERROR') {
    console.error('Claude process crashed:', error.stderr);
  }
}
```

### 7. Token Usage Tracking

```typescript
const events = await ClaudeCode.create()
  .prompt("Write a long essay about TypeScript")
  .execute();

// Calculate token usage
const tokenUsage = calculateTokenUsage(events);
console.log('Token usage:', tokenUsage);

function calculateTokenUsage(events: ClaudeEvent[]) {
  // Group by message ID and take last occurrence
  const messages = new Map<string, any>();
  
  for (const event of events) {
    if (event.type === 'assistant') {
      messages.set(event.message.id, event.message);
    }
  }

  // Sum unique messages
  let total = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0
  };

  for (const message of messages.values()) {
    const usage = message.usage;
    total.input_tokens += usage.input_tokens || 0;
    total.output_tokens += usage.output_tokens || 0;
    total.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
    total.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
  }

  return total;
}
```

### 8. Interactive Mode (Future Enhancement)

```typescript
// Create an interactive session that stays open
const interactive = ClaudeCode.create()
  .interactive()  // Keeps stdin open
  .sessionId("interactive-session");

// Connect without initial prompt
await interactive.connect();

// Send messages dynamically
await interactive.send("Hello Claude");
for await (const event of interactive.receive()) {
  // Process responses
}

// Send follow-up
await interactive.send("What's the weather?");

// Interrupt if needed
await interactive.interrupt();

// Clean up
await interactive.disconnect();
```

### 9. Subagent Handling

```typescript
// When Claude uses the Task tool, subagent events appear
for await (const event of ClaudeCode.create()
  .prompt("Search for all TypeScript files using a subagent")
  .stream()
) {
  // Check if event is from a subagent
  if (event.parent_tool_use_id) {
    console.log('Subagent event:', {
      type: event.type,
      parent: event.parent_tool_use_id,
      model: event.message?.model // May be different (e.g., sonnet vs opus)
    });
  }
}
```

### 10. Custom Event Processing

```typescript
class ClaudeProcessor {
  private events: ClaudeEvent[] = [];

  async process(prompt: string) {
    const stream = ClaudeCode.create()
      .prompt(prompt)
      .allowTools(["Read", "Write"])
      .stream();

    for await (const event of stream) {
      this.events.push(event);
      
      // Custom processing
      if (event.type === 'assistant' && this.shouldInterrupt(event)) {
        // In future: support interrupts
        break;
      }
    }

    return this.events;
  }

  private shouldInterrupt(event: AssistantEvent): boolean {
    // Custom logic
    return false;
  }
}
```

## Implementation Notes

### Process Management
- Each `.stream()` call spawns a new Claude process
- Process is automatically terminated when stream completes
- Stderr is redirected to temp file to avoid deadlocks
- Proper cleanup on errors or early termination

### Session Handling
- Session IDs must be valid UUIDs
- First use of session ID: `--session-id <uuid>`
- Subsequent uses: `--resume <uuid>`
- Sessions persist in `~/.claude/projects/<cwd>/`
- Optional cleanup with `deleteSessionOnExit`

### Event Deduplication
- Assistant messages may appear multiple times with same ID
- Always use last occurrence for complete content
- Token usage calculation must account for this

### Error Scenarios
- Binary not found
- Process crashes
- JSON parsing errors
- Timeout exceeded
- Permission denied
- Tool errors

## Future Enhancements

1. **Interactive Mode**: Keep process alive for dynamic conversations
2. **Interrupt Support**: Cancel long-running operations
3. **Progress Callbacks**: Track operation progress
4. **Caching**: Cache responses for identical prompts
5. **Middleware**: Transform events before yielding
6. **Retry Logic**: Automatic retry on failures
7. **Rate Limiting**: Prevent API overuse
8. **Metrics**: Built-in performance tracking

## Type Definitions

See [claude-stream-json.md](./claude-stream-json.md) for complete event type definitions.