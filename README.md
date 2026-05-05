<div align="center">

# Unified Memory

**Optional local memory package for cross-device handoff and recent-context recall.**  
**用于跨端交接和最近上下文召回的可选本地记忆包。**

![Node.js](https://img.shields.io/badge/Node.js-20+-339933)
![macOS](https://img.shields.io/badge/macOS-14%2B-blue)
![Memory Requirement](https://img.shields.io/badge/free%20memory-3GB%2B-orange)
![Package](https://img.shields.io/badge/package-optional-purple)
![Memory](https://img.shields.io/badge/memory-local-blue)

</div>

---

## Introduction / 介绍

Unified Memory is an optional local memory package for Codex Remote Contact. It stores distilled handoff summaries between mobile chat planning, desktop Codex CLI work, remote execution mode, and recent local sessions.

Unified Memory 是 Codex Remote Contact 的可选本地记忆升级包，用于在手机聊天规划、桌面 Codex CLI 执行、远程执行模式和最近本地会话之间保存“交接摘要”。

It is not a full chat transcript store. It should keep only distilled ideas, decisions, preferences, open loops, daily state, and handoff clues.

它不是聊天全文仓库，只应保存提炼后的灵感、决策、偏好、待办、日常状态和交接线索。

QQ/group chat is excluded by default. Public group chat is usually noisy and should stay in a separate low-cost mode unless the deployer explicitly integrates it.

QQ/群聊默认不接入统一记忆。群聊通常噪声更高，建议保持独立低成本模式，除非明确需要接入。

## Features / 功能

| Feature / 功能 | Description / 说明 |
| :--- | :--- |
| Handoff memory / 交接记忆 | Stores the latest cross-device continuation summary and next actions.<br>保存最新跨端继续工作的摘要和下一步。 |
| Structured types / 结构化分类 | Supports `idea`, `handoff`, `projectNote`, `preference`, `openLoop`, and `dailyState`.<br>支持 `idea`、`handoff`、`projectNote`、`preference`、`openLoop`、`dailyState`。 |
| Flask memory model / 锥形瓶模型 | Keeps near-handoff details clear and distant context compact.<br>近处记忆清晰，远处记忆压缩成摘要。 |
| Recent-context recall / 最近上下文回看 | Can combine durable memory with recent local Codex session snippets.<br>可结合长期记忆和最近本地 Codex 会话片段进行召回。 |
| Local-first / 本地优先 | Data lives in this package's `data/` folder by default and can be moved with environment variables.<br>数据默认保存在本包 `data/` 目录，可用环境变量迁移。 |

## Requirements / 安装要求

| Requirement / 要求 | Notes / 说明 |
| :--- | :--- |
| Codex Remote Contact or Codex skill usage | The package can be loaded by the main hub or installed as a local Codex skill.<br>本包可由主程序加载，也可作为本地 Codex skill 使用。 |
| macOS 14 Sonoma or later | Follows the main hub requirement. Tested on macOS 15.7; macOS 14 is expected to work.<br>沿用主程序要求；已在 macOS 15.7 上验证，低一个大版本预计可用。 |
| Node.js 20+ | Used by the memory tool and ESM modules.<br>记忆工具和 ESM 模块需要。 |
| 3GB+ free memory | Recommended for the full QQBot + Codex CLI recall workflow.<br>建议至少 3GB 可用内存，尤其是同时运行 QQ机器人 和 Codex CLI 召回流程时。 |

## Project Structure / 项目结构

```text
unified-memory/
  src/unified-memory/
    index.js                      # Core memory store / 核心记忆库
    imessage-context.js           # Optional iMessage rolling context / iMessage 滚动上下文
    recent-context.js             # Recent local Codex context recall / 最近本地会话回看
  skill/
    SKILL.md                      # Installable Codex skill instructions / Skill 说明
    scripts/unified-memory-tool.mjs
  data/
    unified-memory.json           # Empty durable memory file / 空长期记忆
    imessage-memory.json          # Empty rolling chat file / 空私聊滚动记忆
    settings.json                 # Feature switches / 功能开关
  docs/
    data-schema.md
    hub-integration.md
  package.json
```

---

## Deployment Guide / 部署教程

### 1. Place next to the main hub / 放在主程序旁边

Recommended layout:

推荐目录结构：

```text
Projects/
  codexremotecontact/
  unified-memory/
```

The main hub auto-detects:

主程序会自动尝试加载：

```text
../unified-memory/src/unified-memory/index.js
```

Manual module path:

手动指定模块路径：

```bash
export CODEX_REMOTE_CONTACT_UNIFIED_MEMORY_MODULE="/absolute/path/to/unified-memory/src/unified-memory/index.js"
```

### 2. Initialize data files / 初始化数据文件

```bash
cd /path/to/unified-memory
node skill/scripts/unified-memory-tool.mjs init
node skill/scripts/unified-memory-tool.mjs status
```

Default data files:

默认数据文件：

```text
data/unified-memory.json
data/imessage-memory.json
data/settings.json
```

### 3. Configure data paths / 配置数据路径

If you want to store data elsewhere:

如果要把数据放到别处：

```bash
export UNIFIED_MEMORY_PATH="/absolute/path/to/unified-memory.json"
export UNIFIED_MEMORY_SETTINGS_PATH="/absolute/path/to/settings.json"
```

Example `data/settings.json`:

`data/settings.json` 示例：

```json
{
  "unifiedMemory": {
    "autoWriteOnSkillRecall": false,
    "autoWriteOnIMessageRecall": true,
    "manualHandoffCommand": true
  }
}
```

### 4. Integrate with the main hub / 接入主程序

If this package sits next to the main hub, Codex Remote Contact loads it automatically.

只要目录与主程序并列，Codex Remote Contact 会自动加载。

```bash
cd /path/to/codexremotecontact
npm start
```

If the package is loaded, startup logs should no longer show:

如果本包已加载，启动日志里不应再出现：

```text
unified-memory not installed; continuing with built-in fallback.
```

### 5. Install as a Codex Skill / 安装为 Codex Skill

If you want to use Unified Memory directly from Codex, copy or symlink `skill/SKILL.md` and the tool script into your Codex skills directory.

如果希望在 Codex 中直接使用统一记忆，可以把 `skill/SKILL.md` 和工具脚本复制或软链接到 Codex skills 目录。

```bash
mkdir -p "$HOME/.codex/skills/unified-memory"
cp /path/to/unified-memory/skill/SKILL.md "$HOME/.codex/skills/unified-memory/SKILL.md"
mkdir -p "$HOME/.codex/skills/unified-memory/scripts"
cp /path/to/unified-memory/skill/scripts/unified-memory-tool.mjs "$HOME/.codex/skills/unified-memory/scripts/unified-memory-tool.mjs"
```

---

## Command Examples / 命令示例

Status:

查看状态：

```bash
node skill/scripts/unified-memory-tool.mjs status
```

Write an idea:

写入想法：

```bash
node skill/scripts/unified-memory-tool.mjs write \
  --type idea \
  --source cli \
  --topic "memory design" \
  --summary "Near-handoff details stay clear; distant context becomes summarized."
```

Read:

读取：

```bash
node skill/scripts/unified-memory-tool.mjs read --query "memory design" --limit 5
```

Combined recall:

组合召回：

```bash
node skill/scripts/unified-memory-tool.mjs recall \
  --query "continue from the phone plan" \
  --limit 8 \
  --recent-limit 8
```

Clear:

清理：

```bash
node skill/scripts/unified-memory-tool.mjs clear --scope latest
node skill/scripts/unified-memory-tool.mjs clear --scope ideas
node skill/scripts/unified-memory-tool.mjs clear --scope currentState
node skill/scripts/unified-memory-tool.mjs clear --scope all
```

---

## Memory Types / 记忆类型

| Type / 类型 | Purpose / 用途 |
| :--- | :--- |
| `handoff` | Latest cross-device continuation state.<br>跨端继续工作的最新状态。 |
| `idea` | Ideas, algorithms, design concepts.<br>灵感、算法、设计概念。 |
| `projectNote` | Implementation progress, decisions, evidence.<br>实现进度、决策、证据。 |
| `preference` | Durable preferences.<br>长期偏好。 |
| `openLoop` | Unfinished tasks.<br>未完成任务。 |
| `dailyState` | Daily rhythm, body state, mood.<br>作息、身体、情绪等日常状态。 |

## Priority / 优先级

Recommended prompt order:

推荐提示词顺序：

1. Recent desktop/Codex window. / 最近桌面或 Codex 当前窗口。
2. Mobile/iMessage rolling context. / 手机或 iMessage 滚动上下文。
3. Long-term unified memory. / 长期统一记忆。

If they conflict, the newest live context wins. Long-term memory is background, not authority.

如果冲突，最新现场上下文优先。长期记忆只是背景，不是最高权限。

---

## Safety Rules / 安全规则

| Rule / 规则 | Description / 说明 |
| :--- | :--- |
| Prefer summaries / 优先摘要 | Store distilled summaries, not full transcripts.<br>保存提炼摘要，不保存全文。 |
| No secrets / 不保存敏感信息 | Never store tokens, API keys, passwords, private keys, one-time codes, or account credentials.<br>不保存 token、API key、密码、私钥、验证码或账号凭据。 |
| Sanitize before writing / 写入前脱敏 | Host apps should sanitize input before writing memory.<br>宿主应用应在写入前做脱敏。 |
| Current instruction wins / 当前指令优先 | Current user instructions override old memory.<br>当前用户指令永远优先于旧记忆。 |
| Verify stale memory / 核验过期记忆 | If memory might be stale, say so and verify cheaply when possible.<br>如果记忆可能过期，先说明并尽量低成本核验。 |

---

