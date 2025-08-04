# Interrupt Handling Analysis

## Interrupt Handling Analysis in chat-tui.ts

### 1. How Interrupts Are Currently Handled

**Keyboard Shortcuts:**
- **Escape Key**: Lines 170-199 in `/Users/badlogic/workspaces/ccwrap/src/chat-tui.ts`
  ```typescript
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
            { bottom: 1 }
          )
        );
        ui.requestRender();
      }
      
      // Don't forward to editor
      return false;
    }
    
    // Forward all other keys
    return true;
  };
  ```

**Signal Handling:**
- **SIGINT (Ctrl+C)**: Lines 354-362 in `/Users/badlogic/workspaces/ccwrap/src/chat-tui.ts`
  ```typescript
  process.on("SIGINT", () => {
    if (currentLoadingAnimation) {
      currentLoadingAnimation.stop();
    }
    claude.stop();
    ui.stop();
    process.exit(0);
  });
  ```

### 2. What Happens When an Interrupt Occurs

When the Escape key is pressed during processing:

1. **Condition Check**: Only triggers if `isProcessing` is true (line 172)
2. **Interrupt Call**: Calls `claude.interrupt()` method (line 175)
3. **UI Feedback**: Shows "[Processing interrupted]" message in yellow (line 178)
4. **Error Handling**: If interrupt fails, shows error message in red (lines 182-189)
5. **Event Blocking**: Returns `false` to prevent the Escape key from being forwarded to the editor (line 194)

### 3. Why the Process Gets Killed

The process termination happens in the `Claude` class interrupt method in `/Users/badlogic/workspaces/ccwrap/src/claude.ts`:

**Lines 235-243:**
```typescript
interrupt(): void {
  // Mark as interrupted
  this.isInterrupted = true;

  // Kill the process - this is what actually stops Claude
  if (this.process && !this.process.killed) {
    this.process.kill("SIGTERM");
  }
}
```

**Why Process Killing is Used:**
- The implementation uses **process termination** instead of sending control messages
- This is a **brute-force approach** that immediately stops the Claude process
- The documentation shows that the proper way would be to send control request messages (as shown in the docs), but the current implementation bypasses this

### 4. How the Claude Process is Managed

**Process Creation** (Lines 113-163 in `/Users/badlogic/workspaces/ccwrap/src/claude.ts`):
```typescript
constructor(args: string[], env: Record<string, string>) {
  // Always add required args for interactive mode
  const fullArgs = ["--output-format", "stream-json", "--input-format", "stream-json", "--verbose", ...args];

  this.process = spawn(getClaudePath(), fullArgs, {
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  this.rl = createInterface({ input: this.process.stdout! });
  // ... event handlers
}
```

**Process Exit Handling** (Lines 149-162):
```typescript
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
```

**Process Destruction:**
- When interrupted, the process is killed with `SIGTERM` (line 241)
- The `isInterrupted` flag is set to true (line 237)
- When the process exits, it triggers the exit handler which creates an "Interrupted by user" error

**Recreation:**
- **No automatic recreation** - once a Claude process is killed, it stays dead
- The `Claude` instance becomes unusable after interruption due to the error state
- A new `Claude` instance would need to be created for subsequent queries

### 5. Flow When a New User Query Comes After an Interrupt

**Current State After Interrupt:**
1. `isProcessing` gets set to `false` in the `finally` block (line 298)
2. `editor.disableSubmit` gets set to `false` (line 299)
3. `currentQueryGenerator` gets set to `null` (line 300)
4. The `Claude` instance has an error state from the killed process

**New Query Attempt:**
When `processQuery()` is called again (line 351), it will fail at line 170-172:
```typescript
if (this.error) {
  throw this.error; // "Interrupted by user" error
}
```

**Critical Issue:**
The current implementation has a **major flaw** - after an interrupt, the Claude instance becomes permanently unusable because:
1. The process is killed
2. An error state is set
3. No mechanism exists to create a new Claude instance
4. Subsequent queries will always throw the "Interrupted by user" error

### Summary of Implementation Issues

1. **No Process Recreation**: Once interrupted, the Claude instance is permanently broken
2. **Brute Force Approach**: Uses process termination instead of proper control messages
3. **State Management**: The interrupt state isn't properly reset for new queries
4. **User Experience**: After interruption, users cannot continue chatting without restarting the entire application

The interrupt functionality works for its intended purpose (stopping a running query), but the lack of process recreation means the chat session effectively ends after any interrupt.

## Claude Process Management Analysis

### 1. Process Creation and Initialization

**Location: `/Users/badlogic/workspaces/ccwrap/src/claude.ts`**

Claude processes are created through the `Claude` class constructor (lines 113-163):

```typescript
constructor(args: string[], env: Record<string, string>) {
    // Always add required args for interactive mode
    const fullArgs = ["--output-format", "stream-json", "--input-format", "stream-json", "--verbose", ...args];

    this.process = spawn(getClaudePath(), fullArgs, {
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "pipe"],
    });

    this.rl = createInterface({ input: this.process.stdout! });
    // ... event handlers setup
}
```

Key initialization aspects:
- Uses Node.js `spawn()` to create a child process
- Always enforces stream-json format for both input/output
- Sets up readline interface for parsing JSON responses
- Configures stdio pipes for bidirectional communication

### 2. Process Lifecycle

The Claude process lifecycle follows this pattern:

**Startup:**
- Process spawns with specific args and environment
- Readline interface attaches to stdout for event parsing
- Session ID is captured from the initial "system/init" event (line 128-130)

**Active State:**
- Process maintains a single active query at a time (enforced by `currentHandler` check at line 166-168)
- Events are queued and yielded through async generators
- Session state is preserved for conversation continuity

**Termination:**
- Graceful shutdown via `stop()` method (lines 245-248)
- Emergency termination via `interrupt()` method (lines 235-243)

### 3. Interrupt/Termination Handling

**Location: `/Users/badlogic/workspaces/ccwrap/src/claude.ts` (lines 235-243)**

The interrupt system is implemented as follows:

```typescript
interrupt(): void {
    // Mark as interrupted
    this.isInterrupted = true;

    // Kill the process - this is what actually stops Claude
    if (this.process && !this.process.killed) {
        this.process.kill("SIGTERM");
    }
}
```

**Process exit handling (lines 149-162):**
```typescript
this.process.on("exit", (code, _signal) => {
    if (this.isInterrupted) {
        // Process was interrupted by user
        this.error = new Error("Interrupted by user");
        if (this.currentHandler) {
            this.currentHandler({ type: "error", error: this.error });
        }
    } else if (code !== 0) {
        this.error = new Error(`Claude process exited with code ${code}`);
        // ... error handling
    }
});
```

The interrupt mechanism:
- Sets internal `isInterrupted` flag
- Sends SIGTERM to the child process
- Handles process exit gracefully with error propagation
- Resets interrupt state after query completion (line 231)

### 4. Process Reuse vs Recreation

**Location: `/Users/badlogic/workspaces/ccwrap/src/fluent.ts`**

The fluent API (`ClaudeCodeBuilder`) implements intelligent process reuse:

```typescript
private needsNewProcess(): boolean {
    const currentArgsKey = this.getArgsKey();
    return this.lastArgsKey !== currentArgsKey;
}

private ensureProcess(): void {
    if (!this.claude || this.needsNewProcess()) {
        // Stop old process if exists
        if (this.claude) {
            this.claude.stop();
        }

        // Create new process with current args
        this.claude = new Claude(args, this.env);
        this.lastArgsKey = this.getArgsKey();
    }
}
```

**Process reuse strategy:**
- Processes are reused when arguments remain the same
- New processes are created when configuration changes (model, working directory, session, etc.)
- Session continuity is maintained via `--resume` flag when switching processes
- Old processes are properly terminated before creating new ones

### 5. Process Recreation Patterns

The codebase shows two distinct patterns for process management:

**Pattern 1: Single Long-lived Process (chat-tui.ts)**
- Creates one Claude instance at startup (line 97-101)
- Reuses the same process for multiple queries
- Handles interrupts but doesn't recreate processes
- Suitable for interactive chat sessions

**Pattern 2: Smart Process Management (fluent.ts)**
- Automatically recreates processes when configuration changes
- Preserves session state across process boundaries
- Optimizes for both performance (reuse) and flexibility (recreation)
- Suitable for programmatic API usage

### 6. Session State Management

**Session continuity mechanisms:**
- Session IDs are captured from init events and stored (fluent.ts line 91)
- When creating new processes, previous session ID is passed via `--resume` flag (fluent.ts line 65)
- This allows conversation history to persist across process recreations

### Key Insights

1. **Process isolation**: Each Claude instance manages exactly one child process
2. **Single query limitation**: Only one query can be active per process at a time
3. **Graceful degradation**: Interrupt handling allows clean termination without corruption
4. **Smart recreation**: The fluent API optimizes process lifecycle based on configuration changes
5. **Session persistence**: Conversation state survives process recreation through session resumption

The architecture demonstrates a well-thought-out approach to process management that balances performance, reliability, and user experience.

## Analysis of Existing Interrupt Handling Patterns in the Codebase

Based on my search through the codebase, I've found several interrupt handling patterns and identified the core issue described in the todo. Here's a comprehensive breakdown:

### 1. Current Interrupt Handling Implementation

**File: `/Users/badlogic/workspaces/ccwrap/src/claude.ts`**
- **Signal Handling**: Uses `SIGTERM` to kill the Claude process (`this.process.kill("SIGTERM")`)
- **State Management**: Tracks interruption state with `isInterrupted` boolean flag
- **Process Lifecycle**: Handles process exit events and error propagation
- **Cleanup**: Process termination triggers error events through the handler

**File: `/Users/badlogic/workspaces/ccwrap/src/chat-tui.ts`**
- **Keyboard Handling**: Escape key (`\x1b`) triggers interrupt during processing
- **SIGINT Handler**: Ctrl+C handler for graceful shutdown (`process.on("SIGINT")`)
- **UI Feedback**: Shows interrupt status messages to user
- **Process State Tracking**: Uses `isProcessing` flag to control when interrupts are allowed

### 2. Process Management Patterns Found

**Fluent API Pattern** (`src/fluent.ts`):
```typescript
private needsNewProcess(): boolean {
    const currentArgsKey = this.getArgsKey();
    return this.lastArgsKey !== currentArgsKey;
}

private ensureProcess(): void {
    if (!this.claude || this.needsNewProcess()) {
        // Stop old process if exists
        if (this.claude) {
            this.claude.stop();
        }
        // Create new process
        this.claude = new Claude(args, this.env);
        this.lastArgsKey = this.getArgsKey();
    }
}
```

This shows a **process recreation pattern** that the chat-tui should adopt.

### 3. Current Problem Identified

**Issue**: In `chat-tui.ts`, when the user presses Escape to interrupt:
1. `claude.interrupt()` is called, which kills the process with `SIGTERM`
2. The process becomes unusable (`this.error` is set)
3. No new Claude instance is created for subsequent queries
4. Future queries fail because the process is dead

**Root Cause**: The chat-tui creates one Claude instance and never recreates it after interruption, unlike the fluent API which has `ensureProcess()`.

### 4. Session Management Patterns

**Session Continuity**: The fluent API maintains session continuity:
```typescript
// If we have a previous session, pass it along
if (this.lastSessionId && !args.includes("--session")) {
    args.push("--resume", this.lastSessionId);
}
```

### 5. State Recovery Patterns

**Error State Recovery**: The codebase shows patterns for:
- Process state tracking (`isInterrupted`, `isProcessing`)
- Session ID preservation for continuity
- Configuration preservation across process restarts
- Error propagation and handling

### 6. Similar Project Patterns

The documentation shows Node.js best practices:
- Use `child_process.spawn()` for process management
- Handle process lifecycle events (`error`, `exit`)
- Implement proper cleanup and resource management
- Use temporary files for stderr capture

### 7. Recommended Implementation Approach

Based on the existing patterns, the fix should:

1. **Adopt the Fluent API Pattern**: Implement process recreation similar to `ensureProcess()`
2. **Preserve Session State**: Track and resume session IDs like the fluent API
3. **Implement Process Recreation**: Create new Claude instance after interruption
4. **Maintain Configuration**: Preserve args and environment across restarts
5. **Handle State Transitions**: Properly reset processing flags and UI state

### 8. Key Files and Code Snippets

**Process Recreation Pattern** (`/Users/badlogic/workspaces/ccwrap/src/fluent.ts:55-72`):
```typescript
private ensureProcess(): void {
    if (!this.claude || this.needsNewProcess()) {
        // Stop old process if exists
        if (this.claude) {
            this.claude.stop();
        }
        // Create new process
        this.claude = new Claude(args, this.env);
    }
}
```

**Interrupt Handling** (`/Users/badlogic/workspaces/ccwrap/src/claude.ts:235-243`):
```typescript
interrupt(): void {
    // Mark as interrupted
    this.isInterrupted = true;
    // Kill the process - this is what actually stops Claude
    if (this.process && !this.process.killed) {
        this.process.kill("SIGTERM");
    }
}
```

**UI Interrupt Handler** (`/Users/badlogic/workspaces/ccwrap/src/chat-tui.ts:169-199`):
```typescript
ui.onGlobalKeyPress = (data: string): boolean => {
    // Intercept Escape key when Claude is processing
    if (data === "\x1b" && isProcessing) {
        claude.interrupt();
        // Show feedback but no process recreation
    }
    return true;
};
```

The solution needs to bridge the gap between the fluent API's smart process management and the chat-tui's current static approach, implementing process recreation after interruption while maintaining session continuity.