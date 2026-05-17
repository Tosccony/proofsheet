/**
 * Proofsheet MCP server.
 *
 * Exposes image generation, refinement, and theme management as MCP tools and
 * prompts. Compatible with any MCP client (Claude desktop, ChatGPT desktop,
 * Claude Code, Codex, Cursor, Cline, etc.).
 *
 * Transports:
 *   --transport stdio (default)              local subprocess, for desktop apps
 *   --transport http --port 3000             remote HTTP/SSE, for hosting
 *
 * Tools:
 *   generate_image    text-to-image via Gemini or OpenAI, returns inline PNG
 *   refine_image      image-to-image OR prompt-tweak regeneration
 *   list_themes       list themes/*.md with descriptions
 *   read_theme        return a theme's body fragment
 *
 * Prompts:
 *   art_direction     the prompt-enrichment recipe
 *   refinement_picker decision guide for prompt-tweak vs image-to-image
 *
 * Env: GEMINI_API_KEY and/or OPENAI_API_KEY. The server starts even if neither
 * is set; tools error with a clear message if the relevant key is missing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import { generateGeminiImage, type GeminiGenerateInput } from './gemini-image.js';
import { generateOpenAIImage, type OpenAIGenerateInput, type OpenAIQuality } from './openai-image.js';

const SERVER_NAME = 'proofsheet';
const SERVER_VERSION = '0.4.0';

// Resolve the plugin root from this file's location so themes/ lookups work
// regardless of cwd. Source: src/mcp-server.ts; compiled: bin/mcp-server.js.
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(moduleDir, '..');
const themesDir = path.join(pluginRoot, 'themes');

interface ParsedFlags {
  transport: 'stdio' | 'http';
  port: number;
  host: string;
}

function parseServerArgs(argv: string[]): ParsedFlags {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val !== undefined && !val.startsWith('--')) {
        flags[key] = val;
        i++;
      } else {
        flags[key] = 'true';
      }
    }
  }
  const transport = (flags.transport ?? 'stdio') as ParsedFlags['transport'];
  if (transport !== 'stdio' && transport !== 'http') {
    throw new Error(`Unknown transport: ${transport}. Use stdio or http.`);
  }
  const port = flags.port ? parseInt(flags.port, 10) : 3000;
  const host = flags.host ?? '127.0.0.1';
  return { transport, port, host };
}

interface ThemeFile {
  slug: string;
  name?: string;
  description?: string;
  bestFor?: string;
  body: string;
}

function parseThemeFile(filePath: string): ThemeFile {
  const slug = path.basename(filePath, '.md');
  const raw = fs.readFileSync(filePath, 'utf8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    return { slug, body: raw.trim() };
  }
  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();
  const props: Record<string, string> = {};
  for (const line of frontmatter.split('\n')) {
    const m = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (m) props[m[1]] = m[2].trim();
  }
  return {
    slug,
    name: props.name,
    description: props.description,
    bestFor: props['best-for'] ?? props.bestFor,
    body,
  };
}

function listThemes(): ThemeFile[] {
  if (!fs.existsSync(themesDir)) return [];
  return fs
    .readdirSync(themesDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => parseThemeFile(path.join(themesDir, f)));
}

function defaultOutputPath(prompt: string, suffix = ''): string {
  const slug =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-')
      .slice(0, 4)
      .join('-') || 'image';
  const ts = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .replace(/\..+/, '');
  const name = suffix ? `${slug}-${suffix}-${ts}.png` : `${slug}-${ts}.png`;
  return path.join(process.cwd(), 'generated', '_images', name);
}

const ART_DIRECTION_PROMPT = `# Art-Direction Recipe (prompt enrichment for image generation)

When asked to generate an image, do not dispatch the user's raw words. Enrich the prompt by concatenating, in this order:

1. Subject (concrete noun phrase): "a weathered fisherman in a yellow oilskin" beats "a man."
2. Environment / setting: where the subject lives.
3. Composition: framing (close-up / medium / wide), angle (eye-level / low-angle / top-down / three-quarter), placement (centered / off-center / rule-of-thirds).
4. Lighting: source (window light from camera-left, harsh midday sun, single tungsten bulb) + quality (soft / hard / dappled) + time of day if relevant.
5. Medium / lens: the single biggest stylistic lever. Photographic ("shot on medium-format film", "Polaroid SX-70") or non-photographic ("oil painting", "risograph two-color print", "charcoal sketch", "gouache illustration").
6. Texture words: "raw linen, weathered wood, matte ceramic" anchor reality and prevent the slick-CGI tell.
7. Mood: one or two atmosphere words.
8. Negative cues (always include): "no text overlays, no recognizable brand names or logos, no watermarks."
9. Aspect ratio clause at the very end: "16:9 landscape aspect ratio." (Gemini's REST has no ratio parameter; the prose is the only knob.)

Hard rules:
- Specificity beats abstraction every time.
- Medium is the biggest single lever. Different mediums produce genuinely different images; different adjectives produce nearly identical ones.
- Lighting needs both source and quality. "Good lighting" is noise.
- Counts above ~3 are unreliable. Say "a small handful" not "exactly seven."
- Don't stack adjectives or promise quality. "Beautiful stunning masterpiece" is pure noise.
- Use composition vocabulary from photography literally ("rule of thirds, subject lower-left, negative space upper-right").

When a theme is provided, weave the theme body into the medium/lighting/palette clauses rather than appending it as a tail.`;

const REFINEMENT_PICKER_PROMPT = `# Refinement mode picker

When refining an image, choose mode by what the user wants:

Mode 1 — Tweak prompt and regenerate fresh:
Best for direction changes where subject identity can shift but the conceptual idea stays:
- Different lighting / time of day
- Different medium ("now as a risograph")
- Different angle or framing
- Aging or de-aging a person

Mode 2 — Image-to-image edit (pass the existing image with a short instruction):
Best for surgical fixes where you want to keep this exact image but tweak one thing:
- Lighting tone (warmer / cooler / brighter / moodier)
- Removing a specific element ("remove the railing", "remove the watermark")
- Adding a specific element ("add fog in the background")
- Color correction

When picking image-to-image, keep the instruction SHORT. Include "Keep subject, composition, and framing unchanged" so the model doesn't redraw everything. Always retain the negative cues ("no text overlays, no watermarks").`;

const THEME_BUILDER_PROMPT = `# Theme-Builder Flow

Build a reusable image aesthetic through guided conversation. Ask one or two questions at a time across roughly 5-8 exchanges:

1. Use case: blog headers? Slide visuals? Product photography? Personal portfolio?
2. Medium: photographic / illustrated / painted / mixed? Specific flavor (35mm film, gouache, risograph, etc.).
3. Lighting and mood: warm or cool, soft or hard, specific time of day.
4. Palette: muted earthy / saturated / monochrome / duotone / specific colors.
5. Composition: spare with negative space / balanced / busier vignettes.
6. References (optional): extract patterns from artist names, don't bake the name into the body.
7. What to avoid: 3D, glossy CGI, text, faces, specific colors.

Compose the theme body as a prompt fragment (2-4 sentences) that fits naturally into a larger image prompt. Don't include subject or aspect ratio. Save as themes/<slug>.md with frontmatter (name, description, best-for) and the body. Validate with 1-2 test images before saving if the user wants.`;

function createMcpServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, prompts: {}, resources: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'generate_image',
        description:
          'Generate an image from a free-form prompt via Gemini (Nano Banana) or OpenAI (gpt-image-1). Writes a PNG plus a sidecar JSON to disk and returns the image inline so the client renders it in chat. Apply the art_direction prompt template before calling this tool.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Enriched art-direction prompt for the image.' },
            provider: {
              type: 'string',
              enum: ['gemini', 'openai'],
              description: 'Backend to use. Default: gemini.',
              default: 'gemini',
            },
            ratio: {
              type: 'string',
              enum: ['16:9', '9:16', '4:3', '3:2', '2:3', '1:1', '21:9'],
              description:
                'Aspect ratio. Gemini honors any value via prose. OpenAI maps to its three discrete sizes.',
            },
            theme: {
              type: 'string',
              description:
                'Optional theme slug (from list_themes). Use read_theme first to fetch the body, then weave into the prompt.',
            },
            quality: {
              type: 'string',
              enum: ['auto', 'low', 'medium', 'high'],
              description: 'OpenAI only. Defaults to auto (~$0.04). High is ~$0.17.',
            },
            output_path: {
              type: 'string',
              description:
                'Optional save path. Default: ./generated/_images/<slug>-<timestamp>.png in the current working directory.',
            },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'refine_image',
        description:
          'Refine an existing image. Mode "edit" passes the image to the model with a short edit instruction (best for surgical fixes). Mode "tweak" regenerates fresh with a modified prompt (best for direction changes). Reads sidecar metadata at <dir>/.meta/<basename>.json when available.',
        inputSchema: {
          type: 'object',
          properties: {
            input_path: {
              type: 'string',
              description: 'Path to the existing image. Required.',
            },
            mode: {
              type: 'string',
              enum: ['edit', 'tweak'],
              description:
                'edit = image-to-image (keeps composition), tweak = regenerate fresh with new prompt.',
            },
            instruction: {
              type: 'string',
              description:
                'For edit mode: short edit instruction ("warmer lighting", "remove railing"). For tweak mode: the modified full prompt.',
            },
            provider: {
              type: 'string',
              enum: ['gemini', 'openai'],
              description: 'Backend to use. Defaults to the provider from the sidecar.',
            },
            quality: {
              type: 'string',
              enum: ['auto', 'low', 'medium', 'high'],
              description: 'OpenAI only.',
            },
            output_path: {
              type: 'string',
              description:
                'Optional save path. Default: <original>-<mode>-<timestamp>.png in the same directory.',
            },
          },
          required: ['input_path', 'mode', 'instruction'],
        },
      },
      {
        name: 'list_themes',
        description:
          'List available themes shipped with proofsheet. Each theme is a saved aesthetic (medium, palette, composition) usable via the theme parameter of generate_image.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'read_theme',
        description:
          'Return a theme by slug. Includes the body fragment to weave into image-generation prompts.',
        inputSchema: {
          type: 'object',
          properties: {
            slug: { type: 'string', description: 'Theme slug, e.g., "editorial-photography".' },
          },
          required: ['slug'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;

    if (name === 'generate_image') {
      return await handleGenerateImage(args);
    }
    if (name === 'refine_image') {
      return await handleRefineImage(args);
    }
    if (name === 'list_themes') {
      return handleListThemes();
    }
    if (name === 'read_theme') {
      return handleReadTheme(args);
    }
    throw new Error(`Unknown tool: ${name}`);
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'art_direction',
        description:
          'Prompt-enrichment recipe for image generation. Apply this before calling generate_image so the model produces structured prompts (subject + environment + composition + lighting + medium + texture + mood + negative cues + aspect ratio).',
      },
      {
        name: 'refinement_picker',
        description:
          'Decision guide for refine_image: when to use prompt-tweak (mode "tweak") versus image-to-image edit (mode "edit").',
      },
      {
        name: 'theme_builder',
        description:
          'Guided flow for building a reusable image aesthetic and saving it as themes/<slug>.md.',
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const { name } = req.params;
    const messages = (() => {
      if (name === 'art_direction') return [{ role: 'user' as const, content: { type: 'text' as const, text: ART_DIRECTION_PROMPT } }];
      if (name === 'refinement_picker') return [{ role: 'user' as const, content: { type: 'text' as const, text: REFINEMENT_PICKER_PROMPT } }];
      if (name === 'theme_builder') return [{ role: 'user' as const, content: { type: 'text' as const, text: THEME_BUILDER_PROMPT } }];
      throw new Error(`Unknown prompt: ${name}`);
    })();
    return { messages };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const themes = listThemes();
    return {
      resources: themes.map((t) => ({
        uri: `proofsheet://theme/${t.slug}`,
        name: t.name ?? t.slug,
        description: t.description ?? 'Theme',
        mimeType: 'text/markdown',
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params.uri;
    const m = uri.match(/^proofsheet:\/\/theme\/([\w-]+)$/);
    if (!m) throw new Error(`Unknown resource: ${uri}`);
    const themePath = path.join(themesDir, `${m[1]}.md`);
    if (!fs.existsSync(themePath)) throw new Error(`Theme not found: ${m[1]}`);
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: fs.readFileSync(themePath, 'utf8'),
        },
      ],
    };
  });

  return server;
}

async function handleGenerateImage(args: Record<string, unknown>) {
  const prompt = String(args.prompt ?? '');
  if (!prompt) throw new Error('prompt is required');

  const provider = (args.provider as string) ?? 'gemini';
  const ratio = args.ratio as string | undefined;
  const theme = args.theme as string | undefined;
  const quality = args.quality as OpenAIQuality | undefined;
  const outputPath = (args.output_path as string) ?? defaultOutputPath(prompt);

  let result;
  if (provider === 'openai') {
    const input: OpenAIGenerateInput = { prompt, outputPath, theme, ratio, quality };
    result = await generateOpenAIImage(input);
  } else {
    const input: GeminiGenerateInput = { prompt, outputPath, theme, ratio };
    result = await generateGeminiImage(input);
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: `Generated ${result.bytes} bytes via ${result.provider}. Saved to ${result.outputPath} (sidecar: ${result.sidecarPath}).`,
      },
      {
        type: 'image' as const,
        data: result.imageBase64,
        mimeType: result.mimeType,
      },
    ],
  };
}

async function handleRefineImage(args: Record<string, unknown>) {
  const inputPath = String(args.input_path ?? '');
  if (!inputPath) throw new Error('input_path is required');
  if (!fs.existsSync(inputPath)) throw new Error(`Image not found: ${inputPath}`);

  const mode = String(args.mode ?? '') as 'edit' | 'tweak';
  if (mode !== 'edit' && mode !== 'tweak') {
    throw new Error("mode must be 'edit' or 'tweak'");
  }

  const instruction = String(args.instruction ?? '');
  if (!instruction) throw new Error('instruction is required');

  // Look up sidecar to recover original provider/ratio/theme.
  const sidecarPath = path.join(
    path.dirname(inputPath),
    '.meta',
    `${path.basename(inputPath)}.json`,
  );
  let sidecar: Record<string, unknown> | null = null;
  if (fs.existsSync(sidecarPath)) {
    try {
      sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) as Record<string, unknown>;
    } catch {
      sidecar = null;
    }
  }

  const provider =
    (args.provider as string | undefined) ??
    (sidecar?.provider as string | undefined) ??
    'gemini';
  const ratio = (sidecar?.ratio as string | undefined);
  const theme = (sidecar?.theme as string | undefined);
  const quality = args.quality as OpenAIQuality | undefined;

  const suffix = mode === 'edit' ? 'edited' : 'refined';
  const outputPath =
    (args.output_path as string) ??
    path.join(
      path.dirname(inputPath),
      `${path.basename(inputPath, path.extname(inputPath))}-${suffix}-${new Date()
        .toISOString()
        .replace(/[-:T]/g, '')
        .replace(/\..+/, '')}.png`,
    );

  let result;
  if (mode === 'edit') {
    if (provider === 'openai') {
      result = await generateOpenAIImage({
        prompt: instruction,
        outputPath,
        inputPath,
        ratio,
        theme,
        quality,
      });
    } else {
      result = await generateGeminiImage({
        prompt: instruction,
        outputPath,
        inputPath,
        ratio,
        theme,
      });
    }
  } else {
    // tweak: regenerate fresh with the new prompt, no input image.
    if (provider === 'openai') {
      result = await generateOpenAIImage({
        prompt: instruction,
        outputPath,
        ratio,
        theme,
        quality,
      });
    } else {
      result = await generateGeminiImage({
        prompt: instruction,
        outputPath,
        ratio,
        theme,
      });
    }
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: `Refined via ${result.provider} (mode: ${mode}). Saved to ${result.outputPath} (sidecar: ${result.sidecarPath}).`,
      },
      {
        type: 'image' as const,
        data: result.imageBase64,
        mimeType: result.mimeType,
      },
    ],
  };
}

function handleListThemes() {
  const themes = listThemes();
  const summary = themes
    .map((t) => {
      const parts: string[] = [`### ${t.slug}`];
      if (t.description) parts.push(t.description);
      if (t.bestFor) parts.push(`Best for: ${t.bestFor}`);
      return parts.join('\n');
    })
    .join('\n\n');
  return {
    content: [
      {
        type: 'text' as const,
        text: themes.length
          ? `${themes.length} theme(s) available:\n\n${summary}`
          : 'No themes found in themes/ directory.',
      },
    ],
  };
}

function handleReadTheme(args: Record<string, unknown>) {
  const slug = String(args.slug ?? '');
  if (!slug) throw new Error('slug is required');
  const themePath = path.join(themesDir, `${slug}.md`);
  if (!fs.existsSync(themePath)) throw new Error(`Theme not found: ${slug}`);
  const theme = parseThemeFile(themePath);
  const parts: string[] = [];
  if (theme.name) parts.push(`# ${theme.name}`);
  if (theme.description) parts.push(theme.description);
  if (theme.bestFor) parts.push(`Best for: ${theme.bestFor}`);
  parts.push('');
  parts.push('## Body fragment (weave into image prompts)');
  parts.push('');
  parts.push(theme.body);
  return {
    content: [{ type: 'text' as const, text: parts.join('\n') }],
  };
}

async function startStdio(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stay alive until stdin closes.
}

async function startHttp(server: Server, host: string, port: number): Promise<void> {
  // StreamableHTTPServerTransport handles a single MCP session per HTTP server
  // here; for multi-client production use you'd add per-session routing. This
  // setup is enough for single-user local hosting.
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-session-id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport && req.method === 'POST') {
      // New session.
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSid) => {
          transports.set(newSid, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      await server.connect(transport);
    }

    if (!transport) {
      res.statusCode = 400;
      res.end('No transport for session');
      return;
    }

    await transport.handleRequest(req, res);
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => {
      process.stderr.write(`proofsheet MCP listening on http://${host}:${port}\n`);
      resolve();
    });
  });
}

async function main(): Promise<void> {
  let flags: ParsedFlags;
  try {
    flags = parseServerArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  const server = createMcpServer();

  if (flags.transport === 'stdio') {
    await startStdio(server);
  } else {
    await startHttp(server, flags.host, flags.port);
  }
}

const entryName = path.basename(process.argv[1] ?? '');
if (entryName === 'mcp-server.js' || entryName === 'mcp-server.ts') {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
