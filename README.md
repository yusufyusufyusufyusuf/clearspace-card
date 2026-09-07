# ClearSpace Card

A beautiful Home Assistant card for displaying and managing your ClearSpace tasks.

## Features

- ✅ View all your ClearSpace tasks
- 🗓️ See due dates with color coding (overdue, due today, upcoming)
- 🏷️ Priority indicators for high/urgent tasks
- ☑️ Tap a task to mark it complete
- 🔹 Quick "Add Task" button
- 🎨 Matches your Home Assistant theme

## Installation

### HACS (Recommended)

1. Go to **HACS** in Home Assistant
2. Click **Frontend**
3. Click the **three dots** (⋮) in the top-right
4. Click **Custom repositories**
5. Add this repository URL:
   ```
   https://github.com/yusufyusufyusufyusuf/clearspace-card
   ```
6. Set category to **Dashboard**
7. Click **Add**
8. Find **ClearSpace Card** and click **Download**
9. Refresh your browser (Ctrl+F5 or Cmd+Shift+R)

### Manual

1. Download `clearspace-card.js` from the latest release
2. Copy it to your `config/www/` directory
3. Go to **Settings → Dashboards → Resources**
4. Click **Add Resource**
5. URL: `/local/clearspace-card.js`
6. Resource type: **JavaScript Module**
7. Click **Create**
8. Refresh your browser

## Configuration

Add the card to your dashboard:

```yaml
type: custom:clearspace-card
entity: sensor.clearspace_open
title: My Tasks
show_completed: false
max_items: 10
show_add_button: true
```

### Options

| Name | Type | Default | Description |
|------|------|---------|-------------|
| entity | string | **required** | Entity to show tasks from (e.g., `sensor.clearspace_open`) |
| title | string | "ClearSpace Tasks" | Card title |
| show_completed | boolean | false | Show completed tasks |
| max_items | number | 10 | Maximum number of tasks to show |
| show_add_button | boolean | true | Show "Add Task" button |

## Required Integration

This card requires the [ClearSpace Home Assistant integration](https://github.com/yusufyusufyusufyusuf/clearspace-home-assistant) to be installed.

## Support

For issues or feature requests, please open an issue on GitHub.
