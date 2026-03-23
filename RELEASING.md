# GitHub Workflow & Release Guide

Quick reference for managing branches, commits, and releases in this repo.

---

## Branch Naming

| Prefix | Use |
|--------|-----|
| `feature/short-desc` | New functionality |
| `fix/short-desc` | Bug fixes |
| `docs/short-desc` | Documentation changes |
| `release/vX.Y` | Preparing a new release |

## Commit Message Format

```
<type>: <short summary, under 72 chars>
```

| Type | When |
|------|------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `data` | Output data changes |
| `refactor` | Code restructuring (no behavior change) |
| `chore` | Config, build scripts, maintenance |

For more detail, add a blank line then a body:

```
feat: add JSON-LD export with lightweight variant

- Full version: commodity > tier > sector > scope
- Light version: commodity > tier > ghg_source
- Includes @context vocabulary for RDF compatibility
```

## Workflow: Making Changes

```bash
# 1. Start from an up-to-date main
git checkout main
git pull origin main

# 2. Create a branch BEFORE editing
git checkout -b feature/my-change

# 3. Make edits, then stage and commit
git add .
git commit -m "feat: describe what you did"

# 4. Push the branch to GitHub
git push origin feature/my-change

# 5. On GitHub: open a Pull Request, review your diff, then Merge
# 6. Optionally delete the branch on GitHub after merging
```

## Workflow: Cutting a New Release

```bash
# 1. Make sure main is up to date (all PRs merged)
git checkout main
git pull origin main

# 2. (Optional) Regenerate outputs if code changed
#    source("scripts/run_analysis.R")
#    git add outputs/
#    git commit -m "data: regenerate outputs for vX.Y"
#    git push origin main

# 3. Tag the release (annotated tag)
git tag -a v1.1 -m "Release v1.1: brief summary of changes"

# 4. Push the tag — this triggers the GitHub Actions release workflow
git push origin v1.1

# 5. On GitHub → Releases → Draft a new release
#    - Select the v1.1 tag
#    - Write release notes (or use the template from prepare_release.ps1)
#    - Attach any extra assets (ZIPs from dist/)

# 6. (Optional) Generate ZIP assets first:
#    .\scripts\prepare_release.ps1 -Version "v1.1"
```

## Version Numbers

This repo uses **semantic versioning**: `vMAJOR.MINOR.PATCH`

| Bump | When |
|------|------|
| **Major** (v2.0) | Breaking changes to data format or schema |
| **Minor** (v1.1) | New features, new outputs, new sectors |
| **Patch** (v1.0.1) | Bug fixes, data corrections, typos |

> **Note:** The repo version (e.g., `v1.1`) is separate from `sef_version` in
> `config.yml`, which tracks the external USEPA Supply Chain Factors version.

## Key Rules

1. **Never modify a tag after pushing it.** If you find a bug, make a new patch release.
2. **Keep `main` releasable.** Do your work on branches and merge via PRs.
3. **Commit outputs with the code that generated them** so each tagged snapshot is self-consistent.
4. **Write meaningful commit messages** — your future self will thank you.
