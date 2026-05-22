import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readMarkdownConfigs(dirPath) {
  const result = {};
  if (!fs.existsSync(dirPath)) return result;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

    const filePath = path.join(dirPath, entry.name);
    const raw = fs.readFileSync(filePath, 'utf8');
    const { data: frontmatter, content } = matter(raw);
    const key = entry.name.replace(/\.md$/, '');

    result[key] = { ...frontmatter, prompt: content.trim() };
  }
  return result;
}

function buildAgentConfigs(raw) {
  const configs = {};
  for (const [name, def] of Object.entries(raw)) {
    const { prompt, ...rest } = def;
    configs[name] = { ...rest, prompt };
  }
  return configs;
}

function buildCommandConfigs(raw) {
  const configs = {};
  for (const [name, def] of Object.entries(raw)) {
    const { prompt, arguments: args, ...rest } = def;
    const cmd = { ...rest, template: prompt };
    if (args) cmd.args = args;
    configs[name] = cmd;
  }
  return configs;
}

export const OpenCodeToolbox = async ({ client, directory }) => {
  const skillsDir = path.resolve(__dirname, 'skills');
  const agentsRaw = readMarkdownConfigs(path.resolve(__dirname, 'agents'));
  const commandsRaw = readMarkdownConfigs(path.resolve(__dirname, 'commands'));

  const agentConfigs = buildAgentConfigs(agentsRaw);
  const commandConfigs = buildCommandConfigs(commandsRaw);

  return {
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(skillsDir)) {
        config.skills.paths.push(skillsDir);
      }

      config.agent = { ...(config.agent ?? {}), ...agentConfigs };
      config.command = { ...(config.command ?? {}), ...commandConfigs };
    }
  };
};
