const CLEARSPACE_VERSION = '1.3.6';
const CLEARSPACE_DOCS_URL = 'https://github.com/yusufyusufyusufyusuf/clearspace-card';

const CARD_VARIANTS = {
  list: {
    tag: 'clearspace-card',
    aliases: ['clearspace-task-card', 'clearspace-tasks-card'],
    name: 'ClearSpace Tasks',
    description: 'Detailed ClearSpace task list',
  },
  compact: {
    tag: 'clearspace-compact-card',
    aliases: ['clearspace-summary-card'],
    name: 'ClearSpace Compact',
    description: 'Small summary card with counts and top tasks',
  },
  board: {
    tag: 'clearspace-board-card',
    aliases: ['clearspace-kanban-card'],
    name: 'ClearSpace Board',
    description: 'Grouped task board with status columns',
  },
  stats: {
    tag: 'clearspace-stats-card',
    aliases: ['clearspace-counts-card'],
    name: 'ClearSpace Stats',
    description: 'Stats-focused card with quick action buttons',
  },
};

const DEFAULT_ENTITIES = [
  'sensor.clearspace_tasks',
  'sensor.clearspace_open',
  'sensor.clearspace_due_today',
  'sensor.clearspace_overdue',
  'calendar.clearspace',
];

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function formatDate(dateValue) {
  if (!dateValue) return '';
  const asString = String(dateValue);
  const dateOnly = asString.slice(0, 10);
  const parsed = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return asString;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((parsed - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < -1) return `${Math.abs(diff)} days overdue`;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function normalizeTask(task, index, source) {
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
  return {
    id: task?.id || task?.uid || `${source}-${index}-${title}`,
    name: title,
    due: task?.due || task?.due_date || task?.start || task?.start_date || task?.datetime || task?.date || null,
    status: task?.status || (task?.completed ? 'done' : 'open'),
    priority: task?.priority || task?.importance || 'medium',
    description: task?.description || '',
    location: task?.location || '',
    source,
  };
}

function extractTasksFromState(state) {
  if (!state?.attributes) return [];
  const raw = state.attributes.tasks || state.attributes.task_list || state.attributes.items || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((task, index) => normalizeTask(task, index, state.entity_id));
}

function scoreState(state) {
  if (!state) return -1;
  if (extractTasksFromState(state).length > 0) return 100;
  if (state.entity_id === 'sensor.clearspace_tasks') return 80;
  if (state.attributes?.tasks) return 70;
  if (state.entity_id === 'sensor.clearspace_open') return 60;
  if (state.entity_id === 'calendar.clearspace') return 50;
  return 0;
}

function resolveTasks(hass, entityHint) {
  if (!hass?.states) return { entityId: entityHint || 'sensor.clearspace_tasks', state: null, tasks: [] };

  const candidateIds = [
    entityHint,
    ...DEFAULT_ENTITIES,
    ...Object.keys(hass.states).filter((entityId) => entityId.includes('clearspace')),
  ].filter(Boolean);

  let best = null;
  for (const entityId of candidateIds) {
    const state = hass.states[entityId];
    const score = scoreState(state);
    if (score > scoreState(best?.state)) {
      best = { entityId, state, tasks: extractTasksFromState(state) };
    }
  }

  if (!best) {
    return { entityId: entityHint || 'sensor.clearspace_tasks', state: null, tasks: [] };
  }

  return best;
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const aDone = a.status === 'done' ? 1 : 0;
    const bDone = b.status === 'done' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const aDue = a.due ? String(a.due) : '9999-12-31';
    const bDue = b.due ? String(b.due) : '9999-12-31';
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return String(a.name).localeCompare(String(b.name));
  });
}

function groupTasks(tasks) {
  const today = new Date().toISOString().slice(0, 10);
  const buckets = { overdue: [], today: [], upcoming: [], done: [] };
  for (const task of tasks) {
    if (task.status === 'done') {
      buckets.done.push(task);
      continue;
    }
    const due = task.due ? String(task.due).slice(0, 10) : '';
    if (due && due < today) buckets.overdue.push(task);
    else if (due === today) buckets.today.push(task);
    else buckets.upcoming.push(task);
  }
  return buckets;
}

function dueClass(task) {
  if (task.status === 'done' || !task.due) return '';
  const today = new Date().toISOString().slice(0, 10);
  const due = String(task.due).slice(0, 10);
  if (due < today) return 'due-overdue';
  if (due === today) return 'due-soon';
  return 'due-later';
}

function taskIcon(task) {
  if (task.status === 'done') return 'mdi:check-circle';
  if (task.priority === 'urgent' || task.priority === 'high') return 'mdi:alert-circle';
  return 'mdi:checkbox-blank-circle-outline';
}

class ClearSpaceCardBase extends HTMLElement {
  constructor(variant) {
    super();
    this._variant = variant;
    this._config = null;
    this._hass = null;
    this._tasks = [];
    this._entityId = 'sensor.clearspace_tasks';
    this._error = null;
    this._lastUpdated = null;
    this._timer = null;
  }

  setConfig(config) {
    this._config = {
      entity: '',
      title: CARD_VARIANTS[this._variant].name,
      refresh_interval_seconds: 60,
      max_items: 50,
      show_completed: true,
      show_add_button: true,
      auto_refresh: true,
      refresh_service: 'refresh',
      ...config,
    };
    if (this._config.entity) this._entityId = this._config.entity;
  }

  connectedCallback() {
    this._ensureTimer();
  }

  disconnectedCallback() {
    if (this._timer) {
      window.clearInterval(this._timer);
      this._timer = null;
    }
  }

  set hass(hass) {
    this._hass = hass;
    this._syncFromHass();
    this.render();
    this._ensureTimer();
  }

  _ensureTimer() {
    if (this._timer || !this._config) return;
    const intervalMs = Math.max(15, Number(this._config.refresh_interval_seconds || 60)) * 1000;
    this._timer = window.setInterval(() => this._refreshAndSync(), intervalMs);
  }

  async _refreshAndSync() {
    if (!this._hass) return;
    if (this._config?.auto_refresh !== false && this._hass.callService) {
      try {
        await this._hass.callService('clearspace', this._config.refresh_service || 'refresh', {});
      } catch (err) {
        // Ignore and fall back to current HA state.
      }
    }
    this._syncFromHass();
    this.render();
  }

  _syncFromHass() {
    const resolved = resolveTasks(this._hass, this._entityId);
    this._entityId = resolved.entityId;
    this._tasks = resolved.tasks;
    this._error = resolved.state ? null : `Entity not found: ${this._entityId}`;
    if (resolved.state) this._lastUpdated = new Date();
  }

  _taskStatusSummary(tasks) {
    const open = tasks.filter((task) => task.status !== 'done').length;
    const overdue = tasks.filter((task) => task.status !== 'done' && task.due && String(task.due).slice(0, 10) < new Date().toISOString().slice(0, 10)).length;
    const today = tasks.filter((task) => task.status !== 'done' && task.due && String(task.due).slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
    const done = tasks.filter((task) => task.status === 'done').length;
    return { open, overdue, today, done };
  }

  _onTaskClick(task) {
    if (!task?.id || !this._hass?.callService) return;
    this._hass.callService('clearspace', 'complete_task', { task_id: task.id }).catch(() => {});
    window.setTimeout(() => this._refreshAndSync(), 800);
  }

  _renderTaskRow(task, compact = false) {
    const isDone = task.status === 'done';
    const meta = [];
    if (task.due) meta.push(`<span class="task-due ${dueClass(task)}">${escapeHtml(formatDate(task.due))}</span>`);
    if (task.priority && task.priority !== 'medium') meta.push(`<span class="task-badge priority-${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span>`);
    if (task.location) meta.push(`<span class="task-badge">${escapeHtml(task.location)}</span>`);

    return `
      <button class="task-row ${compact ? 'task-row-compact' : ''} ${isDone ? 'task-done' : ''}" data-task-id="${escapeHtml(task.id)}" type="button">
        <ha-icon class="task-icon" icon="${taskIcon(task)}"></ha-icon>
        <div class="task-body">
          <div class="task-name">${escapeHtml(task.name)}</div>
          ${meta.length ? `<div class="task-meta">${meta.join('')}</div>` : ''}
        </div>
        <ha-icon class="task-action" icon="mdi:chevron-right"></ha-icon>
      </button>
    `;
  }

  _styleBlock() {
    return `
      <style>
        .clearspace-wrap { padding: 16px; }
        .header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding-bottom:12px; margin-bottom:12px; border-bottom:1px solid var(--divider-color); }
        .titles { display:flex; flex-direction:column; gap:4px; min-width:0; }
        .title { font-size:18px; font-weight:700; color:var(--primary-text-color); line-height:1.2; }
        .subtitle { font-size:12px; color:var(--secondary-text-color); }
        .chips { display:flex; gap:8px; flex-wrap:wrap; }
        .chip { border-radius:999px; padding:4px 10px; font-size:12px; background:var(--secondary-background-color); color:var(--primary-text-color); }
        .chip.warn { color:var(--warning-color); }
        .chip.bad { color:var(--error-color); }
        .chip.good { color:var(--success-color); }
        .section { margin-top:12px; }
        .section-title { font-size:13px; font-weight:700; color:var(--secondary-text-color); margin:0 0 8px; text-transform:uppercase; letter-spacing:.06em; }
        .task-list { display:flex; flex-direction:column; gap:8px; }
        .task-row { width:100%; display:flex; align-items:center; gap:12px; padding:12px; border-radius:14px; border:1px solid var(--divider-color); background:var(--card-background-color); color:inherit; cursor:pointer; text-align:left; }
        .task-row:hover { background:var(--secondary-background-color); }
        .task-row.task-row-compact { padding:10px 12px; }
        .task-icon, .task-action { flex-shrink:0; color:var(--secondary-text-color); }
        .task-done .task-icon { color:var(--success-color); }
        .task-body { min-width:0; flex:1; }
        .task-name { font-size:14px; color:var(--primary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .task-done .task-name { text-decoration:line-through; opacity:.7; }
        .task-meta { display:flex; gap:8px; flex-wrap:wrap; margin-top:3px; }
        .task-due { font-size:12px; color:var(--secondary-text-color); }
        .task-due.due-soon { color:var(--warning-color); }
        .task-due.due-overdue { color:var(--error-color); font-weight:600; }
        .task-due.due-later { color:var(--secondary-text-color); }
        .task-badge { font-size:11px; border-radius:999px; padding:2px 8px; background:rgba(var(--rgb-primary-color), .12); color:var(--primary-text-color); }
        .task-badge.priority-high, .task-badge.priority-urgent { background:rgba(var(--rgb-error-color), .12); color:var(--error-color); }
        .grid { display:grid; gap:10px; }
        .grid-2 { grid-template-columns:repeat(2, minmax(0, 1fr)); }
        .grid-4 { grid-template-columns:repeat(4, minmax(0, 1fr)); }
        .metric { border-radius:16px; padding:14px; background:var(--secondary-background-color); border:1px solid var(--divider-color); }
        .metric-label { font-size:12px; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.06em; }
        .metric-value { font-size:26px; font-weight:800; color:var(--primary-text-color); margin-top:4px; }
        .metric-help { font-size:12px; color:var(--secondary-text-color); margin-top:2px; }
        .board { display:grid; gap:10px; }
        .board-col { border-radius:16px; border:1px solid var(--divider-color); background:var(--secondary-background-color); padding:12px; }
        .board-col-title { margin:0 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--secondary-text-color); display:flex; justify-content:space-between; align-items:center; }
        .board-col-count { font-weight:700; color:var(--primary-text-color); }
        .empty, .error { padding:16px; text-align:center; color:var(--secondary-text-color); }
        .error { color:var(--error-color); }
        .actions { margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; }
        .action-btn { flex:1; min-width:140px; padding:10px 12px; border-radius:12px; border:1px solid rgba(var(--rgb-primary-color), .35); background:transparent; color:var(--primary-color); cursor:pointer; }
        .action-btn:hover { background:rgba(var(--rgb-primary-color), .08); }
        .action-btn.secondary { border-color:var(--divider-color); color:var(--secondary-text-color); }
      </style>
    `;
  }

  _bodyHtml() {
    const tasks = sortTasks(this._tasks);
    const summary = this._taskStatusSummary(tasks);
    const limited = tasks.filter((task) => this._config.show_completed !== false || task.status !== 'done').slice(0, Number(this._config.max_items || 50));
    const groups = groupTasks(limited);

    if (this._variant === 'stats') {
      return `
        <div class="grid grid-2">
          <div class="metric"><div class="metric-label">Open</div><div class="metric-value">${summary.open}</div><div class="metric-help">Active tasks</div></div>
          <div class="metric"><div class="metric-label">Due today</div><div class="metric-value">${summary.today}</div><div class="metric-help">Needs attention</div></div>
          <div class="metric"><div class="metric-label">Overdue</div><div class="metric-value">${summary.overdue}</div><div class="metric-help">Late items</div></div>
          <div class="metric"><div class="metric-label">Done</div><div class="metric-value">${summary.done}</div><div class="metric-help">Completed</div></div>
        </div>
      `;
    }

    if (this._variant === 'compact') {
      const topTasks = limited.slice(0, 3).map((task) => this._renderTaskRow(task, true)).join('');
      return `
        <div class="chips">
          <span class="chip">${summary.open} open</span>
          <span class="chip ${summary.today ? 'warn' : ''}">${summary.today} due today</span>
          <span class="chip ${summary.overdue ? 'bad' : ''}">${summary.overdue} overdue</span>
          <span class="chip ${summary.done ? 'good' : ''}">${summary.done} done</span>
        </div>
        <div class="section">
          <div class="section-title">Top tasks</div>
          <div class="task-list">${topTasks || '<div class="empty">No tasks yet</div>'}</div>
        </div>
      `;
    }

    if (this._variant === 'board') {
      const boardCards = [
        ['Overdue', groups.overdue],
        ['Today', groups.today],
        ['Upcoming', groups.upcoming],
        ['Done', groups.done],
      ].map(([label, list]) => `
        <div class="board-col">
          <div class="board-col-title">${label} <span class="board-col-count">${list.length}</span></div>
          <div class="task-list">${list.slice(0, 8).map((task) => this._renderTaskRow(task, true)).join('') || '<div class="empty">None</div>'}</div>
        </div>
      `).join('');
      return `<div class="board">${boardCards}</div>`;
    }

    const visibleTasks = limited;
    return visibleTasks.length
      ? `<div class="task-list">${visibleTasks.map((task) => this._renderTaskRow(task)).join('')}</div>`
      : '<div class="empty">No tasks found</div>';
  }

  render() {
    if (!this._config) return;
    const summary = this._taskStatusSummary(this._tasks);
    const title = this._config.title || CARD_VARIANTS[this._variant].name;
    const subtitle = `Auto-refresh ${Math.max(15, Number(this._config.refresh_interval_seconds || 60))}s • source: ${this._entityId}${this._lastUpdated ? ` • updated ${this._lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`;

    this.innerHTML = `
      <ha-card>
        ${this._styleBlock()}
        <div class="clearspace-wrap">
          <div class="header">
            <div class="titles">
              <div class="title">${escapeHtml(title)}</div>
              <div class="subtitle">${escapeHtml(subtitle)}</div>
            </div>
            <div class="chips">
              <span class="chip">${summary.open} open</span>
              <span class="chip ${summary.today ? 'warn' : ''}">${summary.today} today</span>
              <span class="chip ${summary.overdue ? 'bad' : ''}">${summary.overdue} overdue</span>
            </div>
          </div>
          ${this._error ? `<div class="error">Could not load tasks: ${escapeHtml(this._error)}</div>` : ''}
          ${this._bodyHtml()}
          <div class="actions">
            ${this._config.show_add_button !== false ? `<button class="action-btn" type="button" data-action="add">Add task</button>` : ''}
            <button class="action-btn secondary" type="button" data-action="refresh">Refresh now</button>
          </div>
        </div>
      </ha-card>
    `;

    this.querySelectorAll('[data-task-id]').forEach((button) => {
      button.addEventListener('click', () => this._onTaskClick({ id: button.getAttribute('data-task-id') }));
    });
    const addBtn = this.querySelector('[data-action="add"]');
    if (addBtn) addBtn.addEventListener('click', () => window.open('https://clearspacetask.com', '_blank', 'noopener,noreferrer'));
    const refreshBtn = this.querySelector('[data-action="refresh"]');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this._refreshAndSync());
  }

  getCardSize() {
    return this._variant === 'board' ? 8 : this._variant === 'stats' ? 3 : 4;
  }

  static getStubConfig() {
    return {
      entity: '',
      title: 'ClearSpace Tasks',
      refresh_interval_seconds: 60,
      max_items: 50,
      show_completed: true,
      show_add_button: true,
      auto_refresh: true,
    };
  }
}

class ClearSpaceCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = null;
    this._hass = null;
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    this._config = {
      entity: '',
      title: 'ClearSpace Tasks',
      refresh_interval_seconds: 60,
      max_items: 50,
      show_completed: true,
      show_add_button: true,
      auto_refresh: true,
      refresh_service: 'refresh',
      ...config,
    };
    this._render();
  }

  connectedCallback() {
    this._render();
  }

  _emitConfig(changes) {
    this._config = { ...this._config, ...changes };
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    }));
  }

  _availableTaskEntities() {
    const states = this._hass?.states || {};
    return Object.entries(states)
      .filter(([entityId, state]) => {
        if (!entityId.startsWith('sensor.')) return false;
        if (!entityId.endsWith('_tasks')) return false;
        return Boolean(state?.attributes?.tasks) || entityId.includes('clearspace');
      })
      .map(([entityId, state]) => ({
        entityId,
        label: state?.attributes?.friendly_name ? `${state.attributes.friendly_name} (${entityId})` : entityId,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  _selectedEntityOption(options) {
    const current = String(this._config?.entity || '').trim();
    return options.find((option) => option.entityId === current) || null;
  }

  _renderEntityField() {
    const options = this._availableTaskEntities();
    const selected = this._selectedEntityOption(options);
    const currentValue = escapeHtml(this._config.entity || '');
    if (options.length) {
      const current = String(this._config?.entity || '').trim();
      const optionList = [...options];
      if (current && !optionList.some((option) => option.entityId === current)) {
        optionList.unshift({ entityId: current, label: `${current} (manual)` });
      }
      const optionHtml = [
        `<option value="">Auto-detect best ClearSpace account</option>`,
        ...optionList.map((option) => `<option value="${escapeHtml(option.entityId)}" ${selected?.entityId === option.entityId ? 'selected' : ''}>${escapeHtml(option.label)}</option>`),
      ].join('');
      return `
        <select data-field="entity">
          ${optionHtml}
        </select>
      `;
    }
    return `<input data-field="entity" type="text" value="${currentValue}" placeholder="sensor.clearspace_tasks" />`;
  }

  _render() {
    if (!this._config) return;
    this.innerHTML = `
      <style>
        .editor {
          display: grid;
          gap: 16px;
          padding: 16px 0 4px;
        }
        .row {
          display: grid;
          gap: 6px;
        }
        .label {
          font-weight: 600;
        }
        .hint {
          color: var(--secondary-text-color);
          font-size: 12px;
        }
        input[type="text"], input[type="number"], select {
          width: 100%;
          box-sizing: border-box;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--divider-color);
          background: var(--card-background-color);
          color: var(--primary-text-color);
        }
        .toggles {
          display: grid;
          gap: 10px;
        }
        label.toggle {
          display: flex;
          gap: 10px;
          align-items: center;
        }
      </style>
      <div class="editor">
        <div class="row">
          <div class="label">ClearSpace API / account</div>
          ${this._renderEntityField()}
          <div class="hint">Choose which connected ClearSpace account this card should display. If no sensors are discovered yet, you can type one manually.</div>
        </div>
        <div class="row">
          <div class="label">Title</div>
          <input data-field="title" type="text" value="${escapeHtml(this._config.title || '')}" placeholder="ClearSpace Tasks" />
        </div>
        <div class="row">
          <div class="label">Refresh interval (seconds)</div>
          <input data-field="refresh_interval_seconds" type="number" min="15" max="3600" value="${Number(this._config.refresh_interval_seconds || 60)}" />
        </div>
        <div class="row">
          <div class="label">Maximum items</div>
          <input data-field="max_items" type="number" min="1" max="200" value="${Number(this._config.max_items || 50)}" />
        </div>
        <div class="row">
          <div class="label">Refresh service</div>
          <input data-field="refresh_service" type="text" value="${escapeHtml(this._config.refresh_service || 'refresh')}" placeholder="refresh" />
          <div class="hint">Usually leave this as <code>refresh</code>.</div>
        </div>
        <div class="toggles">
          <label class="toggle"><input data-field="show_completed" type="checkbox" ${this._config.show_completed ? 'checked' : ''} /> Show completed tasks</label>
          <label class="toggle"><input data-field="show_add_button" type="checkbox" ${this._config.show_add_button !== false ? 'checked' : ''} /> Show add task button</label>
          <label class="toggle"><input data-field="auto_refresh" type="checkbox" ${this._config.auto_refresh !== false ? 'checked' : ''} /> Auto-refresh from Home Assistant</label>
        </div>
      </div>
    `;

    this.querySelectorAll('[data-field]').forEach((input) => {
      const field = input.getAttribute('data-field');
      const eventName = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(eventName, () => {
        const value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
        this._emitConfig({ [field]: value });
      });
    });
  }
}

if (!customElements.get('clearspace-card-editor')) {
  customElements.define('clearspace-card-editor', ClearSpaceCardEditor);
}

function registerCard(variant) {
  const { tag, name, description, aliases = [] } = CARD_VARIANTS[variant];
  const klass = class extends ClearSpaceCardBase {
    constructor() {
      super(variant);
    }
    static getConfigElement() {
      return document.createElement('clearspace-card-editor');
    }
    static getStubConfig() {
      return {
        entity: '',
        title: name,
        refresh_interval_seconds: 60,
        max_items: variant === 'compact' ? 3 : 50,
        show_completed: true,
        show_add_button: true,
        auto_refresh: true,
      };
    }
  };

  const tags = [tag, ...aliases];
  for (const currentTag of tags) {
    if (!customElements.get(currentTag)) {
      customElements.define(currentTag, klass);
    }
    window.customCards = window.customCards || [];
    if (!window.customCards.some((card) => card.type === currentTag)) {
      window.customCards.push({
        type: currentTag,
        name,
        description,
        preview: true,
        documentationURL: CLEARSPACE_DOCS_URL,
      });
    }
  }
}

Object.keys(CARD_VARIANTS).forEach(registerCard);
console.info(`%c CLEARSPACE CARDS %c v${CLEARSPACE_VERSION} `, 'background:#667eea;color:white;font-weight:700;', 'background:#764ba2;color:white;font-weight:700;');
