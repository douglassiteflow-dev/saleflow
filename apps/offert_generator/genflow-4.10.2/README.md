# genflow

Generate professional websites from bokadirekt.se business data, powered by Claude Code.

## Requirements

- Node.js 18+
- Python 3 with `requests` and `beautifulsoup4`
- Claude Code installed and logged in

## Install

```bash
npm install -g genflow
```

## Usage

```bash
genflow
```

Opens http://localhost:1337

1. Paste a bokadirekt.se link
2. Review scraped data and select images
3. Click generate — Claude Code builds the website
4. Preview the finished site

## How it works

genflow scrapes business data from bokadirekt.se, lets you select which images to use, then spawns Claude Code with a clean profile and specialized design skills to generate a complete, production-grade website. Each website is a single HTML file with inline CSS/JS.
