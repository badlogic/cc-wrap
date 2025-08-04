# Claude Code Environment Configuration Guide

This document describes how to configure Claude Code for clean, isolated API usage through ccwrap, ensuring no interference with user's existing Claude Code setup.

## Authentication

### OAuth Token (Recommended for Subscription Users)
- **Setup**: Run `claude setup-token` to obtain OAuth token for accounts with Max or other plans
- **Environment Variable**: `CLAUDE_CODE_OAUTH_TOKEN`
- **Benefits**: Uses subscription plan pricing instead of pay-as-you-go
- **Note**: This token can also be used with the Anthropic SDK for custom implementations

### API Key (Pay-as-you-go)
- **Environment Variable**: `ANTHROPIC_API_KEY`
- **Usage**: Fallback when OAuth token is not available

## Configuration Directory Isolation

### Critical: Always Use Custom Config Directory
Claude Code stores various files in its config directory (default: `~/.claude`). To ensure clean API usage:

- **Environment Variable**: `CLAUDE_CONFIG_DIR`
- **Best Practice**: Always set to a temporary directory that gets cleaned up after use
- **Never**: Use the user's default `~/.claude` directory during API calls

### What Claude Stores in Config Directory

Based on investigation of `tmp-config`, Claude creates:

1. **`/projects/`** - Session data organized by working directory
   - Session JSONL files containing full conversation history
   - Session JSON files with metadata
   - Directory names are sanitized paths (e.g., `-Users-badlogic-workspaces-ccwrap`)

2. **`/shell-snapshots/`** - Shell environment captures
   - Snapshot files containing shell functions and environment
   - Used to understand user's shell context

3. **`/statsig/`** - Analytics and feature flags
   - Stable ID for tracking
   - Cached evaluations
   - Session IDs
   - Last modified timestamps

4. **`/todos/`** - Task tracking
   - JSON files linked to session IDs
   - Contains todo items created during sessions

5. **Note**: The user's default `~/.claude` directory may contain additional configurations, hooks, and customizations that we want to avoid during API usage

## Implementation Requirements for ccwrap

### 1. Temporary Directory Management
```typescript
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

class ClaudeEnvironment {
  private tempDir: string;

  constructor() {
    // Create isolated temp directory
    this.tempDir = mkdtempSync(join(tmpdir(), 'ccwrap-'));
    process.env.CLAUDE_CONFIG_DIR = this.tempDir;
  }

  cleanup() {
    // Remove entire temp directory
    rmSync(this.tempDir, { recursive: true, force: true });
  }
}
```

### 2. Session Cleanup
Since we control the config directory, session cleanup becomes automatic when we delete the temp directory. This solves:
- Large session file accumulation
- Privacy concerns (conversation history)
- Disk space usage

### 3. Environment Variables to Set
```typescript
interface ClaudeEnvironment {
  CLAUDE_CONFIG_DIR: string;        // Always set to temp directory
  CLAUDE_CODE_OAUTH_TOKEN?: string; // If user has subscription
  ANTHROPIC_API_KEY?: string;       // Fallback for pay-as-you-go
}
```

### 4. Isolation Benefits
- **No Hook Interference**: User's custom hooks won't affect API calls
- **No Slash Commands**: Clean command namespace
- **No MCP Conflicts**: Isolated MCP server configurations
- **Clean Sessions**: Each API usage starts fresh
- **Automatic Cleanup**: No persistent data after API usage

## Security Considerations

1. **Temp Directory Permissions**: Ensure temp directories are created with restricted permissions
2. **Token Storage**: Never log or persist authentication tokens
3. **Session Privacy**: Always clean up session data containing user prompts/responses
4. **Process Isolation**: Each ccwrap instance should use its own temp directory

## Example Implementation

```typescript
class CCWrap {
  private env: ClaudeEnvironment;

  constructor(options: CCWrapOptions) {
    this.env = new ClaudeEnvironment();
    
    // Set auth from options or environment
    if (options.oauthToken) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = options.oauthToken;
    } else if (options.apiKey) {
      process.env.ANTHROPIC_API_KEY = options.apiKey;
    }
  }

  async execute(prompt: string): Promise<Result> {
    try {
      // All Claude operations happen in isolated environment
      return await this.runClaude(prompt);
    } finally {
      // Always cleanup, even on error
      this.env.cleanup();
    }
  }
}
```

This approach ensures ccwrap provides a clean, predictable environment for every API call, completely isolated from the user's Claude Code configuration.