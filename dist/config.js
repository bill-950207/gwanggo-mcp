/**
 * API key storage. Priority: GWANGGO_API_KEY env > ~/.config/gwanggo/config.json.
 * The env path matters for MCP configs — users can pass the key without `login`.
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const CONFIG_DIR = join(homedir(), '.config', 'gwanggo');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
export const API_URL = (process.env.GWANGGO_API_URL || 'https://gwanggo.ai').replace(/\/$/, '');
export function getKey() {
    if (process.env.GWANGGO_API_KEY)
        return process.env.GWANGGO_API_KEY.trim();
    try {
        const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
        return typeof raw.apiKey === 'string' ? raw.apiKey : null;
    }
    catch {
        return null;
    }
}
export function saveKey(apiKey) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify({ apiKey }, null, 2), { mode: 0o600 });
    return CONFIG_PATH;
}
export function clearKey() {
    if (!existsSync(CONFIG_PATH))
        return false;
    rmSync(CONFIG_PATH);
    return true;
}
