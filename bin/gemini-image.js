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
 * each PNG keeps the image directory clean. The sidecar makes any image
 * refinable months later via the /refine command — the original prompt
 * survives even when the chat doesn't.
 *
 * Usage:
 *   node bin/gemini-image.js "<prompt>" <output-path>
 *   node bin/gemini-image.js "<prompt>" <output-path> --input <existing-image>
 *   node bin/gemini-image.js "<prompt>" <output-path> --theme <name> --ratio <ratio>
 *
 * (Development: tsx src/gemini-image.ts ...)
 *
 * Env: GEMINI_API_KEY must be set. The key needs billing enabled on its AI
 * Studio account — gemini-2.5-flash-image (Nano Banana) has no free tier.
 *
 * Exit codes: 0 = success, 1 = error (message on stderr).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
const MODEL = 'gemini-2.5-flash-image';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
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
        throw new Error('Usage: node bin/gemini-image.js "<prompt>" <output-path> [--input <path>] [--theme <name>] [--ratio <ratio>]');
    }
    return { prompt, outputPath, inputPath: flags.input, theme: flags.theme, ratio: flags.ratio };
}
function guessMimeFromExt(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png')
        return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg')
        return 'image/jpeg';
    if (ext === '.webp')
        return 'image/webp';
    if (ext === '.gif')
        return 'image/gif';
    throw new Error(`Unsupported input image extension: ${ext}`);
}
function buildRequestBody(args) {
    const parts = [];
    if (args.inputPath) {
        if (!fs.existsSync(args.inputPath)) {
            throw new Error(`Input image not found: ${args.inputPath}`);
        }
        const bytes = fs.readFileSync(args.inputPath);
        parts.push({
            inlineData: {
                mimeType: guessMimeFromExt(args.inputPath),
                data: bytes.toString('base64'),
            },
        });
    }
    parts.push({ text: args.prompt });
    return { contents: [{ parts }] };
}
function writeSidecar(outputPath, args) {
    const dir = path.dirname(outputPath);
    const base = path.basename(outputPath);
    const metaDir = path.join(dir, '.meta');
    fs.mkdirSync(metaDir, { recursive: true });
    const sidecarPath = path.join(metaDir, `${base}.json`);
    const sidecar = {
        prompt: args.prompt,
        model: MODEL,
        timestamp: new Date().toISOString(),
    };
    if (args.ratio)
        sidecar.ratio = args.ratio;
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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('GEMINI_API_KEY not set');
        process.exit(1);
    }
    let body;
    try {
        body = buildRequestBody(args);
    }
    catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const json = (await res.json());
    if (!res.ok || json.error) {
        const msg = json.error?.message ?? `HTTP ${res.status}`;
        console.error(`API error: ${msg}`);
        process.exit(1);
    }
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData !== undefined && p.inlineData.mimeType.startsWith('image/'));
    if (!imagePart) {
        const textParts = parts
            .map((p) => p.text)
            .filter((t) => Boolean(t))
            .join(' ');
        console.error(`No image in response. Finish reason: ${json.candidates?.[0]?.finishReason ?? 'unknown'}. ${textParts ? `Text: ${textParts}` : ''}`);
        process.exit(1);
    }
    const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
    fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
    fs.writeFileSync(args.outputPath, buffer);
    const sidecarPath = writeSidecar(args.outputPath, args);
    console.log(`OK ${args.outputPath} (${buffer.length} bytes, ${imagePart.inlineData.mimeType}) sidecar ${sidecarPath}`);
}
main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
