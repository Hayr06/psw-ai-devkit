#!/usr/bin/env python3
"""
Docs Fetcher - Fetch Microsoft documentation for .NET and Azure.

This script provides utilities for:
- Search Microsoft Learn documentation
- Get article content
- Check API reference pages

Usage:
    python docs_fetcher.py search <query>
    python docs_fetcher.py fetch <url>
    python docs_fetcher.py api <namespace>
"""

import sys
import json
import urllib.request
import urllib.error
import argparse
import re
from pathlib import Path

LEARN_BASE_URL = "https://learn.microsoft.com"
API_BASE_URL = "https://learn.microsoft.com/api/apps/apidays/"

def search_docs(query, locale='en-us'):
    """Search Microsoft Learn documentation."""
    try:
        encoded_query = urllib.parse.quote(query)
        url = f"https://learn.microsoft.com/api/search?search={encoded_query}&locale={locale}&facet=products"

        req = urllib.request.Request(url, headers={
            'User-Agent': 'PSW-DevKit',
            'Accept': 'application/json'
        })

        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))

        results = data.get('results', [])
        if not results:
            return {'results': [], 'message': f'No documentation found for "{query}"'}

        docs = []
        for item in results[:10]:
            docs.append({
                'title': item.get('title', 'Unknown'),
                'url': item.get('url', ''),
                'product': item.get('product', ''),
                'description': item.get('description', '')[:150]
            })

        return {'results': docs, 'query': query}

    except urllib.error.URLError as e:
        return {'error': f'Network error: {e}', 'results': []}
    except Exception as e:
        return {'error': str(e), 'results': []}

def fetch_article(url):
    """Fetch article content from Microsoft Learn."""
    try:
        if not url.startswith('http'):
            url = f"{LEARN_BASE_URL}/{url}"

        req = urllib.request.Request(url, headers={
            'User-Agent': 'PSW-DevKit',
            'Accept': 'text/html'
        })

        with urllib.request.urlopen(req, timeout=30) as response:
            content = response.read().decode('utf-8', errors='ignore')

        title_match = re.search(r'<title>(.*?)</title>', content, re.IGNORECASE)
        title = title_match.group(1) if title_match else 'Unknown'

        h1_match = re.search(r'<h1[^>]*>(.*?)</h1>', content, re.IGNORECASE | re.DOTALL)
        h1 = h1_match.group(1) if h1_match else ''

        return {
            'title': re.sub(r'<[^>]+>', '', title),
            'h1': re.sub(r'<[^>]+>', '', h1),
            'url': url,
            'status': 'fetched'
        }

    except urllib.error.HTTPError as e:
        return {'error': f'HTTP error: {e.code}', 'url': url}
    except Exception as e:
        return {'error': str(e), 'url': url}

def get_api_reference(namespace):
    """Get API reference for a namespace (e.g., Microsoft.AspNetCore)."""
    namespace_map = {
        'aspnetcore': 'aspnetcore',
        'entityframeworkcore': 'efcore',
        'azure': 'azure',
        'dotnet': 'dotnet',
        'visualstudio': 'vs'
    }

    product = namespace_map.get(namespace.lower(), namespace.lower())
    url = f"https://learn.microsoft.com/en-us/dotnet/api/{product}"

    return fetch_article(url)

def get_doc_for_version(package, version):
    """Get documentation for specific package version."""
    version_urls = {
        'efcore': f'https://learn.microsoft.com/en-us/ef/core/',
        'aspnetcore': f'https://learn.microsoft.com/en-us/aspnet/core/',
        'dotnet': f'https://learn.microsoft.com/en-us/dotnet/'
    }

    base_url = version_urls.get(package.lower())
    if not base_url:
        return {'error': f'No documentation found for package: {package}'}

    return fetch_article(base_url)

def main():
    parser = argparse.ArgumentParser(
        description='Docs Fetcher - Fetch Microsoft documentation for .NET and Azure'
    )
    parser.add_argument('action', choices=['search', 'fetch', 'api', 'help'],
                        help='Action to perform')
    parser.add_argument('query', nargs='?', help='Search query or URL')
    parser.add_argument('--locale', '-l', default='en-us',
                        help='Locale for search (default: en-us)')
    parser.add_argument('--json', '-j', action='store_true', help='Output as JSON')

    args = parser.parse_args()

    if args.action == 'help':
        print(__doc__)
        return 0

    if not args.query and args.action in ['search', 'fetch', 'api']:
        print("Error: Query/URL is required")
        return 1

    result = {}

    if args.action == 'search':
        result = search_docs(args.query, args.locale)

    elif args.action == 'fetch':
        result = fetch_article(args.query)

    elif args.action == 'api':
        result = get_api_reference(args.query)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if 'error' in result:
            print(f"[X] Error: {result['error']}")
            return 1

        if 'results' in result:
            print(f"\n[OK] Found {len(result['results'])} documentation pages for '{result['query']}':")
            for doc in result['results']:
                print(f"\n  📄 {doc['title']}")
                print(f"     URL: {doc['url']}")
                print(f"     Product: {doc.get('product', 'N/A')}")
                if doc.get('description'):
                    print(f"     {doc['description']}...")

        elif 'title' in result:
            print(f"\n[OK] Article fetched successfully")
            print(f"  Title: {result['title']}")
            print(f"  URL: {result['url']}")
            if result.get('h1'):
                print(f"  H1: {result['h1']}")

        elif 'message' in result:
            print(f"\n[OK] {result['message']}")

    return 0

if __name__ == "__main__":
    import urllib.parse
    sys.exit(main())