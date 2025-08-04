# Claude Code CLI Complete Reference

This document provides a comprehensive reference for all Claude Code CLI options, with examples and output formats.

## Basic Usage

### Interactive Mode (Default)
```bash
claude
# Starts an interactive session
```

### Non-Interactive Mode (--print)
```bash
claude --print "What is 2+2?"
# Output: 4
```

## Output Formats (--output-format)

### 1. Text Format (default)
```bash
claude --print "What is 2+2?" --output-format text
# Output: 4
```

### 2. JSON Format
```bash
claude --print "What is 2+2?" --output-format json
```
Output:
```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 2820,
  "duration_api_ms": 4382,
  "num_turns": 1,
  "result": "4",
  "session_id": "a5013a0e-7b16-41cb-94cf-65c29ff2b6c6",
  "total_cost_usd": 0.26119595,
  "usage": {
    "input_tokens": 4,
    "cache_creation_input_tokens": 13885,
    "cache_read_input_tokens": 0,
    "output_tokens": 7,
    "server_tool_use": {
      "web_search_requests": 0
    },
    "service_tier": "standard"
  }
}
```

### 3. Stream-JSON Format (requires --verbose)
```bash
claude --print "List all files in this directory" --output-format stream-json --verbose
```
Output (abbreviated):
```json
{"type":"system","subtype":"init","cwd":"/Users/badlogic/workspaces/ccwrap","session_id":"da7f7af7-88e5-43ba-852d-90d1bf3991cb","tools":["Task","Bash","Glob","Grep","LS","ExitPlanMode","Read","Edit","MultiEdit","Write","NotebookRead","NotebookEdit","WebFetch","WebSearch"],"mcp_servers":[{"name":"vs-claude","status":"connected"}],"model":"claude-opus-4-20250514","permissionMode":"default","slash_commands":["todo-worktree","README","todo-branch","add-dir","agents","clear","compact","config","cost","doctor","exit","help","ide","init","install-github-app","mcp","memory","model","pr-comments","release-notes","resume","status","bug","review","terminal-setup","upgrade","vim","permissions","hooks","export","logout","login"],"apiKeySource":"ANTHROPIC_API_KEY"}
{"type":"assistant","message":{"id":"msg_0147SfAdoSPYfT4nxsXjbxy4","type":"message","role":"assistant","model":"claude-opus-4-20250514","content":[{"type":"text","text":"I'll list all files in the current directory for you."}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":3,"cache_creation_input_tokens":281,"cache_read_input_tokens":13588,"output_tokens":4,"service_tier":"standard"}},"parent_tool_use_id":null,"session_id":"da7f7af7-88e5-43ba-852d-90d1bf3991cb"}
{"type":"assistant","message":{"id":"msg_0147SfAdoSPYfT4nxsXjbxy4","type":"message","role":"assistant","model":"claude-opus-4-20250514","content":[{"type":"tool_use","id":"toolu_01KoSCPyB5pKG3XHA8u7Fgzj","name":"LS","input":{"path":"/Users/badlogic/workspaces/ccwrap"}}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":3,"cache_creation_input_tokens":281,"cache_read_input_tokens":13588,"output_tokens":92,"service_tier":"standard"}},"parent_tool_use_id":null,"session_id":"da7f7af7-88e5-43ba-852d-90d1bf3991cb"}
{"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_01KoSCPyB5pKG3XHA8u7Fgzj","type":"tool_result","content":"- /Users/badlogic/workspaces/ccwrap/\n  - README.md\n  - biome.json\n  - docs/\n    - claude-environment.md\n  - node_modules/\n  - package-lock.json\n  - package.json\n  - src/\n    - index.ts\n  - tmp-config/\n  - tsconfig.json"}]},"parent_tool_use_id":null,"session_id":"da7f7af7-88e5-43ba-852d-90d1bf3991cb"}
{"type":"result","subtype":"success","is_error":false,"duration_ms":49293,"duration_api_ms":51353,"num_turns":3,"result":"Here are all the files in the current directory...","session_id":"da7f7af7-88e5-43ba-852d-90d1bf3991cb","total_cost_usd":0.34751435,"usage":{"input_tokens":36,"cache_creation_input_tokens":2915,"cache_read_input_tokens":102723,"output_tokens":1820,"server_tool_use":{"web_search_requests":0},"service_tier":"standard"}}
```

## Input Formats (--input-format)

### 1. Text Format (default)
```bash
echo "What is 2+2?" | claude --print
```

### 2. Stream-JSON Format (requires --output-format stream-json)
```bash
echo '{"type": "user", "message": {"role": "user", "content": "What is 3+3?"}}' | claude --print --input-format stream-json --output-format stream-json --verbose
```

The stream-json input format expects:
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "Your message here"
  }
}
```

## Session Management

### New Session with Custom ID (needs to follow uuid format as below)
```bash
claude --print --session-id "B74C83FE-6001-402F-80F9-B0B132A85DCC" "First message"
```

### Resume Existing Session
```bash
claude --print --resume "B74C83FE-6001-402F-80F9-B0B132A85DCC" "Follow-up message"
```

### Continue Most Recent Session
```bash
claude --continue
```

## Model Selection

### Specify Model
```bash
claude --print --model opus "Complex task"
claude --print --model sonnet "Quick task"
claude --print --model "claude-opus-4-20250514" "Specific version"
```

### Fallback Model (--print only)
```bash
claude --print --model opus --fallback-model sonnet "Task"
```

## Tool Control

### Allow Specific Tools
```bash
claude --print --allowedTools "Read Write Edit" "Edit this file"
claude --print --allowedTools "Bash(git:*) Grep" "Git operations only"
```

### Disallow Specific Tools
```bash
claude --print --disallowedTools "Bash Write" "Read-only task"
```

## Permission Modes

### Default Mode
```bash
claude --print "Do something"
# Will prompt for each permission
```

### Accept Edits Mode
```bash
claude --print --permission-mode acceptEdits "Edit files"
# Auto-accepts file edits
```

### Bypass Permissions Mode
```bash
claude --print --permission-mode bypassPermissions "Automated task"
# Bypasses all permission checks
```

### Plan Mode
```bash
claude --print --permission-mode plan "Plan a feature"
# Planning mode for complex tasks
```

### Dangerous Skip Permissions
```bash
claude --print --dangerously-skip-permissions "Sandboxed operation"
# USE WITH EXTREME CAUTION - bypasses ALL permission checks
```

## Debug and Verbose Modes

### Debug Mode
```bash
claude --debug --print "Debug this"
# Shows detailed debug information
```

### Verbose Mode
```bash
claude --verbose --print "Verbose output"
# Shows additional output (required for stream-json)
```

## Directory Access

### Add Additional Directories
```bash
claude --print --add-dir /path/to/project /another/path "Analyze these directories"
```

## System Prompt Customization

### Append to System Prompt
```bash
claude --print --append-system-prompt "Always use TypeScript" "Write code"
```

## MCP (Model Context Protocol) Configuration

### Load MCP Config from File
```bash
claude --print --mcp-config /path/to/mcp.json "Task"
```

### Load MCP Config from String
```bash
claude --print --mcp-config '{"servers":{"example":{"command":"example-server"}}}' "Task"
```

### Strict MCP Config (ignore other MCP sources)
```bash
claude --print --strict-mcp-config --mcp-config config.json "Task"
```

## Other Options

### Timeout (in milliseconds)
```bash
claude --print --timeout 60000 "Long running task"
```

### Settings File
```bash
claude --print --settings /path/to/settings.json "Task"
```

### IDE Integration
```bash
claude --ide
# Automatically connects to IDE if available
```

## Environment Variables

### Authentication
```bash
export ANTHROPIC_API_KEY="sk-..."           # Pay-as-you-go
export CLAUDE_CODE_OAUTH_TOKEN="..."        # Subscription plan
```

### Configuration Directory
```bash
export CLAUDE_CONFIG_DIR="/tmp/claude-temp"  # Custom config location
```

## Command Examples

### List MCP Servers
```bash
claude mcp list
```

### Add MCP Server
```bash
claude mcp add my-server /usr/local/bin/my-mcp-server
```

### Configure Settings
```bash
claude config set theme dark
claude config set -g model opus  # Global setting
claude config get theme
claude config list
```

### Check for Updates
```bash
claude update
```

### Health Check
```bash
claude doctor
```

## Stream-JSON Event Types

When using `--output-format stream-json --verbose`, you'll see these event types:

1. **system** - Initialization info
   - `subtype: "init"` - Session start with tools, model, etc.

2. **assistant** - Claude's responses
   - Contains message content and/or tool use

3. **user** - User messages and tool results
   - Tool results after Claude uses a tool

4. **result** - Final summary
   - Contains final result, cost, usage stats

## Complete Example: Multi-turn Conversation

```bash
# First message - creates session
SESSION_ID="B74C83FE-6001-402F-80F9-B0B132A85DCC"
claude --print --session-id "$SESSION_ID" --output-format json "What files are in this directory?"

# Follow-up - resumes session
claude --print --resume "$SESSION_ID" --output-format json "Now read the package.json file"

# Another follow-up
claude --print --resume "$SESSION_ID" --output-format json "What dependencies are listed?"
```

## Error Handling

Common errors:
- `Error: Session ID X is already in use` - Use `--resume` instead of `--session-id`
- `Error: --output-format=stream-json requires --verbose` - Add `--verbose` flag
- `Error: --input-format=stream-json requires output-format=stream-json` - Must use together