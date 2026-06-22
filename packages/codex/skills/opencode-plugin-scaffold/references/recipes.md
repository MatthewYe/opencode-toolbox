# Common Recipes

Each recipe shows the minimum viable code to accomplish a common plugin task.

## Add a custom tool

```typescript
import { type Plugin, tool } from '@opencode-ai/plugin'

export const MyPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      greet: tool({
        description: 'Greet someone by name',
        args: {
          name: tool.schema.string().describe('Name to greet'),
        },
        async execute(args, ctx) {
          return `Hello, ${args.name}!`
        },
      }),
    },
  }
}
```

## Inject environment variables

```typescript
export const MyPlugin: Plugin = async (ctx) => {
  return {
    'shell.env': async (input, output) => {
      output.env.MY_API_KEY = process.env.MY_API_KEY ?? ''
      output.env.DEBUG = 'true'
    },
  }
}
```

## Block dangerous tool calls

```typescript
export const MyPlugin: Plugin = async (ctx) => {
  return {
    'tool.execute.before': async (input, output) => {
      if (input.tool === 'read' && output.args.filePath?.includes('.env')) {
        throw new Error('Reading .env files is blocked')
      }
      if (input.tool === 'bash') {
        const cmd = output.args.command || ''
        if (cmd.includes('sudo') || cmd.includes('rm -rf /')) {
          throw new Error('Dangerous command blocked')
        }
      }
    },
  }
}
```

## Register skill paths

```typescript
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const MyPlugin: Plugin = async (ctx) => {
  return {
    config: async (config) => {
      config.skills = config.skills || {}
      config.skills.paths = config.skills.paths || []
      const mySkillsDir = path.resolve(__dirname, 'skills')
      if (!config.skills.paths.includes(mySkillsDir)) {
        config.skills.paths.push(mySkillsDir)
      }
    },
  }
}
```

## Register a custom agent

```typescript
export const MyPlugin: Plugin = async (ctx) => {
  return {
    config: async (config) => {
      config.agent = {
        ...(config.agent ?? {}),
        'code-reviewer': {
          description: 'Reviews code for bugs and style issues',
          prompt: 'You are a code reviewer. Analyze the diff and report issues.',
          model: { providerID: 'my-provider', modelID: 'my-model' },
        },
      }
    },
  }
}
```

## Register a slash command

```typescript
export const MyPlugin: Plugin = async (ctx) => {
  return {
    config: async (config) => {
      config.command = {
        ...(config.command ?? {}),
        deploy: {
          description: 'Deploy the current project',
          template: 'Deploy the project at {{directory}} to production. Steps:\n1. Build\n2. Test\n3. Deploy',
          args: { environment: { type: 'string', description: 'Target environment' } },
        },
      }
    },
  }
}
```

## Intercept slash commands

```typescript
export const MyPlugin: Plugin = async (ctx) => {
  return {
    'command.execute.before': async (input, output) => {
      if (input.command === 'deploy') {
        output.parts = [
          ...output.parts,
          { type: 'text', text: '\nAlways run `bun run build` before deploying.' },
        ]
      }
    },
  }
}
```

## Add custom HTTP headers to LLM requests

```typescript
export const MyPlugin: Plugin = async (ctx) => {
  return {
    'chat.headers': async (input, output) => {
      output.headers['X-Request-ID'] = crypto.randomUUID()
    },
  }
}
```

## Modify the system prompt

```typescript
export const MyPlugin: Plugin = async (ctx) => {
  return {
    'experimental.chat.system.transform': async (input, output) => {
      output.system.push('Never mention competitor products.')
    },
  }
}
```

## Control LLM parameters per request

```typescript
export const MyPlugin: Plugin = async (ctx) => {
  return {
    'chat.params': async (input, output) => {
      // Override temperature for specific agents
      if (input.agent === 'implementer') {
        output.temperature = 0.1
        output.maxOutputTokens = 8192
      }
    },
  }
}
```
