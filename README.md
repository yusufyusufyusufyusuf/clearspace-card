# ClearSpace Card

A Home Assistant Lovelace card for displaying ClearSpace tasks.

## Features

- Shows tasks from `calendar.clearspace` by default
- Falls back to tasks exposed in entity attributes if available
- Auto-refreshes every 60 seconds by default
- Shows due dates and priority styling
- Optional Add Task button

## Installation

### HACS

1. In Home Assistant, go to **HACS → Frontend**
2. Click the **three dots** (⋮)
3. Click **Custom repositories**
4. Add this repository URL:
   ```
   https://github.com/yusufyusufyusufyusuf/clearspace-card
   ```
5. Set category to **Dashboard**
6. Click **Add**
7. Find **ClearSpace Tasks** and click **Download**
8. Refresh your browser

### Manual

1. Download `clearspace-card.js`
2. Copy it to `config/www/`
3. Add a Lovelace resource:
   - URL: `/local/clearspace-card.js`
   - Type: `JavaScript Module`
4. Refresh your browser

## Example

```yaml
type: custom:clearspace-card
entity: calendar.clearspace
title: ClearSpace Tasks
refresh_interval_seconds: 60
show_completed: true
max_items: 50
show_add_button: true
```

## Options

| Option | Type | Default | Description |
|---|---|---:|---|
| `entity` | string | `calendar.clearspace` | ClearSpace entity to read from |
| `title` | string | `ClearSpace Tasks` | Card title |
| `show_completed` | boolean | `true` | Show completed tasks if present |
| `max_items` | number | `50` | Maximum visible tasks |
| `refresh_interval_seconds` | number | `60` | Auto-refresh interval |
| `show_add_button` | boolean | `true` | Show the Add Task button |
