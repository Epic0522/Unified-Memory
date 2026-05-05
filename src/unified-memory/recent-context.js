import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_CODEX_HOME = join(homedir(), ".codex");

export async function searchRecentCodexContext(options = {}) {
  const codexHome = options.codexHome || DEFAULT_CODEX_HOME;
  const query = String(options.query || "").trim();
  if (options.mode === "latest") {
    return searchLatestCodexTurns(options);
  }
  if (isGenericLatestDesktopRecall(query) && !hasConcreteTopicAnchor(query)) {
    return searchLatestCodexTurns(options);
  }
  const files = await listRecentSessionFiles(codexHome, options.maxFiles || 12);
  const tokens = tokenize(query);
  const snippets = [];

  for (const file of files) {
    const messages = await readSessionMessages(file.path);
    const hitIndexes = new Set();
    messages.forEach((message, index) => {
      if (scoreText(message.text, tokens) > 0) hitIndexes.add(index);
    });
    for (const index of hitIndexes) {
      for (let nearby = Math.max(0, index - 2); nearby <= Math.min(messages.length - 1, index + 2); nearby += 1) {
        const message = messages[nearby];
        snippets.push({
          file: file.path,
          timestamp: message.timestamp,
          role: message.role,
          text: message.text,
          score: adjustedSnippetScore(message.text, tokens, nearby === index)
        });
      }
    }
  }

  return dedupeSnippets(snippets)
    .sort((a, b) => b.score - a.score || String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
    .slice(0, options.limit || 8);
}

export async function searchLatestCodexTurns(options = {}) {
  const codexHome = options.codexHome || DEFAULT_CODEX_HOME;
  const files = await listRecentSessionFiles(codexHome, options.maxFiles || 12);
  const limit = Number(options.limit || 8);
  const currentQuery = String(options.query || "");

  for (const file of files) {
    const messages = await readSessionMessages(file.path);
    const latest = messages
      .filter((message) => isMeaningfulLatestMessage(message, currentQuery))
      .slice(-(limit * 2));
    if (!latest.length) continue;

    return dedupeSnippets(latest.map((message, index) => ({
      file: file.path,
      timestamp: message.timestamp,
      role: message.role,
      text: message.text,
      score: 20 + index
    }))).slice(-limit);
  }

  return [];
}

export function formatRecentContextPrompt(snippets) {
  if (!Array.isArray(snippets) || !snippets.length) return "";
  return [
    "以下是从本机最近 Codex 对话中按关键词回看的片段。请只当作补充上下文，自然吸收，不要逐字复读，也不要暴露本地日志路径。",
    "如果这些片段已经足够回答当前问题，就基于片段内容直接回答；不要因为统一记忆 JSON 没有手动写入而拒绝接话：",
    "如果用户问上一条问题是不是自己想出来的、是谁建议的，请优先找最近片段里是否有 assistant 给出的测试问题或建议句。",
    ...snippets.map((snippet) => {
      const speaker = snippet.role === "assistant"
        ? "assistant"
        : snippet.role === "tool"
          ? "本机执行结果"
          : "user";
      return `${speaker}：${snippet.text}`;
    })
  ].join("\n");
}

function isGenericLatestDesktopRecall(text) {
  const normalized = String(text || "").replace(/\s+/g, "");
  const hasRecentAnchor = /(刚刚|刚才|刚才那会|刚那会|刚才在|刚刚在|刚在|刚问|刚说|刚发|刚做|刚弄|刚改|刚更新|刚修)/i.test(normalized);
  const hasDesktopAnchor = /(电脑上|电脑这边|桌面上|cli|codex|本机|这边)/i.test(normalized);
  const isRecallQuestion = /(什么|哪|怎么|咋|吗|没|没有|记得|想起来|同步|结果|更新|进度|做到|做完|弄好|搞好|处理|修好|改好|看见|看到)/i.test(normalized);
  if (hasRecentAnchor && hasDesktopAnchor && isRecallQuestion) return true;
  if (hasRecentAnchor && /(做了什么|做过什么|干了什么|弄了什么|搞了什么|改了什么|更新了什么|处理了什么|修了什么|做到哪|做完没|弄好没|搞好没)/i.test(normalized)) return true;
  if (hasRecentAnchor && /(问的|问过|说的|说过|发的|发过|做的|做过|弄的|弄过|改的|改过|更新的|更新过|聊的|聊过|处理的|处理过)/i.test(normalized)) return true;
  return false;
}

function hasConcreteTopicAnchor(text) {
  const normalized = String(text || "").replace(/\s+/g, "").toLowerCase();
  return /(client|webui|bundle|resources?|app|launcher|adapter|bridge|proxy|message|host|启动器|通讯中枢|通讯client|客户端|资源|同步|统一记忆|桥接|代理|消息|宿主)/i.test(normalized);
}

function findLatestMeaningfulUserMessage(messages, currentQuery) {
  const current = String(currentQuery || "").replace(/\s+/g, "");
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    const text = String(message.text || "").trim();
    const compact = text.replace(/\s+/g, "");
    if (!text || text.length < 4) continue;
    if (current && compact.includes(current.slice(0, 18))) continue;
    if (isGenericLatestDesktopRecall(text)) continue;
    if (/(这次没调用|没调用统一记忆|没有调用统一记忆|没触发统一记忆|还没看到已经更新好的结果|还算没更完|没有同步到最新)/.test(compact)) continue;
    if (/^(嗯|好|好的|ok|OK|继续|继续吧|可以|收到|试试)$/.test(text)) continue;
    return index;
  }
  return -1;
}

function isMeaningfulLatestMessage(message, currentQuery) {
  const text = String(message?.text || "").trim();
  if (!text || text.length < 4) return false;
  if (isNoisyLocalLogText(text)) return false;
  if (message.role === "user") return isMeaningfulLatestUserText(text, currentQuery);
  if (message.role === "tool") return isMeaningfulToolText(text);
  if (message.role === "assistant") return !isLowSignalAssistantText(text);
  return true;
}

function isMeaningfulLatestUserText(text, currentQuery) {
  const current = String(currentQuery || "").replace(/\s+/g, "");
  const compact = text.replace(/\s+/g, "");
  if (current && compact.includes(current.slice(0, 18))) return false;
  if (/(这次没调用|没调用统一记忆|没有调用统一记忆|没触发统一记忆|还没看到已经更新好的结果|还算没更完|没有同步到最新)/.test(compact)) return false;
  if (/^(嗯|好|好的|ok|OK|继续|继续吧|可以|收到|试试)$/.test(text)) return false;
  return true;
}

function isMeaningfulToolText(text) {
  if (isNoisyLocalLogText(text)) return false;
  if (/^(Chunk ID|Wall time|Process exited)/.test(text) && !/(unified handoffs|removed imessage|kept handoffs|Chat Hub started)/i.test(text)) return false;
  if (/(unified handoffs|removed imessage|kept handoffs|Chat Hub started|node --check|Process exited with code 0|清理|清掉|污染)/i.test(text)) return true;
  return text.length < 260 && !/^(Chunk ID|Wall time|Process exited)/.test(text);
}

function isLowSignalAssistantText(text) {
  const compact = text.replace(/\s+/g, "");
  if (/^（.*）?$/.test(compact)) return true;
  if (/^(收到|好的|可以|我来|继续|嗯嗯)/.test(compact) && compact.length < 20) return true;
  return false;
}

function isNoisyLocalLogText(text) {
  return /data:image\/[^;]+;base64/i.test(text)
    || /Original token count:\s*[1-9]\d{5,}/i.test(text)
    || (/Original token count:\s*[1-9]\d{3,}/i.test(text) && !/(unified handoffs|removed imessage|kept handoffs|Chat Hub started)/i.test(text))
    || /Original token count:\s*0\s+Output:\s*$/i.test(text)
    || /iMessage 触发跨端回看[\s\S]*本次回答要点/.test(text)
    || /(做了什么、改了什么、更新了什么|傻傻只抓|只抓一个关键词|错误交接|带偏的错误交接)/.test(text)
    || /searchRecentCodexContext/.test(text)
    || /"file":\s*"[^"]*\/\.codex\/sessions/.test(text)
    || /命令成功：.*unified_memory_tool\.mjs\s+recall[\s\S]*"promptContext":/i.test(text)
    || /命令成功：.*\b(sed|rg|cat|tail|nl)\b/i.test(text)
    || /命令成功：.*searchRecentCodexContext[\s\S]*Output:\s*\[/i.test(text)
    || /(export async function|function extractMessage|import \{ readdir, readFile, stat \})/.test(text)
    || /[A-Za-z0-9+/=_-]{5000,}/.test(text)
    || /iVBORw0KGgoAAAANS/.test(text);
}

async function listRecentSessionFiles(codexHome, limit) {
  const roots = [
    join(codexHome, "sessions"),
    join(codexHome, "archived_sessions")
  ];
  const files = [];
  for (const root of roots) {
    files.push(...await walkJsonl(root));
  }
  const withStats = [];
  for (const path of files) {
    try {
      const fileStat = await stat(path);
      withStats.push({ path, mtimeMs: fileStat.mtimeMs });
    } catch {
      // Ignore files that disappear during traversal.
    }
  }
  return withStats.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
}

async function walkJsonl(root) {
  const output = [];
  async function walk(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) output.push(path);
    }
  }
  await walk(root);
  return output;
}

async function readSessionMessages(path) {
  const body = await readFile(path, "utf8");
  const messages = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let item;
    try {
      item = JSON.parse(line);
    } catch {
      continue;
    }
    const extracted = extractMessage(item);
    if (extracted?.text) {
      messages.push({
        timestamp: item.timestamp,
        ...extracted,
        text: normalizeText(extracted.text)
      });
    }
  }
  return dedupeMessages(messages);
}

function extractMessage(item) {
  const payload = item?.payload || {};
  if (item.type === "event_msg" && payload.type === "user_message") {
    return { role: "user", text: payload.message };
  }
  if (item.type === "event_msg" && payload.type === "agent_message") {
    return { role: "assistant", text: payload.message };
  }
  if (item.type === "event_msg" && payload.type === "task_complete") {
    return { role: "assistant", text: payload.last_agent_message };
  }
  if (item.type === "event_msg" && payload.type === "exec_command_end") {
    const command = Array.isArray(payload.command) ? payload.command.join(" ") : "";
    const output = payload.aggregated_output || payload.stdout || payload.stderr || "";
    const status = payload.exit_code === 0 ? "成功" : `退出码 ${payload.exit_code ?? "未知"}`;
    return { role: "tool", text: `命令${status}${command ? `：${command}` : ""}\n${output}` };
  }
  if (item.type === "response_item" && payload.type === "message") {
    const text = Array.isArray(payload.content)
      ? payload.content.map((part) => part.text || part.input_text || part.output_text || "").join("\n")
      : "";
    return { role: payload.role || "assistant", text };
  }
  if (item.type === "response_item" && payload.type === "function_call_output") {
    return { role: "tool", text: payload.output };
  }
  return null;
}

function tokenize(text) {
  const raw = String(text || "");
  const ascii = raw.match(/[a-z0-9_.-]{2,}/gi) || [];
  const cjk = [...raw.matchAll(/[\u4e00-\u9fff]{2,}/g)].map((match) => match[0]);
  const compact = raw.replace(/\s+/g, "");
  const cjkPairs = [];
  for (let index = 0; index < compact.length - 1; index += 1) {
    const token = compact.slice(index, index + 2);
    if (/^[\u4e00-\u9fff]{2}$/.test(token)) cjkPairs.push(token);
  }
  return [...new Set([...ascii, ...cjk, ...cjkPairs])].slice(0, 24);
}

function scoreText(text, tokens) {
  if (!tokens.length) return 0;
  const normalized = String(text || "").toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (normalized.includes(token.toLowerCase())) score += Math.min(3, Math.max(1, token.length / 2));
  }
  return score;
}

function adjustedSnippetScore(text, tokens, exactHit) {
  const normalized = String(text || "");
  let score = scoreText(normalized, tokens) + (exactHit ? 1 : 0.3);
  const tokenText = tokens.join(" ").toLowerCase();
  if (/(client|webui|bundle|resource|resources|adapter|bridge|proxy|message|host|通讯|客户端|启动器|资源|同步|桥接|代理|消息|宿主)/i.test(tokenText)
    && /(client|webui|bundle|Resources|Contents\/Resources|client\.html|client\.js|client\.css|adapter|bridge|proxy|message|host|通讯中枢|客户端|启动器|资源|同步|桥接|代理|消息|宿主|localhost:\d+)/i.test(normalized)) {
    score += 5;
  }
  if (/(完成了|整理好了|我已经做了|做了这些|新增的是完整|现在两条线都收住|这个阶段完成了|验证也跑过)/.test(normalized)) {
    score += 4;
  }
  if (/(预期：|可以再测|压力测试|第三个问题回复|我现在没法|不敢乱编|给我一个关键词)/.test(normalized)) {
    score -= 5;
  }
  return score;
}

function normalizeText(text) {
  return String(text || "")
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=_-]+/gi, "[image omitted]")
    .replace(/[A-Za-z0-9+/=_-]{2000,}/g, "[long encoded data omitted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

function dedupeMessages(messages) {
  const seen = new Set();
  const output = [];
  for (const message of messages) {
    const key = `${message.role}:${message.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(message);
  }
  return output;
}

function dedupeSnippets(snippets) {
  const seen = new Set();
  const output = [];
  for (const snippet of snippets) {
    const key = `${snippet.role}:${snippet.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(snippet);
  }
  return output;
}
