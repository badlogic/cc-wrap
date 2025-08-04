- After finishing code changes, run npm run check and fix any reported linting and typechecking errors.
- NEVER TAKE SHORTCUTS
    - If a test hangs or doesn't work, do NOT move on. Fix things, or ask the user for help
- NEVER RUN npm run build or node dist/chat-tui.ts
    - If you must run the chat-tui.ts, you must run it ala npx tsx src/chat-tui.ts "prompt" "prompt2" "<EXIT>" so the process closes. You can then inspect the stdout you get via the Bash tool.

## SDKMessage Type Reference
SDKMessage is a union type from @anthropic-ai/claude-code that can be:
- `SDKAssistantMessage`: { type: 'assistant', message: APIAssistantMessage, parent_tool_use_id: string | null, session_id: string }
- `SDKUserMessage`: { type: 'user', message: APIUserMessage, parent_tool_use_id: string | null, session_id: string }
- `SDKResultMessage`: { type: 'result', subtype: 'success' | 'error_max_turns' | 'error_during_execution', ... }
- `SDKSystemMessage`: { type: 'system', subtype: 'init', ... }

For assistant messages, the actual content is in `message.content` array where each item has `type` and content.