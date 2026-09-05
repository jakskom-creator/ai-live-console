import { promises as fs } from 'node:fs'
import type { AppSettings, WorkflowFieldRef, WorkflowMapping } from '../shared/types'
import { tr, type Lang } from '../shared/i18n'

export interface AnalyzeResult {
  ok: boolean
  message: string
  mapping?: WorkflowMapping
}

/** 按点号路径从节点对象取值（支持数字下标，如 "inputs.widgets_values.0"） */
function getByPath(obj: any, path: string): any {
  let cur = obj
  for (const seg of path.split('.')) {
    if (cur == null) return undefined
    const key = /^\d+$/.test(seg) ? Number(seg) : seg
    cur = cur[key]
  }
  return cur
}

/** 按点号路径给节点对象赋值（支持数字下标） */
function setByPath(obj: any, path: string, value: unknown): boolean {
  const segs = path.split('.')
  let cur = obj
  for (let i = 0; i < segs.length - 1; i++) {
    if (cur == null || typeof cur !== 'object') return false
    const seg = segs[i]
    const key = /^\d+$/.test(seg) ? Number(seg) : seg
    if (cur[key] == null) cur[key] = {}
    cur = cur[key]
  }
  if (cur == null || typeof cur !== 'object') return false
  const last = segs[segs.length - 1]
  const key = /^\d+$/.test(last) ? Number(last) : last
  cur[key] = value
  return true
}

/** 校验 AI 返回的映射：nodeId 必须真实存在于工作流，field 必须可写 */
function sanitizeMapping(raw: any, workflow: any): WorkflowMapping {
  const valid = (ref: any): WorkflowFieldRef | undefined => {
    if (!ref || typeof ref !== 'object') return undefined
    const nodeId = String(ref?.nodeId ?? '')
    const field = String(ref?.field ?? '')
    if (!nodeId || !field) return undefined
    const node = workflow[nodeId]
    if (!node || typeof node !== 'object') return undefined
    // 字段路径至少存在一半（目标父级存在即可写，值本身可为空）
    const segs = field.split('.')
    const parentPath = segs.slice(0, -1).join('.')
    if (parentPath) {
      const parent = getByPath(node, parentPath)
      if (parent == null || typeof parent !== 'object') return undefined
    }
    return { nodeId, field }
  }
  return {
    prompt: valid(raw?.prompt),
    image: valid(raw?.image),
    resolution: valid(raw?.resolution),
    duration: valid(raw?.duration),
    steps: valid(raw?.steps),
    motionLoad: valid(raw?.motionLoad),
    motionSave: valid(raw?.motionSave),
    notes: typeof raw?.notes === 'string' ? raw.notes.slice(0, 500) : undefined
  }
}

/**
 * 内置「AI 工作流适配器」。
 * 把 ComfyUI 工作流 JSON 的结构描述发给 LLM，让模型识别出：
 * 提示词节点、参考图节点、分辨率/时长/步数参数、Motion Context 链，
 * 返回 WorkflowMapping（节点 ID + 字段路径），此后每段生成按映射填值。
 */
export class WorkflowAdapter {
  constructor(private readonly getSettings: () => AppSettings) {}

  private lang(): Lang {
    return this.getSettings().language === 'en' ? 'en' : 'zh'
  }

  private t(key: string, vars?: Record<string, string | number>): string {
    return tr(this.lang(), key, vars)
  }

  /** 读取工作流（兼容 { prompt: {...} } 包裹的 API 格式） */
  async readWorkflow(path: string): Promise<any> {
    const raw = await fs.readFile(path, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed?.prompt && typeof parsed.prompt === 'object') return parsed.prompt
    if (parsed && typeof parsed === 'object') return parsed
    throw new Error(this.lang() === 'en' ? 'Workflow format not recognized' : '工作流格式无法识别')
  }

  /** 生成工作流的精简结构描述（去掉 _meta，保留 inputs 全部字段，减少 token 又保留判断信息） */
  private describeWorkflow(workflow: any): string {
    const desc: Record<string, any> = {}
    for (const key of Object.keys(workflow)) {
      const node = workflow[key]
      if (!node || typeof node !== 'object') continue
      const inputs: Record<string, unknown> = {}
      if (node.inputs && typeof node.inputs === 'object') {
        for (const ik of Object.keys(node.inputs)) {
          const v = node.inputs[ik]
          // 数组引用 [nodeId, slot] 是连接，用字符串表达；标量值保留类型
          if (Array.isArray(v)) inputs[ik] = `[link ${String(v[0])} #${String(v[1])}]`
          else inputs[ik] = typeof v === 'string' ? `"${v.length > 40 ? v.slice(0, 40) + '…' : v}"` : v
        }
      }
      desc[key] = {
        class_type: String(node.class_type ?? ''),
        title: String(node._meta?.title ?? ''),
        inputs
      }
    }
    return JSON.stringify(desc)
  }

  private buildPrompt(workflowJson: string, lang: Lang): string {
    const zh = `你是一个 ComfyUI 工作流适配专家。下面是一份 ComfyUI 工作流（API 格式）的结构描述：
每个节点的 inputs 里，形如 [link 节点ID #端口] 的值是节点连接，标量值（数字/字符串）才是可直接填写的参数。

请仔细分析并找出以下「可写入参数」的位置，输出一个 JSON（不要任何其它文字、不要 markdown 代码块）：

{
  "prompt":     { "nodeId": "...", "field": "..." },    // 视频提示词应写入的节点与字段（通常是 MiniMaxH3ReferenceToVideo / CLIPTextEncode 的 inputs.prompt 或 widgets_values 字符串）
  "image":      { "nodeId": "...", "field": "..." },    // 主播参考图文件名应写入的位置（LoadImage 的 inputs.image）
  "resolution": { "nodeId": "...", "field": "..." },    // 分辨率参数（ResolutionSelector 的 inputs.megapixels；或 width/height 输入节点）
  "duration":   { "nodeId": "...", "field": "..." },    // 每段时长（秒）参数（PrimitiveFloat 的 inputs.value，或标题含 Duration/Second/时长 的节点）
  "steps":      { "nodeId": "...", "field": "..." },    // 采样步数（BasicScheduler / KSampler 的 inputs.steps）
  "motionLoad": { "nodeId": "...", "field": "..." },    // Motion Context Load Latent 的 clip_index（没有则省略）
  "motionSave": { "nodeId": "...", "field": "..." },    // Motion Context Save Latent 的 clip_index（没有则省略）
  "notes": "一句话说明你找到了什么"
}

规则：
- nodeId 必须是工作流中真实存在的节点 key；field 必须是该节点 inputs 下真实存在的字段（或 widgets_values 数字下标，如 "inputs.widgets_values.0"）
- 只选择「标量值」字段，不要选连接引用字段；找不到的项就省略该 key，不要编造
- 如果某项找不到，宁缺毋滥，省略即可`

    const en = `You are a ComfyUI workflow adaptation expert. Below is the structural description of a ComfyUI workflow (API format):
In each node's inputs, values shaped like [link NODE_ID #SLOT] are node connections; scalar values (numbers/strings) are the only writable parameters.

Analyze carefully and locate the following writable parameters, then output a JSON (nothing else, no markdown code blocks):

{
  "prompt":     { "nodeId": "...", "field": "..." },    // where the video prompt goes (usually MiniMaxH3ReferenceToVideo / CLIPTextEncode inputs.prompt, or a widgets_values string)
  "image":      { "nodeId": "...", "field": "..." },    // where the streamer reference image filename goes (LoadImage inputs.image)
  "resolution": { "nodeId": "...", "field": "..." },    // resolution param (ResolutionSelector inputs.megapixels, or width/height input node)
  "duration":   { "nodeId": "...", "field": "..." },    // per-segment duration in seconds (PrimitiveFloat inputs.value, or a node titled Duration/Second)
  "steps":      { "nodeId": "...", "field": "..." },    // sampling steps (BasicScheduler / KSampler inputs.steps)
  "motionLoad": { "nodeId": "...", "field": "..." },    // Motion Context Load Latent clip_index (omit if absent)
  "motionSave": { "nodeId": "...", "field": "..." },    // Motion Context Save Latent clip_index (omit if absent)
  "notes": "one sentence explaining what you found"
}

Rules:
- nodeId must be a real node key in the workflow; field must be a real scalar field under that node's inputs (or a widgets_values numeric index like "inputs.widgets_values.0")
- Only choose scalar fields, never link-reference fields; omit keys you cannot find, never invent them
- Better to omit than to invent`

    return lang === 'en' ? en : zh
  }

  private async chatOnce(systemAndUser: string): Promise<string> {
    const settings = this.getSettings()
    if (!settings.apiBaseUrl || !settings.model) {
      throw new Error(this.t('engine.noApiConfig'))
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 180000)
    try {
      const response = await fetch(`${settings.apiBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [{ role: 'user', content: systemAndUser }],
          temperature: 0.2
        }),
        signal: controller.signal
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`API HTTP ${response.status}: ${text.slice(0, 200)}`)
      }
      const json = await response.json()
      const content = json?.choices?.[0]?.message?.content
      return typeof content === 'string' ? content : ''
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new Error(this.t('engine.timeout180'))
      throw new Error(this.t('engine.callFail', { msg: String(error?.message || error) }))
    } finally {
      clearTimeout(timer)
    }
  }

  private extractJson(raw: string): string {
    const trimmed = raw.trim()
    const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed)
    if (fence) return fence[1].trim()
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
    return trimmed
  }

  /** 调用 LLM 分析工作流，返回 WorkflowMapping */
  async analyze(workflowPath: string): Promise<AnalyzeResult> {
    try {
      const workflow = await this.readWorkflow(workflowPath)
      const description = this.describeWorkflow(workflow)
      const prompt = `${this.buildPrompt(description, this.lang())}

工作流结构描述：
${description}`
      const raw = await this.chatOnce(prompt)
      if (!raw.trim()) {
        return { ok: false, message: this.t('adapter.emptyReply') }
      }
      let obj: any
      try {
        obj = JSON.parse(this.extractJson(raw))
      } catch {
        return { ok: false, message: this.t('adapter.badJson') }
      }
      const mapping = sanitizeMapping(obj, workflow)
      const found = [mapping.prompt, mapping.image, mapping.resolution, mapping.duration, mapping.steps, mapping.motionLoad, mapping.motionSave].filter(Boolean).length
      if (found === 0) {
        return { ok: false, message: this.t('adapter.nothingFound') }
      }
      return { ok: true, message: this.t('adapter.found', { count: found }), mapping }
    } catch (error: any) {
      return { ok: false, message: String(error?.message || error) }
    }
  }

  /**
   * 按映射把参数填进工作流副本。
   * - prompt / image / resolution / duration / steps 直接按映射路径写入
   * - motionLoad.clip_index = max(0, segmentIndex)，motionSave.clip_index = segmentIndex + 1
   * 返回修改后的工作流（原地修改传入对象）。
   */
  applyMapping(
    workflow: any,
    mapping: WorkflowMapping,
    params: {
      prompt: string
      imageFileName?: string
      resolution?: string
      durationSec?: number
      steps?: number
      segmentIndex: number
    }
  ): void {
    const write = (ref: WorkflowFieldRef | undefined, value: unknown): boolean => {
      if (!ref) return false
      return setByPath(workflow[ref.nodeId], ref.field, value)
    }

    if (mapping.prompt && params.prompt) {
      write(mapping.prompt, params.prompt)
    }
    if (mapping.image && params.imageFileName) {
      write(mapping.image, params.imageFileName)
    }
    if (mapping.resolution && params.resolution) {
      // 兼容 "0.4MP" 或纯数字，也兼容 megapixels 字段
      const mp = /^(\d+(?:\.\d+)?)\s*MP$/i.exec(params.resolution)
      write(mapping.resolution, mp ? Number(mp[1]) : params.resolution)
    }
    if (mapping.duration && params.durationSec != null) {
      write(mapping.duration, params.durationSec)
    }
    if (mapping.steps && params.steps != null) {
      write(mapping.steps, params.steps)
    }
    // Motion Context 链：Load 上一段（首段 0），Save 当前段
    if (mapping.motionLoad) {
      write(mapping.motionLoad, Math.max(0, params.segmentIndex))
    }
    if (mapping.motionSave) {
      write(mapping.motionSave, params.segmentIndex + 1)
    }
  }
}
