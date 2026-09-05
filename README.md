# AI Live Console

一个通用的桌面版「AI 直播模拟器」界面外壳。它把 AI 生成的直播片段（`seg_001.mp4`、`seg_002.mp4`…）包装成真实的电脑直播软件体验：

- 左侧：直播画面，自动连播 AI 生成的片段
- 右侧：弹幕、礼物、活动、导演控制台
- 内置 AI 导演引擎（OpenAI 兼容 API）：生成主播台词、模拟观众弹幕、编写视频提示词
- 自动提交 ComfyUI 生成下一段直播视频，边播边生成

本项目定位为**通用全年龄直播界面外壳**，不包含任何具体角色、成人内容或专属生成工作流。你可以接入自己的 AI 模型与视频生成后端。

界面支持 **中 / English 双语切换**（设置 → 界面语言），切换后主播台词、观众弹幕、引擎提示也会跟随语言输出。

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
  - **🤖 AI 识别工作流**：自动分析工作流结构，识别提示词/参考图/参数节点位置，生成时自动填入对应占位符

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
  - 界面语言（中文 / English）

---

## 语言 / Language

应用内置**中英双语**，可在「设置 → 界面语言」中切换：

- **中文**（默认）：界面、主播台词、弹幕均为中文
- **English**：界面、主播台词、弹幕、引擎提示均为英文

语言偏好保存在本地设置中，重启后保持。切换语言后无需重启，立即生效。

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

## ComfyUI 工作流：推荐使用 Motion Context 插件

AI Live Console 按段生成视频（`seg_001.mp4`、`seg_002.mp4`…）。要让**连续片段之间的动作与声音真正接续**（不跳变、不重起），
强烈推荐配合 **H3 Motion Context** 插件使用：

- 📦 插件仓库：[NikoDemon80/ComfyUI-H3-Motion-Context](https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context)
- 功能：把上一段 H3 片段的 latent（画面 + 声音）直接喂给下一段，画面不经过像素往返（无色偏、不发虚），
  音频是「继续播放」而不是「重新开始一段相似的声音」
- 节点：`H3 Motion Context` / `H3 Motion Context Trim` / `H3 Motion Context Load Latent` / `H3 Motion Context Save Latent`
- 要求：ComfyUI 0.34.0 或更新版本

### 安装

把插件文件夹放进 `ComfyUI/custom_nodes/` 后重启 ComfyUI：

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context.git
```

### 本仓库提供的样本工作流

[`workflows/minimax-h3-long-video-motion-context.json`](workflows/minimax-h3-long-video-motion-context.json)
是一份可直接导入的 **MiniMax H3 长视频本地工作流**（Ref2VA 单图参考模式 + Motion Context 链式接续），
包含：

- `MiniMaxH3ReferenceToVideo`（单图参考 → 视频 + 声音）
- `MiniMaxH3MotionContextLoadLatent` / `SaveLatent`（段间 latent 链，`clip_index` 递增）
- `MiniMaxH3MotionContextTrim`（裁掉链接触头）
- 分辨率 / 时长 / 步数节点，供应用自动填写

导入方式：ComfyUI → **Workflow → Open**（或直接把 JSON 拖进画布）。
在应用「🚀 开播配置」中选择这份 JSON 作为工作流即可。

> 提示：工作流引用了若干模型/LoRA 文件名（见 `loaders` 节点），使用时请把对应模型放进
> `ComfyUI/models/` 对应目录（`diffusion_models` / `text_encoders` / `vae` / `loras`）。

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
