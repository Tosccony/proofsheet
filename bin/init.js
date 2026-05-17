/**
 * proofsheet init — interactive installer.
 *
 * Detects which MCP clients the user has installed, prompts for API keys
 * (or detects them from env vars), and safely patches each client's config
 * to register proofsheet. Preserves existing config content. Backs up any
 * file it modifies to <file>.bak (only on first run; doesn't overwrite an
 * existing .bak).
 *
 * Supported clients (first cut):
 *   - Claude desktop (JSON, ~/Library/Application Support/Claude/claude_desktop_config.json on Mac, %APPDATA%/Claude/claude_desktop_config.json on Windows)
 *   - Claude Code CLI (JSON, ~/.claude.json)
 *   - Codex CLI (TOML, ~/.codex/config.toml)
 *   - Cursor (JSON, ~/.cursor/mcp.json)
 *
 * Adding clients later is just adding entries to the CLIENTS list.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline/promises';
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml';
function jsonPath(...segments) {
    return path.join(...segments);
}
function homeDir() {
    return os.homedir();
}
function expandConfigPath(candidates) {
    for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate))
            return candidate;
    }
    // Return the first candidate as the *target* (where we'd create it) even if none exist yet.
    return candidates[0] ?? null;
}
const CLIENTS = [
    {
        id: 'claude-desktop',
        name: 'Claude desktop',
        configPath: () => {
            const platform = process.platform;
            if (platform === 'darwin') {
                return expandConfigPath([
                    jsonPath(homeDir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
                ]);
            }
            if (platform === 'win32') {
                const appData = process.env.APPDATA ?? jsonPath(homeDir(), 'AppData', 'Roaming');
                return expandConfigPath([jsonPath(appData, 'Claude', 'claude_desktop_config.json')]);
            }
            // Linux: not officially supported by Claude desktop, but try anyway.
            return expandConfigPath([
                jsonPath(homeDir(), '.config', 'Claude', 'claude_desktop_config.json'),
            ]);
        },
        format: 'json',
        patch: (existing, entry) => {
            const cfg = existing ?? {};
            const servers = cfg.mcpServers ?? {};
            servers.proofsheet = entry;
            return { ...cfg, mcpServers: servers };
        },
    },
    {
        id: 'claude-code',
        name: 'Claude Code (CLI)',
        configPath: () => expandConfigPath([jsonPath(homeDir(), '.claude.json')]),
        format: 'json',
        patch: (existing, entry) => {
            const cfg = existing ?? {};
            const servers = cfg.mcpServers ?? {};
            servers.proofsheet = entry;
            return { ...cfg, mcpServers: servers };
        },
    },
    {
        id: 'codex',
        name: 'Codex (CLI)',
        configPath: () => expandConfigPath([jsonPath(homeDir(), '.codex', 'config.toml')]),
        format: 'toml',
        patch: (existing, entry) => {
            const cfg = existing ?? {};
            const servers = cfg.mcp_servers ?? {};
            // Codex uses snake_case keys and a nested env table.
            const codexEntry = {
                command: entry.command,
                args: entry.args,
            };
            if (Object.keys(entry.env).length > 0) {
                codexEntry.env = entry.env;
            }
            servers.proofsheet = codexEntry;
            return { ...cfg, mcp_servers: servers };
        },
    },
    {
        id: 'cursor',
        name: 'Cursor',
        configPath: () => expandConfigPath([jsonPath(homeDir(), '.cursor', 'mcp.json')]),
        format: 'json',
        patch: (existing, entry) => {
            const cfg = existing ?? {};
            const servers = cfg.mcpServers ?? {};
            servers.proofsheet = entry;
            return { ...cfg, mcpServers: servers };
        },
    },
];
function detectClients() {
    const out = [];
    for (const spec of CLIENTS) {
        const cp = spec.configPath();
        if (!cp)
            continue;
        out.push({ spec, configPath: cp, exists: fs.existsSync(cp) });
    }
    return out;
}
async function prompt(rl, message) {
    const answer = await rl.question(message);
    return answer.trim();
}
async function promptYesNo(rl, message, defaultYes = true) {
    const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
    const answer = (await prompt(rl, message + suffix)).toLowerCase();
    if (!answer)
        return defaultYes;
    return answer === 'y' || answer === 'yes';
}
function readConfig(filePath, format) {
    if (!fs.existsSync(filePath))
        return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim())
        return {};
    if (format === 'json')
        return JSON.parse(raw);
    return tomlParse(raw);
}
function writeConfig(filePath, data, format) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const serialized = format === 'json'
        ? JSON.stringify(data, null, 2) + '\n'
        : tomlStringify(data);
    fs.writeFileSync(filePath, serialized);
}
function backupOnce(filePath) {
    if (!fs.existsSync(filePath))
        return false;
    const bak = `${filePath}.bak`;
    if (fs.existsSync(bak))
        return false; // Don't overwrite existing backup.
    fs.copyFileSync(filePath, bak);
    return true;
}
function buildEntry(geminiKey, openaiKey) {
    const env = {};
    if (geminiKey)
        env.GEMINI_API_KEY = geminiKey;
    if (openaiKey)
        env.OPENAI_API_KEY = openaiKey;
    return {
        command: 'npx',
        args: ['-y', 'proofsheet'],
        env,
    };
}
function detectExistingKey(name) {
    return process.env[name] ?? '';
}
async function gatherKeys(rl) {
    const geminiEnv = detectExistingKey('GEMINI_API_KEY');
    const openaiEnv = detectExistingKey('OPENAI_API_KEY');
    let gemini = '';
    let openai = '';
    if (geminiEnv) {
        process.stdout.write(`✓ GEMINI_API_KEY found in environment, using it.\n`);
        gemini = geminiEnv;
    }
    else {
        const answer = await prompt(rl, 'GEMINI_API_KEY (Enter to skip; get one at https://aistudio.google.com/apikey): ');
        gemini = answer;
    }
    if (openaiEnv) {
        process.stdout.write(`✓ OPENAI_API_KEY found in environment, using it.\n`);
        openai = openaiEnv;
    }
    else {
        const answer = await prompt(rl, 'OPENAI_API_KEY (Enter to skip; get one at https://platform.openai.com/api-keys): ');
        openai = answer;
    }
    return { gemini, openai };
}
export async function runInit(_argv) {
    process.stdout.write('\nproofsheet init — register proofsheet with your MCP clients.\n\n');
    // 1. Detect clients.
    const detected = detectClients();
    const haveConfig = detected.filter((d) => d.exists);
    const noConfig = detected.filter((d) => !d.exists);
    if (haveConfig.length === 0) {
        process.stdout.write('No MCP client config files were found on this machine.\n' +
            'I looked for:\n');
        for (const d of detected) {
            process.stdout.write(`  - ${d.spec.name}: ${d.configPath}\n`);
        }
        process.stdout.write('\nInstall an MCP client (Claude desktop, Claude Code, Codex, Cursor) and then re-run.\n');
        return;
    }
    process.stdout.write('Detected MCP clients:\n');
    for (const d of haveConfig) {
        process.stdout.write(`  ✓ ${d.spec.name} (${d.configPath})\n`);
    }
    if (noConfig.length > 0) {
        process.stdout.write('\nNot detected (no config file present):\n');
        for (const d of noConfig) {
            process.stdout.write(`  - ${d.spec.name} (would be at ${d.configPath})\n`);
        }
    }
    process.stdout.write('\n');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        // 2. Confirm install scope.
        const installAll = await promptYesNo(rl, `Install proofsheet for all ${haveConfig.length} detected client(s)?`, true);
        let targets = [];
        if (installAll) {
            targets = haveConfig;
        }
        else {
            for (const d of haveConfig) {
                const yes = await promptYesNo(rl, `  Install for ${d.spec.name}?`, true);
                if (yes)
                    targets.push(d);
            }
        }
        if (targets.length === 0) {
            process.stdout.write('\nNo clients selected. Nothing to do.\n');
            return;
        }
        // 3. Gather API keys.
        process.stdout.write('\nAPI keys:\n');
        const { gemini, openai } = await gatherKeys(rl);
        if (!gemini && !openai) {
            process.stdout.write('\nNo keys provided. proofsheet will install but image generation will fail until you set GEMINI_API_KEY or OPENAI_API_KEY.\n');
        }
        const entry = buildEntry(gemini, openai);
        // 4. Patch each target config.
        process.stdout.write('\n');
        for (const target of targets) {
            try {
                const existing = readConfig(target.configPath, target.spec.format);
                const updated = target.spec.patch(existing, entry);
                const didBackup = backupOnce(target.configPath);
                writeConfig(target.configPath, updated, target.spec.format);
                const suffix = didBackup ? ` (backup at ${target.configPath}.bak)` : '';
                process.stdout.write(`✓ Patched ${target.spec.name}${suffix}\n`);
            }
            catch (err) {
                process.stdout.write(`✗ Failed to patch ${target.spec.name}: ${err instanceof Error ? err.message : String(err)}\n`);
            }
        }
        process.stdout.write('\nDone. Restart your MCP client(s) for the change to take effect.\n' +
            'Then try saying:\n' +
            '  "Use proofsheet to generate an image of a coffee mug on a wooden table"\n\n');
    }
    finally {
        rl.close();
    }
}
