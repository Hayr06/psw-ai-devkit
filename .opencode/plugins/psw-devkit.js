/**
 * PSW DevKit Plugin para OpenCode.ai
 *
 * Plugin distribuible unificado que registra:
 * - Skills de .NET, methodology, RAG y utils
 * - Agents (orchestrator + 6 specialists)
 * - Commands slash
 * - Scaffolding templates
 * - Contexto empresarial
 *
 * NOTA: OpenCode solo carga agents/commands desde archivos .md en
 * .opencode/agents/ y .opencode/commands/ del proyecto. Este plugin
 * sincroniza esos archivos automaticamente desde el paquete npm al
 * proyecto en la primera sesion.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Copia recursiva de archivos y directorios.
 * No sobrescribe archivos existentes (modo safe).
 */
function copyRecursive(src, dest, opts = {}) {
  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry), opts);
    }
  } else {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      if (opts.onCopied) opts.onCopied(src, dest);
    } else {
      if (opts.onSkipped) opts.onSkipped(src, dest);
    }
  }
}

/**
 * Sincroniza el contenido del paquete psw-devkit (.opencode/*) al proyecto.
 * Retorna un resumen de lo copiado.
 */
function syncToProject(projectDir, sourceDir) {
  const targetDir = path.join(projectDir, '.opencode');
  const result = {
    copied: [],
    skipped: [],
    errors: [],
    hasOpenCodeDir: fs.existsSync(targetDir)
  };

  if (!fs.existsSync(sourceDir)) {
    result.errors.push(`Source directory not found: ${sourceDir}`);
    return result;
  }

  const dirsToSync = ['agents', 'commands', 'context', 'scripts'];

  for (const dirName of dirsToSync) {
    const src = path.join(sourceDir, dirName);
    const dest = path.join(targetDir, dirName);

    if (!fs.existsSync(src)) continue;

    try {
      copyRecursive(src, dest, {
        onCopied: (s, d) => result.copied.push(path.relative(targetDir, d)),
        onSkipped: (s, d) => result.skipped.push(path.relative(targetDir, d))
      });
    } catch (err) {
      result.errors.push(`Failed to sync ${dirName}: ${err.message}`);
    }
  }

  // Skills se mantienen cargados via config.skills.paths (ya funciona),
  // pero tambien los copiamos para consistencia y para que el usuario
  // pueda modificarlos localmente si lo desea.
  const skillsSrc = path.join(sourceDir, 'skills');
  const skillsDest = path.join(targetDir, 'skills');
  if (fs.existsSync(skillsSrc)) {
    try {
      copyRecursive(skillsSrc, skillsDest, {
        onCopied: (s, d) => result.copied.push(path.relative(targetDir, d)),
        onSkipped: (s, d) => result.skipped.push(path.relative(targetDir, d))
      });
    } catch (err) {
      result.errors.push(`Failed to sync skills: ${err.message}`);
    }
  }

  return result;
}

export const PSWDevKitPlugin = async ({ client, directory }) => {
  const pluginOpencodeDir = path.resolve(__dirname, '..');
  const skillsPath = path.join(pluginOpencodeDir, 'skills');
  const agentsPath = path.join(pluginOpencodeDir, 'agents');
  const commandsPath = path.join(pluginOpencodeDir, 'commands');
  const scriptsPath = path.join(pluginOpencodeDir, 'scripts');
  const contextPath = path.join(pluginOpencodeDir, 'context', 'enterprise.yaml');

  const hasEnterpriseContext = fs.existsSync(contextPath);
  let syncResult = null;

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

      // NOTA: OpenCode NO soporta config.agents.paths ni config.commands.paths
      // Los agents/commands deben existir como archivos .md en .opencode/agents/
      // y .opencode/commands/ del proyecto. La sincronizacion se hace en
      // session.created (ver mas abajo).
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
      // Intentar sincronizar agents/commands/context/scripts al proyecto
      if (directory) {
        try {
          syncResult = syncToProject(directory, pluginOpencodeDir);
        } catch (err) {
          syncResult = { copied: [], skipped: [], errors: [err.message], hasOpenCodeDir: false };
        }
      }

      const logBody = {
        service: 'psw-devkit',
        level: 'info',
        message: 'PSW DevKit v1.0.0 initialized',
        enterprise_context_loaded: hasEnterpriseContext,
        skills_path: skillsPath,
        agents_path: agentsPath,
        commands_path: commandsPath,
        project_dir: directory || null,
        sync_copied_count: syncResult ? syncResult.copied.length : 0,
        sync_skipped_count: syncResult ? syncResult.skipped.length : 0,
        sync_errors_count: syncResult ? syncResult.errors.length : 0
      };

      await client.app.log({ body: logBody });

      if (syncResult && syncResult.copied.length > 0) {
        await client.app.log({
          body: {
            service: 'psw-devkit',
            level: 'info',
            message: `PSW DevKit files synced to project: ${syncResult.copied.length} new files copied to .opencode/`,
            copied_files: syncResult.copied.slice(0, 20),
            hint: 'Restart OpenCode if agents/commands do not appear immediately'
          }
        });
      }

      if (syncResult && syncResult.errors.length > 0) {
        await client.app.log({
          body: {
            service: 'psw-devkit',
            level: 'warn',
            message: 'PSW DevKit auto-sync failed. Run manual init: npx psw-devkit-init',
            errors: syncResult.errors,
            manual_init_command: 'npx psw-devkit-init'
          }
        });
      }

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
      const contextInjection = `[PSW_DEVKIT_CONTEXT]\nEste es el contexto empresarial del equipo PSW. DEBES seguir estas reglas:\n\n${contextContent}\n\n[FIN CONTEXT]\n\n`;

      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: 'text', text: contextInjection });
    }
  };
};
