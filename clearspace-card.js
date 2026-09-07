class ClearSpaceCard extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('You need to define an entity');
    }
    this._config = config;
  }

  set hass(hass) {
    if (!hass) return;
    this._hass = hass;
    this.render();
  }

  render() {
    if (!this._hass || !this._config) return;

    const entityId = this._config.entity;
    const state = this._hass.states[entityId];
    
    if (!state) {
      this.innerHTML = `
        <ha-card>
          <div class="card-content">
            <div style="padding: 16px; color: var(--error-color);">
              Entity not found: ${entityId}
            </div>
          </div>
        </ha-card>
      `;
      return;
    }

    const tasks = state.attributes.tasks || [];
    const title = this._config.title || 'ClearSpace Tasks';
    const showCompleted = this._config.show_completed !== false;
    const maxItems = this._config.max_items || 10;

    let displayTasks = tasks;
    if (!showCompleted) {
      displayTasks = tasks.filter(t => t.status !== 'done');
    }
    displayTasks = displayTasks.slice(0, maxItems);

    const taskItems = displayTasks.map(task => {
      const isDone = task.status === 'done';
      const dueClass = this._getDueClass(task);
      const checkbox = isDone 
        ? `<ha-icon icon="mdi:check-circle" style="color: var(--success-color);"></ha-icon>`
        : `<ha-icon icon="mdi:checkbox-blank-circle-outline" style="color: var(--primary-color);"></ha-icon>`;
      
      return `
        <div class="task-item ${isDone ? 'task-done' : ''}" data-task-id="${task.id}">
          <div class="task-checkbox">${checkbox}</div>
          <div class="task-content">
            <div class="task-name">${this._escapeHtml(task.name)}</div>
            ${task.due ? `<div class="task-due ${dueClass}">${this._formatDate(task.due)}</div>` : ''}
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
            padding-bottom: 12px;
            border-bottom: 1px solid var(--divider-color);
            margin-bottom: 12px;
          }
          .card-title {
            font-size: 18px;
            font-weight: 500;
            color: var(--primary-text-color);
          }
          .task-count {
            font-size: 14px;
            color: var(--secondary-text-color);
            background: var(--secondary-background-color);
            padding: 2px 8px;
            border-radius: 12px;
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
            border-radius: 8px;
            background: var(--card-background-color);
            border: 1px solid var(--divider-color);
            cursor: pointer;
            transition: background 0.2s;
          }
          .task-item:hover {
            background: var(--secondary-background-color);
          }
          .task-done {
            opacity: 0.6;
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
          }
          .empty-state {
            text-align: center;
            padding: 24px;
            color: var(--secondary-text-color);
          }
          .add-task-btn {
            margin-top: 12px;
            width: 100%;
            padding: 10px;
            border: 1px dashed var(--primary-color);
            border-radius: 8px;
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
            <div class="card-title">${title}</div>
            <div class="task-count">${tasks.filter(t => t.status !== 'done').length} open</div>
          </div>
          ${displayTasks.length > 0 
            ? `<div class="task-list">${taskItems}</div>`
            : `<div class="empty-state">No tasks found</div>`
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

    // Add click handlers for tasks
    this.querySelectorAll('.task-item').forEach(item => {
      item.addEventListener('click', () => {
        const taskId = item.getAttribute('data-task-id');
        this._hass.callService('clearspace', 'complete_task', { task_id: taskId });
      });
    });
  }

  _getDueClass(task) {
    if (task.status === 'done') return '';
    if (!task.due) return '';
    const today = new Date().toISOString().split('T')[0];
    if (task.due < today) return 'due-overdue';
    if (task.due === today) return 'due-soon';
    return 'due-later';
  }

  _formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0,0,0,0);
    const diff = Math.floor((date - today) / (1000 * 60 * 60 * 24));
    
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff < -1) return `${Math.abs(diff)} days overdue`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getCardSize() {
    return 3;
  }

  static getConfigElement() {
    return document.createElement('clearspace-card-editor');
  }

  static getStubConfig() {
    return {
      entity: 'sensor.clearspace_open',
      title: 'ClearSpace Tasks',
      show_completed: false,
      max_items: 10,
      show_add_button: true
    };
  }
}

customElements.define('clearspace-card', ClearSpaceCard);

// Add to card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'clearspace-card',
  name: 'ClearSpace Tasks',
  description: 'A card to display and manage ClearSpace tasks',
  preview: true,
  documentationURL: 'https://github.com/yusufyusufyusufyusuf/clearspace-card'
});

console.info('%c CLEARSPACE CARD %c v1.0.0 ', 'background: #667eea; color: white; font-weight: 700;', 'background: #764ba2; color: white; font-weight: 700;');
