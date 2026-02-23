---
description: Daily dev update tweet at end of each session
---

# Daily Dev Update Tweet

At the end of each coding session, create a "Build in Public" tweet summarizing the day's work.

## Steps

1. Review all changes made during the session (git log, task.md)
2. Write a tweet in `articulos/tweet_daily_update_<date>.md` with this format:
   - Date header
   - "Building in public 🔨" intro
   - 2-4 sections with emoji headers (🔧 Bug Fix, ⚡ Optimization, 🧬 New Feature, 🔐 Security, etc.)
   - Each section: 2-4 bullet points starting with →
   - Closing line teasing tomorrow's work
   - Hashtags: #MultiversX #BuildInPublic #XCron
3. Keep it under 280 characters per section (thread-friendly)
4. Be technical but accessible — show real work, not marketing fluff
5. Reference verified results (gas savings, test results, build status)
6. Ask user if they want an image generated for the tweet

## Rules
- Only include work that was ACTUALLY done and VERIFIED
- Never exaggerate numbers — use real measured values
- If a feature was started but not finished, say "WIP" honestly
- Always mention if builds pass and tests are clean
