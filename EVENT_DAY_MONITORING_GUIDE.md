# IPL 2026 Live Voting Event — Monitoring & Operational Runbook

This guide outlines the critical monitoring checkpoints, operational runbooks, and fallback procedures for the live high-concurrency voting event.

---

## 1. System Architecture Overview

```text
       VOTERS (1,500 – 2,000 Concurrent Users)
                          │
         ┌────────────────┴────────────────┐
         ▼                                 ▼
   REACT FRONTEND (Vercel)       VOTING MODAL / QR SCAN
         │                                 │
         │ (Cached Leaderboard / Votes)   │ (POST /api/voting/vote)
         ▼                                 ▼
  RENDER EXPRESS API ◄───────────── RATE LIMITER (5 req/10s)
         │                                 │
         │ (REST / Service Role)           │ (Atomic cast_vote RPC)
         ▼                                 ▼
  SUPABASE POSTGRESQL ─────────────► UNIQUE(voter_id, team_id, round)
         │                                 │
         │ (Postgres Changes)              │ (ON CONFLICT DO UPDATE)
         ▼                                 ▼
  SUPABASE REALTIME ───────────────► team_votes (Live Broadcast)
         │
         ▼ (Lightweight payload ~100B)
   LIVE CLIENTS
```

---

## 2. Event-Day Monitoring Checklist

### A. Supabase Dashboard (Database & Realtime)
- [ ] **Database Connections**: Monitor `Active Connections` under *Database -> Metrics*. Keep direct connections under 60 (Free) or 90 (Pro).
- [ ] **Connection Pooler**: Ensure Render connects through the connection pooler if autoscaling is enabled.
- [ ] **Realtime Concurrent Connections**: Under *Realtime -> Metrics*, monitor concurrent client connections. If connection cap is reached, clients seamlessly engage the 20-second fallback polling.
- [ ] **Database CPU & Memory**: Ensure CPU utilization remains below 80%.

### B. Render Dashboard (Backend API)
- [ ] **CPU & Memory Usage**: Monitor memory utilization to ensure it remains below 85% of allocated instance RAM.
- [ ] **HTTP 429 Rate Limits**: Check logs for rate limiter activity. Moderate 429s indicate successful blocking of burst hammering or accidental double-taps.
- [ ] **HTTP 500 Errors**: Must remain at 0.00%.
- [ ] **Zero Google Drive Calls**: Verify no Google Drive API quota is consumed by voting traffic.

### C. Admin Portal Live Monitoring Cards
- [ ] **Total Votes Cast**: Real-time accumulator.
- [ ] **Active Voters**: Count of distinct authenticated students who have voted.
- [ ] **Velocity (Votes/min)**: Sliding-window throughput gauge.
- [ ] **Duplicates Blocked**: Counter of blocked re-vote attempts (HTTP 409).
- [ ] **Realtime Status Pill**: Indicates whether the browser is receiving events via `"Live Realtime Updates Active"` or `"Auto-Sync Active (20s)"`.

---

## 3. Emergency Operational Runbook

### Scenario 1: Realtime Connection Limit Reached or Network Drop
- **Symptom**: Realtime status pill in the leaderboard changes to `"Auto-Sync Active (20s)"`.
- **System Behavior**: The frontend automatically initiates periodic synchronization against `/api/voting/leaderboard` (cached for 3s to shield the database).
- **Admin Action**: None required. As soon as connectivity restores, Realtime automatically re-subscribes, synchronizes, and cancels the polling timer.

### Scenario 2: Suspected Double-Voting or Vote Tampering
- **Symptom**: Student claims they voted twice, or a team claims vote count anomalies.
- **Verification**: Query `SELECT COUNT(*) FROM votes WHERE voter_user_id = '...' AND team_id = '...' AND voting_round = 1`.
- **Guarantee**: Database constraint `CONSTRAINT unique_voter_team_round UNIQUE (voter_user_id, team_id, voting_round)` makes duplicate votes strictly impossible at the PostgreSQL engine level.

### Scenario 3: Need to Pause Voting Immediately
1. Open the IPL 2026 Admin Portal (`/admin` or via profile dropdown).
2. Navigate to **Live Community Voting & QR Control Center**.
3. Click **"Disable Voting"** under Community Voting Switch.
4. The server immediately rejects all incoming vote requests with HTTP 403 (`VOTING_CLOSED`).
5. To resume, click **"Enable Live Voting"**.

### Scenario 4: A Team Cannot Generate or Show QR Code
1. Verify if **QR Generation Switch** in the Admin Portal is set to **ON**.
2. If the team was newly registered or missing a permanent QR token, click **"Batch Generate Team QRs"** in the Admin Portal.
3. The server generates a collision-free 32-character opaque hex token for every team lacking one.
