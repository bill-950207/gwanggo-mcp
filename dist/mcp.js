/** MCP server: exposes Gwanggo generation as agent tools over stdio. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { generate, getTask, listModels, me, pollTask } from './api.js';
const text = (s) => ({ content: [{ type: 'text', text: s }] });
const errText = (e) => {
    const err = e;
    return { content: [{ type: 'text', text: `Error${err.status ? ` (${err.status})` : ''}: ${err.message}` }], isError: true };
};
/** snake_case 입력을 API의 camelCase 필드로 매핑 */
function toBody(model, prompt, opts) {
    const map = {
        image_url: 'imageUrl',
        video_url: 'videoUrl',
        aspect_ratio: 'aspectRatio',
        generate_audio: 'generateAudio',
    };
    const body = { model, prompt };
    for (const [k, v] of Object.entries(opts)) {
        if (v === undefined || v === null)
            continue;
        body[map[k] ?? k] = v;
    }
    return body;
}
export async function serve() {
    const server = new McpServer({ name: 'gwanggo', version: '0.1.1' });
    server.tool('list_models', 'List available AI image/video generation models with credit costs and per-model options (aspect ratios, resolutions, durations). Call this first to pick a model slug.', { type: z.enum(['image', 'video']).optional().describe('Filter by model type') }, async ({ type }) => {
        try {
            const { models } = await listModels();
            const rows = models
                .filter((m) => !m.is_coming_soon && (!type || m.type === type))
                .map((m) => ({
                slug: m.slug,
                name: m.name,
                type: m.type,
                creator: m.creator,
                credit_config: m.credit_config,
                options: m.form_config?.fields
                    ?.filter((f) => f.type !== 'prompt')
                    .map((f) => ({ type: f.type, options: f.options, default: f.default })),
            }));
            return text(JSON.stringify(rows, null, 2));
        }
        catch (e) {
            return errText(e);
        }
    });
    server.tool('get_credits', 'Get the connected Gwanggo account email and remaining credit balance.', {}, async () => {
        try {
            const info = await me();
            return text(`${info.email} — ${info.credits} credits remaining`);
        }
        catch (e) {
            return errText(e);
        }
    });
    server.tool('generate_image', 'Generate an image with a Gwanggo model. Spends credits. Waits for completion and returns the image URL. Use list_models first to choose a model slug and see its options.', {
        model: z.string().describe('Model slug, e.g. "seedream-5", "gpt-image-2"'),
        prompt: z.string().describe('What to generate'),
        image_url: z.string().url().optional().describe('Reference image URL for edit/i2i models'),
        aspect_ratio: z.string().optional().describe('e.g. "1:1", "16:9", "9:16" (model-dependent)'),
        quality: z.string().optional().describe('Model-dependent quality tier, e.g. "basic" | "high"'),
    }, async ({ model, prompt, ...opts }) => {
        try {
            const sub = await generate('image', toBody(model, prompt, opts));
            const task = await pollTask(sub.id, 5 * 60_000);
            if (task.status === 'COMPLETED' && task.result_url) {
                return text(`Image ready (${sub.credits_used} credits): ${task.result_url}`);
            }
            if (task.status === 'FAILED') {
                return text(`Generation failed: ${task.error || 'unknown error'} (credits auto-refunded)`);
            }
            return text(`Still ${task.status} — check later with get_task id=${sub.id}`);
        }
        catch (e) {
            return errText(e);
        }
    });
    server.tool('generate_video', 'Generate a video with a Gwanggo model. Spends credits (often per-second — check list_models). Waits up to 10 minutes and returns the video URL.', {
        model: z.string().describe('Model slug, e.g. "seedance-2.0", "kling-3", "veo-3.1"'),
        prompt: z.string().describe('Scene/motion description'),
        image_url: z.string().url().optional().describe('Reference image URL for image-to-video'),
        aspect_ratio: z.string().optional().describe('e.g. "16:9", "9:16" (model-dependent)'),
        resolution: z.string().optional().describe('e.g. "480p", "720p", "1080p" (model-dependent)'),
        duration: z.number().optional().describe('Seconds (model-dependent, e.g. 5 or 10)'),
        generate_audio: z.boolean().optional().describe('Generate audio track (model-dependent)'),
    }, async ({ model, prompt, ...opts }) => {
        try {
            const sub = await generate('video', toBody(model, prompt, opts));
            const task = await pollTask(sub.id, 10 * 60_000);
            if (task.status === 'COMPLETED' && task.result_url) {
                return text(`Video ready (${sub.credits_used} credits): ${task.result_url}`);
            }
            if (task.status === 'FAILED') {
                return text(`Generation failed: ${task.error || 'unknown error'} (credits auto-refunded)`);
            }
            return text(`Still ${task.status} — check later with get_task id=${sub.id}`);
        }
        catch (e) {
            return errText(e);
        }
    });
    server.tool('get_task', 'Check the status/result of a previous generation by its id.', { id: z.string().describe('Generation id returned by generate_image/generate_video') }, async ({ id }) => {
        try {
            const task = await getTask(id);
            return text(JSON.stringify(task, null, 2));
        }
        catch (e) {
            return errText(e);
        }
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
