import { promises as fs } from 'node:fs'
import type { AppSettings, ClothingState, DirectorTurnOutput, EngineResult } from '../shared/types'
import { EMPTY_CLOTHING_STATE } from '../shared/types'
import { buildSystemPrompt } from './liveDirectorSkill'

/**
 * 内置 AI 直播导演引擎。
 * 完全脱离 DeepSeek Harness，通过 OpenAI 兼容 API（base_url + api_key + model）
 * 在 Electron 主进程内直接对话。每次用户互动，引擎输出结构化的
 * DirectorTurnOutput（弹幕/特效/视频提示词/状态），由主进程脚本解析执行。
 */
export class AiEngine {
  private profile: { name: string; persona: string; appearance: string; scene: string } | null = null
  private history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  private lastState = '开场，坐在摄像头前准备开始直播'
  /** 主播状态系统：结构化五区衣物/身体状态，每回合由 AI 输出更新 */
  private clothingState: ClothingState = { ...EMPTY_CLOTHING_STATE }

  constructor(private readonly getSettings: () => AppSettings) {}

  getProfile() {
    return this.profile
  }

  hasProfile(): boolean {
    return this.profile !== null
  }

  /** 获取主播状态系统当前值（导演面板/状态栏展示用） */
  getClothingState(): ClothingState {
    return { ...this.clothingState }
  }

  async reset(): Promise<void> {
    this.profile = null
    this.history = []
    this.lastState = '开场，坐在摄像头前准备开始直播'
    this.clothingState = { ...EMPTY_CLOTHING_STATE }
  }

  /**
   * 首次开播：读取参考图/文字描述，生成并锁定主播角色卡。
   */
  async initProfile(): Promise<EngineResult> {
    const settings = this.getSettings()
    const appearance = await this.buildAppearanceText(settings)
    const personalityDefault = '请随机生成一个自然、有直播感的性格'
    const prompt = `这是本次虚拟直播的开播初始化。请基于以下主播外貌信息，生成一句主播角色设定（不要任何格式符号，直接一句话）：
外观：${appearance}
性格：${settings.personality || personalityDefault}
内容模式：全年龄通用
额外要求：${settings.extraRequirements || '无'}
请输出格式：主播名：xxx；外貌：xxx；直播间场景：xxx；人设：xxx；说话风格：xxx`
    const text = await this.chatOnce(prompt)
    if (!text) return { ok: false, message: 'AI 引擎未能生成主播角色卡' }
    this.profile = this.parseProfile(text)
    this.lastState = '开场，坐在摄像头前准备开始直播'
    return { ok: true, message: `主播角色卡已生成：${this.profile.name}` }
  }

  /**
   * 处理一次用户互动，返回结构化指令供脚本执行。
   */
  async handleInteraction(userInput: string): Promise<EngineResult & { output?: DirectorTurnOutput; rawOutput?: string }> {
    const user = this.formatUserTurn(userInput)
    // 先调用再写历史：失败的回合不能在 history 里留下孤儿 user 消息，
    // 否则用户每重试一次就多积一条，上下文越滚越大，最终每次请求都超时。
    let response: string
    try {
      response = await this.chatOnce(user)
    } catch (error: any) {
      return { ok: false, message: String(error?.message || error) }
    }
    if (!response || !response.trim()) {
      return {
        ok: false,
        message: 'AI 引擎返回了空回复（可能触发内容过滤或模型过载），请稍后重试'
      }
    }
    this.history.push({ role: 'user', content: userInput })
    this.history.push({ role: 'assistant', content: response })

    const output = this.parseTurnOutput(response)
    this.lastState = output.nextState || this.lastState
    // 主播状态系统：合并 LLM 本回合更新的五区衣物/身体状态（空字段保留上一回合值）
    this.clothingState = this.mergeClothingState(this.clothingState, output.clothingState)
    return { ok: true, message: output.system || '已生成', output, rawOutput: response }
  }

  /** 合并 AI 输出的衣物状态：仅当字段非空时才覆盖，避免 AI 漏填导致状态被清空 */
  private mergeClothingState(prev: ClothingState, next: ClothingState): ClothingState {
    return {
      head: typeof next?.head === 'string' && next.head.trim() !== '' ? next.head : prev.head,
      upper: typeof next?.upper === 'string' && next.upper.trim() !== '' ? next.upper : prev.upper,
      lower: typeof next?.lower === 'string' && next.lower.trim() !== '' ? next.lower : prev.lower,
      legs: typeof next?.legs === 'string' && next.legs.trim() !== '' ? next.legs : prev.legs,
      note: typeof next?.note === 'string' && next.note.trim() !== '' ? next.note : prev.note
    }
  }

  /** 获取完整对话历史（用于后台日志展示） */
  getHistory(): Array<{ role: string; content: string }> {
    return this.history.map((h) => ({ ...h }))
  }

  /** 获取 OBS/显示用的当前主播状态文本（用于导演面板） */
  getLastState(): string {
    return this.lastState
  }

  /**
   * 获取该 API 后端支持的所有模型列表（调用 /models）。
   */
  async listModels(): Promise<EngineResult & { models?: Array<{ id: string; name?: string }> }> {
    const settings = this.getSettings()
    if (!settings.apiBaseUrl) return { ok: false, message: '未配置 AI 引擎 API 地址' }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)
      const res = await fetch(`${settings.apiBaseUrl.replace(/\/+$/, '')}/models`, {
        headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {},
        signal: controller.signal
      })
      clearTimeout(timer)
      if (!res.ok) {
        return { ok: false, message: `获取模型列表失败：HTTP ${res.status}` }
      }
      const json: any = await res.json().catch(() => ({}))
      const models = Array.isArray(json?.data)
        ? json.data.map((m: any) => ({ id: String(m?.id || ''), name: String(m?.id || '') })).filter((m: any) => m.id)
        : []
      return { ok: true, message: `发现 ${models.length} 个模型`, models }
    } catch (error: any) {
      return {
        ok: false,
        message: error?.name === 'AbortError' ? '获取模型列表超时' : `获取模型列表失败：${String(error?.message || error)}`
      }
    }
  }

  private async buildAppearanceText(settings: AppSettings): Promise<string> {
    if (settings.referenceMode === 'description') {
      return settings.referenceDescription || '（未提供文字描述）'
    }
    // 多模态模式但引擎只能看文本：优先尝试把参考图作为 base64 附件发送（取决于模型）
    // 为了兼容纯文本模型，这里提供占位描述并提示引擎，若模型支持多模态可后续扩展。
    if (settings.referenceImagePath) {
      try {
        const buf = await fs.readFile(settings.referenceImagePath)
        return `参考图已提供（文件名：${settings.referenceImagePath.split(/[\\/]/).pop()}，大小 ${buf.length} 字节）。若本模型支持图片，可直接分析该图；否则请基于文件名和常识推断主播外观。`
      } catch {
        return '（参考图文件读取失败）'
      }
    }
    return '（未提供参考图）'
  }

  private async chatOnce(systemAndUser: string): Promise<string> {
    const settings = this.getSettings()
    if (!settings.apiBaseUrl || !settings.model) {
      throw new Error('未配置 AI 引擎的 API 地址或模型')
    }
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: this.buildContextualSystemPrompt() },
      // 只携带最近 16 条历史（约 8 个回合），防止长直播时上下文无限膨胀
      // 导致请求越来越慢直至必然超时；系统提示词每回合都会重建，含最新状态。
      ...this.history.slice(-16).map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: systemAndUser }
    ]
    const controller = new AbortController()
    // 大上下文 + 长视频提示词生成耗时较长，180s 起步，避免正常回合被误杀
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
          messages,
          temperature: 0.8
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
      if (error?.name === 'AbortError') throw new Error('AI 引擎请求超时（180 秒无响应，请检查 API 服务或稍后重试）')
      throw new Error(`AI 引擎调用失败：${String(error?.message || error)}`)
    } finally {
      clearTimeout(timer)
    }
  }

  private formatUserTurn(input: string): string {
    return `【观众互动】${input}\n\n请按系统指令输出本回合的 JSON 结构化结果。`
  }

  /**
   * 在基础导演系统提示词之上，注入当前主播角色卡（含外貌/人设/场景），
   * 保证每一段 videoPrompt 都围绕同一位主播的外貌与描述展开，而不是凭空生成。
   */
  private buildContextualSystemPrompt(): string {
    const base = buildSystemPrompt()
    const p = this.profile
    if (!p) return base
    const parts = [
      base,
      '',
      '## 当前主播角色卡（每条视频提示词必须严格遵守，禁止偏离）',
      `主播名：${p.name || '（未命名）'}`
    ]
    if (p.appearance) parts.push(`外貌：${p.appearance}`)
    if (p.persona) parts.push(`人设：${p.persona}`)
    if (p.scene) parts.push(`直播间场景：${p.scene}`)
    parts.push(
      '在 videoPrompt 的 subject_definitions / detailed_description 中，必须始终以这段角色卡描述该主播的外貌、服饰、发型、身材与直播间布景，保持连续一致，不得换成无关人物。'
    )
    parts.push('', '## 主播状态系统（权威参考 · 必须严格遵守，防衣物回穿）')
    parts.push(
      '以下为主播当前五区衣物/身体状态，由状态系统维护。每段 videoPrompt 的 subject_definitions 中' +
        '「当前实际穿着」必须逐字采用下列各区状态，禁止回到参考图原装、禁止回到历史旧状态、' +
        '禁止凭空增减衣物。'
    )
    parts.push(`- 头颈区：${this.clothingState.head || '（初始装扮，以参考图/外貌描述为准）'}`)
    parts.push(`- 上躯干区：${this.clothingState.upper || '（初始装扮，以参考图/外貌描述为准）'}`)
    parts.push(`- 下躯干区：${this.clothingState.lower || '（初始装扮，以参考图/外貌描述为准）'}`)
    parts.push(`- 腿足区：${this.clothingState.legs || '（初始装扮，以参考图/外貌描述为准）'}`)
    parts.push(`- 状态备注：${this.clothingState.note || '（无）'}`)
    parts.push(
      '规则：已标记为「已脱/absent」的衣物绝对禁止在后续任何段落复现；本段结束时若衣物/身体状态' +
        '发生变化，必须在输出的 clothingState 字段中完整更新五区（本回合没有变化也要原样回填当前状态）。'
    )
    return parts.join('\n')
  }

  private parseProfile(text: string): { name: string; persona: string; appearance: string; scene: string } {
    const pick = (key: string): string => {
      const m = new RegExp(`${key}[:：]\\s*([^；;。]+)`).exec(text)
      return m ? m[1].trim() : ''
    }
    return {
      name: pick('主播名') || '虚拟主播',
      persona: pick('人设') || '自然聊天型',
      appearance: pick('外貌') || '',
      scene: pick('直播间场景') || '温馨直播间'
    }
  }

  /**
   * 从模型输出中提取 JSON。模型可能混入 ```json 代码块或前后说明文字。
   */
  private parseTurnOutput(raw: string): DirectorTurnOutput {
    const jsonStr = this.extractJson(raw)
    let obj: any
    try {
      obj = JSON.parse(jsonStr)
    } catch {
      // 无法解析 JSON 时，退化为纯文本输出
      return {
        line: raw.trim().slice(0, 100),
        danmaku: [],
        videoPrompt: raw.trim(),
        nextState: this.lastState,
        clothingState: { ...this.clothingState },
        system: '模型未返回结构化 JSON，已降级为纯文本'
      }
    }
    const danmaku = Array.isArray(obj?.danmaku)
      ? obj.danmaku.map((d: any) => ({
          user: String(d?.user || '观众'),
          text: String(d?.text || '')
        }))
      : []
    const cs = obj?.clothingState
    return {
      line: String(obj?.line || ''),
      danmaku,
      effect: obj?.effect
        ? {
            name: String(obj.effect.name || '特效'),
            emoji: String(obj.effect.emoji || '✨'),
            level: String(obj.effect.level || '礼物')
          }
        : undefined,
      videoPrompt: String(obj?.videoPrompt || ''),
      nextState: String(obj?.nextState || this.lastState),
      clothingState: {
        head: String(cs?.head || ''),
        upper: String(cs?.upper || ''),
        lower: String(cs?.lower || ''),
        legs: String(cs?.legs || ''),
        note: String(cs?.note || '')
      },
      system: String(obj?.system || '')
    }
  }

  private extractJson(raw: string): string {
    const trimmed = raw.trim()
    // 去掉 ```json ... ``` 包裹
    const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed)
    if (fence) return fence[1].trim()
    // 找到第一个 { 到最后一个 }
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
    return trimmed
  }
}