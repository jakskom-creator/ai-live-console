# AI Live Console

一个通用的桌面版「AI 直播模拟器」界面外壳。它把 AI 生成的直播片段（`seg_001.mp4`、`seg_002.mp4`…）包装成真实的电脑直播软件体验：

- 左侧：直播画面，自动连播 AI 生成的片段
- 右侧：弹幕、礼物、活动、导演控制台
- 内置 AI 导演引擎（OpenAI 兼容 API）：生成主播台词、模拟观众弹幕、编写视频提示词
- 自动提交 ComfyUI 生成下一段直播视频，边播边生成

本项目定位为**通用全年龄直播界面外壳**，不包含任何具体角色、成人内容或专属生成工作流。你可以接入自己的 AI 模型与视频生成后端。

---

## 功能

- 🎬 **视频播放器**
  - 自动播放本地 `*.mp4` 片段，新片段生成后自动出现在列表并排队连播
  - 分段点击跳播、打开目录、在线人数、全屏模式

- 💬 **弹幕系统**
  - 聊天列表 + 画面上飘过的弹幕
  - 输入弹幕后交给 AI 导演，主播台词 / 观众弹幕实时回显

- 🎁 **礼物系统**
  - 内置小额 / 大额 / 礼物级礼物
  - 礼物横幅特效、打赏消息自动进入 AI 导演回合

- 🎮 **活动按钮**
  - 点歌、换装、换姿势、聊天话题、ASMR、抽奖、投票、PK、下播等
  - 一键生成「直播指令」并发送

- 🚀 **开播配置**
  - 选择主播参考图（或填写文字描述）
  - 填写 ComfyUI 地址、选择工作流 JSON
  - 配置清晰度、步数、每段时长
  - 定义主播性格，或留空让 AI 随机生成

- 🤖 **内置 AI 导演引擎**
  - OpenAI 兼容 API（`apiBaseUrl` + `apiKey` + `model`）
  - 每回合生成：主播台词、模拟观众弹幕、礼物/特效反馈
  - 输出 H3 Ref2VA 六段式视频提示词，并维护主播五区状态系统（防服装/状态回穿）

- 🎬 **导演控制台**
  - AI 引擎连接状态 / 测试 / 模型列表
  - 主播角色卡、主播状态系统、AI 对话后台
  - 直播片段列表 / 回放

- ⚙️ **设置**
  - 直播片段目录
  - AI 引擎 API 地址 / Key / 模型
  - ComfyUI 地址

---

## 工作流程

```text
观众互动（弹幕 / 礼物 / 活动）
        │
        ▼
内置 AI 导演引擎（OpenAI 兼容 API）
  ├─ 主播台词 + 观众弹幕 + 特效反馈
  └─ H3 Ref2VA 六段式 videoPrompt
        │
        ▼
ComfyUI 生成 seg_xxx.mp4
        │
        ▼
自动连播 + 弹幕 / 特效回显
```

---

## 界面预览（示意）

```text
┌──────────────────────────────────────────────────────────────┐
│  🎥 AI Live Console   ● LIVE            🔗 已连接   ⚙️ 设置   │
├───────────────────────────────────┬──────────────────────────┤
│                                   │  [弹幕] [礼物] [活动] [导演] │
│           直播画面                 │                          │
│      （AI 生成片段自动连播）          │  聊天列表 / 礼物 / 活动    │
│                                   │                          │
│                                   │  [输入框.........] [发送]   │
└───────────────────────────────────┴──────────────────────────┘
```

---

## 技术栈

- Electron
- React 19
- TypeScript
- Vite / electron-vite
- chokidar（文件监控）
- electron-builder（Windows 打包）

---

## 快速开始

### 环境要求

- Windows 10/11
- Node.js 20+

### 安装

```bash
npm install
```

### 开发运行

```bash
npm run dev
```

### 打包 Windows 安装包

```bash
npm run dist:win
```

安装包输出在 `release/` 目录。

### 可选：配套的全年龄直播技能

本仓库附带一个独立的全年龄「AI 虚拟直播」技能（`skills/ai-live-simulator/SKILL.md`），
面向 DeepSeek Harness 用户：在 Harness 会话中把直播互动变成连续的 AI 直播视频与反馈。
它不是本应用的必需组件，按需安装：

```bash
npm run install:skill
```

---

## 目录结构

```text
ai-live-console/
├─ electron.vite.config.ts
├─ package.json
├─ src/
│  ├─ main/
│  │  ├─ index.ts             # Electron 主进程入口
│  │  ├─ streamServer.ts      # 本地视频服务 + 文件监听
│  │  ├─ settingsStore.ts     # 设置持久化
│  │  ├─ aiEngine.ts          # 内置 AI 导演引擎（OpenAI 兼容 API）
│  │  ├─ liveDirectorSkill.ts # 导演系统提示词（全年龄通用版）
│  │  ├─ comfyExecutor.ts     # ComfyUI 生成执行器
│  │  └─ feedbackWatcher.ts   # 反馈事件监听（JSON 队列）
│  ├─ preload/
│  │  └─ index.ts             # IPC 安全通道
│  ├─ renderer/
│  │  └─ src/
│  │     ├─ App.tsx           # 直播界面
│  │     └─ styles.css
│  └─ shared/
│     └─ types.ts
├─ scripts/
│  ├─ install-skill.cmd
│  └─ install-skill.ps1
└─ skills/
   └─ ai-live-simulator/
      └─ SKILL.md
```

---

## License

[MIT](./LICENSE)
