---
description: UI standards and design rules for the XCron frontend
---

# Frontend UI Standards

Rules to follow when adding or modifying UI components in the XCron frontend.

## Mandatory Rules

1. **NEVER use native `<select>` elements** — always use the `CustomDropdown` component from ScheduleTask.tsx (or create a shared version). Native selects break the dark theme aesthetic.

2. **All dropdowns must be custom-rendered** — consistent with the rest of the form:
   - Dark background (`var(--bg-secondary)`)
   - Accent border on focus (`var(--accent)`)
   - Hover highlighting
   - Smooth open/close transitions

3. **Segmented controls** for binary choices (e.g. Once/Recurring, Above/Below) — use the `segmented-control` CSS class.

4. **Toggle switches** for enable/disable features — custom div-based, NOT native checkboxes.

5. **Color system** — always use CSS variables:
   - `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`
   - `var(--bg-secondary)`, `var(--bg-glass)`, `var(--bg-card)`
   - `var(--border-primary)`, `var(--accent)`
   - For feature accents: use `rgba(r,g,b,0.12)` backgrounds with solid text colors

6. **Font sizes** — consistent scale:
   - Section titles: `0.9rem`
   - Labels: `0.72rem` 
   - Inputs: `0.85rem`
   - Help text / small: `0.68-0.72rem`
   - Badges: `0.6rem`

7. **Spacing** — compact layout:
   - Form sections: `marginBottom: 14, padding: 14`
   - Form groups within sections: `margin: 0` (use parent gap)
   - Glass sections: `background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)'`

8. **Price Condition widget** — the Hybrid Price Condition section uses:
   - Toggle with cyan accent (`rgb(6,182,212)`)
   - Badge "HYBRID" in uppercase cyan
   - CustomDropdown for Token selection
   - Segmented control for Above/Below
   - Live preview banner in cyan when condition is set

## Before Committing UI Changes
// turbo
1. Run `npx tsc --noEmit` to verify no TypeScript errors
2. Visually verify in the browser using browser_subagent
3. Check that all new dropdowns use CustomDropdown, NOT native select
