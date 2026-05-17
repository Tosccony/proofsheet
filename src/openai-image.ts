/**
 * Direct OpenAI image-generation / image-refinement client.
 *
 * Sibling to src/gemini-image.ts. Calls OpenAI's gpt-image-1 REST API.
 * Supports two modes:
 *   1. Text-to-image (default): prompt -> PNG via /v1/images/generations.
 *   2. Image-to-image: prompt + existing image -> modified PNG via /v1/images/edits.
 *
 * Exports `generateOpenAIImage()` for in-process use by the MCP server, plus
 * a CLI entry point for direct invocation.
 *
 * CLI Usage:
 *   node bin/openai-image.js "<prompt>" <output-path>
 *   node bin/openai-image.js "<prompt>" <output-path> --input <existing-image>
 *   node bin/openai-image.js "<prompt>" <output-path> --ratio 1:1 --quality high --theme <name>
 *
 * Env: OPENAI_API_KEY must be set. Pricing is roughly $0.04 (auto/medium) to
 * $0.17 (high) per 1024x1024 image. The ChatGPT subscription does NOT cover
 * API usage; this is a separate billing line.
 *
 * Aspect ratio note: gpt-image-1 only supports three discrete sizes
 * (1024x1024, 1024x1536, 1536x1024). The ratio maps to the closest match.
 * Unmapped ratios fall through to "auto" (model decides).
 *
 * Exit codes: 0 = success, 1 = error (message on stderr).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export const OPENAI_MODEL = 'gpt-image-1';
const GEN_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const EDIT_ENDPOINT = 'https://api.openai.com/v1/images/edits';

export type OpenAIQuality = 'auto' | 'low' | 'medium' | 'high';
export type OpenAISize = 'auto' | '1024x1024' | '1024x1536' | '1536x1024';

export interface OpenAIGenerateInput {
  prompt: string;
  outputPath: string;
  inputPath?: string;
  theme?: string;
  ratio?: string;
  quality?: OpenAIQuality;
  apiKey?: string;
}

export interface OpenAIGenerateResult {
  outputPath: string;
  sidecarPath: string;
  bytes: number;
  mimeType: 'image/png';
  imageBase64: string;
  size: OpenAISize;
  provider: 'openai';
}

interface Sidecar {
  prompt: string;
  provider: 'openai';
  model: string;
  timestamp: string;
  ratio?: string;
  size?: OpenAISize;
  quality?: OpenAIQuality;
  theme?: string;
  inputPath?: string;
}

interface ApiResponseData {
  b64_json?: string;
}

interface ApiResponse {
  data?: ApiResponseData[];
  error?: { code?: string; message: string; type?: string };
}

export function ratioToOpenAISize(ratio: string | undefined): OpenAISize {
  if (!ratio) return 'auto';
  switch (ratio) {
    case '1:1':
      return '1024x1024';
    case '2:3':
    case '9:16':
      return '1024x1536';
    case '3:2':
    case '4:3':
    case '16:9':
    case '21:9':
      return '1536x1024';
    default:
      return 'auto';
  }
}

function guessMimeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  throw new Error(`Unsupported input image extension for OpenAI edits: ${ext}`);
}

async function generateText(
  input: OpenAIGenerateInput,
  apiKey: string,
  size: OpenAISize,
): Promise<Buffer> {
  const body: Record<string, unknown> = {
    model: OPENAI_MODEL,
    prompt: input.prompt,
    n: 1,
  };
  if (size !== 'auto') body.size = size;
  if (input.quality) body.quality = input.quality;

  const res = await fetch(GEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as ApiResponse;

  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  }

  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('No image in response');
  }
  return Buffer.from(b64, 'base64');
}

async function generateEdit(
  input: OpenAIGenerateInput,
  apiKey: string,
  size: OpenAISize,
): Promise<Buffer> {
  if (!input.inputPath || !fs.existsSync(input.inputPath)) {
    throw new Error(`Input image not found: ${input.inputPath}`);
  }

  const imageBytes = fs.readFileSync(input.inputPath);
  const mime = guessMimeFromExt(input.inputPath);
  const inputBasename = path.basename(input.inputPath);

  const form = new FormData();
  form.append('model', OPENAI_MODEL);
  form.append('image', new Blob([new Uint8Array(imageBytes)], { type: mime }), inputBasename);
  form.append('prompt', input.prompt);
  form.append('n', '1');
  if (size !== 'auto') form.append('size', size);
  if (input.quality) form.append('quality', input.quality);

  const res = await fetch(EDIT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const json = (await res.json()) as ApiResponse;

  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  }

  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('No image in response');
  }
  return Buffer.from(b64, 'base64');
}

function writeSidecar(outputPath: string, input: OpenAIGenerateInput, size: OpenAISize): string {
  const dir = path.dirname(outputPath);
  const base = path.basename(outputPath);
  const metaDir = path.join(dir, '.meta');
  fs.mkdirSync(metaDir, { recursive: true });
  const sidecarPath = path.join(metaDir, `${base}.json`);

  const sidecar: Sidecar = {
    prompt: input.prompt,
    provider: 'openai',
    model: OPENAI_MODEL,
    timestamp: new Date().toISOString(),
  };
  if (input.ratio) sidecar.ratio = input.ratio;
  if (size !== 'auto') sidecar.size = size;
  if (input.quality) sidecar.quality = input.quality;
  if (input.theme) sidecar.theme = input.theme;
  if (input.inputPath) sidecar.inputPath = path.resolve(input.inputPath);

  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));
  return sidecarPath;
}

export async function generateOpenAIImage(input: OpenAIGenerateInput): Promise<OpenAIGenerateResult> {
  const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const size = ratioToOpenAISize(input.ratio);
  const buffer = input.inputPath
    ? await generateEdit(input, apiKey, size)
    : await generateText(input, apiKey, size);

  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  fs.writeFileSync(input.outputPath, buffer);
  const sidecarPath = writeSidecar(input.outputPath, input, size);

  return {
    outputPath: input.outputPath,
    sidecarPath,
    bytes: buffer.length,
    mimeType: 'image/png',
    imageBase64: buffer.toString('base64'),
    size,
    provider: 'openai',
  };
}

function parseCliArgs(argv: string[]): OpenAIGenerateInput {
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
      'Usage: node bin/openai-image.js "<prompt>" <output-path> [--input <path>] [--theme <name>] [--ratio <ratio>] [--quality auto|low|medium|high]',
    );
  }

  const quality = flags.quality as OpenAIQuality | undefined;
  if (quality && !['auto', 'low', 'medium', 'high'].includes(quality)) {
    throw new Error(`--quality must be one of: auto, low, medium, high (got: ${quality})`);
  }

  return {
    prompt,
    outputPath,
    inputPath: flags.input,
    theme: flags.theme,
    ratio: flags.ratio,
    quality,
  };
}

async function cliMain(): Promise<void> {
  let input: OpenAIGenerateInput;
  try {
    input = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  try {
    const result = await generateOpenAIImage(input);
    console.log(`OK ${result.outputPath} (${result.bytes} bytes) sidecar ${result.sidecarPath}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

const entryName = path.basename(process.argv[1] ?? '');
if (entryName === 'openai-image.js' || entryName === 'openai-image.ts') {
  cliMain();
}
