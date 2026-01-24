## 2024-05-22 - Accessibility and Interaction Patterns
**Learning:** Found frequent use of `window.alert` and `window.confirm` for user feedback, and buttons using emojis as primary content without `aria-label`.
**Action:** Replace `alert` with non-blocking Toast notifications. Ensure all icon/emoji-based buttons have descriptive `aria-label` attributes.
