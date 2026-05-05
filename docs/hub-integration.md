# Hub Integration / Hub 接入说明

This document shows how to connect Unified Memory to a chat Hub without copying a full application.

本文说明如何把统一记忆接进自己的聊天 Hub，而不是直接复制完整应用。

## 1. Import The Module / 引入模块

```js
import { createUnifiedMemory, judgeUnifiedMemoryByRules } from "./src/unified-memory/index.js";
import { formatRecentContextPrompt, searchRecentCodexContext } from "./src/unified-memory/recent-context.js";

const unifiedMemory = createUnifiedMemory({
  memoryPath: process.env.UNIFIED_MEMORY_PATH || "./data/unified-memory.json"
});
```

## 2. Judge Read/Write / 判断读写

For mobile private chat, first run the rule judge. You may add a lightweight model judge as a fallback.

手机私聊可以先跑规则判断，再用轻量模型做判断

```js
async function prepareUnifiedMemoryContext(messageText) {
  const decision = judgeUnifiedMemoryByRules({ text: messageText, source: "imessage" });
  const needsRead = decision.action === "read" || decision.action === "both";

  if (!needsRead) return { decision, promptContext: "" };

  const query = decision.query || decision.topic || messageText;
  const durable = await unifiedMemory.formatForPrompt({ query, limit: 8 });
  const recent = await searchRecentCodexContext({ query, limit: 8, maxFiles: 16 });
  const promptContext = [
    formatRecentContextPrompt(recent),
    durable && `Long-term unified memory may be stale. If it conflicts with recent desktop context above, prefer the recent desktop context.\n\n${durable}`
  ].filter(Boolean).join("\n\n");

  return { decision, promptContext };
}
```

## 3. Add Context To Reply Prompt / 加入回复上下文

```js
const { decision, promptContext } = await prepareUnifiedMemoryContext(incoming.text);

const finalPrompt = [
  promptContext,
  "Reply naturally. Use memory as context, not as a script.",
  `User: ${incoming.text}`
].filter(Boolean).join("\n\n");
```

## 4. Write After Reply / 回复后写入

Write after the user-facing reply succeeds. Do not block the reply on memory writes.

建议在回复成功后异步写入。不要让记忆写入阻塞用户回复。

```js
async function maybeWriteUnifiedMemory(decision, incoming, replyText) {
  if (decision.action !== "write" && decision.action !== "both") return;

  await unifiedMemory.write({
    type: decision.memoryType,
    source: "imessage",
    channel: "imessage",
    originDevice: "mobile",
    executionDevice: "desktop",
    topic: decision.topic,
    summary: decision.summary || incoming.text,
    sourceTextHint: incoming.text.slice(0, 240),
    confidence: decision.confidence || 0.75,
    zone: "base"
  });
}
```

## 5. Follow-Up Message Recall / 跟进消息回看

For messages like "Was the previous question my own idea?", check the previous mobile user message and force recent desktop recall if the previous one referred to desktop work.

对于“上面那个问题是我自己想的吗？”这种二跳指代，可以先看上一条手机用户消息。如果上一条明显是在问电脑端刚刚做的事，就强制读取最近桌面对话。

```js
function shouldRecallPreviousQuestion(currentText, previousUserText) {
  const asksAboutPrevious = /(上面|上一条|刚才那个|这个问题|那个问题|我问的|谁建议|谁提的|自己想)/.test(currentText);
  const previousLooksDesktop = /(电脑上|电脑这边|桌面上|CLI|Codex|刚刚|刚才|修复|清理|测试)/i.test(previousUserText);
  return asksAboutPrevious && previousLooksDesktop;
}
```

## 6. Recommended Commands / 推荐指令

- `/记忆`: show recent unified memory.
- `/交接`: write a mobile-to-desktop handoff.
- `/清除统一记忆`: clear memory after confirmation.
- `/统一记忆状态`: show counts and latest update time.

These commands are host-app responsibilities. 

这些指令由宿主应用实现。
