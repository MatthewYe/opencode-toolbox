# Hooks Reference

All hooks your plugin can return from its async factory function. Each hook is optional — return only what you need.

## Lifecycle & Config

### `config`
Modify opencode's configuration at startup. Use this to register skill paths, agents, commands, providers, or any other config key.

```typescript
config: async (config) => {
  config.skills = config.skills || {}
  config.skills.paths = config.skills.paths || []
  config.skills.paths.push('/path/to/my/skills')
  config.agent = { ...config.agent, myAgent: { prompt: '...' } }
  config.command = { ...config.command, myCommand: { template: '...' } }
}
```

### `event`
React to lifecycle events (session start, tool calls, etc.).

```typescript
event: async ({ event }) => {
  console.log(event.type, event.properties)
}
```

## Tool System

### `tool`
Register custom tools the agent can call.

```typescript
tool: {
  myTool: tool({
    description: 'Describe what the tool does',
    args: { input: tool.schema.string().describe('...') },
    async execute(args, ctx) {
      return `Result: ${args.input}`
    },
  }),
}
```

### `tool.execute.before`
Intercept before any tool runs. Can modify args or block execution.

```typescript
"tool.execute.before": async (input, output) => {
  if (input.tool === 'bash' && output.args.command?.includes('rm -rf')) {
    throw new Error('Dangerous command blocked')
  }
}
```

### `tool.execute.after`
Intercept after a tool completes. Can modify the title, output, or metadata shown to the agent.

```typescript
"tool.execute.after": async (input, output) => {
  output.title = `[audited] ${output.title}`
}
```

### `tool.definition`
Modify tool definitions (description and parameters) sent to the LLM before each call.

```typescript
"tool.definition": async (input, output) => {
  if (input.toolID === 'bash') {
    output.description += '\nNever run destructive commands.'
  }
}
```

## Commands & Shell

### `command.execute.before`
Intercept before slash commands (`/foo`) execute.

```typescript
"command.execute.before": async (input, output) => {
  // input.command — the slash command name (e.g. "autopilot")
  // input.arguments — the raw argument string
  // output.parts — modify the message parts sent to the agent
}
```

### `shell.env`
Inject environment variables into every shell command the agent runs.

```typescript
"shell.env": async (input, output) => {
  output.env.NODE_ENV = 'development'
  output.env.CI = process.env.CI ?? ''
}
```

## Chat Pipeline

### `chat.message`
Transform incoming user messages before they reach the agent.

```typescript
"chat.message": async (input, output) => {
  // output.message — modify UserMessage
  // output.parts — modify message parts (text, files, etc.)
}
```

### `chat.params`
Modify LLM parameters (temperature, max tokens, etc.) per request.

```typescript
"chat.params": async (input, output) => {
  output.temperature = 0.3
  output.maxOutputTokens = 4096
}
```

### `chat.headers`
Add custom HTTP headers to LLM API requests.

```typescript
"chat.headers": async (input, output) => {
  output.headers['X-Custom-Header'] = 'value'
}
```

### `experimental.chat.messages.transform`
Transform the full message history before it's sent to the LLM.

### `experimental.chat.system.transform`
Modify the system prompt before it's sent.

```typescript
"experimental.chat.system.transform": async (input, output) => {
  output.system.push('Additional system instruction here.')
}
```

## Auth & Providers

### `auth`
Register a custom authentication provider.

```typescript
auth: {
  provider: 'my-oauth',
  methods: [
    {
      type: 'oauth',
      label: 'Sign in with MyService',
      prompts: [
        { type: 'text', key: 'clientId', message: 'Client ID' },
        { type: 'text', key: 'clientSecret', message: 'Client Secret' },
      ],
    },
  ],
  loader: async (auth, provider) => {
    // called with stored auth credentials
    return { /* token data */ }
  },
}
```

### `provider`
Register a custom model provider.

```typescript
provider: {
  // Custom provider implementation
}
```

## Permissions

### `permission.ask`
Intercept permission requests. **Note:** This hook has a known issue (upstream #7006) where it may not fire reliably. Avoid depending on it for critical security checks; use `tool.execute.before` instead.

```typescript
"permission.ask": async (input, output) => {
  output.status = 'allow' // auto-approve
}
```

## Session Management

### `experimental.session.compacting`
Customize the compaction prompt when a session grows too large.

```typescript
"experimental.session.compacting": async (input, output) => {
  output.context.push('Preserve information about X.')
  // output.prompt = 'Replace the entire compaction prompt'
}
```

### `experimental.compaction.autocontinue`
Control whether the agent auto-continues after compaction.

```typescript
"experimental.compaction.autocontinue": async (input, output) => {
  output.enabled = false // suppress auto-continue
}
```

## Text Completion

### `experimental.text.complete`
Intercept text completion in the TUI.

```typescript
"experimental.text.complete": async (input, output) => {
  output.text = 'suggested completion'
}
```
