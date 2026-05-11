# Installing PSW DevKit for OpenCode

## Prerequisites

- [OpenCode.ai](https://opencode.ai) installed
- .NET SDK 8/9/10 (for .NET development)

## Installation

### Step 1: Add plugin to opencode.json

Add the plugin to the `plugin` array in your `opencode.json` (global or project-level):

```json
{
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git",
    "psw-devkit@git+https://github.com/Hayr06/psw-ai-devkit.git"
  ]
}
```

**Important:** Superpowers must be listed FIRST, then psw-devkit. The plugin order matters.

### Step 2: Restart OpenCode

Restart OpenCode. The plugin will auto-install and register skills.

```bash
opencode
```

### Step 3: Synchronize agents, commands, and resources

**Automatic (recommended):** On the first session, the plugin detects missing files and copies them automatically to `.opencode/`. Check the logs for:

```
PSW DevKit files synced to project: 97 new files copied to .opencode/
```

**Manual (if auto-sync fails):** Run from your project root:

```bash
npx psw-devkit-init
```

This copies all agents, commands, skills, context, and scripts to your project's `.opencode/` directory.

### Step 4: Restart OpenCode again

After synchronization, **restart OpenCode** so it discovers the new agents and commands:

```bash
opencode
```

### Step 5: Verify installation

Check that agents are available:

```bash
opencode agent list | grep -E "orchestrator|specialist"
```

You should see:
- `orchestrator (primary)`
- `backend-specialist`, `frontend-specialist`, `devops-specialist`
- `migration-specialist`, `qa-specialist`, `security-specialist`

Try the orchestrator:

```
@orchestrator
```

Or run a command in the TUI:

```
/brainstorm
```

## Setup Script

After installation, run the setup script to install dependencies:

```bash
bash .opencode/scripts/setup.sh
```

This installs:
- Python dependencies (OpenCV, Pillow, PyTesseract for Vision)
- Tesseract OCR
- RAG dependencies (PyMuPDF, openpyxl, python-docx)

## Included Content

### Agents (7)
- `orchestrator` - Main agent hub, single point of contact for developers
- `frontend-specialist` - Blazor WASM, MudBlazor, FluentUI
- `backend-specialist` - DDD, CQRS, Clean Architecture
- `devops-specialist` - Docker, CI/CD, Azure
- `migration-specialist` - Extraction of bounded contexts
- `qa-specialist` - Testing, coverage, quality
- `security-specialist` - JWT, secrets, OWASP

### Skills (55+)

**Methodology (16 Superpowers skills):**
- brainstorming, writing-plans, test-driven-development
- subagent-driven-development, systematic-debugging
- verification-before-completion, requesting-code-review
- receiving-code-review, finishing-a-development-branch
- using-git-worktrees, dispatching-parallel-agents, writing-skills, executing-plans

**.NET Technical (45+ skills):**
- scaffolding, clean-arch-design, ddd-aggregate, domain-analysis
- blazor-component, blazor-authentication, blazor-debugging, blazor-error-handling, blazor-hosting
- fluentui-blazor, yarp-config, dapr-microservices
- jwt-auth, ef-core-filters, row-level-security, tenant-resolution
- sql-optimization, sql-code-review, dapper-reading, sqlserver-migration
- document-export, nuget-manager, dotnet-best-practices
- error-handling-patterns, fix-errors, frontend-design
- i18n-localization, microsoft-docs, rate-limiting

**RAG & Utils:**
- rag-document-retrieval, document-parsing, find-skills

### Commands (13)
- `/start` - Full session with brainstorming
- `/brainstorm` - Design session
- `/plan` - Create implementation plan
- `/execute` - Execute plan
- `/poc` - Proof of concept
- `/test` - Run tests with coverage
- `/review` - Code review
- `/migrate` - Monolith to microservices
- `/onboard` - Onboarding new developer
- `/metrics` - Team metrics
- `/template-list` - List available templates
- `rag-load`, `rag-search`, `analyze-image`

### Scripts
- `setup.sh` - Install dependencies
- `test-endpoints.sh` - Test microservices /health endpoints
- `test-connections.sh` - Test SQL Server, Redis, Dapr connections

## Updating

The plugin updates automatically when you restart OpenCode.

To update the local `.opencode/` files (agents, commands, etc.) to the latest version:

```bash
npx psw-devkit-init
```

To pin specific versions:

```json
{
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git#v5.0.3",
    "psw-devkit@git+https://github.com/Hayr06/psw-ai-devkit.git#v1.0.0"
  ]
}
```

## Troubleshooting

### Plugin not loading

1. Check plugin order (superpowers FIRST, psw-devkit SECOND)
2. Check logs: `opencode run --print-logs "hello" 2>&1 | grep -i devkit`
3. Verify plugins are installed: `ls ~/.cache/opencode/packages/ | grep psw`

### Agents or commands not appearing

OpenCode only loads agents/commands from `.opencode/agents/` and `.opencode/commands/` in your project. The plugin auto-copies these files on first session, but you may need to:

1. Run manual sync: `npx psw-devkit-init`
2. Restart OpenCode completely
3. Verify files exist: `ls .opencode/agents/ && ls .opencode/commands/`

### Skills not found

Skills are loaded via `config.skills.paths` and should work immediately. Use the `skill` tool to list what's discovered:

```
use skill tool to list skills
```

### Scripts not working

Make scripts executable:

```bash
chmod +x .opencode/scripts/*.sh
```

## Documentation

- [AGENTS.md](../docs/AGENTS.md) - Agent documentation
- [METHODOLOGY.md](../docs/METHODOLOGY.md) - Superpowers methodology guide
- [README.md](../README.md) - Full README

## Getting Help

- PSW DevKit issues: https://github.com/Hayr06/psw-ai-devkit/issues
- Superpowers: https://github.com/obra/superpowers/issues
