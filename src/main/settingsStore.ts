import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings } from '../shared/types'

const DEFAULTS: AppSettings = {
  streamsDir: '',
  feedbackDir: join(app.getPath('userData'), 'ai-live-feedback'),
  autoSend: true,
  referenceImagePath: '',
  referenceMode: 'image',
  referenceDescription: '',
  personality: '',
  extraRequirements: '',
  // OpenAI 兼容 API
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
  // ComfyUI
  comfyUrl: 'http://127.0.0.1:8188',
  workflowPath: '',
  resolution: '0.4MP',
  steps: 6,
  durationSec: 10
}

export class SettingsStore {
  private file: string
  private data: AppSettings = { ...DEFAULTS }

  constructor() {
    this.file = join(app.getPath('userData'), 'ai-live-console-settings.json')
  }

  async load(): Promise<AppSettings> {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      this.data = { ...DEFAULTS, ...parsed }
      if (!this.data.feedbackDir) {
        this.data.feedbackDir = DEFAULTS.feedbackDir
      }
    } catch {
      this.data = { ...DEFAULTS }
    }
    return this.get()
  }

  get(): AppSettings {
    return { ...this.data }
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.data = { ...this.data, ...patch }
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    await fs.writeFile(this.file, JSON.stringify(this.data, null, 2), 'utf8')
    return this.get()
  }
}