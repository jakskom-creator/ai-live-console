import { EventEmitter } from 'node:events'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream, promises as fs, type Stats } from 'node:fs'
import { basename, join, extname } from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { VideoFile } from '../shared/types'

export class StreamServer {
  private server: Server | null = null
  private watcher: FSWatcher | null = null
  private port = 0
  private dir = ''
  private videos: VideoFile[] = []
  private emitter = new EventEmitter()

  async start(dir: string): Promise<void> {
    this.dir = dir
    await this.scan()
    this.server = createServer((req, res) => void this.handle(req, res))
    await new Promise<void>((resolve) => {
      this.server!.listen(0, '127.0.0.1', () => {
        const address = this.server!.address()
        this.port = typeof address === 'object' && address ? address.port : 0
        resolve()
      })
    })
    this.watch()
  }

  async setDirectory(dir: string): Promise<void> {
    this.dir = dir
    await this.scan()
    this.watch()
  }

  async refresh(): Promise<void> {
    await this.scan()
  }

  getBaseUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  getVideos(): VideoFile[] {
    return [...this.videos]
  }

  onFilesChanged(listener: (videos: VideoFile[]) => void): () => void {
    this.emitter.on('files-changed', listener)
    return () => this.emitter.off('files-changed', listener)
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()))
      this.server = null
    }
  }

  private async scan(): Promise<void> {
    if (!this.dir) {
      this.videos = []
      this.emitter.emit('files-changed', this.videos)
      return
    }
    try {
      await fs.mkdir(this.dir, { recursive: true })
    } catch {
      // directory may be unavailable; keep empty list
    }
    let entries
    try {
      entries = await fs.readdir(this.dir, { withFileTypes: true })
    } catch {
      this.videos = []
      this.emitter.emit('files-changed', this.videos)
      return
    }

    const files: VideoFile[] = []
    for (const entry of entries) {
      if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.mp4') continue
      const full = join(this.dir, entry.name)
      let stats: Stats
      try {
        stats = await fs.stat(full)
      } catch {
        continue
      }
      files.push({
        name: entry.name,
        url: `/video/${encodeURIComponent(entry.name)}`,
        size: stats.size,
        mtime: stats.mtimeMs
      })
    }
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    this.videos = files
    this.emitter.emit('files-changed', this.videos)
  }

  private watch(): void {
    void this.watcher?.close()
    if (!this.dir) return
    this.watcher = chokidar.watch(this.dir, {
      ignoreInitial: true,
      depth: 0,
      awaitWriteFinish: {
        stabilityThreshold: 1200,
        pollInterval: 200
      }
    })
    const refresh = (): void => {
      void this.scan()
    }
    this.watcher.on('add', refresh)
    this.watcher.on('change', refresh)
    this.watcher.on('unlink', refresh)
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type')
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)

      if (url.pathname === '/api/videos') {
        this.sendJson(res, 200, { videos: this.videos })
        return
      }

      if (url.pathname.startsWith('/video/')) {
        const rawName = decodeURIComponent(url.pathname.slice('/video/'.length))
        const fileName = basename(rawName)
        if (!fileName.toLowerCase().endsWith('.mp4')) {
          this.sendJson(res, 400, { error: 'invalid file' })
          return
        }
        const filePath = join(this.dir, fileName)
        let stats: Stats
        try {
          stats = await fs.stat(filePath)
        } catch {
          this.sendJson(res, 404, { error: 'not found' })
          return
        }
        this.serveVideo(req, res, filePath, stats.size)
        return
      }

      this.sendJson(res, 404, { error: 'not found' })
    } catch (error) {
      this.sendJson(res, 500, { error: String(error) })
    }
  }

  private serveVideo(req: IncomingMessage, res: ServerResponse, filePath: string, size: number): void {
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'no-store')

    const range = req.headers.range
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range)
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0
        const end = match[2] ? parseInt(match[2], 10) : size - 1
        if (start >= 0 && end >= start && start < size) {
          const actualEnd = Math.min(end, size - 1)
          res.statusCode = 206
          res.setHeader('Content-Range', `bytes ${start}-${actualEnd}/${size}`)
          res.setHeader('Content-Length', String(actualEnd - start + 1))
          if (req.method === 'HEAD') {
            res.end()
            return
          }
          createReadStream(filePath, { start, end: actualEnd }).pipe(res)
          return
        }
      }
    }

    res.statusCode = 200
    res.setHeader('Content-Length', String(size))
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(filePath).pipe(res)
  }

  private sendJson(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body)
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Length', Buffer.byteLength(payload))
    res.end(payload)
  }
}
