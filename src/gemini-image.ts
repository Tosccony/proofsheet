/**
 * Direct Gemini image-generation / image-refinement client.
 *
 * Calls Gemini's gemini-2.5-flash-image REST API. Supports two modes:
 *   1. Text-to-image (default): prompt -> PNG.
 *   2. Image-to-image: prompt + existing image -> modified PNG.
 *
 * On success, writes the PNG and a sidecar JSON to <dir>/.meta/<basename>.json
 * containing the prompt, ratio (if known), theme (if used), timestamp, model,
 * and (for i2i) the input path. Keeping sidecars in .meta/ instead of next to
 * each PNG keeps the image directory clean.
 *
 * Exports `generateGeminiImage()` for in-process use by the MCP server, plus
 * a CLI entry point for direct invocation.
 *
 * CLI Usage:
 *   node bin/gemini-image.js "<prompt>" <output-path>
 *   node bin/gemini-image.js "<prompt>" <output-path> --input <existing-image>
 *   node bin/gemini-image.js "<prompt>" <output-path> --theme <name> --ratio <ratio>
 *
 * Env: GEMINI_API_KEY must be set.
 * Exit codes: 0 = success, 1 = error (message on stderr).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export const GEMINI_MODEL = 'gemini-2.5-flash-image';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface InlineData {
  mimeType: string;
  data: string;
}

interface Part {
  text?: string;
  inlineData?: InlineData;
}

interface Candidate {
  content?: { parts?: Part[] };
  finishReason?: string;
}

interface ApiResponse {
  candidates?: Candidate[];
  error?: { code: number; message: string; status: string };
}

export interface GeminiGenerateInput {
  prompt: string;
  outputPath: string;
  inputPath?: string;
  theme?: string;
  ratio?: string;
  apiKey?: string;
}

export interface GeminiGenerateResult {
  outputPath: string;
  sidecarPath: string;
  bytes: number;
  mimeType: string;
  imageBase64: string;
  provider: 'gemini';
}

interface Sidecar {
  prompt: string;
  provider: 'gemini';
  model: string;
  timestamp: string;
  ratio?: string;
  theme?: string;
  inputPath?: string;
}

function guessMimeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  throw new Error(`Unsupported input image extension: ${ext}`);
}

function buildRequestBody(input: GeminiGenerateInput): { contents: { parts: Part[] }[] } {
  const parts: Part[] = [];

  if (input.inputPath) {
    if (!fs.existsSync(input.inputPath)) {
      throw new Error(`Input image not found: ${input.inputPath}`);
    }
    const bytes = fs.readFileSync(input.inputPath);
    parts.push({
      inlineData: {
        mimeType: guessMimeFromExt(input.inputPath),
        data: bytes.toString('base64'),
      },
    });
  }

  parts.push({ text: input.prompt });

  return { contents: [{ parts }] };
}

function writeSidecar(outputPath: string, input: GeminiGenerateInput): string {
  const dir = path.dirname(outputPath);
  const base = path.basename(outputPath);
  const metaDir = path.join(dir, '.meta');
  fs.mkdirSync(metaDir, { recursive: true });
  const sidecarPath = path.join(metaDir, `${base}.json`);
  const sidecar: Sidecar = {
    prompt: input.prompt,
    provider: 'gemini',
    model: GEMINI_MODEL,
    timestamp: new Date().toISOString(),
  };
  if (input.ratio) sidecar.ratio = input.ratio;
  if (input.theme) sidecar.theme = input.theme;
  if (input.inputPath) sidecar.inputPath = path.resolve(input.inputPath);
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));
  return sidecarPath;
}

export async function generateGeminiImage(input: GeminiGenerateInput): Promise<GeminiGenerateResult> {
  const apiKey = input.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const body = buildRequestBody(input);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as ApiResponse;

  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Gemini API error: ${msg}`);
  }

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p): p is Part & { inlineData: InlineData } =>
    p.inlineData !== undefined && p.inlineData.mimeType.startsWith('image/'),
  );

  if (!imagePart) {
    const textParts = parts
      .map((p) => p.text)
      .filter((t): t is string => Boolean(t))
      .join(' ');
    throw new Error(
      `No image in response. Finish reason: ${json.candidates?.[0]?.finishReason ?? 'unknown'}. ${textParts ? `Text: ${textParts}` : ''}`,
    );
  }

  const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  fs.writeFileSync(input.outputPath, buffer);
  const sidecarPath = writeSidecar(input.outputPath, input);

  return {
    outputPath: input.outputPath,
    sidecarPath,
    bytes: buffer.length,
    mimeType: imagePart.inlineData.mimeType,
    imageBase64: imagePart.inlineData.data,
    provider: 'gemini',
  };
}

function parseCliArgs(argv: string[]): GeminiGenerateInput {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val === undefined || val.startsWith('--')) {
        throw new Error(`Flag --${key} requires a value`);
      }
      flags[key] = val;
      i++;
    } else {
      positional.push(a);
    }
  }

  const [prompt, outputPath] = positional;
  if (!prompt || !outputPath) {
    throw new Error(
      'Usage: node bin/gemini-image.js "<prompt>" <output-path> [--input <path>] [--theme <name>] [--ratio <ratio>]',
    );
  }

  return { prompt, outputPath, inputPath: flags.input, theme: flags.theme, ratio: flags.ratio };
}

async function cliMain(): Promise<void> {
  let input: GeminiGenerateInput;
  try {
    input = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  try {
    const result = await generateGeminiImage(input);
    console.log(
      `OK ${result.outputPath} (${result.bytes} bytes, ${result.mimeType}) sidecar ${result.sidecarPath}`,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// Only run CLI when this script is the entry point (not when imported or
// bundled into another script like mcp-server.js).
const entryName = path.basename(process.argv[1] ?? '');
if (entryName === 'gemini-image.js' || entryName === 'gemini-image.ts') {
  cliMain();
}
