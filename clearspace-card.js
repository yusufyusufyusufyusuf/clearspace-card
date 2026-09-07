class ClearSpaceCard extends HTMLElement {
  constructor() {
    super();
    this._config = { entity: 'calendar.clearspace' };
    this._hass = null;
    this._tasks = [];
    this._lastUpdated = null;
    this._loading = false;
    this._error = null;
    this._refreshTimer = null;
    this._refreshInFlight = false;
  }

  setConfig(config) {
    this._config = {
      entity: 'calendar.clearspace',
      title: 'ClearSpace Tasks',
      show_completed: true,
      max_items: 50,
      refresh_interval_seconds: 60,
      show_add_button: true,
      ...config,
    };

    if (!this._config.entity) {
      this._config.entity = 'calendar.clearspace';
    }
  }

  connectedCallback() {
    this._ensureRefreshTimer();
  }

  disconnectedCallback() {
    this._clearRefreshTimer();
  }

  set hass(hass) {
    this._hass = hass;
    this._ensureRefreshTimer();
    this._refreshTasks();
    this.render();
  }

  _ensureRefreshTimer() {
    const intervalSeconds = Number(this._config?.refresh_interval_seconds || 60);
    const intervalMs = Math.max(15, intervalSeconds) * 1000;
    if (this._refreshTimer) return;
    this._refreshTimer = window.setInterval(() => {
      this._refreshTasks();
    }, intervalMs);
  }

  _clearRefreshTimer() {
    if (this._refreshTimer) {
      window.clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  async _refreshTasks() {
    if (!this._hass || this._refreshInFlight) return;

    const entityId = this._config.entity || 'calendar.clearspace';
    const state = this._hass.states[entityId];
    const stateTasks = this._extractTasksFromState(state);

    // Prefer live tasks from the entity if they exist.
    if (stateTasks.length > 0) {
      this._tasks = stateTasks;
      this._lastUpdated = new Date();
      this._error = null;
      this.render();
      return;
    }

    this._refreshInFlight = true;
    this._loading = true;
    this.render();

    try {
      const fetchedTasks = await this._fetchTasksFromCalendar(entityId);
      this._tasks = fetchedTasks;
      this._lastUpdated = new Date();
      this._error = null;
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
      // Keep whatever we had before if fetch fails.
    } finally {
      this._loading = false;
      this._refreshInFlight = false;
      this.render();
    }
  }

  _extractTasksFromState(state) {
    if (!state || !state.attributes) return [];
    const tasks = state.attributes.tasks || state.attributes.task_list || [];
    if (!Array.isArray(tasks)) return [];
    return tasks.map((task, index) => this._normalizeTask(task, index, 'state'));
  }

  async _fetchTasksFromCalendar(entityId) {
    const token = this._hass?.auth?.data?.accessToken;
    if (!token) {
      throw new Error('Home Assistant auth token not available');
    }

    const now = new Date();
    const start = now.toISOString();
    const end = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString();

    const payloads = [
      {
        entity_id: entityId,
        start_date_time: start,
        end_date_time: end,
      },
      {
        target: { entity_id: [entityId] },
        start_date_time: start,
        end_date_time: end,
      },
      {
        target: { entity_id: [entityId] },
        duration: { days: 30 },
      },
    ];

    for (const payload of payloads) {
      const response = await fetch('/api/services/calendar/get_events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const tasks = this._normalizeCalendarResponse(data, entityId);
      if (tasks.length > 0) return tasks;
    }

    return [];
  }

  _normalizeCalendarResponse(data, entityId) {
    const candidateLists = [];

    if (Array.isArray(data)) candidateLists.push(data);
    if (data && Array.isArray(data.events)) candidateLists.push(data.events);
    if (data && Array.isArray(data.tasks)) candidateLists.push(data.tasks);
    if (data && data.response) {
      const response = data.response;
      if (Array.isArray(response)) candidateLists.push(response);
      if (response && Array.isArray(response.events)) candidateLists.push(response.events);
      if (response && response[entityId] && Array.isArray(response[entityId].events)) {
        candidateLists.push(response[entityId].events);
      }
      if (response && response[entityId] && Array.isArray(response[entityId].tasks)) {
        candidateLists.push(response[entityId].tasks);
      }
    }
    if (data && data[entityId]) {
      const scoped = data[entityId];
      if (Array.isArray(scoped)) candidateLists.push(scoped);
      if (scoped && Array.isArray(scoped.events)) candidateLists.push(scoped.events);
      if (scoped && Array.isArray(scoped.tasks)) candidateLists.push(scoped.tasks);
    }

    const flattened = candidateLists.find((list) => Array.isArray(list) && list.length > 0) || [];
    return flattened.map((task, index) => this._normalizeTask(task, index, 'calendar'));
  }

  _normalizeTask(task, index, source) {
    if (typeof task === 'string') {
      return {
        id: `${source}-${index}-${task}`,
        name: task,
        due: null,
        status: 'open',
        priority: 'medium',
        source,
      };
    }

    const title = task?.summary || task?.title || task?.name || task?.subject || 'Untitled task';
    const due = task?.due || task?.due_date || task?.start || task?.start_date || task?.datetime || task?.date || null;
    const status = task?.status || (task?.completed ? 'done' : 'open');
    const priority = task?.priority || task?.importance || 'medium';

    return {
      id: task?.id || task?.uid || `${source}-${index}-${title}`,
      name: title,
      due,
      status,
      priority,
      description: task?.description || '',
      location: task?.location || '',
      source,
    };
  }

  render() {
    if (!this._config) return;

    const title = this._config.title || 'ClearSpace Tasks';
    const showCompleted = this._config.show_completed !== false;
    const maxItems = Number(this._config.max_items || 50);
    const allTasks = Array.isArray(this._tasks) ? this._tasks : [];

    let displayTasks = showCompleted ? allTasks : allTasks.filter((task) => task.status !== 'done');
    displayTasks = displayTasks.slice(0, maxItems);

    const openCount = allTasks.filter((task) => task.status !== 'done').length;
    const taskItems = displayTasks.map((task) => {
      const isDone = task.status === 'done';
      const dueClass = this._getDueClass(task);
      const dueLabel = task.due ? this._formatDate(task.due) : '';
      const checkbox = isDone
        ? `<ha-icon icon="mdi:check-circle" style="color: var(--success-color);"></ha-icon>`
        : `<ha-icon icon="mdi:checkbox-blank-circle-outline" style="color: var(--primary-color);"></ha-icon>`;

      return `
        <div class="task-item ${isDone ? 'task-done' : ''}" data-task-id="${this._escapeHtml(task.id)}">
          <div class="task-checkbox">${checkbox}</div>
          <div class="task-content">
            <div class="task-name">${this._escapeHtml(task.name)}</div>
            ${dueLabel ? `<div class="task-due ${dueClass}">${this._escapeHtml(dueLabel)}</div>` : ''}
          </div>
          ${task.priority === 'high' || task.priority === 'urgent' ? '<div class="task-priority">!</div>' : ''}
        </div>
      `;
    }).join('');

    this.innerHTML = `
      <ha-card>
        <style>
          .clearspace-card {
            padding: 16px;
          }
          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--divider-color);
            margin-bottom: 12px;
          }
          .title-wrap {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .card-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--primary-text-color);
            line-height: 1.2;
          }
          .card-subtitle {
            font-size: 12px;
            color: var(--secondary-text-color);
          }
          .task-count {
            font-size: 14px;
            color: var(--secondary-text-color);
            background: var(--secondary-background-color);
            padding: 4px 10px;
            border-radius: 999px;
            white-space: nowrap;
          }
          .task-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .task-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px;
            border-radius: 10px;
            background: var(--card-background-color);
            border: 1px solid var(--divider-color);
            cursor: pointer;
            transition: background 0.2s ease;
          }
          .task-item:hover {
            background: var(--secondary-background-color);
          }
          .task-done {
            opacity: 0.65;
          }
          .task-done .task-name {
            text-decoration: line-through;
          }
          .task-checkbox {
            flex-shrink: 0;
          }
          .task-content {
            flex: 1;
            min-width: 0;
          }
          .task-name {
            font-size: 14px;
            color: var(--primary-text-color);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .task-due {
            font-size: 12px;
            margin-top: 2px;
          }
          .due-soon {
            color: var(--warning-color);
          }
          .due-overdue {
            color: var(--error-color);
            font-weight: 500;
          }
          .due-later {
            color: var(--secondary-text-color);
          }
          .task-priority {
            color: var(--error-color);
            font-weight: bold;
            font-size: 16px;
            flex-shrink: 0;
          }
          .empty-state {
            text-align: center;
            padding: 24px 12px;
            color: var(--secondary-text-color);
          }
          .error-state {
            text-align: center;
            padding: 16px 12px;
            color: var(--error-color);
            font-size: 13px;
          }
          .add-task-btn {
            margin-top: 12px;
            width: 100%;
            padding: 10px;
            border: 1px dashed var(--primary-color);
            border-radius: 10px;
            background: transparent;
            color: var(--primary-color);
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }
          .add-task-btn:hover {
            background: rgba(var(--rgb-primary-color), 0.1);
          }
        </style>
        <div class="clearspace-card">
          <div class="card-header">
            <div class="title-wrap">
              <div class="card-title">${this._escapeHtml(title)}</div>
              <div class="card-subtitle">Auto-refreshes every ${Math.max(15, Number(this._config.refresh_interval_seconds || 60))} seconds</div>
            </div>
            <div class="task-count">${openCount} open</div>
          </div>

          ${this._loading && displayTasks.length === 0 ? '<div class="empty-state">Loading ClearSpace tasks…</div>' : ''}
          ${this._error ? `<div class="error-state">Could not load tasks: ${this._escapeHtml(this._error)}</div>` : ''}

          ${displayTasks.length > 0
            ? `<div class="task-list">${taskItems}</div>`
            : (!this._loading ? '<div class="empty-state">No tasks found</div>' : '')
          }

          ${this._config.show_add_button !== false ? `
            <button class="add-task-btn" onclick="window.open('https://clearspacetask.com', '_blank')">
              <ha-icon icon="mdi:plus"></ha-icon>
              Add Task
            </button>
          ` : ''}
        </div>
      </ha-card>
    `;

    this.querySelectorAll('.task-item').forEach((item) => {
      item.addEventListener('click', () => {
        const taskId = item.getAttribute('data-task-id');
        if (taskId && this._hass?.callService) {
          this._hass.callService('clearspace', 'complete_task', { task_id: taskId });
        }
      });
    });
  }

  _getDueClass(task) {
    if (task.status === 'done') return '';
    if (!task.due) return '';
    const today = new Date().toISOString().split('T')[0];
    const due = String(task.due).slice(0, 10);
    if (due < today) return 'due-overdue';
    if (due === today) return 'due-soon';
    return 'due-later';
  }

  _formatDate(dateStr) {
    const asString = String(dateStr);
    const dateOnly = asString.slice(0, 10);
    const parsed = new Date(dateOnly + 'T00:00:00');
    if (Number.isNaN(parsed.getTime())) return asString;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((parsed - today) / (1000 * 60 * 60 * 24));

    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff < -1) return `${Math.abs(diff)} days overdue`;
    if (diff > 1) return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  getCardSize() {
    return 4;
  }

  static getConfigElement() {
    return document.createElement('clearspace-card-editor');
  }

  static getStubConfig() {
    return {
      entity: 'calendar.clearspace',
      title: 'ClearSpace Tasks',
      show_completed: true,
      max_items: 50,
      refresh_interval_seconds: 60,
      show_add_button: true,
    };
  }
}

customElements.define('clearspace-card', ClearSpaceCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'clearspace-card',
  name: 'ClearSpace Tasks',
  description: 'A card to display and manage ClearSpace tasks',
  preview: true,
  documentationURL: 'https://github.com/yusufyusufyusufyusuf/clearspace-card',
});

console.info('%c CLEARSPACE CARD %c v1.1.0 ', 'background: #667eea; color: white; font-weight: 700;', 'background: #764ba2; color: white; font-weight: 700;');
