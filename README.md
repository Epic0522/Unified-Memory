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

## How It Works / 工作原理

Unified Memory treats mobile chat, desktop Codex work, durable notes, and local runtime events as one continuous context stream.

统一记忆会把手机聊天、桌面 Codex 工作、长期记忆和本地运行事件视为同一条连续上下文流，而不是分成“手机一份、电脑一份”的两个世界。

### 1. Everything becomes an event / 所有内容先变成事件

The recent-context reader scans local Codex session logs and turns useful records into compact timeline events:

最近上下文读取器会扫描本地 Codex 会话日志，把可用记录压缩成时间线事件：

- user and assistant messages / 用户和助手消息
- final answers and task-complete markers / 最终回复和任务完成标记
- shell commands and tool outputs / 命令执行与工具输出
- patch/apply events with changed files / 补丁应用事件和改动文件
- web search calls and completion events / 网页搜索调用与完成事件
- function calls and custom tool calls / 函数调用与自定义工具调用
- low-signal telemetry such as token usage / token 用量等低信号遥测

This means a follow-up like "what files changed?" can be answered from patch events even if the final natural-language reply did not list every file.

因此，像“这次改了什么文件？”这种追问，可以从补丁事件里找证据，而不是只依赖最终自然语言回复有没有列文件。

### 2. Time controls concentration / 时间决定浓度

Events are not simply appended in raw order. Each event gets a concentration score:

事件不是简单按原始顺序塞进提示词。每条事件都会得到一个浓度分数：

```text
concentration = semantic value * time density * low-signal dilution
```

`semantic value` is higher for completed answers, patch events, tool evidence, and other actionable records. `time density` fades as the event gets farther from the newest point. `low-signal dilution` keeps telemetry, quota, and token-count records in the stream without letting them crowd out real work.

`semantic value` 会提高完成态回复、补丁事件、工具证据等可行动记录的权重。`time density` 会随时间距离变远而降低。`low-signal dilution` 会让 token 用量、配额、心跳等遥测仍然进入上下文，但不会挤掉真正的工作证据。

The goal is not keyword blocking. Old or noisy events are diluted by the algorithm instead of being blindly removed.

目标不是靠关键词屏蔽。旧事件和低信号事件会被算法稀释，而不是在入口处粗暴删除。

### 3. The flask prompt merges devices / 锥形瓶提示词融合设备

After events are selected, the host can combine them with mobile rolling context and durable memory into a flask-shaped prompt:

事件选出后，宿主程序可以把它们和手机滚动上下文、长期统一记忆混合成锥形瓶提示词：

| Zone / 区域 | Meaning / 含义 |
| :--- | :--- |
| `base` | Latest, clearest, most actionable facts. This is the highest-priority layer.<br>最新、最清晰、最可执行的事实，是最高优先级。 |
| `body` | Earlier context in compact form: decisions, summaries, plans, and open loops.<br>较早上下文的压缩层，包括决策、摘要、计划和未完成事项。 |
| `neck` | Distant background: outlines, durable preferences, keywords, and conclusions.<br>更远背景层，只保留轮廓、长期偏好、关键词和结论。 |

The prompt tells the model to treat all sources as one conversation. If mobile and desktop conflict, the newer and more actionable `base` entries win.

提示词会要求模型把所有来源当成同一段对话来理解。如果手机端和电脑端冲突，更新、更可行动的 `base` 内容优先。

### 4. Completion state matters / 完成态很重要

The reader preserves `phase`, `completed`, and `importance` metadata when available.

读取器会尽量保留 `phase`、`completed` 和 `importance` 元数据。

For example, an intermediate assistant message may say a search is still narrowing down, while a later `final_answer` or `task_complete` event contains the actual result. The flask prompt can mark completed snippets explicitly so the model does not confuse an in-progress status with a finished answer.

例如，中间态助手消息可能只是说“还在收窄搜索范围”，后面的 `final_answer` 或 `task_complete` 才是真正结果。锥形瓶提示词可以显式标记完成态，避免模型把“进行中”误当成“已完成”。

### 5. Durable memory is background / 长期记忆只是背景

Durable JSON memory stores distilled value: ideas, handoffs, project notes, preferences, open loops, and daily state. It is intentionally not a transcript archive.

长期 JSON 记忆只保存提炼后的价值：想法、交接、项目记录、偏好、未完成事项和日常状态。它不是聊天全文档案。

When recent events and durable memory conflict, recent events should usually win. Durable memory helps with continuity; recent event concentration helps with freshness.

如果最近事件和长期记忆冲突，通常应优先相信最近事件。长期记忆负责连续性，最近事件浓度负责时效性。

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

1. Flask `base`: newest cross-device events and completed results. / 锥形瓶 `base`：最新跨端事件和完成态结果。
2. Flask `body`: earlier compact summaries and open loops. / 锥形瓶 `body`：较早摘要和未完成事项。
3. Flask `neck`: distant background clues. / 锥形瓶 `neck`：更远背景线索。
4. Durable unified memory. / 长期统一记忆。

If they conflict, the newest useful context wins. Long-term memory is background, not authority.

如果冲突，最新且有用的上下文优先。长期记忆只是背景，不是最高权限。

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
