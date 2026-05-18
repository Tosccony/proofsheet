/**
 * proofsheet CLI dispatcher.
 *
 * Single binary surface for the npm package. Subcommands:
 *
 *   proofsheet                   Run the MCP server (stdio, default for desktop apps)
 *   proofsheet --transport http  Run the MCP server over HTTP (for self-hosting)
 *   proofsheet init              Interactive installer that patches your MCP clients
 *   proofsheet help              Print this usage
 *
 * Anything not "init" or "help" / "--help" is treated as server flags so existing
 * configs that pass --transport / --port directly keep working.
 */

import { runServer } from './mcp-server.js';
import { runInit } from './init.js';

const VERSION = '0.6.0';

function printHelp(): void {
  process.stdout.write(`proofsheet v${VERSION}
MCP server for image generation, refinement, and reusable themes.

USAGE
  proofsheet [SUBCOMMAND] [OPTIONS]

SUBCOMMANDS
  (default)              Run the MCP server (stdio transport).
  init                   Interactive installer. Detects your MCP clients
                         (Claude desktop, Claude Code, Codex, Cursor) and
                         patches their configs to register proofsheet.
  help, --help, -h       Print this usage.

SERVER OPTIONS
  --transport stdio      Default. Used by desktop apps that launch MCP
                         servers as subprocesses.
  --transport http       Run an HTTP MCP server (for self-hosting).
  --port <n>             HTTP port. Default: 3000.
  --host <addr>          HTTP bind address. Default: 127.0.0.1.

EXAMPLES
  npx -y proofsheet init           One-shot install across all detected clients
  npx -y proofsheet                Run the stdio server (what MCP clients launch)
  proofsheet --transport http      Self-host as HTTP MCP for multi-device use

ENV
  GEMINI_API_KEY    Required to use the Gemini (Nano Banana) provider.
  OPENAI_API_KEY    Required to use the OpenAI (gpt-image-1) provider.

DOCS
  https://github.com/Tosccony/proofsheet
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const first = argv[0];

  if (first === 'help' || first === '--help' || first === '-h') {
    printHelp();
    return;
  }

  if (first === 'init') {
    await runInit(argv.slice(1));
    return;
  }

  if (first === 'version' || first === '--version' || first === '-v') {
    process.stdout.write(`proofsheet ${VERSION}\n`);
    return;
  }

  // Default: run the MCP server. Pass through all argv so --transport / --port work.
  await runServer(argv);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
