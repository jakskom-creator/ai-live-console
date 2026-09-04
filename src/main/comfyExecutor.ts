import { promises as fs } from 'node:fs'
import { basename, join, extname } from 'node:path'
import type { AppSettings } from '../shared/types'

export interface ComfyResult {
  ok: boolean
  message: string
  fileName?: string
}

interface PromptNode {
  key: string
  node: any
}

/**
 * 内置 ComfyUI 执行器。
 * 读取用户提供的工作流 JSON，把 videoPrompt（视频提示词）填入工作流中的
 * 提示词节点，提交到 ComfyUI /prompt，轮询历史直到成片，再重命名到 streamsDir。
 *
 * 适配说明：
 * - 提示词节点：优先匹配 inputs.prompt 为字符串的节点（兼容 MiniMaxH3ReferenceToVideo
 *   等直接把 prompt 作为输入字段的节点），其次是 class_type 含
 *   Text/Prompt/CLIPTextEncode 的节点。
 * - 时长：查找 title 含 "Duration" / "秒" / "Second" 的 PrimitiveFloat 节点，设 value。
 * - 分辨率：查找 ResolutionSelector 节点，设 megapixels/aspect_ratio。
 * - 步数：查找 BasicScheduler / KSampler 等含 steps 的节点。
 * - MotionContext：LoadLatent 的 clip_index 设上一段，SaveLatent 设当前段。
 * - 参考图：只保留一张角色参考图——把 ref_image_0 指向的 LoadImage 替换为配置的
 *   参考图文件，并屏蔽/删除工作流中其它 ref_image_1/2… 参考图栏位。
 */
export class ComfyExecutor {
  private segmentIndex = 0

  constructor(private readonly getSettings: () => AppSettings) {}

  getNextSegmentIndex(): number {
    return this.segmentIndex + 1
  }

  reset(): void {
    this.segmentIndex = 0
  }

  async generate(
    videoPrompt: string,
    extra?: { referenceImagePath?: string }
  ): Promise<ComfyResult> {
    const settings = this.getSettings()
    if (!settings.comfyUrl) return { ok: false, message: '未配置 ComfyUI 地址' }
    if (!settings.workflowPath) return { ok: false, message: '未配置 ComfyUI 工作流 JSON' }

    // 读取工作流
    let workflow: any
    try {
      workflow = await this.readWorkflow(settings.workflowPath)
    } catch (error: any) {
      return { ok: false, message: `读取工作流失败：${String(error?.message || error)}` }
    }

    // 修改工作流：填提示词、参考图、画质、步数、时长
    try {
      // 先确保角色参考图被上传到 ComfyUI 的 input 目录（避免文件不在当前根目录导致参考图失效）
      await this.uploadReferenceImage(settings, extra?.referenceImagePath)
      this.applyWorkflowParams(workflow, videoPrompt, settings, extra?.referenceImagePath)
    } catch (error: any) {
      return { ok: false, message: `填充工作流参数失败：${String(error?.message || error)}` }
    }

    // 提交
    const promptId = await this.submit(workflow)
    if (!promptId) return { ok: false, message: 'ComfyUI 未返回任务 ID' }

    // 轮询等待成片
    const outputFile = await this.pollForOutput(promptId)
    if (!outputFile) return { ok: false, message: '轮询超时：未等到成片' }

    // 重命名到 streamsDir
    this.segmentIndex += 1
    const segName = `seg_${String(this.segmentIndex).padStart(3, '0')}.mp4`
    try {
      await this.copyToStreams(outputFile, segName)
    } catch (error: any) {
      return { ok: false, message: `复制成片失败：${String(error?.message || error)}` }
    }
    return { ok: true, message: `已生成 ${segName}`, fileName: segName }
  }

  private async readWorkflow(path: string): Promise<any> {
    const raw = await fs.readFile(path, 'utf8')
    const parsed = JSON.parse(raw)
    // 支持 { prompt: {...} } 包裹的 API 格式
    if (parsed?.prompt && typeof parsed.prompt === 'object') return parsed.prompt
    if (parsed && typeof parsed === 'object') return parsed
    throw new Error('工作流格式无法识别')
  }

  private applyWorkflowParams(
    workflow: any,
    prompt: string,
    settings: AppSettings,
    referenceImagePath?: string
  ): void {
    const keys = Object.keys(workflow)
    const nodes = keys.map((key) => ({ key, node: workflow[key] }))

    // 1. 找到提示词节点并写入提示词
    const promptNode = this.findPromptNode(nodes)
    if (!promptNode) {
      throw new Error('工作流中未找到可写入的提示词节点（未找到含 prompt 输入的节点）')
    }
    this.writePrompt(promptNode, prompt)

    // 2. 参考图：替换角色参考图并屏蔽多余参考图栏位
    if (referenceImagePath) {
      this.applyReferenceImage(workflow, nodes, referenceImagePath)
    }

    // 3. 时长：查找 Duration 节点（PrimitiveFloat）
    this.applyDuration(nodes, settings.durationSec)

    // 4. 分辨率：查找 ResolutionSelector
    this.applyResolution(nodes, settings.resolution)

    // 5. 步数：查找含 steps 的采样/调度节点
    this.applySteps(nodes, settings.steps)

    // 6. MotionContext：第一段绕行，后续段走完整链
    if (this.segmentIndex === 0) {
      this.bypassFirstSegment(workflow, nodes)
    } else {
      this.applyMotionContext(nodes, this.segmentIndex)
    }
  }

  /**
   * 第一段（seg_001）绕行 MotionContext：
   * - BasicGuider 的 conditioning 直接从 ReferenceToVideo 的 conditioning 输出接入（跳过 MotionContext）
   * - CreateVideo 的 images/audio 直接从 VAEDecode/VAEDecodeAudio 输出接入（跳过 MotionContextTrim）
   * - SamplerCustomAdvanced 的 latent_image 直接用 ReferenceToVideo 的 latent（跳过 MotionContext）
   * - 同时把 SaveLatent 的 clip_index 设为 1，让本段把自己的 latent 存成第一个上下文片段，
   *   供第二段 LoadLatent(clip_index=1) 加载，保证段与段之间的连续性（否则会读到旧的 clip_00001）。
   * 通过按 class_type 动态查找节点，兼容不同的节点 ID。
   */
  private bypassFirstSegment(workflow: any, nodes: PromptNode[]): void {
    const findNode = (regex: RegExp): PromptNode | undefined =>
      nodes.find(({ node }) => regex.test(String(node?.class_type || '')))

    const refToVideo = findNode(/ReferenceToVideo/i)
    const basicGuider = findNode(/BasicGuider/i)
    const vaeDecode = findNode(/VAEDecode$/i) || findNode(/^VAEDecode$/i)
    const vaeDecodeAudio = findNode(/VAEDecodeAudio/i)
    const createVideo = findNode(/CreateVideo/i)
    const saveLatent = findNode(/SaveLatent/i)

    if (refToVideo && basicGuider && basicGuider.node?.inputs) {
      // 跳过 MotionContext：conditioning 直接取自 ReferenceToVideo 输出 0
      basicGuider.node.inputs.conditioning = [refToVideo.key, 0]
    }

    if (createVideo && createVideo.node?.inputs) {
      if (vaeDecode && typeof createVideo.node.inputs.images !== 'undefined') {
        createVideo.node.inputs.images = [vaeDecode.key, 0]
      }
      if (vaeDecodeAudio && typeof createVideo.node.inputs.audio !== 'undefined') {
        createVideo.node.inputs.audio = [vaeDecodeAudio.key, 0]
      }
    }

    // 首段的 SamplerCustomAdvanced latent_image 用 ReferenceToVideo 的 latent（输出 1）
    const sampler = findNode(/SamplerCustomAdvanced/i)
    if (refToVideo && sampler && sampler.node?.inputs) {
      sampler.node.inputs.latent_image = [refToVideo.key, 1]
    }

    // 首段把自己的 latent 存为 clip 1（第二段会 LoadLatent clip 1），保证上下文连续
    if (saveLatent && typeof saveLatent.node?.inputs?.clip_index === 'number') {
      saveLatent.node.inputs.clip_index = 1
    }
  }

  /** 找到提示词节点：优先 inputs.prompt 为字符串的节点，其次 class_type 含 Text/Prompt 关键词 */
  private findPromptNode(nodes: PromptNode[]): PromptNode | null {
    // 第一优先级：inputs 里有字符串 prompt 字段
    const byPromptField = nodes.find(({ node }) => {
      const inputs = node?.inputs
      if (inputs && typeof inputs.prompt === 'string') return true
      return false
    })
    if (byPromptField) return byPromptField

    // 第二优先级：class_type 名称匹配
    const byClass = nodes.find(({ node }) => {
      const cls = String(node?.class_type || '')
      return /(CLIPTextEncode|Prompt|TextEncode|ReferenceToVideo|Conditioning)/i.test(cls)
    })
    return byClass || null
  }

  private writePrompt(promptNode: PromptNode, prompt: string): void {
    const inputs = promptNode.node?.inputs
    if (inputs && typeof inputs.prompt === 'string') {
      inputs.prompt = prompt
      return
    }
    // 回退：widgets_values 首字符串
    const widgets = inputs?.widgets_values
    if (Array.isArray(widgets)) {
      const idx = widgets.findIndex((w) => typeof w === 'string')
      if (idx >= 0) {
        widgets[idx] = prompt
        return
      }
      widgets.push(prompt)
      return
    }
    throw new Error('提示词节点结构无法写入')
  }

  /**
   * 屏蔽工作流中多余的参考图栏位，只保留一张角色参考图。
   *
   * 找到含 ref_images.ref_image_0 的节点（通常是 MiniMaxH3ReferenceToVideo），
   * 做两件事：
   * 1. 把 ref_image_0 指向的 LoadImage 替换为用户配置的角色参考图。
   * 2. 删除 ref_image_1、ref_image_2… 等其它参考图输入字段，并把它们曾指向的
   *    LoadImage 节点整体从工作流中移除（避免孤立的 LoadImage 不被引用）。
   *
   * 这样无论原工作流定义了几张参考图，运行时都只使用一张角色参考图。
   */
  private applyReferenceImage(workflow: any, nodes: PromptNode[], referenceImagePath: string): void {
    // 用户配置的角色参考图文件名
    const refName = referenceImagePath ? basename(referenceImagePath) : ''

    // 找到带 ref_images.ref_image_0 的节点（ReferenceToVideo 等）
    const host = nodes.find(({ node }) => {
      const inputs = node?.inputs
      return inputs && typeof inputs['ref_images.ref_image_0'] !== 'undefined'
    })

    if (!host) {
      // 没有多参考图结构：退化为把第一个 LoadImage 设为参考图
      if (!refName) return
      const loadImage = nodes.find(({ node }) =>
        /LoadImage/i.test(String(node?.class_type || ''))
      )
      if (loadImage && typeof loadImage.node?.inputs?.image === 'string') {
        loadImage.node.inputs.image = refName
      }
      return
    }

    const inputs = host.node.inputs
    const refKeys = Object.keys(inputs).filter((k) => /^ref_images\.ref_image_\d+$/.test(k))

    for (const key of refKeys) {
      // 从 "ref_images.ref_image_0" 提取序号 0（注意：key.split('.') 会得到 ["ref_images","ref_image_0"]，
      // 不能直接 parseInt(pop())，否则得到 NaN。）
      const m = /^ref_images\.ref_image_(\d+)$/.exec(key)
      const idx = m ? parseInt(m[1], 10) : NaN
      const ref = inputs[key]
      const targetKey = Array.isArray(ref) ? String(ref[0]) : ''
      const targetNode = nodes.find(({ key: k }) => k === targetKey)?.node

      if (idx === 0) {
        // 角色参考图：把其 LoadImage 换成用户配置的参考图
        if (refName && targetNode && /LoadImage/i.test(String(targetNode?.class_type || ''))) {
          targetNode.inputs.image = refName
        }
      } else {
        // 多余的参考图栏位：直接删除输入字段
        delete inputs[key]
        // 若该 LoadImage 不再被任何输入引用，从工作流顶层移除，避免孤立节点
        if (targetNode && /LoadImage/i.test(String(targetNode?.class_type || ''))) {
          const stillUsed = Object.keys(inputs).some(
            (k) => Array.isArray(inputs[k]) && String(inputs[k][0]) === targetKey
          )
          if (!stillUsed) {
            delete workflow[targetKey]
          }
        }
      }
    }
  }

  /**
   * 把用户配置的角色参考图上传到 ComfyUI 的 input 目录（/upload/image），
   * 返回写入工作流时使用的文件名。这样无论 ComfyUI 当前挂载哪个根目录，
   * 参考图都一定存在，避免"参考图没生效/人物无关"的问题。
   * 若没有配置参考图则直接返回空，跳过上传。
   *
   * 云端隧道（ngrok 等）上传大图容易超时：使用较长超时（90 秒）+ 自动重试一次，
   * 避免 "This operation was aborted" 直接打断整次生图。
   */
  private async uploadReferenceImage(settings: AppSettings, referenceImagePath?: string): Promise<string> {
    if (!referenceImagePath) return ''
    let buf: Buffer
    try {
      buf = await fs.readFile(referenceImagePath)
    } catch (error: any) {
      throw new Error(`参考图文件读取失败：${String(error?.message || error)}`)
    }
    const fileName = basename(referenceImagePath)
    const base = settings.comfyUrl.replace(/\/+$/, '')
    const form = new FormData()
    form.append('image', new Blob([new Uint8Array(buf)]), fileName)
    form.append('overwrite', 'true')

    const MAX_ATTEMPTS = 2
    const UPLOAD_TIMEOUT_MS = 90000
    let lastError: unknown = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
      try {
        const res = await fetch(`${base}/upload/image`, {
          method: 'POST',
          body: form,
          signal: controller.signal
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`上传参考图失败 HTTP ${res.status}: ${text.slice(0, 200)}`)
        }
        return fileName
      } catch (error: any) {
        lastError = error
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 1500))
        }
      } finally {
        clearTimeout(timer)
      }
    }
    const reason =
      (lastError as any)?.name === 'AbortError'
        ? `上传参考图超时（每次 ${UPLOAD_TIMEOUT_MS / 1000} 秒，已重试 ${MAX_ATTEMPTS} 次）：${fileName}`
        : String((lastError as any)?.message || lastError)
    throw new Error(`上传参考图失败：${reason}`)
  }

  private applyDuration(nodes: PromptNode[], durationSec: number): void {
    // 查找 title 含 Duration/秒/Second 的节点（通常是 PrimitiveFloat value）
    for (const { node, key } of nodes) {
      const cls = String(node?.class_type || '')
      const title = String(node?._meta?.title || '')
      const isFloat = /PrimitiveFloat|Float/i.test(cls)
      const isDuration = /Duration|秒|Second|时长/i.test(title + ' ' + key)
      if (isFloat && isDuration) {
        if (typeof node.inputs?.value === 'number') {
          node.inputs.value = durationSec
        } else if (typeof node.inputs?.float === 'number') {
          node.inputs.float = durationSec
        }
        return
      }
    }
  }

  private applyResolution(nodes: PromptNode[], resolution: string): void {
    const resNode = nodes.find(({ node }) => /ResolutionSelector/i.test(String(node?.class_type || '')))
    if (!resNode) return
    const inputs = resNode.node?.inputs
    if (!inputs) return
    // 解析 "0.4MP" 或 "1280x720" → megapixels
    const mp = /^(\d+(?:\.\d+)?)\s*MP$/i.exec(resolution.trim())
    if (mp) {
      inputs.megapixels = Number(mp[1])
    }
  }

  private applySteps(nodes: PromptNode[], steps: number): void {
    for (const { node } of nodes) {
      const cls = String(node?.class_type || '')
      if (/Sampler|Scheduler|KSampler/i.test(cls)) {
        const inputs = node?.inputs
        if (inputs && typeof inputs.steps === 'number') {
          inputs.steps = steps
          return
        }
        const widgets = inputs?.widgets_values
        if (Array.isArray(widgets)) {
          const idx = widgets.findIndex((w) => typeof w === 'number')
          if (idx >= 0) {
            widgets[idx] = steps
            return
          }
        }
      }
    }
  }

  private applyMotionContext(nodes: PromptNode[], currentSegment: number): void {
    // 当前要生成的是第 currentSegment+1 段；LoadLatent 载入上一段，SaveLatent 存当前段
    const nextIndex = currentSegment + 1
    for (const { node } of nodes) {
      const cls = String(node?.class_type || '')
      if (/LoadLatent/i.test(cls)) {
        if (typeof node?.inputs?.clip_index === 'number') {
          node.inputs.clip_index = Math.max(0, currentSegment)
        }
      }
      if (/SaveLatent/i.test(cls)) {
        if (typeof node?.inputs?.clip_index === 'number') {
          node.inputs.clip_index = nextIndex
        }
      }
    }
  }

  private async submit(workflow: any): Promise<string | null> {
    const settings = this.getSettings()
    const body = { prompt: workflow }
    // 云端隧道（ngrok 等）提交大工作流 JSON 可能较慢：超时放宽到 60 秒
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60000)
    try {
      const response = await fetch(`${settings.comfyUrl.replace(/\/+$/, '')}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(`ComfyUI HTTP ${response.status}: ${JSON.stringify(json).slice(0, 200)}`)
      }
      return typeof json?.prompt_id === 'string' ? json.prompt_id : null
    } catch (error: any) {
      throw new Error(`提交 ComfyUI 失败：${String(error?.message || error)}`)
    } finally {
      clearTimeout(timer)
    }
  }

  private async pollForOutput(promptId: string): Promise<string | null> {
    const settings = this.getSettings()
    const base = settings.comfyUrl.replace(/\/+$/, '')
    const deadline = Date.now() + 900000 // 15 分钟超时：MiniMax H3 长视频本地生成可能超过 5 分钟
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${base}/history/${promptId}`)
        const json = await res.json().catch(() => ({}))
        const entry = json?.[promptId]
        if (entry?.outputs) {
          for (const outKey of Object.keys(entry.outputs)) {
            const out = entry.outputs[outKey]
            // MiniMax H3 的 SaveVideo 把成片 mp4 放在 images 数组里（subfolder=video, type=output, animated=true），
            // 同时也兼容标准 videos / gifs 字段。
            const candidates = [
              ...(out?.videos || []),
              ...(out?.gifs || []),
              ...(out?.images || [])
            ]
            for (const item of candidates) {
              const filename = item?.filename
              if (!filename) continue
              const isVideo = extname(filename).toLowerCase() === '.mp4'
              // 仅接受：视频文件，或 gif（老旧节点也可能用 gif）
              if (isVideo || /\.gif$/i.test(filename)) {
                return `${base}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(item.subfolder || '')}&type=${encodeURIComponent(item.type || 'output')}`
              }
            }
          }
        }
      } catch {
        // transient, keep polling
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
    return null
  }

  private async copyToStreams(outputUrl: string, segName: string): Promise<void> {
    const settings = this.getSettings()
    if (!settings.streamsDir) throw new Error('未配置成片目录 streamsDir')
    await fs.mkdir(settings.streamsDir, { recursive: true })
    const res = await fetch(outputUrl)
    if (!res.ok) throw new Error(`下载成片失败 HTTP ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    const target = join(settings.streamsDir, segName)
    await fs.writeFile(target, buffer)
  }
}