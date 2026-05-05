import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_LIMITS = {
  handoffHistory: 40,
  ideas: 120,
  projectNotes: 160,
  userPreferences: 100,
  openLoops: 100,
  dailyTimeline: 160
};

const SENSITIVE_PATTERN = /(token|api[-_\s]?key|secret|password|passwd|验证码|校验码|密钥|私钥|账号密码|access[_-\s]?key|refresh[_-\s]?token)/i;

export function createUnifiedMemory(options = {}) {
  return new UnifiedMemory(options);
}

export class UnifiedMemory {
  constructor(options = {}) {
    this.memoryPath = options.memoryPath;
    this.limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  }

  emptyMemory() {
    return {
      version: 1,
      memoryShape: {
        strategy: "flask",
        description: "base keeps near-handoff details, body keeps compact summaries, neck keeps distant outlines."
      },
      updatedAt: null,
      handoff: {
        latest: null,
        history: []
      },
      ideas: [],
      projectNotes: [],
      userPreferences: [],
      openLoops: [],
      dailyTimeline: [],
      currentState: {
        timeContext: null,
        sleepState: null,
        recentMeal: null,
        bodyState: null,
        mood: null,
        updatedAt: null
      }
    };
  }

  async load() {
    try {
      return normalizeMemory(JSON.parse(await readFile(this.memoryPath, "utf8")), this.emptyMemory());
    } catch {
      return this.emptyMemory();
    }
  }

  async save(memory) {
    memory.updatedAt = new Date().toISOString();
    await mkdir(dirname(this.memoryPath), { recursive: true });
    await writeFile(this.memoryPath, `${JSON.stringify(normalizeMemory(memory, this.emptyMemory()), null, 2)}\n`);
  }

  async read(options = {}) {
    const memory = await this.load();
    const query = String(options.query || "").trim();
    const limit = clampNumber(options.limit, 5, 1, 30);
    const device = String(options.device || "").trim();
    const entries = flattenMemory(memory)
      .filter((entry) => !device || [entry.originDevice, entry.executionDevice, entry.channel].includes(device))
      .map((entry) => ({
        ...entry,
        score: scoreEntry(entry, query)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      path: this.memoryPath,
      updatedAt: memory.updatedAt,
      latestHandoff: memory.handoff.latest,
      currentState: memory.currentState,
      entries,
      counts: memoryCounts(memory)
    };
  }

  async search(options = {}) {
    return this.read(options);
  }

  async write(options = {}) {
    const memory = await this.load();
    const now = new Date().toISOString();
    const type = normalizeType(options.type);
    const sourceTextHint = sanitizeText(options.sourceTextHint || options.evidence || "", 240);
    const summary = sanitizeText(options.summary || options.text || "", 1200);

    if (!summary || containsSensitiveValue(options.summary || options.text || "")) {
      return {
        ok: false,
        skipped: true,
        reason: "empty_or_sensitive",
        memory: await this.read({ limit: 5 })
      };
    }

    const entry = {
      id: createId(),
      type,
      topic: sanitizeText(options.topic || inferTopic(summary), 80),
      summary,
      nextActions: list(options.next || options.nextActions).map((item) => sanitizeText(item, 220)).filter(Boolean),
      evidence: list(options.evidencePath || options.evidencePaths).map((item) => sanitizeText(item, 260)).filter(Boolean),
      channel: options.channel || sourceToChannel(options.source),
      originDevice: options.originDevice || sourceToOriginDevice(options.source),
      executionDevice: options.executionDevice || sourceToExecutionDevice(options.source),
      mode: options.mode || options.source || "manual",
      sourceTextHint,
      confidence: clampNumber(options.confidence, 0.75, 0, 1),
      zone: normalizeZone(options.zone || "base"),
      createdAt: now,
      updatedAt: now
    };

    if (type === "handoff") {
      if (memory.handoff.latest) memory.handoff.history.push({ ...memory.handoff.latest, zone: "body" });
      memory.handoff.history = memory.handoff.history.slice(-this.limits.handoffHistory);
      memory.handoff.latest = entry;
    } else if (type === "idea") {
      memory.ideas.push(entry);
      memory.ideas = compactEntries(memory.ideas, this.limits.ideas);
    } else if (type === "projectNote") {
      memory.projectNotes.push(entry);
      memory.projectNotes = compactEntries(memory.projectNotes, this.limits.projectNotes);
    } else if (type === "preference") {
      memory.userPreferences.push(entry);
      memory.userPreferences = compactEntries(memory.userPreferences, this.limits.userPreferences);
    } else if (type === "openLoop") {
      memory.openLoops.push({ ...entry, status: options.status || "open" });
      memory.openLoops = compactEntries(memory.openLoops, this.limits.openLoops);
    } else if (type === "dailyState") {
      memory.dailyTimeline.push(entry);
      memory.dailyTimeline = compactEntries(memory.dailyTimeline, this.limits.dailyTimeline);
      memory.currentState = updateCurrentState(memory.currentState, entry);
    }

    await this.save(memory);
    return { ok: true, entry, memory: await this.read({ query: entry.topic, limit: 5 }) };
  }

  async clear(options = {}) {
    const scope = String(options.scope || "latest").trim();
    const memory = await this.load();
    if (scope === "all") {
      await this.save(this.emptyMemory());
      return { ok: true, scope, memory: await this.read({ limit: 5 }) };
    }
    if (scope === "latest") memory.handoff.latest = null;
    else if (scope === "ideas") memory.ideas = [];
    else if (scope === "openLoops") memory.openLoops = [];
    else if (scope === "dailyTimeline") memory.dailyTimeline = [];
    else if (scope === "currentState") memory.currentState = this.emptyMemory().currentState;
    else if (scope === "projectNotes") memory.projectNotes = [];
    else if (scope === "preferences" || scope === "userPreferences") memory.userPreferences = [];
    else return { ok: false, error: `Unknown clear scope: ${scope}` };
    await this.save(memory);
    return { ok: true, scope, memory: await this.read({ limit: 5 }) };
  }

  async status() {
    const memory = await this.load();
    return {
      path: this.memoryPath,
      updatedAt: memory.updatedAt,
      counts: memoryCounts(memory),
      latestHandoff: memory.handoff.latest,
      currentState: memory.currentState
    };
  }

  async formatForPrompt(options = {}) {
    const snapshot = await this.read(options);
    return formatUnifiedMemoryPrompt(snapshot);
  }

  judgeByRules(options = {}) {
    return judgeUnifiedMemoryByRules(options);
  }
}

export function judgeUnifiedMemoryByRules(options = {}) {
  const text = String(options.text || "").trim();
  const normalized = text.replace(/\s+/g, "");
  if (!text) return noneDecision();
  if (containsSensitiveValue(text)) {
    return { ...noneDecision(), reason: "sensitive_content" };
  }

  const needsRead = /(手机上|电脑上|电脑这边|这边|刚刚那个|刚才那个|刚刚说|刚才说|刚才|刚刚|前两天|昨天|上次|之前|还记得|记不记得|接着|继续|做到哪|进度|交接|更新|同步|client|webui|通讯中枢|客户端)/i.test(normalized);
  const explicitWrite = /(把.*记|记一下|记录一下|留个交接|写进统一记忆|写入统一记忆|我想到|我突然想到|新点子|新想法|补充一下)/.test(normalized);
  const recallOnly = /(还记得|记不记得|想得起来|有没有记住|有没有记得)/.test(normalized)
    && /[?？吗嘛呢]?$/.test(normalized)
    && !explicitWrite;
  const statusQuestionOnly = needsRead
    && /(做到哪|整理到哪|进度|什么状态|为什么|怎么回事|还记得|记不记得|想得起来)/.test(normalized)
    && !explicitWrite;
  const readOnlyQuestion = recallOnly || statusQuestionOnly;
  const isIdea = !readOnlyQuestion && /(想到|想法|点子|灵感|算法|方案|计划|规划|设计|模型|办法)/.test(normalized);
  const isTodo = !readOnlyQuestion && /(待办|记一下|记录一下|别忘|之后要|明天|回头|下一步|要做)/.test(normalized);
  const isPreference = !readOnlyQuestion && /(我喜欢|我不喜欢|以后.*别|以后.*要|偏好|习惯|更适合|不要.*AI味|自然一点)/.test(normalized);
  const isDaily = !readOnlyQuestion && /(睡醒|起床|吃了|吃完|洗澡|洗完|腿|疼|痛|磕|困|累|红温|心情|状态|上午|早上|下午|晚上|今天)/.test(normalized);
  const isProject = !readOnlyQuestion && /(项目|实现|代码|脚本|readme|发布版|模块|接口|测试|bug|修复|部署)/i.test(text);

  const writes = [];
  if (isDaily) writes.push("dailyState");
  if (isIdea) writes.push("idea");
  if (isTodo) writes.push("openLoop");
  if (isPreference) writes.push("preference");
  if (isProject) writes.push("projectNote");

  const memoryType = writes[0] || (needsRead ? "handoff" : "idea");
  const action = needsRead && writes.length ? "both" : needsRead ? "read" : writes.length ? "write" : "none";
  const confidence = action === "none" ? 0.35 : needsRead ? 0.86 : 0.78;

  return {
    action,
    memoryType,
    topic: inferTopic(text),
    summary: action === "read" ? "" : summarizeTextHint(text),
    nextActions: [],
    query: needsRead ? inferQuery(text) : inferTopic(text),
    confidence,
    reason: "rule"
  };
}

export function buildUnifiedMemoryJudgePrompt(options = {}) {
  return [
    "你是统一记忆判断器，只输出 JSON，不要解释。",
    "判断这条 iMessage 私聊是否需要读取或写入本地统一记忆。",
    "统一记忆只保存提炼后的价值点，不保存全文。",
    "敏感内容不要写入：token、密码、验证码、密钥、账号隐私。",
    "日常状态也可以写入，例如睡醒、吃饭、腿疼、情绪、作息节奏。",
    "跨入口或跨时间指代表达需要读取，例如手机上、电脑上、刚刚那个、前两天那个、还记得、接着做。",
    "输出 JSON 结构：",
    "{\"action\":\"read|write|both|none\",\"memoryType\":\"handoff|projectNote|preference|openLoop|idea|dailyState\",\"topic\":\"短主题\",\"summary\":\"需要写入时的脱敏摘要\",\"nextActions\":[\"可执行下一步\"],\"query\":\"需要读取时的检索词\",\"confidence\":0.0}",
    "",
    `来源：${options.source || "imessage"}`,
    `消息：${String(options.text || "").slice(0, 2000)}`
  ].join("\n");
}

export function parseUnifiedMemoryJudge(raw) {
  const text = String(raw || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
    const action = ["read", "write", "both", "none"].includes(parsed.action) ? parsed.action : "none";
    return {
      action,
      memoryType: normalizeType(parsed.memoryType),
      topic: sanitizeText(parsed.topic || "", 80),
      summary: sanitizeText(parsed.summary || "", 1200),
      nextActions: list(parsed.nextActions).map((item) => sanitizeText(item, 220)).filter(Boolean),
      query: sanitizeText(parsed.query || parsed.topic || "", 120),
      confidence: clampNumber(parsed.confidence, action === "none" ? 0.4 : 0.7, 0, 1),
      reason: "model"
    };
  } catch {
    return noneDecision();
  }
}

export function formatUnifiedMemoryPrompt(snapshot) {
  const lines = [];
  if (snapshot.latestHandoff?.summary) {
    lines.push(`最近交接：${snapshot.latestHandoff.summary}`);
    if (snapshot.latestHandoff.nextActions?.length) lines.push(`下一步：${snapshot.latestHandoff.nextActions.join("；")}`);
  }
  const state = snapshot.currentState || {};
  const stateParts = [state.timeContext, state.sleepState, state.recentMeal, state.bodyState, state.mood].filter(Boolean);
  if (stateParts.length) lines.push(`近期状态：${stateParts.join("；")}`);
  for (const entry of snapshot.entries || []) {
    lines.push(`${zoneLabel(entry.zone)} ${typeLabel(entry.type)}：${entry.summary}`);
  }
  if (!lines.length) return "";
  return [
    "以下是统一记忆摘要。请自然参考，不要逐字复述，也不要主动声明你查了记忆：",
    ...dedupe(lines).slice(0, 12)
  ].join("\n");
}

function normalizeMemory(data, empty) {
  return {
    ...empty,
    ...data,
    memoryShape: { ...empty.memoryShape, ...(data?.memoryShape || {}) },
    handoff: { ...empty.handoff, ...(data?.handoff || {}) },
    ideas: array(data?.ideas),
    projectNotes: array(data?.projectNotes),
    userPreferences: array(data?.userPreferences),
    openLoops: array(data?.openLoops),
    dailyTimeline: array(data?.dailyTimeline),
    currentState: { ...empty.currentState, ...(data?.currentState || {}) }
  };
}

function flattenMemory(memory) {
  const entries = [];
  if (memory.handoff.latest) entries.push({ ...memory.handoff.latest, type: "handoff", zone: memory.handoff.latest.zone || "base" });
  for (const entry of memory.handoff.history || []) entries.push({ ...entry, type: "handoff", zone: entry.zone || "body" });
  for (const type of ["ideas", "projectNotes", "userPreferences", "openLoops", "dailyTimeline"]) {
    for (const entry of memory[type] || []) entries.push({ ...entry, type: entry.type || collectionToType(type), zone: entry.zone || inferZone(entry) });
  }
  return entries;
}

function scoreEntry(entry, query) {
  const zoneScore = { base: 1, body: 0.62, neck: 0.35 }[entry.zone] || 0.5;
  const ageHours = Math.max(0, (Date.now() - Date.parse(entry.updatedAt || entry.createdAt || 0)) / 36e5);
  const recency = 1 / (1 + ageHours / 24);
  const relevance = query ? textRelevance(`${entry.topic || ""} ${entry.summary || ""} ${entry.sourceTextHint || ""}`, query) : 0.5;
  const typeWeight = entry.type === "handoff" ? 1 : entry.type === "dailyState" ? 0.86 : entry.type === "projectNote" ? 0.82 : 0.72;
  const confidence = Number(entry.confidence || 0.7);
  return relevance * 0.45 + zoneScore * 0.28 + recency * 0.14 + typeWeight * 0.08 + confidence * 0.05;
}

function textRelevance(text, query) {
  const haystack = String(text || "").toLowerCase();
  const tokens = tokenize(query);
  if (!tokens.length) return 0.5;
  const hits = tokens.filter((token) => haystack.includes(token.toLowerCase())).length;
  return hits / tokens.length;
}

function tokenize(text) {
  const ascii = String(text || "").match(/[a-z0-9_.-]{2,}/gi) || [];
  const cjk = [...String(text || "").matchAll(/[\u4e00-\u9fff]{2,}/g)].map((match) => match[0]);
  return [...ascii, ...cjk].slice(0, 12);
}

function updateCurrentState(currentState, entry) {
  const text = `${entry.summary || ""} ${entry.sourceTextHint || ""}`;
  const next = { ...(currentState || {}), updatedAt: entry.updatedAt };
  if (/(早上|上午|刚睡醒|起床)/.test(text)) next.timeContext = /上午|早上/.test(text) ? "上午/早上" : "刚睡醒附近";
  if (/(下午)/.test(text)) next.timeContext = "下午";
  if (/(晚上|今晚|夜里)/.test(text)) next.timeContext = "晚上";
  if (/(睡醒|起床|困|睡不醒)/.test(text)) next.sleepState = summarizeTextHint(text, 80);
  if (/(吃了|吃完|饭|早餐|午饭|晚饭|夜宵)/.test(text)) next.recentMeal = summarizeTextHint(text, 80);
  if (/(疼|痛|磕|撞|伤|不舒服)/.test(text)) next.bodyState = summarizeTextHint(text, 100);
  if (/(开心|难受|焦虑|累|烦|高兴|心情)/.test(text)) next.mood = summarizeTextHint(text, 80);
  return next;
}

function compactEntries(entries, limit) {
  return entries.slice(-limit).map((entry, index, arr) => ({
    ...entry,
    zone: entry.zone || (index >= arr.length - 3 ? "base" : index >= arr.length - 18 ? "body" : "neck")
  }));
}

function normalizeType(type) {
  const value = String(type || "").trim();
  if (["idea", "handoff", "projectNote", "preference", "openLoop", "dailyState"].includes(value)) return value;
  if (/project/i.test(value)) return "projectNote";
  if (/pref/i.test(value)) return "preference";
  if (/open/i.test(value)) return "openLoop";
  if (/daily|state/i.test(value)) return "dailyState";
  return "idea";
}

function normalizeZone(zone) {
  return ["base", "body", "neck"].includes(zone) ? zone : "base";
}

function inferZone(entry) {
  const ageHours = Math.max(0, (Date.now() - Date.parse(entry.updatedAt || entry.createdAt || 0)) / 36e5);
  if (ageHours < 12) return "base";
  if (ageHours < 24 * 7) return "body";
  return "neck";
}

function sourceToChannel(source) {
  if (source === "imessage") return "imessage";
  if (source === "remoteExecution") return "imessage";
  if (source === "cli") return "cli";
  return "manual";
}

function sourceToOriginDevice(source) {
  if (source === "imessage") return "mobile_or_messages";
  if (source === "remoteExecution" || source === "cli") return "desktop";
  return "unknown";
}

function sourceToExecutionDevice(source) {
  if (source === "remoteExecution" || source === "cli") return "desktop";
  return "unknown";
}

function containsSensitiveValue(text) {
  return SENSITIVE_PATTERN.test(String(text || ""));
}

function sanitizeText(text, limit = 1000) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(SENSITIVE_PATTERN, "[敏感信息]")
    .trim()
    .slice(0, limit);
}

function summarizeTextHint(text, limit = 220) {
  return sanitizeText(text, limit);
}

function inferTopic(text) {
  const value = sanitizeText(text, 60);
  return value || "未命名记忆";
}

function inferQuery(text) {
  return sanitizeText(text.replace(/(还记得|记不记得|接着|继续|刚刚|刚才|手机上|电脑上|前两天|上次|之前)/g, " "), 120) || inferTopic(text);
}

function list(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function createId() {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function collectionToType(collection) {
  return {
    ideas: "idea",
    projectNotes: "projectNote",
    userPreferences: "preference",
    openLoops: "openLoop",
    dailyTimeline: "dailyState"
  }[collection] || "idea";
}

function memoryCounts(memory) {
  return {
    handoffHistory: memory.handoff.history.length + (memory.handoff.latest ? 1 : 0),
    ideas: memory.ideas.length,
    projectNotes: memory.projectNotes.length,
    userPreferences: memory.userPreferences.length,
    openLoops: memory.openLoops.length,
    dailyTimeline: memory.dailyTimeline.length
  };
}

function typeLabel(type) {
  return {
    handoff: "交接",
    idea: "点子",
    projectNote: "项目",
    preference: "偏好",
    openLoop: "待办",
    dailyState: "状态"
  }[type] || "记忆";
}

function zoneLabel(zone) {
  return {
    base: "瓶底清晰区",
    body: "瓶身摘要区",
    neck: "瓶口轮廓区"
  }[zone] || "记忆区";
}

function dedupe(lines) {
  return [...new Set(lines.filter(Boolean))];
}

function noneDecision() {
  return {
    action: "none",
    memoryType: "idea",
    topic: "",
    summary: "",
    nextActions: [],
    query: "",
    confidence: 0.35,
    reason: "none"
  };
}
