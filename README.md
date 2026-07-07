<div align="center">

# gwanggo-mcp

### Give your AI agent the power to generate images & video.

**MCP server + CLI for the [Gwanggo](https://gwanggo.jocoding.io?utm_source=github&utm_medium=mcp-readme) API — Seedream, Sora, Veo, Kling, GPT Image and 30+ more models behind one key.**

[![npm](https://img.shields.io/npm/v/gwanggo-mcp?color=cb3837&logo=npm)](https://www.npmjs.com/package/gwanggo-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-111111.svg)](./LICENSE)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-compatible-6d28d9)](https://modelcontextprotocol.io)

Works with **Claude Code · Claude Desktop · Cursor · Codex** — anything that speaks MCP.

</div>

---

```
You: "우리 신제품 세럼 광고 이미지 만들어줘, 화장품 무드로"
Agent: [calls generate_image with seedream-5] → https://…/result.png
```

## Setup (2 minutes)

**1. Connect your account** (opens a browser approval — no password pasting):

```bash
npx gwanggo-mcp login
```

> New accounts get free credits: sign up at [gwanggo.jocoding.io](https://gwanggo.jocoding.io?utm_source=github&utm_medium=mcp-readme). You can also skip `login` and set `GWANGGO_API_KEY` (create one at **Dashboard → API keys**).

**2. Add to your agent:**

**Claude Code**
```bash
claude mcp add gwanggo -- npx -y gwanggo-mcp
```

**Claude Desktop / Cursor** (`claude_desktop_config.json` / `.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "gwanggo": {
      "command": "npx",
      "args": ["-y", "gwanggo-mcp"]
    }
  }
}
```

**Codex CLI** (`~/.codex/config.toml`)
```toml
[mcp_servers.gwanggo]
command = "npx"
args = ["-y", "gwanggo-mcp"]
```

To pass the key explicitly instead of `login`, add `"env": { "GWANGGO_API_KEY": "gwk_..." }`.

## Tools

| Tool | What it does |
| --- | --- |
| `list_models` | 35+ image/video models with credit costs and per-model options |
| `generate_image` | Text→image / image edit. Waits for completion, returns the URL |
| `generate_video` | Text→video / image→video (Seedance 2.0, Kling 3.0, Veo 3.1, Sora 2 …) |
| `get_task` | Check a previous generation by id |
| `get_credits` | Remaining credit balance |

Failed generations are **auto-refunded** server-side.

## CLI usage

The same binary doubles as a CLI:

```bash
npx gwanggo-mcp models
npx gwanggo-mcp generate image "neon alley cat, cinematic" --model gpt-image-2 --quality high
npx gwanggo-mcp generate video "waves crashing at dawn" --model seedance-2.0 --resolution 720p --duration 5
npx gwanggo-mcp me          # credits
npx gwanggo-mcp task <id>   # check status
```

## How it works

Thin client over the public [Gwanggo /v1 REST API](https://github.com/bill-950207/gwanggo-studio#-the-api-underneath) — the same API that powers the open-source [Gwanggo Studio](https://github.com/bill-950207/gwanggo-studio). Your key is stored at `~/.config/gwanggo/config.json` (0600) and sent only as a Bearer token.

## License

[MIT](./LICENSE)
