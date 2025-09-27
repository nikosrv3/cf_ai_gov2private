# API Documentation

This document describes the backend API for the Government-to-Private Sector Resume Transformation application.

## Base URL

The API is served from the Cloudflare Worker at your deployed URL.

## Authentication

The API uses anonymous authentication via signed cookies. Each request automatically gets a unique user ID via HMAC-signed cookies.

## Data Models

### RunData

```typescript
interface RunData {
  id: string;
  createdAt: string;
  updatedAt?: string;
  status: "queued" | "pending" | "generating" | "role_selection" | "done" | "error";
  targetRole?: string;
  phases?: {
    normalize?: NormalizedData;
    roleDiscovery?: JobRole[];
    selectedRole?: JobRole;
    requirements?: { must_have: string[]; nice_to_have: string[] };
    mapping?: any;
    bullets?: string[];
    bullets_history?: string[][];
    scoring?: Array<{ skill: string; score: number; depth?: number }>;
    draft?: string;
    chat?: Array<{ role: "user" | "assistant"; content: string; timestamp?: string }>;
  };
  jobDescription?: string;
  jobDescriptionSource?: "user_pasted" | "llm_generated";
}
```

### JobRole

```typescript
interface JobRole {
  id: string;
  title: string;
  company?: string;
  description: string;
  requirements?: string[];
  score?: number;  // 0..100
  source?: "ai" | "user";
}
```

### NormalizedData

```typescript
interface NormalizedData {
  name: string | null;
  contact: {
    email: string | null;
    phone: string | null;
    location: string | null;
    links: string[];
  };
  summary?: string | null;
  skills: string[];
  certifications?: string[];
  education: Array<{
    degree: string;
    field?: string | null;
    institution: string;
    year?: string | null;
  }>;
  experience: Array<{
    title: string;
    org: string;
    location?: string | null;
    start?: string | null;
    end?: string | null;
    bullets: string[];
    skills?: string[];
  }>;
}
```

## Endpoints

### 1. Health Check

**GET** `/api/health`

Returns a simple health check.

**Response:**
```
200 OK
ok
```

### 2. Discover Jobs

**POST** `/api/discover-jobs`

Creates a new run, normalizes the resume, and discovers potential job roles.

**Request Body:**
```json
{
  "resumeText": "string",
  "background": "string" // optional
}
```

**Response:**
```json
{
  "ok": true,
  "run": RunData
}
```

**Status Flow:**
- `queued` → `role_selection` (after role discovery)

### 3. Get Run

**GET** `/api/run/:id`

Retrieves a specific run by ID.

**Response:**
```json
{
  "ok": true,
  "run": RunData
}
```

**Error Response:**
```json
{
  "ok": false,
  "error": "not_found"
}
```

### 4. Get History

**GET** `/api/history`

Retrieves the user's run history.

**Response:**
```json
{
  "ok": true,
  "items": Array<{
    id: string;
    role?: string;
    status: string;
    createdAt: string;
  }>
}
```

### 5. Select Role

**POST** `/api/run/:id/select-role`

Selects a role and runs the full tailoring pipeline.

**Request Body (one of):**
```json
{
  "roleId": "string",
  "jobDescription": "string", // optional
  "useAiGenerated": boolean // optional
}
```

or

```json
{
  "customRole": JobRole,
  "jobDescription": "string" // optional
}
```

**Response:**
```json
{
  "ok": true,
  "run": RunData
}
```

**Status Flow:**
- `role_selection` → `done` (after full pipeline)

### 6. Change Role

**POST** `/api/run/:id/change-role`

Changes the selected role and sets status to generating.

**Request Body (one of):**
```json
{
  "roleId": "string"
}
```

or

```json
{
  "customRole": JobRole
}
```

**Response:**
```json
{
  "ok": true
}
```

**Status Flow:**
- Any status → `generating`

### 7. Generate

**POST** `/api/run/:id/generate`

Runs the full tailoring pipeline for the selected role.

**Response:**
```json
{
  "ok": true,
  "run": RunData
}
```

**Status Flow:**
- `generating` → `done`

### 8. Chat

**POST** `/api/chat`

Chat with the AI assistant. Supports bullet editing intents.

**Request Body:**
```json
{
  "runId": "string",
  "message": "string",
  "context": "string" // optional
}
```

**Response:**
```json
{
  "ok": true,
  "reply": "string"
}
```

### 9. Chat (Alternative Route)

**POST** `/api/run/:id/chat`

Alternative chat endpoint with run ID in URL.

**Request Body:**
```json
{
  "message": "string",
  "context": "string" // optional
}
```

**Response:**
```json
{
  "ok": true,
  "reply": "string"
}
```

### 10. Bullet Transform

**POST** `/api/run/:id/bullets/transform`

Transforms bullets according to a specific style.

**Request Body:**
```json
{
  "style": "quant" | "short" | "lead" | "ats" | "dejargon",
  "indexes": [number] // optional, defaults to all bullets
}
```

**Response:**
```json
{
  "ok": true,
  "runId": "string",
  "style": "string",
  "indexes": [number],
  "bullets": [string]
}
```

### 11. Export

#### TXT Export

**GET** `/api/run/:id/export.txt`

Exports the resume as plain text.

**Response:**
```
200 OK
Content-Type: text/plain
Content-Disposition: attachment; filename="resume-{role}-{date}.txt"

[Resume content]
```

#### PDF Export

**GET** `/api/run/:id/export.pdf`

Exports the resume as PDF (placeholder implementation).

**Response:**
```
501 Not Implemented
Content-Type: application/pdf
Content-Disposition: attachment; filename="resume-{role}-{date}.pdf"
```

#### DOCX Export

**GET** `/api/run/:id/export.docx`

Exports the resume as DOCX (placeholder implementation).

**Response:**
```
501 Not Implemented
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
Content-Disposition: attachment; filename="resume-{role}-{date}.docx"
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "ok": false,
  "error": "error_code"
}
```

Common error codes:
- `not_found` - Resource not found
- `invalid_role` - Invalid role ID
- `missing_role` - No role provided
- `empty_message` - Empty chat message
- `invalid_style` - Invalid bullet style
- `no_bullets` - No bullets to transform
- `ai_error` - AI processing error
- `server_misconfigured` - Missing APP_SECRET

## Status Values

The canonical status values are:
- `queued` - Initial state
- `pending` - Waiting for processing
- `generating` - Running AI pipeline
- `role_selection` - Waiting for user to select role
- `done` - Completed successfully
- `error` - Failed with error

## Testing

Use the provided test scripts to validate the API:

**PowerShell (Windows):**
```powershell
.\scripts\test-api.ps1 -BaseUrl "http://localhost:8787"
```

**Bash (Linux/Mac):**
```bash
./scripts/test-api.sh http://localhost:8787
```

## Implementation Notes

- All AI outputs are validated with JSON schemas
- Failed AI calls are logged but don't crash the system
- Deep merge semantics are used for phase updates
- Bullet history is maintained for undo functionality
- Chat history is limited to the last 12 messages
- Export filenames follow the pattern: `resume-{role}-{date}.{ext}`
