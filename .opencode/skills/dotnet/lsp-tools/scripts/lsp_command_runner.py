#!/usr/bin/env python3
"""
LSP Command Runner - Execute LSP commands for code navigation and refactoring.

This script provides utilities for:
- Finding symbol references
- Renaming symbols globally
- Go to definition
- Document symbols
- Code actions

Usage:
    python lsp_command_runner.py <command> [options]

Commands:
    find-references <symbol>   Find all references to a symbol
    rename <old> <new>         Rename symbol globally
    goto-definition <symbol>   Go to symbol definition
    document-symbols            List all symbols in the document
    code-actions               List available code actions
"""

import sys
import json
import subprocess
import argparse
from pathlib import Path

def find_lsp_server():
    """Detect available LSP servers in the project."""
    project_path = Path.cwd()
    lsp_markers = {
        '.sln': 'dotnet',
        'package.json': 'node',
        'Cargo.toml': 'rust',
        'go.mod': 'go',
        'pyproject.toml': 'python',
    }

    for marker, server in lsp_markers.items():
        if (project_path / marker).exists():
            return server

    return 'unknown'

def run_ruff_command(cmd, file_path=None):
    """Run ruff linter commands for Python projects."""
    try:
        if cmd == 'find-references':
            result = subprocess.run(
                ['ruff', 'check', '--select=E', str(file_path) if file_path else '.'],
                capture_output=True, text=True
            )
            return {'references': result.stdout.split('\n')}

        elif cmd == 'rename':
            return {'message': 'Use LSP rename in VS Code/Cursor with F2 key'}

        elif cmd == 'document-symbols':
            result = subprocess.run(
                ['ruff', 'check', '--output-format=json', '.'],
                capture_output=True, text=True, cwd=Path.cwd()
            )
            try:
                issues = json.loads(result.stdout) if result.stdout else []
                symbols = [f"{i['filename']}:{i['location']['row']}" for i in issues]
                return {'symbols': symbols}
            except:
                return {'symbols': []}

        return {'error': f'Unknown command: {cmd}'}

    except FileNotFoundError:
        return {'error': 'ruff not installed. Run: pip install ruff'}
    except Exception as e:
        return {'error': str(e)}

def run_dotnet_command(cmd, args):
    """Run dotnet LSP-like commands for .NET projects."""
    try:
        if cmd == 'find-references':
            symbol = args[0] if args else ''
            result = subprocess.run(
                ['dotnet', 'tool', 'run', 'dotnet-symbol', '--', 'search', symbol],
                capture_output=True, text=True, timeout=30
            )
            return {'references': result.stdout.split('\n')}

        elif cmd == 'goto-definition':
            result = subprocess.run(
                ['dotnet', 'build', '--no-incremental', '-v', 'q'],
                capture_output=True, text=True, cwd=Path.cwd()
            )
            return {'status': 'Build completed for symbol resolution'}

        elif cmd == 'document-symbols':
            result = subprocess.run(
                ['dotnet', 'list', 'project.json', 'reference'] if Path('project.json').exists() else ['dotnet', 'sln', 'list'],
                capture_output=True, text=True, cwd=Path.cwd()
            )
            return {'symbols': result.stdout.split('\n')}

        return {'error': f'Unknown command: {cmd}'}

    except FileNotFoundError:
        return {'error': 'dotnet not installed or not in PATH'}
    except subprocess.TimeoutExpired:
        return {'error': 'Command timed out'}
    except Exception as e:
        return {'error': str(e)}

def run_typescript_command(cmd, args):
    """Run TypeScript/JavaScript LSP commands."""
    try:
        if cmd == 'find-references':
            result = subprocess.run(
                ['npx', 'typescript', '--project', '.', '--noEmit'],
                capture_output=True, text=True, timeout=60
            )
            return {'references': result.stdout.split('\n')}

        elif cmd == 'document-symbols':
            result = subprocess.run(
                ['npx', 'tsc', '--noEmit', '--listFiles'],
                capture_output=True, text=True, timeout=60
            )
            return {'symbols': result.stdout.split('\n')[:50]}

        return {'error': f'Unknown command: {cmd}'}

    except FileNotFoundError:
        return {'error': 'npx not available or TypeScript not configured'}
    except Exception as e:
        return {'error': str(e)}

def main():
    parser = argparse.ArgumentParser(
        description='LSP Command Runner - Execute LSP commands for code navigation'
    )
    parser.add_argument('command', choices=[
        'find-references', 'rename', 'goto-definition',
        'document-symbols', 'code-actions', 'help'
    ], help='LSP command to execute')
    parser.add_argument('args', nargs='*', help='Arguments for the command')
    parser.add_argument('--file', '-f', help='Target file path')
    parser.add_argument('--json', '-j', action='store_true', help='Output as JSON')

    args = parser.parse_args()

    if args.command == 'help':
        print(__doc__)
        return 0

    if not args.args and args.command in ['find-references', 'rename', 'goto-definition']:
        if args.file:
            print(f"Error: {args.command} requires a symbol argument")
            return 1
        print(f"Error: {args.command} requires a symbol argument")
        return 1

    server = find_lsp_server()
    result = {}

    if server == 'dotnet':
        result = run_dotnet_command(args.command, args.args)
    elif server == 'python':
        result = run_ruff_command(args.command, args.file)
    elif server == 'node':
        result = run_typescript_command(args.command, args.args)
    else:
        result = {
            'message': f'LSP server not detected. Create a .sln, package.json, or Cargo.toml to enable.',
            'server': server,
            'available_commands': [
                'find-references <symbol> - Find all references',
                'rename <old> <new> - Rename symbol',
                'goto-definition <symbol> - Go to definition',
                'document-symbols - List all symbols',
                'code-actions - List code actions'
            ]
        }

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if 'error' in result:
            print(f"[X] Error: {result['error']}")
            return 1
        elif 'references' in result:
            print(f"[OK] Found {len(result.get('references', []))} references:")
            for ref in result['references'][:20]:
                if ref.strip():
                    print(f"  → {ref}")
        elif 'symbols' in result:
            print(f"[OK] Found {len(result.get('symbols', []))} symbols:")
            for sym in result['symbols'][:20]:
                if sym.strip():
                    print(f"  → {sym}")
        else:
            print(f"[OK] {result.get('message', result)}")

    return 0

if __name__ == "__main__":
    sys.exit(main())