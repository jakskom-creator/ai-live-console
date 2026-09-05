import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AppSettings,
  FeedbackEventPayload,
  EngineResult,
  StreamEventPayload,
  VideoFile
} from '../shared/types'

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:set', patch),
  chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke('settings:choose-dir'),
  chooseReferenceImage: (): Promise<string | null> => ipcRenderer.invoke('project:choose-reference-image'),
  chooseWorkflow: (): Promise<string | null> => ipcRenderer.invoke('project:choose-workflow'),
  getStreamState: (): Promise<StreamEventPayload> => ipcRenderer.invoke('stream:get-state'),
  refreshStream: (): Promise<boolean> => ipcRenderer.invoke('stream:refresh'),
  // 内置 AI 引擎
  testEngine: (): Promise<EngineResult> => ipcRenderer.invoke('engine:test'),
  getEngineState: (): Promise<{ state: string; profile: { name: string; persona: string; appearance: string; scene: string } | null; clothingState: import('../shared/types').ClothingState }> =>
    ipcRenderer.invoke('engine:get-state'),
  listEngineModels: (): Promise<EngineResult & { models?: Array<{ id: string; name?: string }> }> =>
    ipcRenderer.invoke('engine:list-models'),
  getEngineHistory: (): Promise<{ ok: boolean; history: Array<{ role: string; content: string }> }> =>
    ipcRenderer.invoke('engine:get-history'),
  initEngine: (): Promise<EngineResult> => ipcRenderer.invoke('engine:init'),
  interact: (text: string): Promise<EngineResult> => ipcRenderer.invoke('engine:interact', text),
  resetEngine: (): Promise<EngineResult> => ipcRenderer.invoke('engine:reset'),
  // ComfyUI
  testComfy: (): Promise<EngineResult> => ipcRenderer.invoke('comfy:test'),
  // AI 工作流适配
  analyzeWorkflow: (): Promise<EngineResult & { mapping?: import('../shared/types').WorkflowMapping }> =>
    ipcRenderer.invoke('workflow:analyze'),
  clearWorkflowMapping: (): Promise<EngineResult> => ipcRenderer.invoke('workflow:clear-mapping'),
  openPath: (path: string): Promise<void> => ipcRenderer.invoke('app:open-path', path),
  onFilesChanged: (callback: (payload: StreamEventPayload) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: StreamEventPayload): void => callback(payload)
    ipcRenderer.on('stream:files-changed', listener)
    return () => ipcRenderer.removeListener('stream:files-changed', listener)
  },
  onFeedbackEvent: (callback: (event: FeedbackEventPayload) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, event: FeedbackEventPayload): void => callback(event)
    ipcRenderer.on('feedback:event', listener)
    return () => ipcRenderer.removeListener('feedback:event', listener)
  },
  onEngineStatus: (callback: (status: { text: string }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, status: { text: string }): void => callback(status)
    ipcRenderer.on('engine:status', listener)
    return () => ipcRenderer.removeListener('engine:status', listener)
  },
  onConversation: (callback: (entry: { role: string; content: string; time: number }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, entry: { role: string; content: string; time: number }): void =>
      callback(entry)
    ipcRenderer.on('engine:conversation', listener)
    return () => ipcRenderer.removeListener('engine:conversation', listener)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: Api
  }
}

export type { VideoFile }