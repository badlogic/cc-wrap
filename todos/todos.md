- Interrupting in chat-tui.ts kills process, doesn't recreate it upon new user query
- Clean-up chat-tui.ts, tool-renderers.ts
    - Each type of message/tool needs its own TUI component. Do we need a type field to test what component something is, or will instanceof work in TS?
    - Some components need to have expand/collapse() methods. this is especially true for
- Display Task tool and subagent messages nicely
- Rework TUI design to be beautiful, concise and informative by subtle use of color and information design best practices
- When the text editor component is taller than the terminal viewport and we scroll upwards, we get artifacts above the terminal viewport
  In the case below the terminal viewport is 10 lines high. After pressing SHIFT + ENTER 10 times, the scrollbuffer looks like shown below.
  This is likely a bug in the text-editor.ts component in ../tui, which is a dependency of this project via a file refernce in package.json
  If you make changes to sources in ../tui you must run `npm run dist` in ../tui to rebuild the output .js so we can consume it in ccwrap-
	➜  ccwrap git:(main) ✗ npx tsx src/chat-tui.ts
	Initializing Claude...
	Claude Code SDK Chat

	────────────────────────────────────────────────────────────────────────────────
	Config: /Users/badlogic/.ccwrap
	Working Directory: /Users/badlogic/workspaces/ccwrap
	────────────────────────────────────────────────────────────────────────────────

	Type /help for commands or start chatting with Claude
	Press Escape to interrupt Claude while processing

	╭─────────────────────────────────────────────────────────────────────────────────────────────╮
	╭─────────────────────────────────────────────────────────────────────────────────────────────╮
	│ >                                                                                           │
	╭─────────────────────────────────────────────────────────────────────────────────────────────╮
	│ >                                                                                           │
	│                                                                                             │
	│                                                                                             │
	│                                                                                             │
	│                                                                                             │
	│                                                                                             │
	│                                                                                             │
	│                                                                                             │
	│                                                                                             │
	│                                                                                             │
	│                                                                                             │
	╰─────────────────────────────────────────────────────────────────────────────────────────────╯
