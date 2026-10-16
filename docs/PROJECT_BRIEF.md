# EduGame Studio — Project Brief

## Vision
A Windows application that helps teachers turn lesson plans, teaching documents, and curriculum content into engaging educational games. Teachers should not need to know how to install AI runtimes, manage API keys, or write code.

## Intended users and launch
- Primary users: teachers, initially in Vietnam.
- Initial pilot: 1–10 teachers.
- Business model: free tier and paid tier, with quotas enforced on the server.
- Desktop target: Windows 10/11.

## Core product promise
1. Import lesson content from local documents.
2. Create or draft game content with AI online, or use basic rule-based drafting offline.
3. Preview and edit before classroom use.
4. Save games locally and play them without internet.
5. Export/import portable `.egame` files, including transfer via USB.

## Product principles
- Offline gameplay is a core requirement, not a premium feature.
- Cloud AI generates content; it is not called for each student answer.
- AI output must be structured and validated; fixed game engines render it.
- Teachers must review educational accuracy before using generated content.
- Collect as little lesson/student data as possible. Avoid sending student-identifying information to AI.
- The app should be simple for non-technical teachers.

## Initial scope
- Windows desktop app using Electron + TypeScript.
- Local SQLite database for game library and session history.
- Game package `.egame` for portability.
- Cloud AI Gateway using TypeScript/Express, Supabase Auth/DB, and Gemini API as the initial provider.
- Free/Plus quota logic as a starting point; payment integration is not yet complete.

## Out of scope for the first pilot
- Mandatory local LLM installation.
- GPU server hosting a model.
- Fully automatic billing before validating demand.
- Arbitrary AI-generated executable code.
- Full multi-device cloud sync unless prioritized after pilot feedback.
