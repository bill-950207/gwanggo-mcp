/**
 * API key storage. Priority: ~/.config/gwanggo/config.json > GWANGGO_API_KEY env.
 *
 * An interactive browser login must replace a stale environment key inherited
 * by Claude/Cursor. CI and headless MCP configs still use GWANGGO_API_KEY when
 * no browser-login key has been saved.
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CONFIG_DIR = join(homedir(), '.config', 'gwanggo')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export const API_URL = (process.env.GWANGGO_API_URL || 'https://gwanggo.ai').replace(/\/$/, '')

export function getKey(): string | null {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    if (typeof raw.apiKey === 'string' && raw.apiKey.trim()) return raw.apiKey.trim()
  } catch {}

  return process.env.GWANGGO_API_KEY?.trim() || null
}

export function saveKey(apiKey: string): string {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify({ apiKey }, null, 2), { mode: 0o600 })
  return CONFIG_PATH
}

export function clearKey(): boolean {
  if (!existsSync(CONFIG_PATH)) return false
  rmSync(CONFIG_PATH)
  return true
}
