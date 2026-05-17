# Hosting proofsheet on your own server

This directory has a sample `systemd` unit for running proofsheet as an HTTP MCP server, suitable for installing on a Linux box (game-server VPS, Raspberry Pi, etc.) so multiple devices can use the same backend.

## Quick install on a Debian/Ubuntu host

```bash
# 1. Install Node 18+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Clone proofsheet into /opt
sudo git clone https://github.com/Tosccony/proofsheet /opt/proofsheet
sudo useradd --system --home /opt/proofsheet --shell /usr/sbin/nologin proofsheet
sudo chown -R proofsheet:proofsheet /opt/proofsheet

# 3. The compiled JS is already in bin/. If you want to rebuild:
cd /opt/proofsheet
sudo -u proofsheet npm install
sudo -u proofsheet npm run build

# 4. Put your API keys in /etc/proofsheet/env (chmod 600).
sudo mkdir -p /etc/proofsheet
sudo tee /etc/proofsheet/env > /dev/null <<EOF
GEMINI_API_KEY=your-gemini-key
OPENAI_API_KEY=your-openai-key
EOF
sudo chmod 600 /etc/proofsheet/env

# 5. Install the systemd unit and start it.
sudo cp /opt/proofsheet/deploy/proofsheet.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now proofsheet
sudo systemctl status proofsheet
```

The server now listens on `127.0.0.1:3000` (localhost-only). That's intentional — you don't want it directly exposed to the public internet without auth, since any caller can rack up API charges on your keys.

## Exposing it to other devices: three options

### Option A: Tailscale (simplest)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Now your laptops, phone, and the server are all on the same private Tailscale network. Change the systemd unit's `--host 127.0.0.1` to `--host 0.0.0.0`, restart proofsheet, and connect from any Tailscale-connected device using the server's Tailscale IP or magic DNS name (e.g., `http://my-server:3000`).

No public exposure. No auth code. Works for desktop apps and CLIs that can reach the Tailscale network.

### Option B: Caddy reverse proxy with HTTPS + bearer token

Use this if you need a public HTTPS URL (e.g., for ChatGPT's remote-MCP connector flow when you're not on Tailscale).

`/etc/caddy/Caddyfile`:

```
proofsheet.your-domain.com {
    @authorized header Authorization "Bearer YOUR-SECRET-TOKEN-HERE"
    handle @authorized {
        reverse_proxy 127.0.0.1:3000
    }
    handle {
        respond "Unauthorized" 401
    }
}
```

Caddy gets you free Let's Encrypt TLS. Set `YOUR-SECRET-TOKEN-HERE` to a long random string and use it as the bearer token in your MCP client config.

### Option C: Cloudflare Tunnel

Free TLS-terminated tunnel from your server to a Cloudflare-managed hostname. Pair with Cloudflare Access for auth. See https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/.

## Wiring clients to a remote proofsheet

### Claude desktop

Claude desktop primarily uses stdio for MCP. To point it at a remote HTTP MCP server, you need a small stdio-to-HTTP bridge. Easiest: use [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "proofsheet": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://proofsheet.your-domain.com",
        "--header",
        "Authorization: Bearer YOUR-SECRET-TOKEN-HERE"
      ]
    }
  }
}
```

### ChatGPT desktop

In ChatGPT desktop's connector settings, add a custom MCP connector pointing at your HTTPS URL with the bearer token. (Requires ChatGPT Plus or Pro and the developer/connector feature enabled.)

### Claude Code / Codex

Same `mcp-remote` bridge approach works for both. See their respective MCP config docs.

## Logs and operations

```bash
# Live logs
sudo journalctl -fu proofsheet

# Restart after a config change
sudo systemctl restart proofsheet

# Update to a new version
cd /opt/proofsheet
sudo -u proofsheet git pull
sudo -u proofsheet npm install
sudo -u proofsheet npm run build
sudo systemctl restart proofsheet
```

## Cost monitoring

proofsheet does not have built-in usage metering. Watch your Gemini and OpenAI billing dashboards directly. If you're hosting publicly, an attacker who finds your endpoint could burn through your credit fast. Tailscale is the simplest mitigation; bearer-token auth is the next level.
