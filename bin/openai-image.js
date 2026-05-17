/**
 * Direct OpenAI image-generation / image-refinement client.
 *
 * Sibling to src/gemini-image.ts (compiled to bin/gemini-image.js). Calls OpenAI's gpt-image-1 REST API.
 * Supports two modes:
 *   1. Text-to-image (default): prompt -> PNG via /v1/images/generations.
 *   2. Image-to-image: prompt + existing image -> modified PNG via /v1/images/edits.
 *
 * On success, writes the PNG and a sidecar JSON to <dir>/.meta/<basename>.json
 * with the same shape as the Gemini script, plus a provider: "openai" field
 * and a quality field if one was set.
 *
 * Usage:
 *   node bin/openai-image.js "<prompt>" <output-path>
 *   node bin/openai-image.js "<prompt>" <output-path> --input <existing-image>
 *   node bin/openai-image.js "<prompt>" <output-path> --ratio 1:1 --quality high --theme <name>
 *
 * (Development: tsx src/openai-image.ts ...)
 *
 * Env: OPENAI_API_KEY must be set. Pricing is roughly $0.04 (auto/medium) to
 * $0.17 (high) per 1024x1024 image. The ChatGPT subscription does NOT cover
 * API usage; this is a separate billing line.
 *
 * Aspect ratio note: gpt-image-1 only supports three discrete sizes
 * (1024x1024, 1024x1536, 1536x1024) rather than free-form ratios like Gemini.
 * The --ratio flag maps to the closest available size. Unmapped ratios fall
 * through to "auto" (model decides).
 *
 * Exit codes: 0 = success, 1 = error (message on stderr).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
const MODEL = 'gpt-image-1';
const GEN_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const EDIT_ENDPOINT = 'https://api.openai.com/v1/images/edits';
function parseArgs(argv) {
    const positional = [];
    const flags = {};
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
        }
        else {
            positional.push(a);
        }
    }
    const [prompt, outputPath] = positional;
    if (!prompt || !outputPath) {
        throw new Error('Usage: node bin/openai-image.js "<prompt>" <output-path> [--input <path>] [--theme <name>] [--ratio <ratio>] [--quality auto|low|medium|high]');
    }
    const quality = flags.quality;
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
function ratioToSize(ratio) {
    if (!ratio)
        return 'auto';
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
function guessMimeFromExt(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png')
        return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg')
        return 'image/jpeg';
    if (ext === '.webp')
        return 'image/webp';
    throw new Error(`Unsupported input image extension for OpenAI edits: ${ext}`);
}
async function generateText(args, apiKey, size) {
    const body = {
        model: MODEL,
        prompt: args.prompt,
        n: 1,
    };
    if (size !== 'auto')
        body.size = size;
    if (args.quality)
        body.quality = args.quality;
    const res = await fetch(GEN_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const json = (await res.json());
    if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? `HTTP ${res.status}`);
    }
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) {
        throw new Error('No image in response');
    }
    return Buffer.from(b64, 'base64');
}
async function generateEdit(args, apiKey, size) {
    if (!args.inputPath || !fs.existsSync(args.inputPath)) {
        throw new Error(`Input image not found: ${args.inputPath}`);
    }
    const imageBytes = fs.readFileSync(args.inputPath);
    const mime = guessMimeFromExt(args.inputPath);
    const inputBasename = path.basename(args.inputPath);
    const form = new FormData();
    form.append('model', MODEL);
    form.append('image', new Blob([new Uint8Array(imageBytes)], { type: mime }), inputBasename);
    form.append('prompt', args.prompt);
    form.append('n', '1');
    if (size !== 'auto')
        form.append('size', size);
    if (args.quality)
        form.append('quality', args.quality);
    const res = await fetch(EDIT_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
        body: form,
    });
    const json = (await res.json());
    if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? `HTTP ${res.status}`);
    }
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) {
        throw new Error('No image in response');
    }
    return Buffer.from(b64, 'base64');
}
function writeSidecar(outputPath, args, size) {
    const dir = path.dirname(outputPath);
    const base = path.basename(outputPath);
    const metaDir = path.join(dir, '.meta');
    fs.mkdirSync(metaDir, { recursive: true });
    const sidecarPath = path.join(metaDir, `${base}.json`);
    const sidecar = {
        prompt: args.prompt,
        provider: 'openai',
        model: MODEL,
        timestamp: new Date().toISOString(),
    };
    if (args.ratio)
        sidecar.ratio = args.ratio;
    if (size !== 'auto')
        sidecar.size = size;
    if (args.quality)
        sidecar.quality = args.quality;
    if (args.theme)
        sidecar.theme = args.theme;
    if (args.inputPath)
        sidecar.inputPath = path.resolve(args.inputPath);
    fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));
    return sidecarPath;
}
async function main() {
    let args;
    try {
        args = parseArgs(process.argv.slice(2));
    }
    catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('OPENAI_API_KEY not set');
        process.exit(1);
    }
    const size = ratioToSize(args.ratio);
    let buffer;
    try {
        buffer = args.inputPath
            ? await generateEdit(args, apiKey, size)
            : await generateText(args, apiKey, size);
    }
    catch (err) {
        console.error(`API error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
    fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
    fs.writeFileSync(args.outputPath, buffer);
    const sidecarPath = writeSidecar(args.outputPath, args, size);
    console.log(`OK ${args.outputPath} (${buffer.length} bytes) sidecar ${sidecarPath}`);
}
main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
