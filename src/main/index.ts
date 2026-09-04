import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { SettingsStore } from './settingsStore'
import { StreamServer } from './streamServer'
import { AiEngine } from './aiEngine'
import { ComfyExecutor } from './comfyExecutor'
import { FeedbackWatcher } from './feedbackWatcher'
import type { AppSettings, FeedbackEventPayload, StreamEventPayload } from '../shared/types'
import { tr, type Lang } from '../shared/i18n'

let mainWindow: BrowserWindow | null = null
let settingsStore: SettingsStore | null = null
let streamServer: StreamServer | null = null
let aiEngine: AiEngine | null = null
let comfyExecutor: ComfyExecutor | null = null
let feedbackWatcher: FeedbackWatcher | null = null

/** 当前界面语言（跟随设置） */
function lang(): Lang {
  return settingsStore?.get().language === 'en' ? 'en' : 'zh'
}

/** 当前语言下的用户可见消息 */
function t(key: string, vars?: Record<string, string | number>): string {
  return tr(lang(), key, vars)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0b0e14',
    title: 'AI Live Console',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function sendStreamState(): void {
  if (!mainWindow || !streamServer) return
  const payload: StreamEventPayload = {
    videos: streamServer.getVideos(),
    baseUrl: streamServer.getBaseUrl()
  }
  mainWindow.webContents.send('stream:files-changed', payload)
}

function sendStatus(text: string): void {
  if (mainWindow) {
    mainWindow.webContents.send('engine:status', { text })
  }
}

function sendConversation(entry: { role: string; content: string; time: number }): void {
  if (mainWindow) {
    mainWindow.webContents.send('engine:conversation', entry)
  }
}

function registerIpc(): void {
  if (!settingsStore || !streamServer || !aiEngine || !comfyExecutor || !feedbackWatcher) return

  ipcMain.handle('settings:get', () => settingsStore!.get())
  ipcMain.handle('settings:set', async (_event, patch: Partial<AppSettings>) => {
    const next = await settingsStore!.update(patch)
    if (patch.streamsDir !== undefined) {
      await streamServer!.setDirectory(next.streamsDir)
      sendStreamState()
    }
    if (patch.feedbackDir !== undefined) {
      await feedbackWatcher!.setDirectory(next.feedbackDir)
    }
    return next
  })
  ipcMain.handle('settings:choose-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: t('dialog.chooseDir')
    })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('project:choose-reference-image', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      title: t('dialog.chooseRefImage'),
      filters: [{ name: t('dialog.images'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('project:choose-workflow', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      title: t('dialog.chooseWorkflow'),
      filters: [{ name: t('dialog.workflow'), extensions: ['json'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('stream:get-state', () => ({
    videos: streamServer!.getVideos(),
    baseUrl: streamServer!.getBaseUrl()
  }))
  ipcMain.handle('stream:refresh', async () => {
    await streamServer!.refresh()
    sendStreamState()
    return true
  })
  ipcMain.handle('engine:test', async () => {
    const settings = settingsStore!.get()
    if (!settings.apiBaseUrl || !settings.model) {
      return { ok: false, message: t('engine.noApiConfig') }
    }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(`${settings.apiBaseUrl.replace(/\/+$/, '')}/models`, {
        headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {},
        signal: controller.signal
      })
      clearTimeout(timer)
      if (!res.ok) return { ok: false, message: t('engine.http', { status: res.status }) }
      return { ok: true, message: t('engine.connected', { model: settings.model }) }
    } catch (error: any) {
      return {
        ok: false,
        message: error?.name === 'AbortError' ? t('engine.timeout') : t('engine.connectFail', { msg: String(error?.message || error) })
      }
    }
  })
  ipcMain.handle('engine:get-profile', () => {
    return aiEngine!.getProfile()
  })
  ipcMain.handle('engine:get-state', () => {
    return { state: aiEngine!.getLastState(), profile: aiEngine!.getProfile(), clothingState: aiEngine!.getClothingState() }
  })
  ipcMain.handle('engine:init', async () => {
    sendStatus(t('status.generating'))
    const result = await aiEngine!.initProfile()
    return result
  })
  ipcMain.handle('engine:interact', async (_event, text: string) => {
    if (!aiEngine!.hasProfile()) {
      return { ok: false, message: t('engine.noProfile') }
    }
    const input = String(text || '').trim()
    if (!input) return { ok: false, message: t('engine.emptyInput') }
    sendStatus(t('engine.directing'))
    sendConversation({ role: 'user', content: input, time: Date.now() })
    try {
      const result = await aiEngine!.handleInteraction(input)
      if (result.rawOutput) {
        sendConversation({ role: 'assistant', content: result.rawOutput, time: Date.now() })
      }

      if (result.ok && result.output) {
        const out = result.output
        // 回显主播台词到反馈流
        await writeSelfFeedback({ type: 'system', text: t('chat.streamerPrefix', { line: out.line }), timestamp: Date.now() })
        // 弹幕回显
        for (const d of out.danmaku) {
          await writeSelfFeedback({
            type: 'danmaku',
            text: d.text,
            user: d.user,
            timestamp: Date.now()
          })
        }
        // 特效回显
        if (out.effect) {
          await writeSelfFeedback({
            type: 'effect',
            text: out.effect.name,
            effect: out.effect.name,
            timestamp: Date.now()
          })
        }

        // 尝试生成视频
        if (out.videoPrompt) {
          sendStatus(t('engine.submitComfy'))
          const settings = settingsStore!.get()
          const gen = await comfyExecutor!.generate(out.videoPrompt, {
            referenceImagePath: settings.referenceImagePath
          })
          sendStatus(gen.message)
          await writeSelfFeedback({ type: 'system', text: gen.message, timestamp: Date.now() })
        } else {
          // 没有视频提示词也要给用户明确反馈，禁止静默成功
          sendStatus(t('engine.turnDone'))
        }
      } else if (!result.ok) {
        sendStatus(t('engine.error', { msg: result.message }))
      }
      return result
    } catch (error: any) {
      // 任何异常都必须转成可见的错误结果，不能让渲染层拿到 rejected promise 静默失败
      const msg = String(error?.message || error)
      sendStatus(t('engine.error', { msg }))
      return { ok: false, message: msg }
    }
  })
  ipcMain.handle('engine:reset', async () => {
    await aiEngine!.reset()
    comfyExecutor!.reset()
    return { ok: true, message: t('engine.reset') }
  })
  ipcMain.handle('engine:list-models', async () => {
    return aiEngine!.listModels()
  })
  ipcMain.handle('engine:get-history', () => {
    return { ok: true, history: aiEngine!.getHistory() }
  })
  ipcMain.handle('comfy:test', async () => {
    const settings = settingsStore!.get()
    if (!settings.comfyUrl) return { ok: false, message: t('engine.noComfyUrl') }
    try {
      const response = await fetch(settings.comfyUrl.replace(/\/+$/, '') + '/system_stats', {
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) return { ok: false, message: t('engine.comfyHttp', { status: response.status }) }
      return { ok: true, message: t('engine.comfyConnected') }
    } catch (error: any) {
      return { ok: false, message: t('engine.comfyConnectFail', { msg: String(error?.message || error) }) }
    }
  })
  ipcMain.handle('app:open-path', async (_event, target: string) => {
    if (target) await shell.openPath(target)
  })
}

async function writeSelfFeedback(event: {
  type: 'danmaku' | 'effect' | 'system'
  text: string
  user?: string
  effect?: string
  timestamp: number
}): Promise<void> {
  if (!mainWindow) return
  mainWindow.webContents.send('feedback:event', {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...event
  } as FeedbackEventPayload)
}

app.whenReady().then(async () => {
  settingsStore = new SettingsStore()
  const settings = await settingsStore.load()
  streamServer = new StreamServer()
  await streamServer.start(settings.streamsDir)
  aiEngine = new AiEngine(() => settingsStore!.get())
  comfyExecutor = new ComfyExecutor(() => settingsStore!.get())
  feedbackWatcher = new FeedbackWatcher()
  await feedbackWatcher.start(settings.feedbackDir)

  registerIpc()

  streamServer.onFilesChanged((videos) => {
    if (mainWindow) {
      mainWindow.webContents.send('stream:files-changed', {
        videos,
        baseUrl: streamServer!.getBaseUrl()
      } satisfies StreamEventPayload)
    }
  })

  feedbackWatcher.onFeedback((event: FeedbackEventPayload) => {
    if (mainWindow) {
      mainWindow.webContents.send('feedback:event', event)
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void streamServer?.stop()
  void feedbackWatcher?.stop()
})