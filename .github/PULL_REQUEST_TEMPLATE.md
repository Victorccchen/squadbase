## Summary

<!-- What does this change do? -->

## Stage

- [ ] Stage 0 scaffold only (no business features)
- [ ] Stage 1 auth / profiles / roles / RLS (no business features)
- [ ] Stage 2 org master data (teams, players, coaches, roster read)
- [ ] Stage 3 guardian–player binding with admin approval
- [ ] Stage 4 training sessions / parent registration / Q&A

## Verification

- [ ] `npm run lint`, `npm run typecheck`, and `npm test` pass
- [ ] Unauthenticated `/app` redirects to login (T1-1)
- [ ] Phone OTP request + verify + logout flows exist with zh-Hant / en / ja copy
- [ ] Migration SQL is in `supabase/migrations/` (applied on **staging only**)
- [ ] No secrets, `.env`, or service role keys in the diff
- [ ] This PR is not merged to `main` by the agent
- [ ] This PR does **not** deploy to production

## Deploy

This PR must **not** deploy to production. Production deploys require human approval. CI is lint + typecheck + unit tests only.
