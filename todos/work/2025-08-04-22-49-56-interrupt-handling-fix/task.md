# Interrupt Handling Fix
**Status:** AwaitingCommit
**Agent PID:** 9204

## Original Todo
Interrupting in chat-tui.ts kills process, doesn't recreate it upon new user query

## Description
We need to fix the interrupt handling in chat-tui.ts so that after interrupting a query with the Escape key, the user can continue chatting without restarting the application. Currently, interrupting kills the Claude process permanently, making it unusable for subsequent queries.

*Read [analysis.md](./analysis.md) in full for detailed codebase research and context*

## Implementation Plan
The `Claude` class should handle process recreation transparently when `interrupt()` is called, so consumers don't need to manage this complexity.

- [x] Add properties to track recreation state and store constructor args (src/claude.ts:105-115)
- [x] Create `spawnProcess()` method to eliminate code duplication (src/claude.ts:125-178)
- [x] Update process exit handler to set `needsRecreation` flag instead of permanent error (src/claude.ts:168-170)
- [x] Update `interrupt()` to mark process for recreation (src/claude.ts:235-243)
- [x] Modify `query()` method to check and recreate process if needed before sending query (src/claude.ts:180-185)
- [x] Create automated test using Node.js test framework that verifies interrupt and recovery (test/claude.test.ts)
- [ ] User test: In chat-tui, press Escape during a query, then submit a new query to verify it works

## Notes
[Implementation notes]