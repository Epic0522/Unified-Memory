import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cwd } from "node:process";

export async function searchIMessageMemory(options = {}) {
  const memoryPath = options.memoryPath || join(cwd(), "data", "imessage-memory.json");
  const query = String(options.query || "").trim();
  const limit = Number(options.limit || 12);
  let body;
  try {
    body = JSON.parse(await readFile(memoryPath, "utf8"));
  } catch {
    return [];
  }
  const tokens = tokenize(query);
  const entries = [];
  for (const [handle, turns] of Object.entries(body.entries || {})) {
    if (!Array.isArray(turns)) continue;
    turns.forEach((turn, index) => {
      const score = scoreText(turn.text, tokens);
      const recency = index / Math.max(1, turns.length);
      if (score > 0 || !tokens.length) {
        entries.push({
          handle,
          role: turn.role,
          text: normalizeText(turn.text),
          at: turn.at,
          score: score + recency
        });
      }
    });
  }
  return dedupe(entries)
    .sort((a, b) => b.score - a.score || String(b.at || "").localeCompare(String(a.at || "")))
    .slice(0, limit);
}

export function formatIMessageMemoryPrompt(entries) {
  if (!Array.isArray(entries) || !entries.length) return "";
  return [
    "以下是手机 iMessage 私聊滚动记录中召回的片段。请把它当作手机端上下文，自然承接，不要逐字复读：",
    ...entries.map((entry) => {
      const speaker = entry.role === "assistant" ? "assistant" : "user";
      return `${speaker}：${entry.text}`;
    })
  ].join("\n");
}

function tokenize(text) {
  const raw = String(text || "");
  const ascii = raw.match(/[a-z0-9_.-]{2,}/gi) || [];
  const cjk = [...raw.matchAll(/[\u4e00-\u9fff]{2,}/g)].map((match) => match[0]);
  const compact = raw.replace(/\s+/g, "");
  const pairs = [];
  for (let index = 0; index < compact.length - 1; index += 1) {
    const token = compact.slice(index, index + 2);
    if (/^[\u4e00-\u9fff]{2}$/.test(token)) pairs.push(token);
  }
  return [...new Set([...ascii, ...cjk, ...pairs])].slice(0, 24);
}

function scoreText(text, tokens) {
  if (!tokens.length) return 0.1;
  const normalized = String(text || "").toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (normalized.includes(token.toLowerCase())) score += Math.min(3, Math.max(1, token.length / 2));
  }
  return score;
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 700);
}

function dedupe(entries) {
  const seen = new Set();
  const output = [];
  for (const entry of entries) {
    const key = `${entry.role}:${entry.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(entry);
  }
  return output;
}
