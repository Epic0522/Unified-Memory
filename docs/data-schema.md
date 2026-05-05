# Data Schema / 数据结构

`data/unified-memory.json`:

```json
{
  "version": 1,
  "memoryShape": {
    "strategy": "flask",
    "description": "base keeps near-handoff details, body keeps compact summaries, neck keeps distant outlines."
  },
  "updatedAt": null,
  "handoff": {
    "latest": null,
    "history": []
  },
  "ideas": [],
  "projectNotes": [],
  "userPreferences": [],
  "openLoops": [],
  "dailyTimeline": [],
  "currentState": {
    "timeContext": null,
    "sleepState": null,
    "recentMeal": null,
    "bodyState": null,
    "mood": null,
    "updatedAt": null
  }
}
```

Common entry fields:

```json
{
  "id": "timestamp-random",
  "type": "idea|handoff|projectNote|preference|openLoop|dailyState",
  "topic": "short topic",
  "summary": "distilled memory",
  "nextActions": [],
  "evidence": [],
  "channel": "cli|imessage|other",
  "originDevice": "mobile|desktop|unknown",
  "executionDevice": "desktop|mobile|unknown",
  "mode": "manual|imessage|cli|remoteExecution",
  "sourceTextHint": "short non-sensitive hint",
  "confidence": 0.75,
  "zone": "base|body|neck",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```
