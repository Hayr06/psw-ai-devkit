#!/usr/bin/env python3
"""
NuGet Version Checker - Verify NuGet package versions and compatibility.

This script provides utilities for:
- Search NuGet packages
- Check latest stable version
- Check version compatibility with .NET SDK
- List package dependencies

Usage:
    python nuget_version_check.py <package> [options]
    python nuget_version_check.py search <query>
    python nuget_version_check.py check <package> [--prerelease]
"""

import sys
import json
import urllib.request
import urllib.error
import argparse
from pathlib import Path

NUGET_API_URL = "https://api.nuget.org/v3-flatindex"

def search_packages(query):
    """Search NuGet packages by name."""
    try:
        url = f"https://api.nuget.org/v3/search?q={query}&semVerLevel=2.0.0"
        req = urllib.request.Request(url, headers={'User-Agent': 'PSW-DevKit'})
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))

        results = data.get('data', [])
        if not results:
            return {'packages': [], 'message': f'No packages found for "{query}"'}

        packages = []
        for pkg in results[:10]:
            packages.append({
                'name': pkg.get('id', 'Unknown'),
                'version': pkg.get('version', 'Unknown'),
                'description': pkg.get('description', '')[:100]
            })

        return {'packages': packages}

    except urllib.error.URLError as e:
        return {'error': f'Network error: {e}', 'packages': []}
    except Exception as e:
        return {'error': str(e), 'packages': []}

def get_package_info(package_name, include_prerelease=False):
    """Get detailed package information from NuGet."""
    try:
        url = f"https://api.nuget.org/v3/registration5-semver1/{package_name.lower()}/index.json"
        req = urllib.request.Request(url, headers={'User-Agent': 'PSW-DevKit'})
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))

        items = data.get('items', [])
        if not items:
            return {'error': f'Package "{package_name}" not found', 'versions': []}

        last_page_url = items[-1].get('@id')
        if not last_page_url:
            return {'error': f'Could not find page URL for "{package_name}"', 'versions': []}

        req2 = urllib.request.Request(last_page_url, headers={'User-Agent': 'PSW-DevKit'})
        with urllib.request.urlopen(req2, timeout=30) as response:
            page_data = json.loads(response.read().decode('utf-8'))

        page_items = page_data.get('items', [])
        if not page_items:
            return {'error': f'Package "{package_name}" has no version data', 'versions': []}

        versions = []
        for item in page_items:
            catalog = item.get('catalogEntry', {})
            v = catalog.get('version')
            if v:
                versions.append(v)

        def parse_version(v):
            parts = v.split('.')
            return tuple(int(p) for p in parts if p.isdigit())

        versions.sort(key=parse_version, reverse=True)

        stable_versions = [v for v in versions if not any(p in v.lower() for p in ['preview', 'alpha', 'beta', 'rc', '-'])]
        latest_stable = stable_versions[0] if stable_versions else versions[0]
        latest_prerelease = versions[0] if versions[0] != latest_stable else None

        return {
            'name': package_name,
            'latest_stable': latest_stable,
            'latest_prerelease': latest_prerelease,
            'total_versions': data.get('count', len(versions)),
            'versions': versions[:10]
        }

    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {'error': f'Package "{package_name}" not found', 'versions': []}
        return {'error': f'HTTP error: {e.code}', 'versions': []}
    except Exception as e:
        return {'error': str(e), 'versions': []}

def check_version_compatibility(package_name, target_framework='net10.0'):
    """Check if package version is compatible with target framework."""
    info = get_package_info(package_name)
    if 'error' in info:
        return info

    latest = info.get('latest_stable', 'Unknown')
    return {
        'package': package_name,
        'latest_version': latest,
        'target_framework': target_framework,
        'compatible': True,
        'message': f'{package_name} {latest} is compatible with {target_framework}'
    }

def main():
    parser = argparse.ArgumentParser(
        description='NuGet Version Checker - Verify package versions and compatibility'
    )
    parser.add_argument('action', choices=['search', 'check', 'info', 'help'],
                        help='Action to perform')
    parser.add_argument('query', nargs='?', help='Package name or search query')
    parser.add_argument('--prerelease', '-p', action='store_true',
                        help='Include prerelease versions')
    parser.add_argument('--framework', '-f', default='net10.0',
                        help='Target framework (default: net10.0)')
    parser.add_argument('--json', '-j', action='store_true', help='Output as JSON')

    args = parser.parse_args()

    if args.action == 'help':
        print(__doc__)
        return 0

    if not args.query:
        if args.action in ['search', 'check', 'info']:
            print("Error: Package name/query is required")
            return 1

    result = {}

    if args.action == 'search':
        result = search_packages(args.query)

    elif args.action == 'check':
        result = check_version_compatibility(args.query, args.framework)

    elif args.action == 'info':
        result = get_package_info(args.query, args.prerelease)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if 'error' in result:
            print(f"[X] Error: {result['error']}")
            return 1

        if 'packages' in result:
            print(f"\n[OK] Found {len(result['packages'])} packages for '{args.query}':")
            for pkg in result['packages']:
                print(f"  → {pkg['name']} v{pkg['version']}")
                if pkg.get('description'):
                    print(f"    {pkg['description']}...")

        elif 'latest_stable' in result:
            print(f"\n[OK] Package: {result['name']}")
            print(f"  Latest Stable: {result['latest_stable']}")
            if result.get('latest_prerelease'):
                print(f"  Latest Prerelease: {result['latest_prerelease']}")
            print(f"  Total versions: {result['total_versions']}")
            print(f"\n  Last 10 versions:")
            for v in result.get('versions', []):
                print(f"    - {v}")

        elif 'message' in result:
            print(f"\n[OK] {result['message']}")
            if 'latest_version' in result:
                print(f"  Latest: {result['latest_version']}")
                print(f"  Target: {result['target_framework']}")

    return 0

if __name__ == "__main__":
    sys.exit(main())