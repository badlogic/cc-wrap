# chat-tui.ts should accept multiple prompt strings
**Status:** Done
**Agent PID:** 9204

## Original Todo
- chat-tui.ts should accept multiple prompt strings
   - Feed claude the first prompt, wait for result, feed the next, rinse, repeat
   - If prompt string equals <EXIT>, exit process (same as /quit or /exit slash command)

## Description
We're enhancing chat-tui.ts to accept and process multiple command-line prompts sequentially. The application will feed Claude each prompt one by one, waiting for a complete response before sending the next. If any prompt equals `<EXIT>`, the application will terminate gracefully, similar to the existing /quit or /exit commands.

*Read [analysis.md](./analysis.md) in full for detailed codebase research and context*

## Implementation Plan
Based on the codebase analysis, here's how we'll implement multiple prompt support:

- [x] Modify argument parsing in chat-tui.ts to accept multiple prompts (src/chat-tui.ts:92)
- [x] Create a prompt queue to process arguments sequentially after UI initialization (src/chat-tui.ts:343-351)
- [x] Add a queue display container between loadingContainer and editor to show pending prompts
- [x] Disable text editor submission when prompts are queued
- [x] Add special handling for `<EXIT>` prompt to terminate gracefully
- [x] Ensure proper UI feedback between each prompt/response cycle
- [x] Test with multiple prompts including `<EXIT>` termination
- [x] User test: Run `node dist/chat-tui.js "First prompt" "Second prompt" "<EXIT>"` and verify sequential execution

## Notes
[Implementation notes]