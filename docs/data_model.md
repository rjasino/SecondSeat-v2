### Collections

#### `users`

Stores user profiles, authentication credentials, and preferences.

```json
{
  "_id": ObjectId,
  "name": String,
  "email": String,
  "passwordHash": String,
  "role": "user" | "admin" | "author",
  "profile": {
    "displayName": String,
    "primaryPlaystyle": "explorer" | "completionist" | "narrative" | "challenge" | "time_limited",
    "hintPhilosophy": "minimal" | "directional" | "confirm_only" | "explicit_opt_in",
    "spoilerTolerance": "none" | "low" | "medium" | "high",
    "accessibilityNeeds": Mixed,
    "preferences": {
      "allowVoiceOutput": Boolean,
      "defaultOutputMode": "text" | "voice_optional",
      "maxHintLines": Number,
      "repeatHintCooldownSeconds": Number,
      "autoRefuseSpoilers": Boolean,
      "confirmBeforeExplicitHint": Boolean
    },
    "uiSettings": {
      "overlayEnabled": Boolean,
      "overlayPosition": "top" | "bottom" | "left" | "right",
      "overlayOpacity": Number,
      "fontSize": "small" | "medium" | "large",
      "theme": "dark" | "light" | "transparent"
    }
  },
  "createdAt": Date,
  "updatedAt": Date
}
```

**Indexes:** `{ email: 1 }` (unique)

#### `games`

Catalog of supported games with metadata.

```json
{
  "_id": ObjectId,
  "title": String,
  "slug": String,
  "developer": String,
  "releaseYear": Number,
  "genre": String,
  "supported": Boolean,
  "createdAt": Date,
  "updatedAt": Date
}
```

**Indexes:** `{ slug: 1 }` (unique)

#### `play_sessions`

Active and completed player game sessions with context.

```json
{
  "_id": ObjectId,
  "userId": ObjectId,
  "gameId": ObjectId,
  "startedAt": Date,
  "endedAt": Date,
  "isActive": Boolean,
  "memoryClearedAt": Date,
  "currentContext": {
    "gameArea": String,
    "chapter": String,
    "subArea": String,
    "playerGoal": "progression" | "exploration" | "confirmation" | "completion",
    "confidenceLevel": "confident" | "uncertain" | "stuck",
    "updatedAt": Date
  },
  "contextEvents": [
    {
      "eventType": "area_change" | "chapter_update" | "goal_change" | "confidence_shift",
      "previousValue": String,
      "newValue": String,
      "createdAt": Date
    }
  ],
  "createdAt": Date,
  "updatedAt": Date
}
```

**Indexes:** `{ userId: 1, gameId: 1, isActive: 1 }`, `{ "currentContext.gameArea": 1, "currentContext.chapter": 1 }`

#### `hint_interactions`

Merged request/response log of hint generation.

```json
{
  "_id": ObjectId,
  "playSessionId": ObjectId,
  "request": {
    "rawInput": String,
    "detectedIntent": "progression" | "confirmation" | "exploration" | "completion",
    "createdAt": Date
  },
  "response": {
    "outputText": String,
    "lineCount": Number,
    "refused": Boolean,
    "refusalReason": String,
    "audioUri": String,
    "createdAt": Date
  },
  "createdAt": Date,
  "updatedAt": Date
}
```

**Indexes:** `{ playSessionId: 1, createdAt: -1 }`

#### `rag_sources`

Ingested source documents (files, URLs, or raw text).

```json
{
  "_id": ObjectId,
  "title": String,
  "sourceType": "file" | "url" | "text",
  "sourceUri": String,
  "content": String,
  "createdBy": ObjectId,
  "metadata": Mixed,
  "status": "idle" | "queued" | "processing" | "completed" | "failed",
  "startedAt": Date,
  "finishedAt": Date,
  "createdAt": Date,
  "updatedAt": Date
}
```

**Indexes:** `{ status: 1, createdBy: 1 }`

#### `rag_documents`

Chunked content from sources with vector metadata.

```json
{
  "_id": ObjectId,
  "sourceId": ObjectId,
  "chunkIndex": Number,
  "content": String,
  "hash": String,
  "vectorId": String,
  "metadata": Mixed,
  "tokens": Number,
  "createdAt": Date,
  "updatedAt": Date
}
```

**Indexes:** `{ sourceId: 1, chunkIndex: 1 }` (unique), `{ hash: 1 }`

#### `rag_ingestion_jobs`

BullMQ job tracking for ingestion pipeline.

```json
{
  "_id": ObjectId,
  "sourceId": ObjectId,
  "queueJobUuid": String,
  "status": "queued" | "processing" | "completed" | "failed",
  "totalChunks": Number,
  "processedChunks": Number,
  "progress": Number,
  "error": String,
  "startedAt": Date,
  "finishedAt": Date,
  "createdAt": Date,
  "updatedAt": Date
}
```

**Indexes:** `{ sourceId: 1, createdAt: -1 }`
