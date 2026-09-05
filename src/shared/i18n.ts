/**
 * 轻量中英双语 i18n（无第三方依赖）。
 * 渲染层与主进程共用：tr(lang, key, vars) 返回当前语言的字符串。
 * key 缺失时回退到中文，中文缺失时原样返回 key。
 */

export type Lang = 'zh' | 'en'

export function isLang(v: unknown): v is Lang {
  return v === 'zh' || v === 'en'
}

const zh: Record<string, string> = {
  // ===== 通用 =====
  'common.cancel': '取消',
  'common.viewer': '观众',
  'common.effect': '特效',
  'common.gift': '礼物',
  'common.unknown': '未知',

  // ===== 头部 =====
  'header.onlineCount': '在线人数',
  'header.restart': '🔁 重开',
  'header.goLive': '🚀 开播',
  'header.settings': '⚙️ 设置',

  // ===== 状态栏 =====
  'status.disconnected': '未连接',
  'status.engineModel': '引擎：{model}',
  'status.engineNotConfigured': '未配置 AI 引擎',
  'status.engineConnected': '引擎已连接：',
  'status.engineNotConnected': '引擎未连接：',
  'status.generating': '正在生成主播角色卡…',
  'status.liveStart': '🚀 开播成功！主播：{name}，开始互动吧～',
  'status.notLiveYet': '⚠️ 尚未开播，请先在右上角点击「🚀 开播」初始化主播角色卡',

  // ===== 舞台 =====
  'stage.waiting': '等待直播片段…',
  'stage.waitingHint': '开播后 AI 生成的 seg_xxx.mp4 会自动出现在这里',
  'stage.roomName': '{name} 的直播间',
  'stage.roomNameDefault': 'AI 虚拟直播间',
  'stage.notLive': '未开播',
  'stage.fullscreen': '全屏',
  'stage.giftSent': '我送出',
  'stage.giftLevel': '{level}礼物',
  'stage.effectLevel': 'AI 特效',
  'stage.dir': '📁 {dir}',
  'stage.noDir': '📁 未选择目录',
  'stage.segmentCount': '🎬 {count} 个片段',
  'stage.replay': '🔁 重播当前',
  'stage.openDir': '打开目录',

  // ===== 标签页 =====
  'tabs.chat': '弹幕',
  'tabs.gifts': '礼物',
  'tabs.activity': '活动',
  'tabs.director': '导演',
  'tabs.replay': '回放',

  // ===== 聊天 =====
  'chat.me': '我',
  'chat.cancelGift': '取消礼物',
  'chat.giftPlaceholder': '输入礼物留言，可留空，点发送一起送出…',
  'chat.placeholder': '发一条互动给主播…',
  'chat.sendGift': '送出',
  'chat.send': '发送',
  'chat.giftSentLine': '我送出「{name}」（{level}礼物）{msg}',
  'chat.giftNote': '｜留言：{msg}',
  'chat.giftDanmaku': '{emoji} 我送出了 {name} {emoji}',
  'chat.activityLine': '我发起了【{activity}】',
  'chat.activityDanmaku': '📢 我发起了【{activity}】',
  'chat.streamerPrefix': '主播：{line}',

  // ===== 系统对话框 =====
  'dialog.chooseDir': '选择直播片段目录',
  'dialog.chooseRefImage': '选择主播参考图',
  'dialog.images': '图片',
  'dialog.chooseWorkflow': '选择 ComfyUI 工作流 JSON',
  'dialog.workflow': 'ComfyUI 工作流',

  // ===== 礼物 =====
  'gifts.coins': '{price} 币',

  // ===== 导演面板 =====
  'director.engine': 'AI 引擎',
  'director.testEngine': '测试引擎',
  'director.anchor': '主播角色',
  'director.notLive': '未开播',
  'director.persona': '人设：{v}',
  'director.scene': '场景：{v}',
  'director.state': '当前状态',
  'director.conversation': 'AI 对话后台',
  'director.noConversation': '暂无对话',
  'director.me': '👤 我',
  'director.ai': '🤖 AI',
  'director.segments': '直播片段',
  'director.noSegments': '暂无片段',
  'director.refresh': '刷新列表',
  'director.replayTitle': '已生成视频 / 回放',
  'director.noVideos': '还没有生成视频',

  // ===== 主播状态系统 =====
  'cloth.head': '头颈区',
  'cloth.upper': '上躯干区',
  'cloth.lower': '下躯干区',
  'cloth.legs': '腿足区',
  'cloth.note': '状态备注',
  'cloth.fallback': '按参考图初始装扮',
  'cloth.removed': '已脱',
  'cloth.absentTitle': '{zone}：已脱下（本轮起保持裸露，不再穿回）',

  // ===== 开播配置 =====
  'start.title': '🚀 开播配置',
  'start.streamsDir': '直播片段目录（AI 生成的 seg_xxx.mp4 会存到这里）',
  'start.streamsDirPlaceholder': '存放 seg_xxx.mp4 的目录',
  'start.browse': '浏览',
  'start.refMode': '参考信息模式',
  'start.refImageMode': '参考图（多模态模型可直接看）',
  'start.textMode': '文字描述',
  'start.refFile': '参考图文件（ComfyUI 生成使用）',
  'start.chooseRefFile': '选择参考图文件',
  'start.chooseImage': '选择图片',
  'start.refDescription': '参考图文字描述（作为主播外貌依据）',
  'start.refDescriptionPlaceholder':
    '例如：年轻女性，黑色长直发，白色汉服，双白色发带，手持白色长剑，背景为古代庭院…',
  'start.personality': '主播性格（留空或填 random 表示由 AI 自动生成）',
  'start.personalityPlaceholder': '例如：温柔治愈、慢热、话痨… 或留空/random',
  'start.comfyUrl': 'ComfyUI 地址',
  'start.workflow': 'ComfyUI 工作流 JSON',
  'start.workflowPlaceholder': '选择本地 workflow.json',
  'start.chooseWorkflow': '选择工作流',
  'start.resolution': '清晰度 / 分辨率',
  'start.resolutionPlaceholder': '例如 0.4MP 或 1280x720',
  'start.steps': '生成步数',
  'start.duration': '每段时长（秒）',
  'start.extra': '额外自定义要求',
  'start.extraPlaceholder': '适配工作流的补充要求，例如：镜头固定、夜晚场景、无字幕等',
  'start.testComfy': '🔌 测试 ComfyUI',
  'start.initializing': '正在初始化…',
  'start.goLive': '▶ 开始直播',
  'start.saving': '正在保存配置并初始化…',
  'start.streamStyle': '直播画面风格（强制生效，防止二次元参考图被画成真人）',
  'start.styleAuto': '跟随参考图',
  'start.styleRealistic': '真人写实',
  'start.styleAnime': '动漫二次元',
  'start.style3d': '3D 渲染',
  'start.styleCustom': '自定义',
  'start.styleCustomPlaceholder': '输入自定义风格描述，例如：手绘水彩风、像素风、哥特暗黑风…',

  // ===== 设置 =====
  'settings.title': '设置',
  'settings.streamsDir': '片段目录',
  'settings.streamsDirPlaceholder': '例如 D:\\桌面\\Projects\\streams',
  'settings.engineSection': '🤖 内置 AI 引擎（OpenAI 兼容 API）',
  'settings.apiBaseUrl': 'API 地址（base_url，如 https://api.openai.com/v1 或 http://localhost:11434/v1）',
  'settings.apiKey': 'API Key（本地模型可留空）',
  'settings.model': '模型名称（可点击「获取模型」拉取列表选择，也可手动输入）',
  'settings.modelPlaceholder': '如 gpt-4o / deepseek-chat / llama3 等',
  'settings.fetchModels': '📋 获取模型',
  'settings.chooseModel': '选择模型…',
  'settings.testEngine': '🔌 测试 AI 引擎',
  'settings.comfySection': '🎬 ComfyUI 生成',
  'settings.comfyUrl': 'ComfyUI 地址',
  'settings.testComfy': '🔌 测试 ComfyUI',
  'settings.save': '保存',
  'settings.language': '界面语言',
  'settings.fetchingModels': '正在获取模型列表…',
  'settings.saveSuccess': '✅ 设置已保存',
  'settings.saveFailed': '❌ 保存失败：{msg}',

  // ===== AI 引擎消息（主进程） =====
  'engine.noApiConfig': '未配置 AI 引擎的 API 地址/模型',
  'engine.http': 'AI 引擎 HTTP {status}',
  'engine.connected': 'AI 引擎已连接：{model}',
  'engine.timeout': 'AI 引擎请求超时',
  'engine.connectFail': '无法连接 AI 引擎：{msg}',
  'engine.noProfile': '尚未开播，请先初始化主播角色卡',
  'engine.emptyInput': '输入为空',
  'engine.directing': 'AI 导演生成中…',
  'engine.submitComfy': '正在提交 ComfyUI 生成视频…',
  'engine.turnDone': '回合完成（本回合未提交视频生成）',
  'engine.turnOk': '已生成',
  'engine.error': 'AI 导演出错：{msg}',
  'engine.reset': '已重置直播会话',
  'engine.noComfyUrl': '未配置 ComfyUI 地址',
  'engine.comfyHttp': 'ComfyUI 返回 HTTP {status}',
  'engine.comfyConnected': 'ComfyUI 已连接',
  'engine.comfyConnectFail': '无法连接 ComfyUI: {msg}',
  'engine.noApiBase': '未配置 AI 引擎 API 地址',
  'engine.profileFail': 'AI 引擎未能生成主播角色卡',
  'engine.profileReady': '主播角色卡已生成：{name}',
  'engine.emptyReply': 'AI 引擎返回了空回复（可能触发内容过滤或模型过载），请稍后重试',
  'engine.callFail': 'AI 引擎调用失败：{msg}',
  'engine.timeout180': 'AI 引擎请求超时（180 秒无响应，请检查 API 服务或稍后重试）',
  'engine.modelsFail': '获取模型列表失败：HTTP {status}',
  'engine.modelsFailMsg': '获取模型列表失败：{msg}',
  'engine.modelsOk': '发现 {count} 个模型',
  'engine.modelsTimeout': '获取模型列表超时',
  'engine.degraded': '模型未返回结构化 JSON，已降级为纯文本',

  // ===== ComfyUI 执行器消息（主进程） =====
  'comfy.noUrl': '未配置 ComfyUI 地址',
  'comfy.noWorkflow': '未配置 ComfyUI 工作流 JSON',
  'comfy.readFail': '读取工作流失败：{msg}',
  'comfy.fillFail': '填充工作流参数失败：{msg}',
  'comfy.noTaskId': 'ComfyUI 未返回任务 ID',
  'comfy.pollTimeout': '轮询超时：未等到成片',
  'comfy.copyFail': '复制成片失败：{msg}',
  'comfy.generated': '已生成 {name}',
  'comfy.noStreamsDir': '未配置成片目录 streamsDir',
  'comfy.downloadFail': '下载成片失败 HTTP {status}',
  'comfy.submitFail': '提交 ComfyUI 失败：{msg}',
  'comfy.uploadFail': '上传参考图失败：{msg}',
  'comfy.uploadReadFail': '参考图文件读取失败：{msg}',
  'comfy.uploadTimeout': '上传参考图超时（每次 {sec} 秒，已重试 {tries} 次）：{name}',

  // ===== AI 工作流适配器（主进程） =====
  'adapter.emptyReply': 'AI 未返回工作流分析结果，请重试',
  'adapter.badJson': 'AI 返回的工作流映射格式无法解析，请重试',
  'adapter.nothingFound': 'AI 未能识别出任何可填写的节点，请检查工作流格式',
  'adapter.found': 'AI 已识别 {count} 处可填写位置',
  'adapter.analyzing': '正在用 AI 识别工作流结构…',
  'adapter.analyze': '🤖 AI 识别工作流',
  'adapter.reanalyze': '🤖 重新识别',
  'adapter.done': '✅ 已识别工作流，生成时自动按映射填值',
  'adapter.hint': '工作流结构差异大时，先用 AI 识别节点，避免提示词/参数填不进去',
  'adapter.cleared': '已清除工作流映射'
}

const en: Record<string, string> = {
  // ===== Common =====
  'common.cancel': 'Cancel',
  'common.viewer': 'Viewer',
  'common.effect': 'Effect',
  'common.gift': 'Gift',
  'common.unknown': 'Unknown',

  // ===== Header =====
  'header.onlineCount': 'Online viewers',
  'header.restart': '🔁 Restart',
  'header.goLive': '🚀 Go Live',
  'header.settings': '⚙️ Settings',

  // ===== Status bar =====
  'status.disconnected': 'Disconnected',
  'status.engineModel': 'Engine: {model}',
  'status.engineNotConfigured': 'AI engine not configured',
  'status.engineConnected': 'Engine connected: ',
  'status.engineNotConnected': 'Engine not connected: ',
  'status.generating': 'Generating streamer profile…',
  'status.liveStart': '🚀 Live! Streamer: {name}. Start interacting!',
  'status.notLiveYet': '⚠️ Not live yet. Click "🚀 Go Live" in the top-right to initialize the streamer profile',

  // ===== Stage =====
  'stage.waiting': 'Waiting for stream segments…',
  'stage.waitingHint': 'AI-generated seg_xxx.mp4 files will appear here after going live',
  'stage.roomName': "{name}'s Live Room",
  'stage.roomNameDefault': 'AI Virtual Live Room',
  'stage.notLive': 'Not Live',
  'stage.fullscreen': 'Fullscreen',
  'stage.giftSent': 'I sent',
  'stage.giftLevel': '{level} Gift',
  'stage.effectLevel': 'AI Effect',
  'stage.dir': '📁 {dir}',
  'stage.noDir': '📁 No directory selected',
  'stage.segmentCount': '🎬 {count} segments',
  'stage.replay': '🔁 Replay Current',
  'stage.openDir': 'Open Folder',

  // ===== Tabs =====
  'tabs.chat': 'Chat',
  'tabs.gifts': 'Gifts',
  'tabs.activity': 'Activities',
  'tabs.director': 'Director',
  'tabs.replay': 'Replay',

  // ===== Chat =====
  'chat.me': 'Me',
  'chat.cancelGift': 'Cancel Gift',
  'chat.giftPlaceholder': 'Add a message (optional) and send with your gift…',
  'chat.placeholder': 'Send a message to the streamer…',
  'chat.sendGift': 'Send Gift',
  'chat.send': 'Send',
  'chat.giftSentLine': 'I sent "{name}" ({level} gift){msg}',
  'chat.giftNote': ' | Note: {msg}',
  'chat.giftDanmaku': '{emoji} I sent {name} {emoji}',
  'chat.activityLine': 'I started 【{activity}】',
  'chat.activityDanmaku': '📢 I started 【{activity}】',
  'chat.streamerPrefix': 'Streamer: {line}',

  // ===== Native dialogs =====
  'dialog.chooseDir': 'Choose segments directory',
  'dialog.chooseRefImage': 'Choose streamer reference image',
  'dialog.images': 'Images',
  'dialog.chooseWorkflow': 'Choose ComfyUI workflow JSON',
  'dialog.workflow': 'ComfyUI workflow',

  // ===== Gifts =====
  'gifts.coins': '{price} coins',

  // ===== Director panel =====
  'director.engine': 'AI Engine',
  'director.testEngine': 'Test Engine',
  'director.anchor': 'Streamer',
  'director.notLive': 'Not Live',
  'director.persona': 'Persona: {v}',
  'director.scene': 'Scene: {v}',
  'director.state': 'Current State',
  'director.conversation': 'AI Conversation',
  'director.noConversation': 'No conversation yet',
  'director.me': '👤 Me',
  'director.ai': '🤖 AI',
  'director.segments': 'Segments',
  'director.noSegments': 'No segments yet',
  'director.refresh': 'Refresh List',
  'director.replayTitle': 'Generated Videos / Replay',
  'director.noVideos': 'No videos generated yet',

  // ===== Clothing state =====
  'cloth.head': 'Head & Neck',
  'cloth.upper': 'Upper Body',
  'cloth.lower': 'Lower Body',
  'cloth.legs': 'Legs & Feet',
  'cloth.note': 'Note',
  'cloth.fallback': 'Per reference image',
  'cloth.removed': 'Off',
  'cloth.absentTitle': '{zone}: removed (stays off for this session)',

  // ===== Go Live Setup =====
  'start.title': '🚀 Go Live Setup',
  'start.streamsDir': 'Segments directory (AI-generated seg_xxx.mp4 files are saved here)',
  'start.streamsDirPlaceholder': 'Directory for seg_xxx.mp4 files',
  'start.browse': 'Browse',
  'start.refMode': 'Reference Mode',
  'start.refImageMode': 'Reference image (for multimodal models)',
  'start.textMode': 'Text description',
  'start.refFile': 'Reference image file (used by ComfyUI)',
  'start.chooseRefFile': 'Choose reference image file',
  'start.chooseImage': 'Choose Image',
  'start.refDescription': 'Text description of the streamer (appearance reference)',
  'start.refDescriptionPlaceholder':
    'e.g. young woman, long black straight hair, white hanfu, white hair ribbons, holding a white sword, ancient courtyard background…',
  'start.personality': 'Streamer personality (leave empty or "random" to auto-generate)',
  'start.personalityPlaceholder': 'e.g. gentle, healing, slow to warm up, talkative… or empty/random',
  'start.comfyUrl': 'ComfyUI URL',
  'start.workflow': 'ComfyUI Workflow JSON',
  'start.workflowPlaceholder': 'Choose a local workflow.json',
  'start.chooseWorkflow': 'Choose Workflow',
  'start.resolution': 'Resolution',
  'start.resolutionPlaceholder': 'e.g. 0.4MP or 1280x720',
  'start.steps': 'Steps',
  'start.duration': 'Segment duration (seconds)',
  'start.extra': 'Extra requirements',
  'start.extraPlaceholder': 'Extra requirements for the workflow, e.g. fixed camera, night scene, no subtitles…',
  'start.testComfy': '🔌 Test ComfyUI',
  'start.initializing': 'Initializing…',
  'start.goLive': '▶ Start Live',
  'start.streamStyle': 'Stream visual style (enforced — prevents an anime reference from being rendered as a real person)',
  'start.styleAuto': 'Follow Reference',
  'start.styleRealistic': 'Photorealistic',
  'start.styleAnime': '2D Anime',
  'start.style3d': '3D Render',
  'start.styleCustom': 'Custom',
  'start.styleCustomPlaceholder': 'Describe the style, e.g. hand-drawn watercolor, pixel art, gothic dark…',
  'start.saving': 'Saving config and initializing…',

  // ===== Settings =====
  'settings.title': 'Settings',
  'settings.streamsDir': 'Segments directory',
  'settings.streamsDirPlaceholder': 'e.g. D:\\Projects\\streams',
  'settings.engineSection': '🤖 Built-in AI Engine (OpenAI-compatible API)',
  'settings.apiBaseUrl': 'API base URL (e.g. https://api.openai.com/v1 or http://localhost:11434/v1)',
  'settings.apiKey': 'API Key (optional for local models)',
  'settings.model': 'Model name (click "Fetch Models" to load the list, or type manually)',
  'settings.modelPlaceholder': 'e.g. gpt-4o / deepseek-chat / llama3',
  'settings.fetchModels': '📋 Fetch Models',
  'settings.chooseModel': 'Choose a model…',
  'settings.testEngine': '🔌 Test AI Engine',
  'settings.comfySection': '🎬 ComfyUI Generation',
  'settings.comfyUrl': 'ComfyUI URL',
  'settings.testComfy': '🔌 Test ComfyUI',
  'settings.save': 'Save',
  'settings.language': 'Language',
  'settings.fetchingModels': 'Fetching model list…',
  'settings.saveSuccess': '✅ Settings saved',
  'settings.saveFailed': '❌ Failed to save: {msg}',

  // ===== AI engine messages (main process) =====
  'engine.noApiConfig': 'AI engine API URL/model not configured',
  'engine.http': 'AI engine HTTP {status}',
  'engine.connected': 'AI engine connected: {model}',
  'engine.timeout': 'AI engine request timed out',
  'engine.connectFail': 'Cannot connect to AI engine: {msg}',
  'engine.noProfile': 'Not live yet. Initialize the streamer profile first',
  'engine.emptyInput': 'Input is empty',
  'engine.directing': 'AI director working…',
  'engine.submitComfy': 'Submitting to ComfyUI to generate video…',
  'engine.turnDone': 'Turn complete (no video generation this turn)',
  'engine.turnOk': 'Done',
  'engine.error': 'AI director error: {msg}',
  'engine.reset': 'Live session reset',
  'engine.noComfyUrl': 'ComfyUI URL not configured',
  'engine.comfyHttp': 'ComfyUI returned HTTP {status}',
  'engine.comfyConnected': 'ComfyUI connected',
  'engine.comfyConnectFail': 'Cannot connect to ComfyUI: {msg}',
  'engine.noApiBase': 'AI engine API URL not configured',
  'engine.profileFail': 'AI engine could not generate a streamer profile',
  'engine.profileReady': 'Streamer profile ready: {name}',
  'engine.emptyReply': 'AI engine returned an empty reply (content filter or overload). Please retry later',
  'engine.callFail': 'AI engine call failed: {msg}',
  'engine.timeout180': 'AI engine request timed out (no response for 180s). Check the API service or retry later',
  'engine.modelsFail': 'Failed to fetch model list: HTTP {status}',
  'engine.modelsFailMsg': 'Failed to fetch model list: {msg}',
  'engine.modelsOk': 'Found {count} models',
  'engine.modelsTimeout': 'Timed out fetching model list',
  'engine.degraded': 'Model did not return structured JSON; degraded to plain text',

  // ===== ComfyUI executor messages (main process) =====
  'comfy.noUrl': 'ComfyUI URL not configured',
  'comfy.noWorkflow': 'ComfyUI workflow JSON not configured',
  'comfy.readFail': 'Failed to read workflow: {msg}',
  'comfy.fillFail': 'Failed to fill workflow params: {msg}',
  'comfy.noTaskId': 'ComfyUI did not return a task ID',
  'comfy.pollTimeout': 'Polling timed out: no output video',
  'comfy.copyFail': 'Failed to copy output: {msg}',
  'comfy.generated': 'Generated {name}',
  'comfy.noStreamsDir': 'Output directory (streamsDir) not configured',
  'comfy.downloadFail': 'Failed to download output: HTTP {status}',
  'comfy.submitFail': 'Failed to submit to ComfyUI: {msg}',
  'comfy.uploadFail': 'Failed to upload reference image: {msg}',
  'comfy.uploadReadFail': 'Failed to read reference image: {msg}',
  'comfy.uploadTimeout': 'Upload timed out ({sec}s per attempt, {tries} attempts): {name}',

  // ===== AI workflow adapter (main process) =====
  'adapter.emptyReply': 'AI returned no workflow analysis, please retry',
  'adapter.badJson': 'AI workflow mapping could not be parsed, please retry',
  'adapter.nothingFound': 'AI could not identify any writable nodes, please check the workflow format',
  'adapter.found': 'AI identified {count} writable locations',
  'adapter.analyzing': 'Analyzing workflow with AI…',
  'adapter.analyze': '🤖 Analyze Workflow',
  'adapter.reanalyze': '🤖 Re-analyze',
  'adapter.done': '✅ Workflow mapped; values are filled automatically on generation',
  'adapter.hint': 'Workflows differ a lot; use AI analysis first so prompts/params actually land',
  'adapter.cleared': 'Workflow mapping cleared'
}

/** 礼物等级显示名（保留中文作为引擎内部标识，CSS 类名也依赖中文） */
const GIFT_LEVELS: Record<string, { zh: string; en: string }> = {
  小额: { zh: '小额', en: 'Small' },
  大额: { zh: '大额', en: 'Large' },
  礼物级: { zh: '礼物级', en: 'Top' }
}

export function giftLevelName(level: string, lang: Lang): string {
  return GIFT_LEVELS[level]?.[lang] ?? level
}

/** 翻译函数：lang 取 'en' 用英文，其余用中文；{var} 插值 */
export function tr(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const table = lang === 'en' ? en : zh
  let s = table[key] ?? zh[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v))
    }
  }
  return s
}
