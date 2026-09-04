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
import { giftLevelName, tr, type Lang } from '../../shared/i18n'

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
  key: string
  name: string
  nameEn: string
  emoji: string
  level: string
  price: number
}

const GIFTS: GiftItem[] = [
  { key: 'heart', name: '小心心', nameEn: 'Little Heart', emoji: '💗', level: '小额', price: 1 },
  { key: 'lollipop', name: '棒棒糖', nameEn: 'Lollipop', emoji: '🍭', level: '小额', price: 5 },
  { key: 'sign', name: '灯牌', nameEn: 'Fan Sign', emoji: '🏮', level: '小额', price: 10 },
  { key: 'sportscar', name: '跑车', nameEn: 'Sports Car', emoji: '🏎️', level: '大额', price: 100 },
  { key: 'rocket', name: '火箭', nameEn: 'Rocket', emoji: '🚀', level: '大额', price: 500 },
  { key: 'carnival', name: '嘉年华', nameEn: 'Carnival', emoji: '🎆', level: '礼物级', price: 1000 }
]

const ACTIVITIES: { key: string; zh: string; en: string }[] = [
  { key: 'song', zh: '点歌', en: 'Request Song' },
  { key: 'costume', zh: '换装', en: 'Outfit Change' },
  { key: 'pose', zh: '换姿势', en: 'New Pose' },
  { key: 'topic', zh: '聊天话题', en: 'Chat Topic' },
  { key: 'asmr', zh: 'ASMR', en: 'ASMR' },
  { key: 'lottery', zh: '抽奖', en: 'Lottery' },
  { key: 'vote', zh: '投票', en: 'Vote' },
  { key: 'pk', zh: 'PK挑战', en: 'PK Battle' },
  { key: 'end', zh: '下播', en: 'End Stream' }
]

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
const CLOTH_ZONES: { key: keyof ClothingState; emoji: string }[] = [
  { key: 'head', emoji: '👒' },
  { key: 'upper', emoji: '👚' },
  { key: 'lower', emoji: '👗' },
  { key: 'legs', emoji: '🧦' },
  { key: 'note', emoji: '📝' }
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
  const [engineStatus, setEngineStatus] = useState('')
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

  const lang: Lang = settings?.language === 'en' ? 'en' : 'zh'
  const t = useCallback((key: string, vars?: Record<string, string | number>) => tr(lang, key, vars), [lang])

  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'
  }, [lang])

  useEffect(() => {
    void window.api.getSettings().then((s) => {
      setSettings(s)
      setEngineStatus(s.model ? t('status.engineModel', { model: s.model }) : t('status.engineNotConfigured'))
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
      setEngineStatus(r.message)
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
  }, [t])

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
        const line = `${event.user || t('common.viewer')}：${event.text}`
        pushChat({ id: nextId('fb'), kind: 'danmaku', user: event.user, content: line, time: Date.now() })
        pushDanmaku(line)
      } else if (event.type === 'effect') {
        const name = event.effect || t('common.effect')
        pushChat({
          id: nextId('fx'),
          kind: 'gift',
          content: `✨ ${event.text || name}`,
          time: Date.now()
        })
        setGiftBanner({ name, emoji: '✨', level: t('stage.effectLevel') })
        setTimeout(() => setGiftBanner(null), 4500)
      } else if (event.type === 'system') {
        pushChat({ id: nextId('fb-sys'), kind: 'system', content: event.text, time: Date.now() })
      }
    })
    return off
  }, [pushChat, pushDanmaku, t])

  const interact = useCallback(
    async (raw: string): Promise<void> => {
      const text = raw.trim()
      if (!text) return
      if (!profile) {
        pushChat({
          id: nextId('sys'),
          kind: 'system',
          content: `⚠️ ${t('status.notLiveYet')}`,
          time: Date.now()
        })
        return
      }
      // 本地回显观众输入
      pushChat({ id: nextId('chat'), kind: 'danmaku', user: t('chat.me'), content: `${t('chat.me')}：${text}`, time: Date.now() })
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
    [profile, pushChat, pushDanmaku, t]
  )

  const sendPendingInteraction = useCallback(
    (rawMessage: string) => {
      if (pendingGift) {
        const gift = pendingGift
        const giftName = lang === 'en' ? gift.nameEn : gift.name
        const levelName = giftLevelName(gift.level, lang)
        const note = rawMessage.trim() ? t('chat.giftNote', { msg: rawMessage.trim() }) : ''
        const giftLine = t('chat.giftSentLine', { name: giftName, level: levelName, msg: note })
        pushChat({ id: nextId('gift'), kind: 'gift', content: giftLine, time: Date.now() })
        pushDanmaku(t('chat.giftDanmaku', { emoji: gift.emoji, name: giftName }))
        setGiftBanner({ name: giftName, emoji: gift.emoji, level: levelName })
        setTimeout(() => setGiftBanner(null), 4500)
        setPendingGift(null)
        setChatInput('')
        // 送给 AI 引擎
        const message = rawMessage.trim()
        const input =
          lang === 'en'
            ? `[Gift] Sent "${giftName}"${message ? `, note: ${message}` : ''}`
            : `【礼物】送出「${gift.name}」${message ? `，留言：${message}` : ''}`
        void interact(`我 ${input}`)
        return
      }
      void interact(rawMessage)
    },
    [pendingGift, interact, pushChat, pushDanmaku, lang, t]
  )

  const sendGift = useCallback((gift: GiftItem) => {
    setPendingGift(gift)
  }, [])

  const sendActivity = useCallback(
    (activity: { key: string; zh: string; en: string }) => {
      const actName = lang === 'en' ? activity.en : activity.zh
      const line = t('chat.activityLine', { activity: actName })
      pushChat({ id: nextId('act'), kind: 'activity', content: line, time: Date.now() })
      pushDanmaku(t('chat.activityDanmaku', { activity: actName }))
      setChatInput('')
      void interact(line)
    },
    [interact, pushChat, pushDanmaku, lang, t]
  )

  const startProject = useCallback(async () => {
    setStarting(true)
    setEngineStatus(t('status.generating'))
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
          content: t('status.liveStart', { name: state.profile?.name || t('common.unknown') }),
          time: Date.now()
        })
      }
    } catch (error: any) {
      setEngineStatus(`❌ ${String(error?.message || error)}`)
    } finally {
      setStarting(false)
    }
  }, [pushChat, t])

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
          <span className="online-count" title={t('header.onlineCount')}>
            👥 {onlineCount}
          </span>
          <button className="primary-btn small" onClick={() => (profile ? resetProject() : setProjectOpen(true))}>
            {profile ? t('header.restart') : t('header.goLive')}
          </button>
          <span className="engine-status" title={engineStatus}>
            🔗 {engineStatus}
          </span>
          <button className="ghost-btn" onClick={() => setSettingsOpen(true)}>
            {t('header.settings')}
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
                <div>{t('stage.waiting')}</div>
                <div className="empty-hint">{t('stage.waitingHint')}</div>
              </div>
            )}

            <div className="stage-topbar">
              <div className="stage-topbar-left">
                <span className="room-name">
                  {profile ? t('stage.roomName', { name: profile.name }) : t('stage.roomNameDefault')}
                </span>
              </div>
              <div className="stage-topbar-right">
                <span className="seg-name">{currentVideo || t('stage.notLive')}</span>
                <button className="stage-btn" onClick={toggleFullscreen} title={t('stage.fullscreen')}>
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
                  {t('stage.giftSent')} <strong>{giftBanner.name}</strong>
                </div>
                <div className="gift-level">{t('stage.giftLevel', { level: giftBanner.level })}</div>
              </div>
            )}
          </div>

          <div className="stage-info">
            <span>{settings?.streamsDir ? t('stage.dir', { dir: settings.streamsDir }) : t('stage.noDir')}</span>
            <span>{t('stage.segmentCount', { count: videos.length })}</span>
            {engineState && <span className="state-hint">🎭 {engineState.slice(0, 30)}…</span>}
            <button className="ghost-btn" onClick={() => setPlayNonce((n) => n + 1)} disabled={!currentVideo}>
              {t('stage.replay')}
            </button>
            <button className="ghost-btn" onClick={() => void window.api.openPath(settings?.streamsDir || '')}>
              {t('stage.openDir')}
            </button>
          </div>
        </section>

        <aside className="side">
          <div className="tabs">
            {(
              [
                ['chat', 'tabs.chat'],
                ['gifts', 'tabs.gifts'],
                ['activity', 'tabs.activity'],
                ['director', 'tabs.director'],
                ['replay', 'tabs.replay']
              ] as [TabKey, string][]
            ).map(([key, labelKey]) => (
              <button
                key={key}
                className={activeTab === key ? 'tab active' : 'tab'}
                onClick={() => setActiveTab(key)}
              >
                {t(labelKey)}
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
                      <span>{lang === 'en' ? pendingGift.nameEn : pendingGift.name}</span>
                      <button className="ghost-btn" onClick={() => setPendingGift(null)}>
                        {t('chat.cancelGift')}
                      </button>
                    </div>
                  )}
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') sendPendingInteraction(chatInput)
                    }}
                    placeholder={pendingGift ? t('chat.giftPlaceholder') : t('chat.placeholder')}
                  />
                  <button className="send-btn" onClick={() => sendPendingInteraction(chatInput)}>
                    {pendingGift ? t('chat.sendGift') : t('chat.send')}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'gifts' && (
              <div className="gift-grid">
                {GIFTS.map((gift) => (
                  <button key={gift.key} className="gift-card" onClick={() => sendGift(gift)}>
                    <div className="gift-emoji-big">{gift.emoji}</div>
                    <div className="gift-name">{lang === 'en' ? gift.nameEn : gift.name}</div>
                    <div className={`gift-level-tag ${gift.level}`}>{giftLevelName(gift.level, lang)}</div>
                    <div className="gift-price">{t('gifts.coins', { price: gift.price })}</div>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="activity-grid">
                {ACTIVITIES.map((activity) => (
                  <button key={activity.key} className="activity-card" onClick={() => sendActivity(activity)}>
                    {lang === 'en' ? activity.en : activity.zh}
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'director' && (
              <div className="director-panel">
                <div className="director-section">
                  <div className="director-title">{t('director.engine')}</div>
                  <div className="director-status">{engineStatus}</div>
                  <button className="ghost-btn" onClick={() => void window.api.testEngine().then((r) => setEngineStatus(r.message))}>
                    {t('director.testEngine')}
                  </button>
                </div>
                <div className="director-section">
                  <div className="director-title">{t('director.anchor')}</div>
                  <div className="director-status">
                    {profile ? `🎤 ${profile.name}` : t('director.notLive')}
                  </div>
                  {profile && (
                    <>
                      <div className="director-status dim">
                        <div>{t('director.persona', { v: profile.persona })}</div>
                        <div>{t('director.scene', { v: profile.scene })}</div>
                      </div>
                      <div className="cloth-state-bar">
                        {CLOTH_ZONES.map((z) => {
                          const raw = clothingState[z.key]
                          const absent = isAbsent(raw)
                          const label = t(`cloth.${z.key}`)
                          const text = absent ? t('cloth.removed') : raw && raw.trim() ? raw.trim() : t('cloth.fallback')
                          return (
                            <div
                              key={z.key}
                              className={`cloth-state-item${absent ? ' absent' : ''}`}
                              title={absent ? t('cloth.absentTitle', { zone: label }) : text}
                            >
                              <span className="cloth-state-emoji">{z.emoji}</span>
                              <span className="cloth-state-body">
                                <span className="cloth-state-label">{label}</span>
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
                  <div className="director-title">{t('director.state')}</div>
                  <div className="director-status dim">{engineState || '—'}</div>
                </div>
                <div className="director-section">
                  <div className="director-title">{t('director.conversation')}</div>
                  <div className="conversation-list">
                    {conversation.length === 0 && <div className="director-empty">{t('director.noConversation')}</div>}
                    {conversation.map((c, i) => (
                      <div key={i} className={`conv-entry ${c.role === 'user' ? 'user' : 'assistant'}`}>
                        <div className="conv-role">{c.role === 'user' ? t('director.me') : t('director.ai')}</div>
                        <pre className="conv-content">{c.content}</pre>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="director-section">
                  <div className="director-title">{t('director.segments')}</div>
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
                    {videos.length === 0 && <div className="director-empty">{t('director.noSegments')}</div>}
                  </div>
                </div>
                <div className="director-section">
                  <button className="ghost-btn" onClick={() => void window.api.refreshStream()}>
                    {t('director.refresh')}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'replay' && (
              <div className="director-panel">
                <div className="director-section">
                  <div className="director-title">{t('director.replayTitle')}</div>
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
                    {videos.length === 0 && <div className="director-empty">{t('director.noVideos')}</div>}
                  </div>
                </div>
                <div className="director-section">
                  <button className="ghost-btn" onClick={() => void window.api.refreshStream()}>
                    {t('director.refresh')}
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
            setEngineStatus(saved.model ? t('status.engineModel', { model: saved.model }) : t('status.engineNotConfigured'))
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
  const lang: Lang = settings.language === 'en' ? 'en' : 'zh'
  const t = useCallback((key: string, vars?: Record<string, string | number>) => tr(lang, key, vars), [lang])
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
    setStatus(t('start.saving'))
    const saved = await window.api.saveSettings(draft)
    setDraft(saved)
    onSaved(saved)
    await onStart()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('start.title')}</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="form-row">
          <label>{t('start.streamsDir')}</label>
          <div className="input-with-btn">
            <input
              value={draft.streamsDir}
              onChange={(e) => setDraft((d) => ({ ...d, streamsDir: e.target.value }))}
              placeholder={t('start.streamsDirPlaceholder')}
            />
            <button className="ghost-btn" onClick={() => void chooseDir()}>
              {t('start.browse')}
            </button>
          </div>
        </div>

        <div className="form-row">
          <label>{t('start.refMode')}</label>
          <div>
            <label className="inline-radio">
              <input
                type="radio"
                checked={draft.referenceMode === 'image'}
                onChange={() => setDraft((d) => ({ ...d, referenceMode: 'image' }))}
              />
              {t('start.refImageMode')}
            </label>
            <label className="inline-radio">
              <input
                type="radio"
                checked={draft.referenceMode === 'description'}
                onChange={() => setDraft((d) => ({ ...d, referenceMode: 'description' }))}
              />
              {t('start.textMode')}
            </label>
          </div>
        </div>

        <div className="form-row">
          <label>{t('start.refFile')}</label>
          <div className="input-with-btn">
            <input
              value={draft.referenceImagePath}
              onChange={(e) => setDraft((d) => ({ ...d, referenceImagePath: e.target.value }))}
              placeholder={t('start.chooseRefFile')}
            />
            <button className="ghost-btn" onClick={() => void chooseImage()}>
              {t('start.chooseImage')}
            </button>
          </div>
        </div>

        {draft.referenceMode === 'description' && (
          <div className="form-row">
            <label>{t('start.refDescription')}</label>
            <textarea
              value={draft.referenceDescription}
              onChange={(e) => setDraft((d) => ({ ...d, referenceDescription: e.target.value }))}
              placeholder={t('start.refDescriptionPlaceholder')}
              rows={5}
            />
          </div>
        )}

        <div className="form-row">
          <label>{t('start.personality')}</label>
          <textarea
            value={draft.personality}
            onChange={(e) => setDraft((d) => ({ ...d, personality: e.target.value }))}
            placeholder={t('start.personalityPlaceholder')}
            rows={2}
          />
        </div>

        <div className="form-row">
          <label>{t('start.comfyUrl')}</label>
          <input
            value={draft.comfyUrl}
            onChange={(e) => setDraft((d) => ({ ...d, comfyUrl: e.target.value }))}
            placeholder="http://127.0.0.1:8188"
          />
        </div>

        <div className="form-row">
          <label>{t('start.workflow')}</label>
          <div className="input-with-btn">
            <input
              value={draft.workflowPath}
              onChange={(e) => setDraft((d) => ({ ...d, workflowPath: e.target.value }))}
              placeholder={t('start.workflowPlaceholder')}
            />
            <button className="ghost-btn" onClick={() => void chooseWorkflow()}>
              {t('start.chooseWorkflow')}
            </button>
          </div>
        </div>

        <div className="form-row form-grid">
          <div>
            <label>{t('start.resolution')}</label>
            <input
              value={draft.resolution}
              onChange={(e) => setDraft((d) => ({ ...d, resolution: e.target.value }))}
              placeholder={t('start.resolutionPlaceholder')}
            />
          </div>
          <div>
            <label>{t('start.steps')}</label>
            <input
              type="number"
              value={draft.steps}
              onChange={(e) => setDraft((d) => ({ ...d, steps: Number(e.target.value) || 6 }))}
              min={1}
            />
          </div>
          <div>
            <label>{t('start.duration')}</label>
            <input
              type="number"
              value={draft.durationSec}
              onChange={(e) => setDraft((d) => ({ ...d, durationSec: Number(e.target.value) || 10 }))}
              min={1}
            />
          </div>
        </div>

        <div className="form-row">
          <label>{t('start.extra')}</label>
          <textarea
            value={draft.extraRequirements}
            onChange={(e) => setDraft((d) => ({ ...d, extraRequirements: e.target.value }))}
            placeholder={t('start.extraPlaceholder')}
            rows={3}
          />
        </div>

        {status && <div className="start-status">{status}</div>}

        <div className="modal-actions">
          <button className="ghost-btn" onClick={() => void testComfy()}>
            {t('start.testComfy')}
          </button>
          <button className="ghost-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="primary-btn" disabled={starting} onClick={() => void start()}>
            {starting ? t('start.initializing') : t('start.goLive')}
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
  const lang: Lang = settings.language === 'en' ? 'en' : 'zh'
  const t = useCallback((key: string, vars?: Record<string, string | number>) => tr(lang, key, vars), [lang])
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
    setStatus(t('settings.fetchingModels'))
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
          <h2>{t('settings.title')}</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="form-row">
          <label>{t('settings.streamsDir')}</label>
          <div className="input-with-btn">
            <input
              value={draft.streamsDir}
              onChange={(e) => setDraft((d) => ({ ...d, streamsDir: e.target.value }))}
              placeholder={t('settings.streamsDirPlaceholder')}
            />
            <button className="ghost-btn" onClick={() => void chooseDir()}>
              {t('start.browse')}
            </button>
          </div>
        </div>

        <div className="form-row">
          <label>{t('settings.language')}</label>
          <div>
            <label className="inline-radio">
              <input
                type="radio"
                checked={draft.language === 'zh'}
                onChange={() => setDraft((d) => ({ ...d, language: 'zh' }))}
              />
              中文
            </label>
            <label className="inline-radio">
              <input
                type="radio"
                checked={draft.language === 'en'}
                onChange={() => setDraft((d) => ({ ...d, language: 'en' }))}
              />
              English
            </label>
          </div>
        </div>

        <div className="settings-section-title">{t('settings.engineSection')}</div>

        <div className="form-row">
          <label>{t('settings.apiBaseUrl')}</label>
          <input
            value={draft.apiBaseUrl}
            onChange={(e) => setDraft((d) => ({ ...d, apiBaseUrl: e.target.value }))}
            placeholder="https://api.openai.com/v1"
          />
        </div>

        <div className="form-row">
          <label>{t('settings.apiKey')}</label>
          <input
            type="password"
            value={draft.apiKey}
            onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
            placeholder="sk-..."
          />
        </div>

        <div className="form-row">
          <label>{t('settings.model')}</label>
          <div className="input-with-btn">
            <input
              value={draft.model}
              onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
              placeholder={t('settings.modelPlaceholder')}
            />
            <button className="ghost-btn" onClick={() => void loadModels()}>
              {t('settings.fetchModels')}
            </button>
          </div>
          {models.length > 0 && (
            <select
              className="session-select"
              value={draft.model}
              onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
            >
              <option value="">{t('settings.chooseModel')}</option>
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
            {t('settings.testEngine')}
          </button>
        </div>

        <div className="settings-section-title" style={{ marginTop: 24 }}>
          {t('settings.comfySection')}
        </div>

        <div className="form-row">
          <label>{t('settings.comfyUrl')}</label>
          <input
            value={draft.comfyUrl}
            onChange={(e) => setDraft((d) => ({ ...d, comfyUrl: e.target.value }))}
            placeholder="http://127.0.0.1:8188"
          />
        </div>
        <div className="modal-actions">
          <button className="ghost-btn" onClick={() => void testComfy()}>
            {t('settings.testComfy')}
          </button>
        </div>

        {status && <div className="start-status">{status}</div>}

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="primary-btn" onClick={() => void onSave(draft)}>
            {t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
