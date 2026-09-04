import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AnchorProfile,
  AppSettings,
  ClothingState,
  EngineResult,
  VideoFile,
  StreamEventPayload
} from '../../shared/types'
import { EMPTY_CLOTHING_STATE } from '../../shared/types'

type TabKey = 'chat' | 'gifts' | 'activity' | 'director' | 'replay'

interface ChatMessage {
  id: string
  kind: 'danmaku' | 'system' | 'gift' | 'activity'
  user?: string
  content: string
  time: number
}

interface DanmakuItem {
  id: string
  text: string
  top: number
}

interface GiftItem {
  name: string
  emoji: string
  level: string
  price: number
}

const GIFTS: GiftItem[] = [
  { name: '小心心', emoji: '💗', level: '小额', price: 1 },
  { name: '棒棒糖', emoji: '🍭', level: '小额', price: 5 },
  { name: '灯牌', emoji: '🏮', level: '小额', price: 10 },
  { name: '跑车', emoji: '🏎️', level: '大额', price: 100 },
  { name: '火箭', emoji: '🚀', level: '大额', price: 500 },
  { name: '嘉年华', emoji: '🎆', level: '礼物级', price: 1000 }
]

const ACTIVITIES = ['点歌', '换装', '换姿势', '聊天话题', 'ASMR', '抽奖', '投票', 'PK挑战', '下播']

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now()}-${idCounter}`
}

/**
 * 主播状态系统栏 —— 五区衣物/身体状态配置。
 * 每区含 emoji 图标、中文小标题（与引擎权威标签对齐）、以及取值字段。
 * 空值视为「未指定＝按参考图初始装扮」；absent 专值视为「已脱」，用删除线置灰。
 */
const CLOTH_ZONES: { key: keyof ClothingState; label: string; emoji: string; fallback: string }[] = [
  { key: 'head', label: '头颈区', emoji: '👒', fallback: '按参考图初始装扮' },
  { key: 'upper', label: '上躯干区', emoji: '👚', fallback: '按参考图初始装扮' },
  { key: 'lower', label: '下躯干区', emoji: '👗', fallback: '按参考图初始装扮' },
  { key: 'legs', label: '腿足区', emoji: '🧦', fallback: '按参考图初始装扮' },
  { key: 'note', label: '状态备注', emoji: '📝', fallback: '—' }
]

const ABSENT = 'absent'

/** 空值判断：未定义/空串 → 初始装扮回退；absent → 已脱 */
function isAbsent(v: string | undefined): boolean {
  return !!v && v.trim().toLowerCase() === ABSENT
}

export default function App(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [videos, setVideos] = useState<VideoFile[]>([])
  const [baseUrl, setBaseUrl] = useState('')
  const [currentVideo, setCurrentVideo] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [danmakuItems, setDanmakuItems] = useState<DanmakuItem[]>([])
  const [giftBanner, setGiftBanner] = useState<{ name: string; emoji: string; level: string } | null>(null)
  const [pendingGift, setPendingGift] = useState<GiftItem | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('chat')
  const [chatInput, setChatInput] = useState('')
  const [waitingForNext, setWaitingForNext] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [engineStatus, setEngineStatus] = useState('未连接')
  const [engineState, setEngineState] = useState('')
  const [profile, setProfile] = useState<AnchorProfile | null>(null)
  const [clothingState, setClothingState] = useState<ClothingState>(EMPTY_CLOTHING_STATE)
  const [conversation, setConversation] = useState<Array<{ role: string; content: string; time: number }>>([])
  const [onlineCount, setOnlineCount] = useState(128)
  const [projectOpen, setProjectOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [playNonce, setPlayNonce] = useState(0)
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void window.api.getSettings().then((s) => {
      setSettings(s)
      setEngineStatus(s.model ? `引擎：${s.model}` : '未配置 AI 引擎')
    })
    void window.api.getEngineState().then((r) => {
      setEngineState(r.state)
      setProfile(r.profile)
      if (r.clothingState) setClothingState(r.clothingState)
    })
    void window.api.getEngineHistory().then((r) => {
      if (r.ok && r.history) {
        setConversation(r.history.map((h) => ({ role: h.role, content: h.content, time: Date.now() })))
      }
    })
    void window.api.testEngine().then((r) => {
      setEngineStatus(r.ok ? `引擎已连接：${r.message}` : `引擎未连接：${r.message}`)
    })
    void window.api.getStreamState().then((payload) => {
      setVideos(payload.videos)
      setBaseUrl(payload.baseUrl)
    })
    const off = window.api.onFilesChanged((payload: StreamEventPayload) => {
      setVideos(payload.videos)
      setBaseUrl(payload.baseUrl)
    })
    const offStatus = window.api.onEngineStatus((status) => {
      setEngineStatus(status.text)
    })
    const offConv = window.api.onConversation((entry) => {
      setConversation((prev) => [...prev.slice(-199), entry])
    })
    return () => {
      off()
      offStatus()
      offConv()
    }
  }, [])

  useEffect(() => {
    if (!currentVideo && videos.length > 0) {
      setCurrentVideo(videos[0].name)
    }
    if (currentVideo && videos.length > 0 && !videos.some((v) => v.name === currentVideo)) {
      setCurrentVideo(videos[0].name)
    }
  }, [videos, currentVideo])

  useEffect(() => {
    if (!waitingForNext || !currentVideo || videos.length === 0) return
    const idx = videos.findIndex((v) => v.name === currentVideo)
    if (idx >= 0 && idx < videos.length - 1) {
      setCurrentVideo(videos[idx + 1].name)
      setWaitingForNext(false)
    }
  }, [waitingForNext, videos, currentVideo])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const timer = setInterval(() => {
      setOnlineCount((prev) => Math.max(50, Math.min(999, prev + Math.floor(Math.random() * 21) - 10)))
    }, 3000)
    return () => clearInterval(timer)
  }, [])

  const pushChat = useCallback((message: ChatMessage) => {
    setMessages((prev) => {
      const duplicate = prev.some(
        (m) => m.kind === message.kind && m.user === message.user && m.content === message.content
      )
      if (duplicate) return prev
      return [...prev.slice(-199), message]
    })
  }, [])

  const pushDanmaku = useCallback((text: string) => {
    const item: DanmakuItem = { id: nextId('dm'), text, top: 8 + Math.floor(Math.random() * 70) }
    setDanmakuItems((prev) => [...prev.slice(-30), item])
    setTimeout(() => {
      setDanmakuItems((prev) => prev.filter((i) => i.id !== item.id))
    }, 8000)
  }, [])

  useEffect(() => {
    const off = window.api.onFeedbackEvent((event) => {
      if (event.type === 'danmaku') {
        const line = `${event.user || '观众'}：${event.text}`
        pushChat({ id: nextId('fb'), kind: 'danmaku', user: event.user, content: line, time: Date.now() })
        pushDanmaku(line)
      } else if (event.type === 'effect') {
        const name = event.effect || '特效'
        pushChat({
          id: nextId('fx'),
          kind: 'gift',
          content: `✨ ${event.text || name}`,
          time: Date.now()
        })
        setGiftBanner({ name, emoji: '✨', level: 'AI 特效' })
        setTimeout(() => setGiftBanner(null), 4500)
      } else if (event.type === 'system') {
        pushChat({ id: nextId('fb-sys'), kind: 'system', content: event.text, time: Date.now() })
      }
    })
    return off
  }, [pushChat, pushDanmaku])

  const interact = useCallback(
    async (raw: string): Promise<void> => {
      const text = raw.trim()
      if (!text) return
      if (!profile) {
        pushChat({
          id: nextId('sys'),
          kind: 'system',
          content: '⚠️ 尚未开播，请先在右上角点击「🚀 开播」初始化主播角色卡',
          time: Date.now()
        })
        return
      }
      // 本地回显观众输入
      pushChat({ id: nextId('chat'), kind: 'danmaku', user: '我', content: `我：${text}`, time: Date.now() })
      pushDanmaku(`${text}`)
      setChatInput('')
      // 必须捕获 invoke 的拒绝：主进程抛错时若不接住，界面就会毫无反应地静默失败
      let result: EngineResult
      try {
        result = await window.api.interact(text)
      } catch (error: any) {
        pushChat({
          id: nextId('sys'),
          kind: 'system',
          content: `⚠️ ${String(error?.message || error)}`,
          time: Date.now()
        })
        return
      }
      if (!result.ok) {
        pushChat({
          id: nextId('sys'),
          kind: 'system',
          content: `⚠️ ${result.message}`,
          time: Date.now()
        })
      } else {
        // 回包成功后刷新主播状态系统栏（clothingState 已由引擎更新）
        try {
          const st = await window.api.getEngineState()
          if (st.clothingState) setClothingState(st.clothingState)
        } catch {
          /* 忽略刷新失败 */
        }
        // 成功但没有产出视频提示词时，明确告知原因，禁止静默
        if (!result.output?.videoPrompt) {
          pushChat({
            id: nextId('sys'),
            kind: 'system',
            content: `⚠️ ${result.message}`,
            time: Date.now()
          })
        }
      }
    },
    [profile, pushChat, pushDanmaku]
  )

  const sendPendingInteraction = useCallback(
    (rawMessage: string) => {
      if (pendingGift) {
        const gift = pendingGift
        const giftLine = `我送出「${gift.name}」（${gift.level}礼物）${rawMessage.trim() ? `｜留言：${rawMessage.trim()}` : ''}`
        pushChat({ id: nextId('gift'), kind: 'gift', content: giftLine, time: Date.now() })
        pushDanmaku(`${gift.emoji} 我送出了 ${gift.name} ${gift.emoji}`)
        setGiftBanner({ name: gift.name, emoji: gift.emoji, level: gift.level })
        setTimeout(() => setGiftBanner(null), 4500)
        setPendingGift(null)
        setChatInput('')
        // 送给 AI 引擎
        const message = rawMessage.trim()
        const input = `【礼物】送出「${gift.name}」${message ? `，留言：${message}` : ''}`
        void interact(`我 ${input}`)
        return
      }
      void interact(rawMessage)
    },
    [pendingGift, interact, pushChat, pushDanmaku]
  )

  const sendGift = useCallback((gift: GiftItem) => {
    setPendingGift(gift)
  }, [])

  const sendActivity = useCallback(
    (activity: string) => {
      const line = `我发起了【${activity}】`
      pushChat({ id: nextId('act'), kind: 'activity', content: line, time: Date.now() })
      pushDanmaku(`📢 我发起了【${activity}】`)
      setChatInput('')
      void interact(line)
    },
    [interact, pushChat, pushDanmaku]
  )

  const startProject = useCallback(async () => {
    setStarting(true)
    setEngineStatus('正在生成主播角色卡…')
    try {
      const result = await window.api.initEngine()
      setEngineStatus(result.message)
      const state = await window.api.getEngineState()
      setProfile(state.profile)
      setEngineState(state.state)
      if (state.clothingState) setClothingState(state.clothingState)
      if (result.ok) {
        setProjectOpen(false)
        pushChat({
          id: nextId('sys'),
          kind: 'system',
          content: `🚀 开播成功！主播：${state.profile?.name || '虚拟主播'}，开始互动吧～`,
          time: Date.now()
        })
      }
    } catch (error: any) {
      setEngineStatus(`❌ ${String(error?.message || error)}`)
    } finally {
      setStarting(false)
    }
  }, [pushChat])

  const resetProject = useCallback(async () => {
    setProfile(null)
    setEngineState('')
    setClothingState(EMPTY_CLOTHING_STATE)
    const result = await window.api.resetEngine()
    setEngineStatus(result.message)
  }, [])

  const currentIndex = videos.findIndex((v) => v.name === currentVideo)
  const currentUrl = currentVideo ? `${baseUrl}${videos[currentIndex]?.url || ''}` : ''
  const nextVideo = currentIndex >= 0 && currentIndex < videos.length - 1 ? videos[currentIndex + 1].name : null

  const handleVideoEnded = useCallback(() => {
    if (nextVideo) {
      setCurrentVideo(nextVideo)
      setWaitingForNext(false)
    } else {
      setWaitingForNext(true)
    }
  }, [nextVideo])

  const toggleFullscreen = useCallback(() => {
    const el = stageRef.current
    if (!el) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void el.requestFullscreen()
    }
  }, [])

  const visibleMessages = useMemo(() => [...messages], [messages])

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">🎥 AI Live Console</div>
          <div className="live-badge">
            <span className="live-dot" />
            LIVE
          </div>
          {profile && <span className="anchor-name">🎤 {profile.name}</span>}
        </div>
        <div className="header-right">
          <span className="online-count" title="在线人数">
            👥 {onlineCount}
          </span>
          <button className="primary-btn small" onClick={() => (profile ? resetProject() : setProjectOpen(true))}>
            {profile ? '🔁 重开' : '🚀 开播'}
          </button>
          <span className="engine-status" title={engineStatus}>
            🔗 {engineStatus}
          </span>
          <button className="ghost-btn" onClick={() => setSettingsOpen(true)}>
            ⚙️ 设置
          </button>
        </div>
      </header>

      <div className="main">
        <section className="stage">
          <div className="video-wrap" ref={stageRef}>
            {currentUrl ? (
              <video
                key={`${currentVideo}-${playNonce}`}
                className="video"
                src={currentUrl}
                autoPlay
                onEnded={handleVideoEnded}
                controls={false}
              />
            ) : (
              <div className="empty-stage">
                <div className="empty-icon">🛰️</div>
                <div>等待直播片段…</div>
                <div className="empty-hint">开播后 AI 生成的 seg_xxx.mp4 会自动出现在这里</div>
              </div>
            )}

            <div className="stage-topbar">
              <div className="stage-topbar-left">
                <span className="room-name">
                  {profile ? `${profile.name} 的直播间` : 'AI 虚拟直播间'}
                </span>
              </div>
              <div className="stage-topbar-right">
                <span className="seg-name">{currentVideo || '未开播'}</span>
                <button className="stage-btn" onClick={toggleFullscreen} title="全屏">
                  ⛶
                </button>
              </div>
            </div>

            {danmakuItems.map((item) => (
              <div key={item.id} className="danmaku-item" style={{ top: `${item.top}%` }}>
                {item.text}
              </div>
            ))}

            {giftBanner && (
              <div className="gift-banner">
                <div className="gift-emoji">{giftBanner.emoji}</div>
                <div className="gift-title">
                  我送出 <strong>{giftBanner.name}</strong>
                </div>
                <div className="gift-level">{giftBanner.level}礼物</div>
              </div>
            )}
          </div>

          <div className="stage-info">
            <span>📁 {settings?.streamsDir || '未选择目录'}</span>
            <span>🎬 {videos.length} 个片段</span>
            {engineState && <span className="state-hint">🎭 {engineState.slice(0, 30)}…</span>}
            <button className="ghost-btn" onClick={() => setPlayNonce((n) => n + 1)} disabled={!currentVideo}>
              🔁 重播当前
            </button>
            <button className="ghost-btn" onClick={() => void window.api.openPath(settings?.streamsDir || '')}>
              打开目录
            </button>
          </div>
        </section>

        <aside className="side">
          <div className="tabs">
            {(
              [
                ['chat', '弹幕'],
                ['gifts', '礼物'],
                ['activity', '活动'],
                ['director', '导演'],
                ['replay', '回放']
              ] as [TabKey, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                className={activeTab === key ? 'tab active' : 'tab'}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="panel-body">
            {activeTab === 'chat' && (
              <div className="chat-panel">
                <div className="chat-list">
                  {visibleMessages.map((m) => (
                    <div key={m.id} className={`chat-line ${m.kind}`}>
                      {m.content}
                    </div>
                  ))}
                  <div ref={messageEndRef} />
                </div>
                <div className="chat-input-row">
                  {pendingGift && (
                    <div className="pending-gift">
                      <span>{pendingGift.emoji}</span>
                      <span>{pendingGift.name}</span>
                      <button className="ghost-btn" onClick={() => setPendingGift(null)}>
                        取消礼物
                      </button>
                    </div>
                  )}
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') sendPendingInteraction(chatInput)
                    }}
                    placeholder={pendingGift ? '输入礼物留言，可留空，点发送一起送出…' : '发一条互动给主播…'}
                  />
                  <button className="send-btn" onClick={() => sendPendingInteraction(chatInput)}>
                    {pendingGift ? '送出' : '发送'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'gifts' && (
              <div className="gift-grid">
                {GIFTS.map((gift) => (
                  <button key={gift.name} className="gift-card" onClick={() => sendGift(gift)}>
                    <div className="gift-emoji-big">{gift.emoji}</div>
                    <div className="gift-name">{gift.name}</div>
                    <div className={`gift-level-tag ${gift.level}`}>{gift.level}</div>
                    <div className="gift-price">{gift.price} 币</div>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="activity-grid">
                {ACTIVITIES.map((activity) => (
                  <button key={activity} className="activity-card" onClick={() => sendActivity(activity)}>
                    {activity}
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'director' && (
              <div className="director-panel">
                <div className="director-section">
                  <div className="director-title">AI 引擎</div>
                  <div className="director-status">{engineStatus}</div>
                  <button className="ghost-btn" onClick={() => void window.api.testEngine().then((r) => setEngineStatus(r.message))}>
                    测试引擎
                  </button>
                </div>
                <div className="director-section">
                  <div className="director-title">主播角色</div>
                  <div className="director-status">
                    {profile ? `🎤 ${profile.name}` : '未开播'}
                  </div>
                  {profile && (
                    <>
                      <div className="director-status dim">
                        <div>人设：{profile.persona}</div>
                        <div>场景：{profile.scene}</div>
                      </div>
                      <div className="cloth-state-bar">
                        {CLOTH_ZONES.map((z) => {
                          const raw = clothingState[z.key]
                          const absent = isAbsent(raw)
                          const text = absent ? '已脱' : raw && raw.trim() ? raw.trim() : z.fallback
                          return (
                            <div
                              key={z.key}
                              className={`cloth-state-item${absent ? ' absent' : ''}`}
                              title={absent ? `${z.label}：已脱下（本轮起保持裸露，不再穿回）` : text}
                            >
                              <span className="cloth-state-emoji">{z.emoji}</span>
                              <span className="cloth-state-body">
                                <span className="cloth-state-label">{z.label}</span>
                                <span className="cloth-state-value">{text}</span>
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
                <div className="director-section">
                  <div className="director-title">当前状态</div>
                  <div className="director-status dim">{engineState || '—'}</div>
                </div>
                <div className="director-section">
                  <div className="director-title">AI 对话后台</div>
                  <div className="conversation-list">
                    {conversation.length === 0 && <div className="director-empty">暂无对话</div>}
                    {conversation.map((c, i) => (
                      <div key={i} className={`conv-entry ${c.role === 'user' ? 'user' : 'assistant'}`}>
                        <div className="conv-role">{c.role === 'user' ? '👤 我' : '🤖 AI'}</div>
                        <pre className="conv-content">{c.content}</pre>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="director-section">
                  <div className="director-title">直播片段</div>
                  <div className="director-list">
                    {videos.map((v, idx) => (
                      <div
                        key={v.name}
                        className={v.name === currentVideo ? 'director-item active' : 'director-item'}
                        onClick={() => {
                          setCurrentVideo(v.name)
                          setWaitingForNext(false)
                        }}
                      >
                        <span>#{String(idx + 1).padStart(3, '0')}</span>
                        <span className="director-name">{v.name}</span>
                        <span className="director-size">{(v.size / 1024 / 1024).toFixed(1)} MB</span>
                      </div>
                    ))}
                    {videos.length === 0 && <div className="director-empty">暂无片段</div>}
                  </div>
                </div>
                <div className="director-section">
                  <button className="ghost-btn" onClick={() => void window.api.refreshStream()}>
                    刷新列表
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'replay' && (
              <div className="director-panel">
                <div className="director-section">
                  <div className="director-title">已生成视频 / 回放</div>
                  <div className="director-list">
                    {videos.map((v, idx) => (
                      <div
                        key={v.name}
                        className={v.name === currentVideo ? 'director-item active' : 'director-item'}
                        onClick={() => {
                          setCurrentVideo(v.name)
                          setWaitingForNext(false)
                        }}
                      >
                        <span>#{String(idx + 1).padStart(3, '0')}</span>
                        <span className="director-name">{v.name}</span>
                        <span className="director-size">{(v.size / 1024 / 1024).toFixed(1)} MB</span>
                        <span className="play-icon">▶</span>
                      </div>
                    ))}
                    {videos.length === 0 && <div className="director-empty">还没有生成视频</div>}
                  </div>
                </div>
                <div className="director-section">
                  <button className="ghost-btn" onClick={() => void window.api.refreshStream()}>
                    刷新列表
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {settingsOpen && settings && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={async (next) => {
            const saved = await window.api.saveSettings(next)
            setSettings(saved)
            setEngineStatus(saved.model ? `引擎：${saved.model}` : '未配置 AI 引擎')
            setSettingsOpen(false)
          }}
        />
      )}

      {projectOpen && settings && !profile && (
        <ProjectStartModal
          settings={settings}
          starting={starting}
          onClose={() => setProjectOpen(false)}
          onStart={startProject}
          onSaved={(next) => setSettings(next)}
        />
      )}
    </div>
  )
}

function ProjectStartModal({
  settings,
  starting,
  onClose,
  onStart,
  onSaved
}: {
  settings: AppSettings
  starting: boolean
  onClose: () => void
  onStart: () => Promise<void>
  onSaved: (next: AppSettings) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<AppSettings>({ ...settings })
  const [status, setStatus] = useState('')

  const chooseImage = async (): Promise<void> => {
    const file = await window.api.chooseReferenceImage()
    if (file) setDraft((d) => ({ ...d, referenceImagePath: file }))
  }

  const chooseWorkflow = async (): Promise<void> => {
    const file = await window.api.chooseWorkflow()
    if (file) setDraft((d) => ({ ...d, workflowPath: file }))
  }

  const chooseDir = async (): Promise<void> => {
    const dir = await window.api.chooseDirectory()
    if (dir) setDraft((d) => ({ ...d, streamsDir: dir }))
  }

  const testComfy = async (): Promise<void> => {
    const saved = await window.api.saveSettings(draft)
    setDraft(saved)
    onSaved(saved)
    const result = await window.api.testComfy()
    setStatus(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`)
  }

  const start = async (): Promise<void> => {
    setStatus('正在保存配置并初始化…')
    const saved = await window.api.saveSettings(draft)
    setDraft(saved)
    onSaved(saved)
    await onStart()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🚀 开播配置</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="form-row">
          <label>直播片段目录（AI 生成的 seg_xxx.mp4 会存到这里）</label>
          <div className="input-with-btn">
            <input
              value={draft.streamsDir}
              onChange={(e) => setDraft((d) => ({ ...d, streamsDir: e.target.value }))}
              placeholder="存放 seg_xxx.mp4 的目录"
            />
            <button className="ghost-btn" onClick={() => void chooseDir()}>
              浏览
            </button>
          </div>
        </div>

        <div className="form-row">
          <label>参考信息模式</label>
          <div>
            <label className="inline-radio">
              <input
                type="radio"
                checked={draft.referenceMode === 'image'}
                onChange={() => setDraft((d) => ({ ...d, referenceMode: 'image' }))}
              />
              参考图（多模态模型可直接看）
            </label>
            <label className="inline-radio">
              <input
                type="radio"
                checked={draft.referenceMode === 'description'}
                onChange={() => setDraft((d) => ({ ...d, referenceMode: 'description' }))}
              />
              文字描述
            </label>
          </div>
        </div>

        <div className="form-row">
          <label>参考图文件（ComfyUI 生成使用）</label>
          <div className="input-with-btn">
            <input
              value={draft.referenceImagePath}
              onChange={(e) => setDraft((d) => ({ ...d, referenceImagePath: e.target.value }))}
              placeholder="选择参考图文件"
            />
            <button className="ghost-btn" onClick={() => void chooseImage()}>
              选择图片
            </button>
          </div>
        </div>

        {draft.referenceMode === 'description' && (
          <div className="form-row">
            <label>参考图文字描述（作为主播外貌依据）</label>
            <textarea
              value={draft.referenceDescription}
              onChange={(e) => setDraft((d) => ({ ...d, referenceDescription: e.target.value }))}
              placeholder="例如：年轻女性，黑色长直发，白色汉服，双白色发带，手持白色长剑，背景为古代庭院…"
              rows={5}
            />
          </div>
        )}

        <div className="form-row">
          <label>主播性格（留空或填 random 表示由 AI 自动生成）</label>
          <textarea
            value={draft.personality}
            onChange={(e) => setDraft((d) => ({ ...d, personality: e.target.value }))}
            placeholder="例如：温柔治愈、慢热、话痨… 或留空/random"
            rows={2}
          />
        </div>

        <div className="form-row">
          <label>ComfyUI 地址</label>
          <input
            value={draft.comfyUrl}
            onChange={(e) => setDraft((d) => ({ ...d, comfyUrl: e.target.value }))}
            placeholder="http://127.0.0.1:8188"
          />
        </div>

        <div className="form-row">
          <label>ComfyUI 工作流 JSON</label>
          <div className="input-with-btn">
            <input
              value={draft.workflowPath}
              onChange={(e) => setDraft((d) => ({ ...d, workflowPath: e.target.value }))}
              placeholder="选择本地 workflow.json"
            />
            <button className="ghost-btn" onClick={() => void chooseWorkflow()}>
              选择工作流
            </button>
          </div>
        </div>

        <div className="form-row form-grid">
          <div>
            <label>清晰度 / 分辨率</label>
            <input
              value={draft.resolution}
              onChange={(e) => setDraft((d) => ({ ...d, resolution: e.target.value }))}
              placeholder="例如 0.4MP 或 1280x720"
            />
          </div>
          <div>
            <label>生成步数</label>
            <input
              type="number"
              value={draft.steps}
              onChange={(e) => setDraft((d) => ({ ...d, steps: Number(e.target.value) || 6 }))}
              min={1}
            />
          </div>
          <div>
            <label>每段时长（秒）</label>
            <input
              type="number"
              value={draft.durationSec}
              onChange={(e) => setDraft((d) => ({ ...d, durationSec: Number(e.target.value) || 10 }))}
              min={1}
            />
          </div>
        </div>

        <div className="form-row">
          <label>额外自定义要求</label>
          <textarea
            value={draft.extraRequirements}
            onChange={(e) => setDraft((d) => ({ ...d, extraRequirements: e.target.value }))}
            placeholder="适配工作流的补充要求，例如：镜头固定、夜晚场景、无字幕等"
            rows={3}
          />
        </div>

        {status && <div className="start-status">{status}</div>}

        <div className="modal-actions">
          <button className="ghost-btn" onClick={() => void testComfy()}>
            🔌 测试 ComfyUI
          </button>
          <button className="ghost-btn" onClick={onClose}>
            取消
          </button>
          <button className="primary-btn" disabled={starting} onClick={() => void start()}>
            {starting ? '正在初始化…' : '▶ 开始直播'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingsModal({
  settings,
  onClose,
  onSave
}: {
  settings: AppSettings
  onClose: () => void
  onSave: (next: AppSettings) => Promise<void>
}): React.JSX.Element {
  const [draft, setDraft] = useState<AppSettings>({ ...settings })
  const [status, setStatus] = useState('')
  const [models, setModels] = useState<Array<{ id: string; name?: string }>>([])

  const chooseDir = async (): Promise<void> => {
    const dir = await window.api.chooseDirectory()
    if (dir) setDraft((d) => ({ ...d, streamsDir: dir }))
  }

  const testEngine = async (): Promise<void> => {
    const saved = await window.api.saveSettings(draft)
    setDraft(saved)
    const result = await window.api.testEngine()
    setStatus(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`)
  }

  const loadModels = async (): Promise<void> => {
    const saved = await window.api.saveSettings(draft)
    setDraft(saved)
    setStatus('正在获取模型列表…')
    const result = await window.api.listEngineModels()
    if (result.ok && result.models) {
      setModels(result.models)
      setStatus(`✅ ${result.message}`)
    } else {
      setStatus(`❌ ${result.message}`)
    }
  }

  const testComfy = async (): Promise<void> => {
    const saved = await window.api.saveSettings(draft)
    setDraft(saved)
    const result = await window.api.testComfy()
    setStatus(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>设置</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="form-row">
          <label>片段目录</label>
          <div className="input-with-btn">
            <input
              value={draft.streamsDir}
              onChange={(e) => setDraft((d) => ({ ...d, streamsDir: e.target.value }))}
              placeholder="例如 D:\桌面\Projects\streams"
            />
            <button className="ghost-btn" onClick={() => void chooseDir()}>
              浏览
            </button>
          </div>
        </div>

        <div className="settings-section-title">🤖 内置 AI 引擎（OpenAI 兼容 API）</div>

        <div className="form-row">
          <label>API 地址（base_url，如 https://api.openai.com/v1 或 http://localhost:11434/v1）</label>
          <input
            value={draft.apiBaseUrl}
            onChange={(e) => setDraft((d) => ({ ...d, apiBaseUrl: e.target.value }))}
            placeholder="https://api.openai.com/v1"
          />
        </div>

        <div className="form-row">
          <label>API Key（本地模型可留空）</label>
          <input
            type="password"
            value={draft.apiKey}
            onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
            placeholder="sk-..."
          />
        </div>

        <div className="form-row">
          <label>模型名称（可点击「获取模型」拉取列表选择，也可手动输入）</label>
          <div className="input-with-btn">
            <input
              value={draft.model}
              onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
              placeholder="如 gpt-4o / deepseek-chat / llama3 等"
            />
            <button className="ghost-btn" onClick={() => void loadModels()}>
              📋 获取模型
            </button>
          </div>
          {models.length > 0 && (
            <select
              className="session-select"
              value={draft.model}
              onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
            >
              <option value="">选择模型…</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="modal-actions">
          <button className="ghost-btn" onClick={() => void testEngine()}>
            🔌 测试 AI 引擎
          </button>
        </div>

        <div className="settings-section-title" style={{ marginTop: 24 }}>
          🎬 ComfyUI 生成
        </div>

        <div className="form-row">
          <label>ComfyUI 地址</label>
          <input
            value={draft.comfyUrl}
            onChange={(e) => setDraft((d) => ({ ...d, comfyUrl: e.target.value }))}
            placeholder="http://127.0.0.1:8188"
          />
        </div>
        <div className="modal-actions">
          <button className="ghost-btn" onClick={() => void testComfy()}>
            🔌 测试 ComfyUI
          </button>
        </div>

        {status && <div className="start-status">{status}</div>}

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>
            取消
          </button>
          <button className="primary-btn" onClick={() => void onSave(draft)}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}