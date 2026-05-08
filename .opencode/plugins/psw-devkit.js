/**
 * PSW DevKit Plugin para OpenCode.ai
 *
 * Plugin distribuible unificado que registra:
 * - Skills de .NET, methodology, RAG y utils
 * - Agents (orchestrator + 6 specialists)
 * - Commands slash
 * - Scaffolding templates
 * - Contexto empresarial
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PSWDevKitPlugin = async ({ client, directory }) => {
  const skillsPath = path.resolve(__dirname, '../skills');
  const agentsPath = path.resolve(__dirname, '../agents');
  const commandsPath = path.resolve(__dirname, '../commands');
  const scriptsPath = path.resolve(__dirname, '../scripts');
  const contextPath = path.resolve(__dirname, '../context/enterprise.yaml');

  const hasEnterpriseContext = fs.existsSync(contextPath);

  return {
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];

      const skillCategories = ['dotnet', 'methodology', 'rag', 'utils'];
      for (const category of skillCategories) {
        const categoryPath = path.join(skillsPath, category);
        if (fs.existsSync(categoryPath) && !config.skills.paths.includes(categoryPath)) {
          config.skills.paths.push(categoryPath);
        }
      }

      config.agents = config.agents || { paths: [] };
      if (!config.agents.paths.includes(agentsPath)) {
        config.agents.paths.push(agentsPath);
      }

      config.commands = config.commands || { paths: [] };
      if (!config.commands.paths.includes(commandsPath)) {
        config.commands.paths.push(commandsPath);
      }

      config.psw_devkit = {
        scripts_path: scriptsPath,
        context_path: contextPath,
        version: '1.0.0'
      };
    },

    'session.created': async ({ client }) => {
      await client.app.log({
        body: {
          service: 'psw-devkit',
          level: 'info',
          message: 'PSW DevKit v1.0.0 initialized',
          enterprise_context_loaded: hasEnterpriseContext,
          skills_path: skillsPath,
          agents_path: agentsPath
        }
      });

      if (hasEnterpriseContext) {
        const contextContent = fs.readFileSync(contextPath, 'utf8');

        await client.app.log({
          body: {
            service: 'psw-devkit',
            level: 'info',
            message: 'Enterprise context loaded',
            context_preview: contextContent.substring(0, 200) + '...'
          }
        });
      }
    },

    'experimental.chat.messages.transform': async (_input, output) => {
      if (!hasEnterpriseContext || !output.messages.length) return;

      const firstUser = output.messages.find(m => m.info.role === 'user');
      if (!firstUser || !firstUser.parts.length) return;

      if (firstUser.parts.some(p => p.type === 'text' && p.text.includes('[PSW_DEVKIT_CONTEXT]'))) return;

      const contextContent = fs.readFileSync(contextPath, 'utf8');
      const contextInjection = `[PSW_DEVKIT_CONTEXT]
Este es el contexto empresarial del equipo PSW. DEBES seguir estas reglas:

${contextContent}

[FIN CONTEXT]

`;

      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: 'text', text: contextInjection });
    }
  };
};