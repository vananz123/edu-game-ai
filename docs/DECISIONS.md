# Architecture Decisions

## Accepted decisions

### 1. TypeScript for application and backend
Use TypeScript as the main source language for maintainability and shared contracts. Some inherited code may temporarily use `@ts-nocheck`; remove it incrementally, not by hiding errors.

### 2. Electron for Windows desktop
Electron is the desktop shell. Keep renderer isolated from Node.js and expose only allowlisted APIs via preload/contextBridge.

### 3. SQLite for local library/history
Use SQLite on the teacher's machine for structured local data. Keep `.egame` as a portable export format. SQLite is not the cloud account database.

### 4. Offline gameplay
Saved games, scoring, explanations, history, and game assets must work without internet. Cloud generation/account features may require internet.

### 5. Fixed engines, structured AI output
AI returns validated game data (for example JSON), not executable game code. The app renders it with tested game engines.

### 6. Cloud AI Gateway owns provider keys
Gemini is the initial provider candidate. Provider keys and Supabase service-role secrets stay on the server. Desktop sends an authenticated user access token to the Gateway; it must not contain a product-owned provider key.

### 7. Supabase for auth/database in pilot
Use Supabase Auth and Postgres quota records to reduce initial implementation work. Reassess only if actual requirements justify changing providers.

### 8. Free + paid plans, pilot 1–10 teachers
Start with server-enforced quotas. Suggested starting limits in the scaffold are Free 5 generations/month and Plus 100/month; these are test defaults, not final commercial promises. Validate AI cost and user demand before setting final pricing.

### 9. Local AI is optional and later
Do not require teachers to install Ollama or download a multi-GB model. Consider local AI after the core product and cloud flow are stable.

## Decisions still open
- Final provider/model and production data terms.
- Final free/paid quotas and pricing.
- Payment provider suitable for Vietnam and accounting requirements.
- Whether/how to sync game libraries across devices.
- Retention period for usage logs and account deletion workflow.
