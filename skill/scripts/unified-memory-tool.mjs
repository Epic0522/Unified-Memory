#!/usr/bin/env node
import { createUnifiedMemory } from "../src/unified-memory/index.js";
import { formatIMessageMemoryPrompt, searchIMessageMemory } from "../src/unified-memory/imessage-context.js";
import { formatRecentContextPrompt, searchRecentCodexContext } from "../src/unified-memory/recent-context.js";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const memoryPath = process.env.UNIFIED_MEMORY_PATH || join(packageRoot, "data", "unified-memory.json");
const settingsPath = process.env.UNIFIED_MEMORY_SETTINGS_PATH || join(packageRoot, "data", "settings.json");
const memory = createUnifiedMemory({ memoryPath });

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "true";
    if (args[key] == null) args[key] = value;
    else if (Array.isArray(args[key])) args[key].push(value);
    else args[key] = [args[key], value];
  }
  return args;
}

function list(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function loadUnifiedMemorySettings() {
  try {
    const body = JSON.parse(await readFile(settingsPath, "utf8"));
    return {
      autoWriteOnSkillRecall: Boolean(body.unifiedMemory?.autoWriteOnSkillRecall),
      autoWriteOnIMessageRecall: body.unifiedMemory?.autoWriteOnIMessageRecall !== false,
      manualHandoffCommand: body.unifiedMemory?.manualHandoffCommand !== false
    };
  } catch {
    return {
      autoWriteOnSkillRecall: false,
      autoWriteOnIMessageRecall: true,
      manualHandoffCommand: true
    };
  }
}

function optionsFromArgs(args) {
  return {
    type: args.type,
    source: args.source,
    channel: args.channel,
    originDevice: args["origin-device"] || args.originDevice,
    executionDevice: args["execution-device"] || args.executionDevice,
    mode: args.mode,
    zone: args.zone,
    topic: args.topic || args.title,
    summary: args.summary || args.text,
    text: args.text,
    sourceTextHint: args["source-text-hint"] || args.sourceTextHint,
    confidence: args.confidence,
    nextActions: list(args.next || args.nextActions),
    evidencePaths: list(args.evidence || args.evidencePath || args.evidencePaths),
    status: args.status
  };
}

async function main() {
  const [command = "read", ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === "init") {
    await memory.save(await memory.load());
    print(await memory.status());
    return;
  }

  if (command === "read" || command === "search") {
    const snapshot = await memory.read({
      query: args.query || args.q || args._.join(" "),
      device: args.device,
      limit: args.limit
    });
    await maybeWriteSkillRecall({
      query: args.query || args.q || args._.join(" "),
      kind: command,
      snapshot
    });
    print(snapshot);
    return;
  }

  if (command === "recall") {
    const query = args.query || args.q || args._.join(" ");
    const snapshot = await memory.read({
      query,
      device: args.device,
      limit: args.limit || 8
    });
    const imessage = await searchIMessageMemory({
      query,
      limit: args.imessageLimit || args["imessage-limit"] || 12
    });
    const recent = await searchRecentCodexContext({
      query,
      limit: args.recentLimit || args["recent-limit"] || 8,
      maxFiles: args.maxFiles || args["max-files"] || 16
    });
    const output = {
      ...snapshot,
      imessageContext: imessage,
      recentContext: recent,
      promptContext: [
        formatRecentContextPrompt(recent),
        formatIMessageMemoryPrompt(imessage),
        "以下长期统一记忆可能较旧；如果和最近桌面对话或手机滚动上下文冲突，请优先相信更近的上下文：",
        await memory.formatForPrompt({ query, limit: args.limit || 8 })
      ].filter(Boolean).join("\n\n")
    };
    await maybeWriteSkillRecall({
      query,
      kind: "recall",
      snapshot,
      imessage,
      recent
    });
    print(output);
    return;
  }

  if (command === "status") {
    print(await memory.status());
    return;
  }

  if (command === "write") {
    print(await memory.write(optionsFromArgs(args)));
    return;
  }

  if (command === "clear") {
    print(await memory.clear({ scope: args.scope || "latest" }));
    return;
  }

  if (command === "handoff") {
    print(await memory.write({
      ...optionsFromArgs(args),
      type: "handoff",
      source: args.source || "cli",
      summary: args.summary || args.text || "",
      topic: args.title || args.topic
    }));
    return;
  }

  if (command === "preference") {
    print(await memory.write({
      ...optionsFromArgs(args),
      type: "preference",
      source: args.source || "cli",
      summary: args.text || args.summary || ""
    }));
    return;
  }

  if (command === "note") {
    print(await memory.write({
      ...optionsFromArgs(args),
      type: "projectNote",
      source: args.source || "cli",
      topic: args.title || args.topic,
      summary: args.summary || args.text || ""
    }));
    return;
  }

  if (command === "open-loop") {
    print(await memory.write({
      ...optionsFromArgs(args),
      type: "openLoop",
      source: args.source || "cli",
      topic: args.title || args.topic,
      summary: args.summary || args.text || ""
    }));
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exit(2);
}

async function maybeWriteSkillRecall(options = {}) {
  const settings = await loadUnifiedMemorySettings();
  if (!settings.autoWriteOnSkillRecall) return;
  const query = String(options.query || "").trim();
  if (!query) return;
  const topMemory = options.snapshot?.entries?.[0]?.summary || "";
  const topIMessage = options.imessage?.[0]?.text || "";
  const topRecent = options.recent?.[0]?.text || "";
  const context = [topMemory, topIMessage, topRecent].filter(Boolean).join(" / ").slice(0, 700);
  await memory.write({
    type: "handoff",
    source: "cli",
    channel: "cli",
    originDevice: "desktop",
    executionDevice: "desktop",
    mode: "unified_memory_skill",
    topic: query.slice(0, 80),
    summary: `桌面端调用 unified-memory ${options.kind || "read"}：${query}${context ? `；召回要点：${context}` : ""}`,
    sourceTextHint: query,
    confidence: 0.7,
    zone: "base"
  });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
