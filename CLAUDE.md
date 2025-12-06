# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an Octoherd script that queries GitHub repositories to check if a specific npm library meets a version requirement. It's used to drive Renovate's major library update process by identifying repositories that need dependency updates.

The script:
1. Fetches lockfiles (pnpm-lock.yaml or yarn.lock) from repositories
2. Extracts version information for a specified library
3. Checks if the version satisfies a semver requirement
4. Reports compliance status

## Key Commands

### Running the Script

```bash
# Use the appropriate Node version
nvm use

# Run the script with options
node cli.js \
  -R time-loop/\*-cdk \
  -T ghp_YOUR_TOKEN \
  --octoherd-bypass-confirms true \
  --library @time-loop/cdk-ecs-fargate \
  --versionRequirement \>=5.15.2 | \
tee raw.txt | grep NOT | sort | tee non-compliant.txt && wc -l non-compliant.txt
```

### Testing

```bash
pnpm test   # Runs the script directly
```

### Package Management

This repository uses **pnpm** - respect this choice and use `pnpm` commands, not `npm` or `yarn`.

```bash
pnpm install        # Install dependencies
```

## Architecture

### Core Components

**script.js** - Main octoherd script logic
- `script()` function is the entry point called by octoherd-cli for each repository
- Parameters: `octokit` (GitHub API client), `repository` (repo metadata), `options` (CLI flags)
- Required options:
  - `--versionRequirement`: semver range (e.g., `>=5.15.2`, `^12`)
  - `--library`: npm package name to check (default: `@time-loop/cdk-library`)
  - `--reduce`: optional `min` or `max` to reduce multiple versions to single value

**cli.js** - Simple wrapper that imports and runs the script via octoherd's CLI

### Lockfile Parsing Strategy

The script tries lockfiles in order:
1. **pnpm-lock.yaml** (parsed with `yaml` package)
   - Dependency format: `/packageName@version(peer-deps)`
   - Regex: `/^(?<packageName>(@[^\/]+\/)?[^@]+)@(?<version>[0-9]+\.[0-9]+\.[0-9]+).*/`
2. **yarn.lock** (parsed with `@yarnpkg/lockfile`)
   - Key format: `packageName@versionRange`
   - Extracts version from nested `version` field

### Version Reduction

When `--reduce` is specified:
- `min`: Returns smallest version using semver comparison
- `max`: Returns largest version using semver comparison
- Useful when a repo has multiple versions of the same library

### Output Format

- **INFO log**: Version satisfies requirement
- **WARN log**: Version does NOT satisfy requirement (these are filtered with `grep NOT`)
- **DEBUG log**: Repository skipped or processing details

## Development Notes

- Node.js version: 22.14.0 (specified in .nvmrc, but package.json requires `>= 18.17.1`)
- Uses ES modules (`"type": "module"` in package.json)
- TypeScript checking via JSDoc comments (`// @ts-check`)
- Skips archived repositories automatically
- Uses pnpm lockfile format version 9.0

## Limitations (from README)

- Written in JavaScript instead of TypeScript (time constraints)
- Not projen-ified
- Not published to npmjs.com (runs locally only)
