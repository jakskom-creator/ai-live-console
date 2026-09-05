import type { Lang } from './i18n'

export interface AppSettings {
  streamsDir: string
  feedbackDir: string
  autoSend: boolean
  referenceImagePath: string
  referenceMode: 'image' | 'description'
  referenceDescription: string
  personality: string
  extraRequirements: string
  /** 界面语言（默认中文；英文模式下引擎内容语言也跟随英文） */
  language: Lang
  /** 直播画面风格：auto（跟随参考图）/ realistic（真人写实）/ anime（动漫二次元）/ 3d（3D 渲染）/ custom（自定义） */
  streamStyle: 'auto' | 'realistic' | 'anime' | '3d' | 'custom'
  /** 自定义风格描述（streamStyle = custom 时使用，注入提示词强制生效） */
  customStyleText: string
  // OpenAI 兼容 API（内置 AI 引擎）
  apiBaseUrl: string
  apiKey: string
  model: string
  // ComfyUI 生成
  comfyUrl: string
  workflowPath: string
  resolution: string
  steps: number
  durationSec: number
  /** ComfyUI 输出目录（用于开播时清理旧 MotionContext latent 缓存，防止串直播） */
  comfyOutputDir: string
  /** AI 识别的工作流节点映射（由 workflow:analyze 生成并保存，用于按映射填值） */
  workflowMapping: WorkflowMapping | null
}

export interface VideoFile {
  name: string
  url: string
  size: number
  mtime: number
}

export interface EngineResult {
  ok: boolean
  message: string
  /** 导演回合的结构化输出（engine:interact 成功时返回） */
  output?: DirectorTurnOutput
  /** 引擎原始文本输出（用于调试展示） */
  rawOutput?: string
}

export interface StreamEventPayload {
  videos: VideoFile[]
  baseUrl: string
}

export interface FeedbackEvent {
  type: 'danmaku' | 'effect' | 'system'
  text: string
  user?: string
  effect?: string
  timestamp: number
}

export interface FeedbackEventPayload extends FeedbackEvent {
  id: string
}

/**
 * AI 导演回合输出的结构化结果。
 * 前端/主进程根据这些字段执行：展示弹幕、播放特效、提交 ComfyUI 生成视频。
 */
export interface DirectorTurnOutput {
  /** 主播本段台词 */
  line: string
  /** 观众弹幕（由引擎模拟观众反应） */
  danmaku: Array<{ user: string; text: string }>
  /** 礼物/特效反馈（可选） */
  effect?: { name: string; emoji: string; level: string }
  /** 本段视频提示词（H3 Ref2VA 六段式，或可直接放入工作流 prompt 字段） */
  videoPrompt: string
  /** 当前主播状态（末帧/服装/情绪），用于下一段连续性 */
  nextState: string
  /** 主播状态系统：五区衣物/身体状态，每回合必须更新（防跨段衣物回穿） */
  clothingState: ClothingState
  /** 系统状态说明 */
  system: string
}

/**
 * 主播状态系统 —— 结构化五区衣物/身体状态。
 * 由 AI 导演每回合输出、引擎持久维护，并作为「权威参考」注入下一回合的
 * subject_definitions / CONTINUITY LOCK，防止上一段已脱的衣物下一段复现。
 */
export interface ClothingState {
  /** 头颈区：发型/发饰/颈圈/头饰等 */
  head: string
  /** 上躯干：上衣/内衣/胸肩腹腰背的覆盖或裸露 */
  upper: string
  /** 下躯干：裙/裤/内裤/臀髋腿根处的覆盖或裸露 */
  lower: string
  /** 腿足区：丝袜/长筒袜/鞋等 */
  legs: string
  /** 备注：姿势/表情/生理状态/道具等补充 */
  note: string
}

/** 空状态：尚未建立时使用（默认=按参考图初始穿着） */
export const EMPTY_CLOTHING_STATE: ClothingState = {
  head: '',
  upper: '',
  lower: '',
  legs: '',
  note: ''
}

/** AI 引擎的状态查询结果（导演面板/状态栏使用） */
export interface AnchorStateResult {
  state: string
  profile: AnchorProfile | null
  clothingState: ClothingState
}

/** AI 引擎的身份上下文（角色卡等，仅在会话内维护） */
export interface AnchorProfile {
  name: string
  persona: string
  appearance: string
  scene: string
}

/**
 * AI 识别出的工作流「节点映射」：定位工作流 JSON 中每个可填值的位置。
 * nodeId 是工作流顶层 key（如 "191" 或 "245:209"），
 * field 是节点内的属性路径（点号分隔，如 "inputs.prompt" 或 "inputs.widgets_values.0"）。
 */
export interface WorkflowFieldRef {
  nodeId: string
  field: string
}

export interface WorkflowMapping {
  /** 视频提示词写入位置 */
  prompt?: WorkflowFieldRef
  /** 主播参考图文件名写入位置（LoadImage 的 inputs.image 等） */
  image?: WorkflowFieldRef
  /** 分辨率参数写入位置（ResolutionSelector.megapixels 或 width/height 输入） */
  resolution?: WorkflowFieldRef
  /** 每段时长（秒）写入位置（PrimitiveFloat.value 等） */
  duration?: WorkflowFieldRef
  /** 生成步数写入位置（BasicScheduler/KSampler 的 inputs.steps） */
  steps?: WorkflowFieldRef
  /** Motion Context Load Latent 的 clip_index 位置 */
  motionLoad?: WorkflowFieldRef
  /** Motion Context Save Latent 的 clip_index 位置 */
  motionSave?: WorkflowFieldRef
  /** 附加说明（AI 诊断信息，展示用） */
  notes?: string
  /** 该映射对应的工作流文件路径（换工作流后旧映射失效） */
  workflowPath?: string
  /** 生成该映射时使用的模型名 */
  model?: string
}