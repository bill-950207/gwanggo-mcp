#!/usr/bin/env node
/**
 * gwanggo-mcp — MCP server + CLI for the Gwanggo API.
 *
 *   gwanggo-mcp               MCP 서버 (stdio) — Claude/Cursor/Codex 설정에서 사용
 *   gwanggo-mcp login         브라우저 승인으로 API 키 발급/저장 (device flow)
 *   gwanggo auth login        브라우저 승인으로 API 키 발급/저장 (alias)
 *   gwanggo-mcp logout        저장된 키 삭제
 *   gwanggo-mcp me            계정/크레딧 확인
 *   gwanggo-mcp models        모델 목록
 *   gwanggo-mcp generate ...  CLI에서 바로 생성
 *   gwanggo-mcp task <id>     생성 상태 확인
 */
import { spawn } from 'node:child_process'
import { API_URL, saveKey, clearKey, getKey } from './config.js'
import { generate, getTask, listModels, me, pollDeviceToken, pollTask, startDeviceFlow, GwanggoError } from './api.js'
import { serve } from './mcp.js'

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  spawn(cmd, [url], { shell: process.platform === 'win32', stdio: 'ignore', detached: true }).unref()
}

function arg(flags: string[], name: string): string | undefined {
  const i = flags.findIndex((f) => f === `--${name}`)
  if (i >= 0 && flags[i + 1] && !flags[i + 1].startsWith('--')) return flags[i + 1]
  const eq = flags.find((f) => f.startsWith(`--${name}=`))
  return eq?.split('=').slice(1).join('=')
}

function booleanArg(flags: string[], name: string): boolean | undefined {
  if (flags.includes(`--no-${name}`)) return false

  const inline = flags.find((f) => f.startsWith(`--${name}=`))
  if (inline) {
    const value = inline.split('=').slice(1).join('=').toLowerCase()
    if (value === 'true' || value === '1') return true
    if (value === 'false' || value === '0') return false
    throw new GwanggoError(400, `--${name} must be true or false`)
  }

  const index = flags.indexOf(`--${name}`)
  if (index < 0) return undefined
  const value = flags[index + 1]?.toLowerCase()
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return true
}

async function cmdLogin(): Promise<void> {
  const dc = await startDeviceFlow()
  console.log(`\n브라우저에서 gwanggo CLI 연결을 승인해주세요:`)
  console.log(`${dc.verification_uri_complete}`)
  console.log(`브라우저가 열리지 않으면 위 URL을 복사해 여세요. 요청 코드: ${dc.user_code}\n`)
  openBrowser(dc.verification_uri_complete)
  const token = await pollDeviceToken(dc.device_code, dc.interval, dc.expires_in)
  const path = saveKey(token)
  const info = await me()
  console.log(`연결 완료: ${info.email} (${info.credits} credits)`)
  console.log(`키 저장 위치: ${path}`)
}

async function cmdGenerate(rest: string[]): Promise<void> {
  const kind = (rest[0] === 'video' ? 'video' : 'image') as 'image' | 'video'
  const positional = rest.filter((a, i) => i > 0 && !a.startsWith('--') && !rest[i - 1]?.startsWith('--'))
  const prompt = positional.join(' ')
  const model = arg(rest, 'model') || (kind === 'video' ? 'seedance-2.0' : 'gpt-image-2')
  if (!prompt) {
    console.error(`사용법: gwanggo generate [image|video] "프롬프트" --model <slug> [--image-url u] [--aspect-ratio r] [--resolution r] [--duration n] [--quality q] [--generate-audio]`)
    process.exit(1)
  }
  const body: Record<string, unknown> = { model, prompt }
  const imageUrl = arg(rest, 'image-url'); if (imageUrl) body.imageUrl = imageUrl
  const aspect = arg(rest, 'aspect-ratio'); if (aspect) body.aspectRatio = aspect
  const resolution = arg(rest, 'resolution'); if (resolution) body.resolution = resolution
  const duration = arg(rest, 'duration'); if (duration) body.duration = Number(duration)
  const quality = arg(rest, 'quality'); if (quality) body.quality = quality
  const generateAudio = booleanArg(rest, 'generate-audio'); if (generateAudio !== undefined) body.generateAudio = generateAudio

  const sub = await generate(kind, body)
  console.log(`제출됨 (${sub.credits_used} credits) — id ${sub.id}`)
  const task = await pollTask(sub.id, kind === 'video' ? 10 * 60_000 : 5 * 60_000, (t) =>
    process.stderr.write(`\r상태: ${t.status}   `)
  )
  process.stderr.write('\n')
  if (task.status === 'COMPLETED') console.log(task.result_url)
  else if (task.status === 'FAILED') { console.error(`실패: ${task.error || 'unknown'} (크레딧 자동 환불)`); process.exit(1) }
  else console.log(`아직 ${task.status} — gwanggo task ${sub.id} 로 확인하세요`)
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2)
  try {
    if (cmd === 'auth' && rest[0] === 'login') {
      await cmdLogin()
      return
    }

    switch (cmd) {
      case undefined:
      case 'serve':
        await serve()
        return
      case 'login':
        await cmdLogin()
        return
      case 'logout':
        console.log(clearKey() ? '키를 삭제했습니다.' : '저장된 키가 없습니다.')
        return
      case 'me': {
        const info = await me()
        console.log(`${info.email} — ${info.credits} credits (${API_URL})`)
        return
      }
      case 'models': {
        const { models } = await listModels()
        for (const m of models.filter((x) => !x.is_coming_soon)) {
          console.log(`${m.type.padEnd(5)} ${m.slug.padEnd(20)} ${m.name}`)
        }
        return
      }
      case 'task': {
        if (!rest[0]) { console.error('사용법: gwanggo-mcp task <id>'); process.exit(1) }
        console.log(JSON.stringify(await getTask(rest[0]), null, 2))
        return
      }
      case 'generate':
        await cmdGenerate(rest)
        return
      case '--help':
      case 'help':
        console.log(`gwanggo-mcp <command>

  (없음)/serve   MCP 서버 실행 (stdio)
  login          브라우저 승인으로 API 키 연결
  auth login     브라우저 승인으로 API 키 연결 (gwanggo alias)
  logout         저장된 키 삭제
  me             계정/크레딧 확인
  models         모델 목록
  generate       이미지/영상 생성  예) gwanggo generate video "파도 위 서핑" --model seedance-2.0 --resolution 720p --duration 5 --generate-audio
  task <id>      생성 상태 확인

키 우선순위: 브라우저 로그인 저장 키 > GWANGGO_API_KEY 환경변수
API 키 발급: ${API_URL}/dashboard/api-keys`)
        return
      default:
        console.error(`알 수 없는 명령: ${cmd} — gwanggo-mcp help`)
        process.exit(1)
    }
  } catch (e) {
    const err = e as GwanggoError
    console.error(`오류${err.status ? ` (${err.status})` : ''}: ${err.message}`)
    if (err.status === 401 && cmd !== 'login' && !getKey()) console.error('먼저 `gwanggo-mcp login` 을 실행하세요.')
    process.exit(1)
  }
}

main()
