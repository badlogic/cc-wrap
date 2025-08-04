# Claude Code Stream-JSON Event Reference

This document provides an exhaustive reference for all event types emitted by Claude Code when using `--output-format stream-json --verbose`.

**Note**: This analysis is based on the official [claude-code-sdk-python](https://github.com/anthropics/claude-code-sdk-python) implementation, which provides the authoritative reference for how to interact with Claude Code's stream-JSON output.

## Overview

Stream-JSON output provides real-time events as Claude processes your request. Each event is a single JSON object on its own line, enabling streaming parsing and immediate UI updates.

### Transport Mechanism

Based on the Python SDK's `SubprocessCLITransport` implementation:
- **Communication**: Via stdin/stdout pipes of the Claude Code subprocess
- **Format**: Line-delimited JSON (each event is a JSON object followed by `\n`)
- **Direction**: 
  - **To Claude**: JSON messages sent to stdin
  - **From Claude**: JSON events received from stdout
  - **Error handling**: stderr is redirected to a temporary file to avoid pipe deadlocks

## Event Types

### 1. System Events

System events provide metadata and control information about the session.

#### Structure
```typescript
interface SystemEvent {
  type: "system";
  subtype: "init" | "start" | "end";
  // Additional fields vary by subtype
}
```

#### Subtypes

##### `init` - Session Initialization
Sent at the beginning of every session with complete metadata.

```json
{
  "type": "system",
  "subtype": "init",
  "cwd": "/Users/badlogic/workspaces/ccwrap",
  "session_id": "da7f7af7-88e5-43ba-852d-90d1bf3991cb",
  "tools": ["Task", "Bash", "Glob", "Grep", "LS", "ExitPlanMode", "Read", "Edit", "MultiEdit", "Write", "NotebookRead", "NotebookEdit", "WebFetch", "WebSearch"],
  "mcp_servers": [
    {
      "name": "vs-claude",
      "status": "connected"
    }
  ],
  "model": "claude-opus-4-20250514",
  "permissionMode": "default",
  "slash_commands": ["todo-worktree", "README", "todo-branch", "add-dir", "agents", "clear", "compact", "config", "cost", "doctor", "exit", "help", "ide", "init", "install-github-app", "mcp", "memory", "model", "pr-comments", "release-notes", "resume", "status", "bug", "review", "terminal-setup", "upgrade", "vim", "permissions", "hooks", "export", "logout", "login"],
  "apiKeySource": "ANTHROPIC_API_KEY"
}
```

##### `start` - Processing Start
Marks the beginning of request processing.

```json
{
  "type": "system",
  "subtype": "start",
  "session_id": "da7f7af7-88e5-43ba-852d-90d1bf3991cb"
}
```

##### `end` - Processing End
Marks the end of processing (before final result).

```json
{
  "type": "system",
  "subtype": "end",
  "session_id": "da7f7af7-88e5-43ba-852d-90d1bf3991cb"
}
```

### 2. Assistant Events

Assistant events contain Claude's responses, including text and tool usage.

#### Structure
```typescript
interface AssistantEvent {
  type: "assistant";
  message: {
    id: string;
    type: "message";
    role: "assistant";
    model: string;
    content: ContentBlock[];
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: UsageStats;
  };
  parent_tool_use_id: string | null;
  session_id: string;
}
```

#### Important Behavior
**The same message ID will appear multiple times** as content is streamed:
1. First appearance: Initial content (e.g., text)
2. Subsequent appearances: Additional content (e.g., tool use)
3. Always use the **last occurrence** of each message ID for complete content

#### Content Block Types

##### Text Content
```json
{
  "type": "text",
  "text": "I'll help you with that. Let me check the files..."
}
```

##### Tool Use Content
```json
{
  "type": "tool_use",
  "id": "toolu_01KpMhSRNBek6AbDyvoYE18b",
  "name": "Read",
  "input": {
    "file_path": "/Users/badlogic/workspaces/ccwrap/package.json"
  }
}
```

#### Usage Statistics
Each assistant event includes token usage:

```json
{
  "usage": {
    "input_tokens": 7,
    "cache_creation_input_tokens": 174,
    "cache_read_input_tokens": 11758,
    "output_tokens": 63,
    "service_tier": "standard"
  }
}
```

### 3. User Events

User events contain user messages and tool results.

#### Structure
```typescript
interface UserEvent {
  type: "user";
  message: {
    role: "user";
    content: UserContentBlock[];
  };
  parent_tool_use_id: string | null;
  session_id: string;
}
```

#### Content Block Types

##### User Text Input
```json
{
  "type": "text",
  "text": "What files are in this directory?"
}
```

##### Tool Result
```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_01KpMhSRNBek6AbDyvoYE18b",
  "content": "File contents or tool output here",
  "is_error": false
}
```

##### Tool Error Result
```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_01KpMhSRNBek6AbDyvoYE18b",
  "content": "Error: No such tool available: Bash",
  "is_error": true
}
```

### 4. Result Event

The final event in every stream, containing summary and metadata.

#### Structure
```typescript
interface ResultEvent {
  type: "result";
  subtype: "success" | string; // Error subtypes when is_error is true
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result: string;
  session_id: string;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    output_tokens: number;
    server_tool_use: {
      web_search_requests: number;
    };
    service_tier: string;
  };
}
```

#### Example
```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 25504,
  "duration_api_ms": 27141,
  "num_turns": 13,
  "result": "Here are all the files in the current directory:\n\n**Main files:**\n- `.gitignore` (modified)\n- `biome.json`\n- `package.json`\n- `package-lock.json`\n- `README.md`\n- `tsconfig.json`\n\n**Directories:**\n- `docs/` (untracked)\n- `node_modules/` (dependencies)\n- `src/` (contains `index.ts`)\n- `tmp-config/` (untracked)",
  "session_id": "dfa7fe9d-8705-4ece-b4a1-3417de19d2e6",
  "total_cost_usd": 0.38458844999999997,
  "usage": {
    "input_tokens": 33,
    "cache_creation_input_tokens": 15089,
    "cache_read_input_tokens": 47379,
    "output_tokens": 397,
    "server_tool_use": {
      "web_search_requests": 0
    },
    "service_tier": "standard"
  }
}
```

### 5. Control Events

Control events handle interrupts and other control flow. Based on the Python SDK's implementation in `SubprocessCLITransport._send_control_request()` and `interrupt()` methods:

#### Control Request (Sent to stdin by SDK)
```json
{
  "type": "control_request",
  "request_id": "req_1_a3f2b8c9",
  "request": {
    "subtype": "interrupt"
  }
}
```

#### Control Response (Received from stdout)
```json
{
  "type": "control_response",
  "response": {
    "request_id": "req_1_a3f2b8c9",
    "subtype": "success"
  }
}
```

Or on error:
```json
{
  "type": "control_response",
  "response": {
    "request_id": "req_1_a3f2b8c9",
    "subtype": "error",
    "error": "Cannot interrupt in non-streaming mode"
  }
}
```

**Implementation Details from Python SDK**:
- Control events are only available when using `--input-format stream-json` (streaming mode)
- The SDK generates unique request IDs using a counter and random hex suffix
- Control responses are handled separately from regular messages in the receive loop
- The SDK waits for the matching response before returning from the interrupt call

## Token Usage Calculation

### Understanding Message Duplication

1. Each assistant message may appear multiple times with the same `message.id`
2. Each appearance includes cumulative usage statistics
3. To calculate total usage:
   - Group events by `message.id`
   - Take only the **last occurrence** of each unique message ID
   - Sum the usage statistics from these unique messages

### Example Calculation

```javascript
const messages = new Map();

// Process stream events
for (const event of stream) {
  if (event.type === 'assistant') {
    // Always overwrite with latest occurrence
    messages.set(event.message.id, event.message);
  }
}

// Calculate total usage
let totalUsage = {
  input_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  output_tokens: 0
};

for (const message of messages.values()) {
  totalUsage.input_tokens += message.usage.input_tokens;
  totalUsage.cache_creation_input_tokens += message.usage.cache_creation_input_tokens;
  totalUsage.cache_read_input_tokens += message.usage.cache_read_input_tokens;
  totalUsage.output_tokens += message.usage.output_tokens;
}

// This should match the final result event usage (with ~10-15 token difference for output)
```

## Error Handling

### Error Types

1. **Tool Errors**: Indicated by `is_error: true` in tool result content blocks
2. **Process Errors**: When Claude Code exits unexpectedly
3. **Control Errors**: When control requests fail (in control_response events)
4. **Result Errors**: When `is_error: true` in the final result event

### Error Detection

```javascript
// Check tool results
if (event.type === 'user') {
  for (const content of event.message.content) {
    if (content.type === 'tool_result' && content.is_error) {
      console.error('Tool error:', content.content);
    }
  }
}

// Check final result
if (event.type === 'result' && event.is_error) {
  console.error('Conversation ended with error:', event.subtype);
}

// Check control responses
if (event.type === 'control_response' && event.subtype === 'error') {
  console.error('Control error:', event.error);
}
```

## TypeScript Type Definitions

```typescript
// Base event type
interface BaseEvent {
  type: string;
  session_id?: string;
}

// System event subtypes
interface SystemInitEvent extends BaseEvent {
  type: "system";
  subtype: "init";
  cwd: string;
  session_id: string;
  tools: string[];
  mcp_servers: Array<{
    name: string;
    status: string;
  }>;
  model: string;
  permissionMode: string;
  slash_commands: string[];
  apiKeySource: string;
}

interface SystemStartEvent extends BaseEvent {
  type: "system";
  subtype: "start";
  session_id: string;
}

interface SystemEndEvent extends BaseEvent {
  type: "system";
  subtype: "end";
  session_id: string;
}

// Union type for all system events
type SystemEvent = SystemInitEvent | SystemStartEvent | SystemEndEvent;

// Content blocks
interface TextContent {
  type: "text";
  text: string;
}

interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, any>;
}

interface ToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

type ContentBlock = TextContent | ToolUseContent | ToolResultContent;

// Usage statistics
interface UsageStats {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
  service_tier: string;
}

// Message types
interface AssistantMessage {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: ContentBlock[];
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: UsageStats;
}

interface UserMessage {
  role: "user";
  content: ContentBlock[];
}

// Event types
interface AssistantEvent extends BaseEvent {
  type: "assistant";
  message: AssistantMessage;
  parent_tool_use_id: string | null;
}

interface UserEvent extends BaseEvent {
  type: "user";
  message: UserMessage;
  parent_tool_use_id: string | null;
}

interface ResultEvent extends BaseEvent {
  type: "result";
  subtype: string;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result: string;
  total_cost_usd: number;
  usage: UsageStats & {
    server_tool_use: {
      web_search_requests: number;
    };
  };
}

interface ControlRequestEvent extends BaseEvent {
  type: "control_request";
  request_id: string;
  request: {
    subtype: "interrupt";
  };
}

interface ControlResponseEvent extends BaseEvent {
  type: "control_response";
  response: {
    request_id: string;
    subtype: "success" | "error";
    error?: string; // Present when subtype is "error"
  };
}

// Union of all event types
type ClaudeStreamEvent = 
  | SystemEvent 
  | AssistantEvent 
  | UserEvent 
  | ResultEvent 
  | ControlRequestEvent 
  | ControlResponseEvent;
```

## Best Practices

Based on patterns observed in the Python SDK:

1. **Always handle message deduplication** - Group by message ID and use the last occurrence (see `message_parser.py`)
2. **Check for errors** in tool results and final result events
3. **Stream processing** - Parse events as they arrive for responsive UI
4. **Token tracking** - Sum unique assistant messages for accurate usage
5. **Session management** - Use session_id for conversation continuity
6. **Error recovery** - Handle process errors and unexpected stream termination
7. **Buffer management** - The SDK uses a 1MB buffer limit for incomplete JSON
8. **Stderr handling** - Redirect stderr to a temp file to avoid pipe deadlocks

## Python SDK Implementation Details

### How the SDK Wraps the Claude Binary

The Python SDK's `SubprocessCLITransport` class provides a complete reference implementation:

#### 1. Binary Discovery
```python
# The SDK searches for claude in these locations:
locations = [
    shutil.which("claude"),  # System PATH
    Path.home() / ".npm-global/bin/claude",
    Path("/usr/local/bin/claude"),
    Path.home() / ".local/bin/claude",
    Path.home() / "node_modules/.bin/claude",
    Path.home() / ".yarn/bin/claude",
]
```

#### 2. Process Spawning
```python
# Non-interactive mode (--print)
cmd = ["claude", "--output-format", "stream-json", "--verbose", "--print", prompt]

# Interactive mode (--input-format stream-json)
cmd = ["claude", "--output-format", "stream-json", "--verbose", "--input-format", "stream-json"]

# Spawn with pipes
process = await anyio.open_process(
    cmd,
    stdin=PIPE,
    stdout=PIPE,
    stderr=temp_file,  # Stderr to temp file to avoid deadlock
    cwd=working_directory,
    env={**os.environ, "CLAUDE_CODE_ENTRYPOINT": "sdk-py"}
)
```

#### 3. Communication Protocol
- **Sending messages**: JSON objects to stdin, each followed by newline
- **Receiving events**: Read stdout line by line, parse each as JSON
- **Buffer management**: Accumulate partial lines until valid JSON, max 1MB buffer

#### 4. Error Handling Strategy

The SDK implements multiple layers of error handling:

```python
# a) Process errors - Check exit code
if returncode != 0:
    raise ProcessError(f"Command failed with exit code {returncode}", stderr=stderr_output)

# b) JSON parsing errors - Buffer overflow protection
if len(json_buffer) > MAX_BUFFER_SIZE:
    raise SDKJSONDecodeError("JSON message exceeded maximum buffer size")

# c) Connection errors
if not process or process.returncode is not None:
    raise CLIConnectionError("Not connected")

# d) Stderr capture - Keep last 100 lines for debugging
stderr_lines = deque(maxlen=100)
```

### Translation to Node.js/TypeScript

Here's how to implement the same patterns in TypeScript:

#### 1. Binary Discovery
```typescript
import { which } from 'node:which';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

async function findClaude(): Promise<string> {
  // Check system PATH first
  const systemClaude = await which('claude').catch(() => null);
  if (systemClaude) return systemClaude;

  // Check common locations
  const locations = [
    join(homedir(), '.npm-global/bin/claude'),
    '/usr/local/bin/claude',
    join(homedir(), '.local/bin/claude'),
    join(homedir(), 'node_modules/.bin/claude'),
    join(homedir(), '.yarn/bin/claude'),
  ];

  for (const location of locations) {
    if (existsSync(location)) return location;
  }

  throw new Error('Claude Code not found. Install with: npm install -g @anthropic-ai/claude-code');
}
```

#### 2. Process Management
```typescript
import { spawn, ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

class ClaudeTransport {
  private process: ChildProcess | null = null;
  private stderrPath: string;

  async connect(options: ClaudeOptions): Promise<void> {
    const claudePath = await findClaude();
    
    // Create temp file for stderr
    this.stderrPath = join(tmpdir(), `claude-stderr-${Date.now()}.log`);
    const stderrStream = createWriteStream(this.stderrPath);

    // Build command
    const args = [
      '--output-format', 'stream-json',
      '--verbose',
      ...(options.streaming ? ['--input-format', 'stream-json'] : ['--print', options.prompt])
    ];

    // Spawn process
    this.process = spawn(claudePath, args, {
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'sdk-ts' },
      cwd: options.cwd
    });

    // Redirect stderr to file
    this.process.stderr?.pipe(stderrStream);
  }
}
```

#### 3. Stream Processing
```typescript
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';

class JSONStreamParser {
  private buffer = '';
  private readonly MAX_BUFFER_SIZE = 1024 * 1024; // 1MB

  async *parseStream(stream: Readable): AsyncGenerator<any> {
    const rl = createInterface({ input: stream });

    for await (const line of rl) {
      this.buffer += line;

      // Check buffer size
      if (this.buffer.length > this.MAX_BUFFER_SIZE) {
        this.buffer = '';
        throw new Error('JSON buffer overflow');
      }

      try {
        const data = JSON.parse(this.buffer);
        this.buffer = '';
        
        // Handle control responses separately
        if (data.type === 'control_response') {
          this.handleControlResponse(data);
          continue;
        }
        
        yield data;
      } catch (e) {
        // Not complete JSON yet, continue accumulating
        if (!(e instanceof SyntaxError)) throw e;
      }
    }
  }
}
```

#### 4. Error Handling
```typescript
interface ClaudeError extends Error {
  exitCode?: number;
  stderr?: string;
}

class ProcessError extends Error implements ClaudeError {
  constructor(message: string, public exitCode: number, public stderr: string) {
    super(message);
    this.name = 'ProcessError';
  }
}

async function handleProcessExit(process: ChildProcess, stderrPath: string): Promise<void> {
  const exitCode = await new Promise<number>((resolve) => {
    process.on('exit', resolve);
  });

  if (exitCode !== 0) {
    // Read last 100 lines of stderr
    const stderr = await readLastLines(stderrPath, 100);
    throw new ProcessError(`Claude exited with code ${exitCode}`, exitCode, stderr);
  }
}
```

#### 5. Control Requests (Interrupts)
```typescript
class ControlManager {
  private requestCounter = 0;
  private pendingResponses = new Map<string, any>();

  async interrupt(stdin: Writable): Promise<void> {
    const requestId = `req_${++this.requestCounter}_${crypto.randomBytes(4).toString('hex')}`;
    
    const request = {
      type: 'control_request',
      request_id: requestId,
      request: { subtype: 'interrupt' }
    };

    // Send request
    stdin.write(JSON.stringify(request) + '\n');

    // Wait for response
    return new Promise((resolve, reject) => {
      const checkResponse = setInterval(() => {
        if (this.pendingResponses.has(requestId)) {
          clearInterval(checkResponse);
          const response = this.pendingResponses.get(requestId);
          this.pendingResponses.delete(requestId);
          
          if (response.subtype === 'error') {
            reject(new Error(response.error));
          } else {
            resolve();
          }
        }
      }, 100);
    });
  }
}
```

### Key Differences: Python vs Node.js

1. **Async Patterns**:
   - Python: Uses `anyio` for async subprocess management
   - Node.js: Native `child_process` with promises/async iterators

2. **Stream Handling**:
   - Python: `TextReceiveStream`/`TextSendStream` wrappers
   - Node.js: Native `Readable`/`Writable` streams with `readline` for line parsing

3. **Buffer Management**:
   - Python: String concatenation with manual line splitting
   - Node.js: Can use `readline` interface for automatic line buffering

4. **Error Handling**:
   - Python: Custom exception hierarchy
   - Node.js: Error subclasses with additional properties

5. **Process Management**:
   - Python: `anyio.open_process` with context managers
   - Node.js: `child_process.spawn` with event-based lifecycle

### Best Practices for Node.js Implementation

1. **Use readline for line parsing** - Avoids manual buffer management
2. **Handle backpressure** - Use stream.pause()/resume() when needed
3. **Clean up resources** - Always kill process and delete temp files
4. **Use TypeScript discriminated unions** - For event type safety
5. **Implement exponential backoff** - For control request retries
6. **Monitor process health** - Check if process is still alive before operations
7. **Use AbortController** - For cancellable operations

## Common Patterns

### Simple One-Shot Request
```
1. system (init)
2. assistant (text)
3. result (success)
```

### Request with Tool Use
```
1. system (init)
2. assistant (text)
3. assistant (tool_use) - same message ID as #2
4. user (tool_result)
5. assistant (text) - final response
6. result (success)
```

### Multi-Turn with Multiple Tools
```
1. system (init)
2. assistant (text)
3. assistant (tool_use)
4. user (tool_result)
5. assistant (text)
6. assistant (tool_use)
7. user (tool_result)
8. assistant (text) - final response
9. result (success)
```

### Subagent Pattern (Task Tool)
```
1. system (init) - main agent
2. assistant (text) - main agent announces task
3. assistant (tool_use) - main agent invokes Task tool
4. assistant (messages) - SUBAGENT messages with parent_tool_use_id
5. user (tool_result) - SUBAGENT results with parent_tool_use_id
6. ... (more subagent interactions)
7. user (tool_result) - Task tool result back to main agent
8. assistant (text) - main agent final response
9. result (success)
```

### Parallel Subagents Pattern
```
1. system (init) - main agent
2. assistant (text) - main agent announces tasks
3. assistant (tool_use) - Task tool invocation #1
4. assistant (tool_use) - Task tool invocation #2 (same message ID!)
5-6. Subagent #1 messages (with parent_tool_use_id from #3)
7-8. Subagent #2 messages (with parent_tool_use_id from #4)
9. user (tool_result) - Result from Task #1
10. user (tool_result) - Result from Task #2
11. assistant (text) - main agent summarizes results
12. result (success)
```

## Subagent Event Handling

When Claude uses the Task tool to spawn subagents, the events have special characteristics:

### Identifying Subagent Events

1. **parent_tool_use_id Field**: ALL subagent events include a `parent_tool_use_id` that matches the tool_use_id from the Task invocation
   - This includes both `assistant` messages from the subagent
   - AND `user` messages containing tool results for the subagent
2. **Different Model**: Subagents may use a different model (e.g., `claude-sonnet-4-20250514` vs main agent's `claude-opus-4-20250514`)
3. **Same Session ID**: Subagents share the same session_id as the main agent

### Example Subagent Events

```json
// Main agent invokes Task tool
{
  "type": "assistant",
  "message": {
    "id": "msg_01VEKyTVnsfBYG2eeRjRy7AT",
    "model": "claude-opus-4-20250514",
    "content": [{
      "type": "tool_use",
      "id": "toolu_01JjCEbPbDJxQUZAWXomNoai",  // This ID will be referenced
      "name": "Task",
      "input": {
        "description": "Search for .ts files",
        "prompt": "Find all .ts files...",
        "subagent_type": "general-purpose"
      }
    }]
  },
  "parent_tool_use_id": null,  // Main agent has no parent
  "session_id": "35a6174f-e55b-4a28-919c-52ebab826b07"
}

// Subagent performs work
{
  "type": "assistant",
  "message": {
    "id": "msg_014aHC2x7o82u9HbQgCpuddP",
    "model": "claude-sonnet-4-20250514",  // Different model!
    "content": [{
      "type": "tool_use",
      "id": "toolu_013CuN4rVPuF8rvc4cC3LoX7",
      "name": "Glob",
      "input": {"pattern": "**/*.ts"}
    }]
  },
  "parent_tool_use_id": "toolu_01JjCEbPbDJxQUZAWXomNoai",  // References Task invocation
  "session_id": "35a6174f-e55b-4a28-919c-52ebab826b07"
}

// Tool result for subagent - ALSO has parent_tool_use_id!
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [{
      "tool_use_id": "toolu_013CuN4rVPuF8rvc4cC3LoX7",  // References subagent's tool use
      "type": "tool_result",
      "content": "...file list..."
    }]
  },
  "parent_tool_use_id": "toolu_01JjCEbPbDJxQUZAWXomNoai",  // SAME parent as subagent!
  "session_id": "35a6174f-e55b-4a28-919c-52ebab826b07"
}
```

### Parallel Subagent Execution

When multiple Task tools are invoked in the same assistant message:
1. They appear as separate tool_use blocks with the same message ID
2. Subagents may execute in parallel (interleaved events)
3. Each subagent's events are linked via their respective parent_tool_use_id
4. Results return in the order they complete, not necessarily the order invoked

### Nested Subagent Limitation

Based on testing, **nested subagents are not supported** - when a subagent attempts to use the Task tool:
1. The subagent will typically use other tools (Read, Glob, etc.) instead
2. The Task tool is not available within subagent contexts
3. This prevents infinite recursion and maintains a single level of delegation

This comprehensive reference covers all stream-JSON event types emitted by Claude Code CLI, including subagent patterns.