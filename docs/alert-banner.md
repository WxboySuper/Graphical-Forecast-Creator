# Alert banner

Site-wide banner loaded from `public/alert-banner.json` at runtime (deploy updates copy without rebuilding app logic).

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | boolean | yes | Master switch |
| `message` | string | yes | Banner text |
| `type` | `info` \| `warning` \| `error` | yes | Visual style |
| `dismissible` | boolean | yes | Show close button |
| `id` | string | no | Identifier for tracking |
| `linkUrl` | string | no | CTA URL; paths starting with `/` use in-app routing |
| `linkLabel` | string | no | CTA label (default: "Learn more") |
| `startsAt` | string (ISO 8601) | no | Hide before this instant |
| `expiresAt` | string (ISO 8601) | no | Hide at or after this instant |

## v1.6 examples (production `hotfix/*` → `main`)

**Pre-release maintenance**

```json
{
  "enabled": true,
  "id": "v1.6-maintenance",
  "message": "v1.6 is deploying soon. You may see brief downtime while we update the site.",
  "type": "warning",
  "dismissible": true
}
```

**Post-release**

```json
{
  "enabled": true,
  "id": "v1.6-released",
  "message": "v1.6 is live — meet the new Monitor workspace.",
  "type": "info",
  "dismissible": true,
  "linkUrl": "/updates",
  "linkLabel": "What's new"
}
```
