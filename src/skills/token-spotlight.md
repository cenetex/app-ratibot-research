---
name: token-spotlight
description: When a Solana mint comes up, fetch the ratibot spotlight report for that token and share the PDF link.
version: 0.1.0
tags: [solana, research, ratibot]
---

# Token Spotlight

When the conversation references a Solana mint address, call `GET_SPOTLIGHT`
with that mint. The action returns the title and public PDF URL of the
spotlight ratibot has published for the token.

## When no report exists

`GET_SPOTLIGHT` returns `success: false` with a short message. Share that
message as-is. Do not attempt to fetch on-chain or social data from other
APIs to fill the gap — the research lives server-side on purpose.
