---
name: unified-memory
description: |
  Shared local memory layer for bridging mobile planning, desktop Codex CLI work, and remote execution modes. Use when the user asks to read, write, summarize, update, or continue from cross-device context: unified memory, handoff, continue from phone, remember this, what did we do earlier, etc.
---

# Unified Memory / 统一记忆

Unified Memory is a local relay layer between mobile chat planning and desktop agent execution.

统一记忆用于打通手机端规划、电脑端 Codex CLI 执行、以及远程执行模式。它不是聊天全文仓库，而是本地的“交接摘要层”。

QQ/group chat is intentionally excluded by default. Keep low-cost public group replies independent unless your project explicitly opts in.

默认不接入 QQ/群聊。群聊通常适合保持独立低算力模式，避免噪声和 token 膨胀。

## Core Model / 核心模型

Use the "flask" memory model:

- `base`: nearest to the handoff point. Keep the clearest actionable details.
- `body`: earlier context in the same workstream. Keep compact decisions, plans, progress, and open loops.
- `neck`: distant history. Keep only keywords, conclusions, and durable preferences.

“锥形瓶”模型：

- `base`：靠近交接点，最清晰，保存可直接续上的信息。
- `body`：同一段较早内容，保存决策、计划、进度、未完成点。
- `neck`：更远历史，只保存关键词、结论和长期偏好。

## Files / 文件

Recommended layout:

```text
unified-memory-dlc/
  src/unified-memory/
  scripts/unified-memory-tool.mjs
  data/unified-memory.json
  data/imessage-memory.json
  data/settings.json
```

Environment variables:

```bash
export UNIFIED_MEMORY_PATH="/path/to/data/unified-memory.json"
export UNIFIED_MEMORY_SETTINGS_PATH="/path/to/data/settings.json"
```

## Read / 读取

Use when the user refers to cross-device or past context:

- "接着手机上说的..."
- "刚刚那个..."
- "前两天电脑上那个..."
- "还记得 xxx 吗"
- "做到哪了"
- "把手机上的规划继续做"

```bash
node scripts/unified-memory-tool.mjs read --query "keyword" --device mobile --limit 5
```

For desktop continuity, prefer `recall`. It combines durable unified memory, iMessage rolling context, and recent local Codex session snippets:

```bash
node scripts/unified-memory-tool.mjs recall \
  --query "刚刚手机上说的规划" \
  --limit 8 \
  --recent-limit 8 \
  --max-files 16
```

Reply naturally. Do not sound like a database dump.

回答时自然承接，不要像数据库查询结果：

- "手机端最近留下的是..."
- "瓶底清晰区里最重要的是..."
- "电脑这边可以直接从这一步继续..."
- "我从最近桌面对话里接回来的重点是..."

## Write / 写入

Store distilled value only:

- `idea`: ideas, algorithms, design concepts.
- `handoff`: cross-device continuation state.
- `projectNote`: implementation progress, decisions, evidence.
- `preference`: durable user preferences.
- `openLoop`: unfinished tasks.
- `dailyState`: daily/life state, such as waking up, meals, pain, mood, rhythm.

只保存提炼后的价值点：

- `idea`：想法、算法、设计概念。
- `handoff`：跨端交接状态。
- `projectNote`：实现进度、决策、证据。
- `preference`：长期偏好。
- `openLoop`：未完成事项。
- `dailyState`：日常状态，例如睡醒、吃饭、身体不适、情绪、作息节奏。

Examples:

```bash
node scripts/unified-memory-tool.mjs write \
  --type idea \
  --source cli \
  --topic "flask memory model" \
  --summary "Unified memory uses a flask model: near-handoff details stay clear; distant context becomes summarized."
```

```bash
node scripts/unified-memory-tool.mjs write \
  --type projectNote \
  --source cli \
  --topic "unified memory v1" \
  --summary "Core module and iMessage recall integration are implemented. Next step is live testing." \
  --next "Restart the Hub" \
  --next "Test natural mobile triggers"
```

```bash
node scripts/unified-memory-tool.mjs write \
  --type dailyState \
  --source imessage \
  --summary "User woke up in the morning, ate breakfast, and mentioned a new memory-model idea."
```

## Clear / Status

```bash
node scripts/unified-memory-tool.mjs status
node scripts/unified-memory-tool.mjs clear --scope latest
node scripts/unified-memory-tool.mjs clear --scope ideas
node scripts/unified-memory-tool.mjs clear --scope currentState
node scripts/unified-memory-tool.mjs clear --scope all
```

## Safety Rules / 安全规则

- Prefer summaries over transcripts.
- Never store secrets, tokens, passwords, private keys, one-time codes, or sensitive account details.
- For daily state, store useful continuity such as "leg still hurts after bumping it", not every casual sentence.
- If memory conflicts with the current user instruction, the current instruction wins.
- If memory might be stale, say so briefly and verify from files when cheap.

- 优先保存摘要，不保存全文。
- 不保存 token、密码、验证码、密钥、账号隐私。
- 日常状态保存有助于承接的摘要，不记录每句闲聊。
- 当前用户指令永远优先于记忆。
- 如果记忆可能过期，先说明并尽量低成本核验。
