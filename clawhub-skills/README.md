# OpenClaw ClawHub Skills

Community skills for [OpenClaw](https://github.com/openclaw/openclaw), distributed via [ClawHub](https://clawhub.com).

These skills are designed to be installed individually rather than bundled in OpenClaw core, per [VISION.md](../VISION.md) guidelines.

## Skills

| Skill                  | Description                                                                      |
| ---------------------- | -------------------------------------------------------------------------------- |
| **blog-publisher**     | Publish posts to Hugo, Jekyll, Astro, Next.js, Ghost, and WordPress              |
| **site-deployer**      | Deploy sites to Vercel, Netlify, Cloudflare Pages, GitHub Pages, Fly.io, Railway |
| **voice-clone**        | Clone and generate voices via ElevenLabs API                                     |
| **research-scout**     | AI research digest from HackerNews, GitHub, Reddit, ArXiv                        |
| **creative-mode**      | Brainstorm, content sprint, and story modes for content creation                 |
| **agent-manager**      | Multi-agent orchestration with commander, researcher, creator, deployer, voice   |
| **gh-issues**          | Auto-fix GitHub issues with parallel sub-agents and PR review handling           |
| **telegram-always-on** | Keep the gateway + Telegram running permanently via PM2, systemd, or LaunchAgent |

## Install

```bash
# Install a single skill
clawhub install blog-publisher

# Install multiple
clawhub install blog-publisher site-deployer voice-clone
```

## Publish (maintainers)

```bash
# Login first
npm i -g clawhub
clawhub login

# Publish all skills
./publish-all.sh --version 1.0.0 --changelog "Initial release"

# Dry run
./publish-all.sh --dry-run
```

## Development

Each skill directory follows the standard OpenClaw skill format:

```
skill-name/
  SKILL.md           # Skill definition (agent prompt + metadata)
  scripts/           # Optional helper scripts
  references/        # Optional API/platform references
```

To test a skill locally, symlink or copy it into your OpenClaw `skills/` directory:

```bash
ln -s "$(pwd)/blog-publisher" ~/.openclaw/skills/blog-publisher
```
