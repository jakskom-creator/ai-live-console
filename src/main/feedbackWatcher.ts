import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import { basename, join, extname } from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { FeedbackEvent, FeedbackEventPayload } from '../shared/types'

const VALID_TYPES = new Set(['danmaku', 'effect', 'system'])

export class FeedbackWatcher {
  private watcher: FSWatcher | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private dir = ''
  private emitter = new EventEmitter()
  private processing = new Set<string>()

  async start(dir: string): Promise<void> {
    this.dir = dir
    try {
      await fs.mkdir(dir, { recursive: true })
    } catch {
      // ignore
    }
    await this.scanExisting()
    this.watch()
    this.startPolling()
  }

  async setDirectory(dir: string): Promise<void> {
    this.dir = dir
    try {
      await fs.mkdir(dir, { recursive: true })
    } catch {
      // ignore
    }
    await this.scanExisting()
    this.watch()
    this.startPolling()
  }

  onFeedback(listener: (event: FeedbackEventPayload) => void): () => void {
    this.emitter.on('feedback', listener)
    return () => this.emitter.off('feedback', listener)
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }

  private startPolling(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => {
      void this.scanExisting()
    }, 1500)
  }

  private async scanExisting(): Promise<void> {
    if (!this.dir) return
    let entries
    try {
      entries = await fs.readdir(this.dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isFile() && extname(entry.name).toLowerCase() === '.json') {
        await this.processFile(join(this.dir, entry.name))
      }
    }
  }

  private watch(): void {
    void this.watcher?.close()
    if (!this.dir) return
    this.watcher = chokidar.watch(this.dir, {
      ignoreInitial: true,
      depth: 0,
      awaitWriteFinish: {
        stabilityThreshold: 600,
        pollInterval: 150
      }
    })
    const onFile = (file: string): void => {
      if (extname(file).toLowerCase() === '.json') {
        void this.processFile(file)
      }
    }
    this.watcher.on('add', onFile)
    this.watcher.on('change', onFile)
  }

  private async processFile(file: string): Promise<void> {
    if (this.processing.has(file)) return
    this.processing.add(file)
    try {
      const raw = await fs.readFile(file, 'utf8')
      const parsed = JSON.parse(raw) as Partial<FeedbackEvent>
      if (!parsed || !VALID_TYPES.has(parsed.type || '')) return
      const event: FeedbackEventPayload = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${basename(file)}`,
        type: parsed.type as FeedbackEvent['type'],
        text: String(parsed.text || ''),
        user: parsed.user,
        effect: parsed.effect,
        timestamp: Number(parsed.timestamp || Date.now())
      }
      this.emitter.emit('feedback', event)
      await fs.unlink(file).catch(() => undefined)
    } catch {
      // ignore invalid / partially written files
    } finally {
      this.processing.delete(file)
    }
  }
}
