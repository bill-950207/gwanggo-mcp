/** Thin client over the Gwanggo public /v1 API. */
import { API_URL, getKey } from './config.js';
export class GwanggoError extends Error {
    status;
    code;
    constructor(status, message, code) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
async function request(path, init) {
    const headers = { ...init?.headers };
    if (init?.auth !== false) {
        const key = getKey();
        if (!key) {
            throw new GwanggoError(401, 'No API key. Run `gwanggo-mcp login`, or set GWANGGO_API_KEY. Keys: https://gwanggo.ai/dashboard/api-keys');
        }
        headers['Authorization'] = `Bearer ${key}`;
    }
    if (init?.body)
        headers['Content-Type'] = 'application/json';
    const res = await fetch(`${API_URL}/api/v1${path}`, { ...init, headers });
    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        throw new GwanggoError(res.status, text.slice(0, 200) || `HTTP ${res.status}`);
    }
    if (!res.ok) {
        const err = json.error;
        throw new GwanggoError(res.status, err?.message || `HTTP ${res.status}`, err?.code);
    }
    return json;
}
// ---------- endpoints ----------
export const listModels = () => request('/models', { auth: false });
export const me = () => request('/me');
export const getTask = (id) => request(`/tasks/${id}`);
export const generate = (kind, body) => request(`/generate/${kind}`, {
    method: 'POST',
    body: JSON.stringify(body),
});
export async function pollTask(id, timeoutMs, onTick) {
    const start = Date.now();
    let delay = 2000;
    for (;;) {
        const task = await getTask(id);
        onTick?.(task);
        if (task.status === 'COMPLETED' || task.status === 'FAILED')
            return task;
        if (Date.now() - start > timeoutMs)
            return task;
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 1.3, 8000);
    }
}
export const startDeviceFlow = () => request('/auth/device', { method: 'POST', body: JSON.stringify({}), auth: false });
export async function pollDeviceToken(deviceCode, intervalSec, expiresInSec) {
    const deadline = Date.now() + expiresInSec * 1000;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, Math.max(intervalSec, 3) * 1000));
        try {
            const res = await request('/auth/token', {
                method: 'POST',
                body: JSON.stringify({ device_code: deviceCode }),
                auth: false,
            });
            if (res.access_token)
                return res.access_token;
        }
        catch (e) {
            const err = e;
            if (err.code === 'authorization_pending')
                continue;
            throw e; // access_denied / expired_token / 그 외
        }
    }
    throw new GwanggoError(408, 'Device authorization timed out — run login again.');
}
