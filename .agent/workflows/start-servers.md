---
description: How to start backend (port 3010) and frontend (port 3011)
---

# Start Backend and Frontend Servers

// turbo-all

1. Start the backend server (port 3010):
```
cmd /c "npm run dev"
```
Run from: `c:\Users\lovro\Cezih_fhir\cezih_fhir`
This starts `tsx watch src/server.ts` which watches for file changes.

2. Start the frontend server (port 3011):
```
cmd /c "npm run dev:client"
```
Run from: `c:\Users\lovro\Cezih_fhir\cezih_fhir`
This starts Next.js dev server on port 3011.

**Note:** Use `cmd /c` wrapper because PowerShell execution policy may block npm.ps1 scripts.
