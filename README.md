# ClearSpace Cards

A set of Home Assistant Lovelace cards for ClearSpace.

## Available card types

- `custom:clearspace-card` — detailed task list
- `custom:clearspace-compact-card` — compact summary + top tasks
- `custom:clearspace-board-card` — grouped board view
- `custom:clearspace-stats-card` — stats-focused layout

## Install

### HACS

1. Open **HACS → Frontend**
2. Add this repository as a custom repository:
   ```
   https://github.com/yusufyusufyusufyusuf/clearspace-card
   ```
3. Download the ClearSpace card resource (`clearspace-card.v1.3.8.js`)
4. Add the JavaScript resource to Lovelace
5. Refresh your browser

### Manual

1. Download `clearspace-card.js`
2. Copy it into `config/www/`
3. Add a Lovelace resource:
   - URL: `/local/clearspace-card.js`
   - Type: `JavaScript Module`
4. Refresh your browser

## Home Assistant config

Use the entity that contains the ClearSpace task list. The cards will auto-detect ClearSpace entities when possible.
### Task list card

```yaml
type: custom:clearspace-card
entity: sensor.clearspace_tasks
title: ClearSpace Tasks
refresh_interval_seconds: 60
show_completed: true
max_items: 50
show_add_button: true
```

### Compact card

```yaml
type: custom:clearspace-compact-card
entity: sensor.clearspace_tasks
title: ClearSpace Compact
refresh_interval_seconds: 60
show_completed: false
max_items: 3
```

### Board card

```yaml
type: custom:clearspace-board-card
entity: sensor.clearspace_tasks
title: ClearSpace Board
refresh_interval_seconds: 60
show_completed: true
```

### Stats card

```yaml
type: custom:clearspace-stats-card
entity: sensor.clearspace_tasks
title: ClearSpace Stats
refresh_interval_seconds: 60
```

## Backend refresh service

The integration now exposes:

- `clearspace.refresh`
- `clearspace.create_task`
- `clearspace.complete_task`
- `clearspace.delete_task`

You can call `clearspace.refresh` from automations if you want to force a sync.

## Docs

Open the setup and gallery page:

- `docs/index.html`

If you publish this repo with GitHub Pages, that page becomes your public install/config guide.
