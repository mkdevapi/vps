// VPS Pro - Frontend Application

class VPSProApp {
  constructor() {
    this.socket = null;
    this.terminal = null;
    this.fitAddon = null;
    this.currentSession = null;
    this.currentPath = '/root';
    this.sessions = [];
    this.cronJobs = [];
    this.selectedFile = null;
    this.statsInterval = null;

    this.init();
  }

  async init() {
    this.initSocket();
    this.initTerminal();
    this.initEventListeners();
    this.initModals();
    this.loadDashboard();
    this.startStatsPolling();
  }

  // ==================== SOCKET CONNECTION ====================

  initSocket() {
    this.socket = io();

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.showToast('Connected to server', 'success');
      this.loadSessions();
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.showToast('Disconnected from server', 'error');
      this.updateTerminalStatus('Disconnected');
    });

    this.socket.on('output', (data) => {
      if (this.terminal) {
        this.terminal.write(data);
      }
    });

    this.socket.on('session-attached', (data) => {
      console.log('Session attached:', data);
      this.updateTerminalStatus('Connected', data.sessionId);
      this.loadSessions();
    });

    this.socket.on('session-created', (data) => {
      console.log('Session created:', data);
      this.currentSession = data.session.id;
      this.loadSessions();
    });

    this.socket.on('session-closed', (data) => {
      console.log('Session closed:', data);
      this.updateTerminalStatus('Session Closed');
      this.loadSessions();
    });

    this.socket.on('error', (data) => {
      console.error('Socket error:', data);
      this.showToast(data.message || 'An error occurred', 'error');
    });
  }

  // ==================== TERMINAL ====================

  initTerminal() {
    this.terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Fira Code", "Cascadia Code", Menlo, monospace',
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selection: 'rgba(88, 166, 255, 0.3)',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4'
      },
      allowProposedApi: true
    });

    this.fitAddon = new FitAddon.FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    const webLinksAddon = new WebLinksAddon.WebLinksAddon();
    this.terminal.loadAddon(webLinksAddon);

    this.terminal.open(document.getElementById('terminal'));
    this.fitAddon.fit();

    // Terminal input handling
    this.terminal.onData((data) => {
      if (this.socket && this.currentSession) {
        this.socket.emit('input', data);
      }
    });

    // Handle resize
    this.terminal.onResize(({ cols, rows }) => {
      if (this.socket && this.currentSession) {
        this.socket.emit('resize', { cols, rows });
      }
    });

    // Initial fit
    window.addEventListener('resize', () => {
      if (this.fitAddon) {
        this.fitAddon.fit();
      }
    });
  }

  resizeTerminal() {
    if (this.fitAddon) {
      this.fitAddon.fit();
      if (this.socket && this.currentSession) {
        this.socket.emit('resize', {
          cols: this.terminal.cols,
          rows: this.terminal.rows
        });
      }
    }
  }

  updateTerminalStatus(status, sessionId = null) {
    const statusEl = document.getElementById('terminalStatus');
    const statusDot = statusEl.querySelector('.status-dot');
    const statusText = statusEl.querySelector('.status-text');
    const sessionInfo = document.getElementById('sessionInfo');

    statusText.textContent = status;

    if (status === 'Connected') {
      statusDot.classList.add('connected');
      const session = this.sessions.find(s => s.id === sessionId);
      sessionInfo.textContent = `Session: ${session ? session.name : sessionId}`;
    } else {
      statusDot.classList.remove('connected');
      if (status === 'Disconnected') {
        sessionInfo.textContent = 'No session connected';
      }
    }
  }

  // ==================== NAVIGATION ====================

  initEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        this.showView(view);
      });
    });

    // Mobile menu
    document.getElementById('mobileMenuBtn').addEventListener('click', () => {
      document.querySelector('.sidebar').classList.toggle('open');
    });

    // Quick actions
    document.getElementById('quickNewSession').addEventListener('click', () => this.showNewSessionModal());
    document.getElementById('quickOpenTerminal').addEventListener('click', () => this.showView('terminal'));
    document.getElementById('quickFileManager').addEventListener('click', () => this.showView('files'));
    document.getElementById('quickCronJobs').addEventListener('click', () => this.showView('cron'));

    // Terminal controls
    document.getElementById('newSessionBtn').addEventListener('click', () => this.showNewSessionModal());
    document.getElementById('deleteSessionBtn').addEventListener('click', () => this.deleteCurrentSession());
    document.getElementById('fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());
    document.getElementById('clearTerminalBtn').addEventListener('click', () => this.terminal.clear());
    document.getElementById('toggleTerminal').addEventListener('click', () => this.resizeTerminal());

    // Session select
    document.getElementById('sessionSelect').addEventListener('change', (e) => {
      if (e.target.value) {
        this.connectToSession(e.target.value);
      }
    });

    // Session buttons
    document.getElementById('createSessionBtn').addEventListener('click', () => this.showNewSessionModal());

    // File manager
    document.getElementById('newFolderBtn').addEventListener('click', () => this.showNewFolderModal());
    document.getElementById('uploadFileBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('refreshFilesBtn').addEventListener('click', () => this.loadFiles(this.currentPath));
    document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileUpload(e));
    document.getElementById('closePreview').addEventListener('click', () => this.closeFilePreview());
    document.getElementById('editFileBtn').addEventListener('click', () => this.editFile());
    document.getElementById('deleteFileBtn').addEventListener('click', () => this.deleteFile());
    document.getElementById('downloadFileBtn').addEventListener('click', () => this.downloadFile());

    // Cron
    document.getElementById('addCronBtn').addEventListener('click', () => this.showCronModal());
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('cronSchedule').value = btn.dataset.preset;
      });
    });

    // VNC
    document.getElementById('startVncBtn').addEventListener('click', () => this.startVNC());
    document.getElementById('refreshVncBtn').addEventListener('click', () => this.refreshVNC());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'c' && document.activeElement === this.terminal.element) {
        // Allow Ctrl+C in terminal
      }
      if (e.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen();
      }
    });

    // Fullscreen change
    document.addEventListener('fullscreenchange', () => {
      setTimeout(() => this.resizeTerminal(), 100);
    });
  }

  showView(viewName) {
    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    // Update views
    document.querySelectorAll('.view').forEach(view => {
      view.classList.toggle('active', view.id === `${viewName}-view`);
    });

    // Load view data
    switch (viewName) {
      case 'dashboard':
        this.loadDashboard();
        break;
      case 'terminal':
        this.resizeTerminal();
        break;
      case 'sessions':
        this.loadSessions();
        break;
      case 'files':
        this.loadFiles(this.currentPath);
        break;
      case 'cron':
        this.loadCronJobs();
        break;
      case 'vnc':
        this.loadVNC();
        break;
    }

    // Close mobile menu
    document.querySelector('.sidebar').classList.remove('open');
  }

  // ==================== SESSIONS ====================

  async loadSessions() {
    try {
      const response = await fetch('/api/sessions');
      const sessions = await response.json();
      this.sessions = sessions;
      this.renderSessions();
      this.updateSessionSelect();
      this.updateSessionStats();
    } catch (err) {
      console.error('Error loading sessions:', err);
      this.showToast('Error loading sessions', 'error');
    }
  }

  renderSessions() {
    const listEl = document.getElementById('sessionsList');

    if (this.sessions.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📁</span>
          <p>No sessions yet. Create your first session!</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = this.sessions.map(session => `
      <div class="session-card ${session.isActive ? 'active' : 'inactive'}">
        <div class="session-icon">
          <span>${session.isActive ? '💻' : '💤'}</span>
        </div>
        <div class="session-info">
          <h3>${session.name}</h3>
          <p class="session-path">${session.workingDir}</p>
          <p class="session-meta">
            Created: ${new Date(session.createdAt).toLocaleString()} |
            PID: ${session.pid || 'N/A'}
          </p>
        </div>
        <div class="session-actions">
          <button class="btn small ${session.isActive ? 'primary' : ''}" onclick="app.connectToSession('${session.id}')">
            ${session.isActive ? 'Reconnect' : 'Connect'}
          </button>
          <button class="btn small danger" onclick="app.deleteSession('${session.id}')">
            Delete
          </button>
        </div>
      </div>
    `).join('');
  }

  updateSessionSelect() {
    const select = document.getElementById('sessionSelect');
    const currentValue = select.value;

    select.innerHTML = '<option value="">-- Select Session --</option>' +
      this.sessions.map(session => `
        <option value="${session.id}" ${session.id === currentValue ? 'selected' : ''}>
          ${session.name} ${session.isActive ? '(Active)' : ''}
        </option>
      `).join('');
  }

  updateSessionStats() {
    const activeCount = this.sessions.filter(s => s.isActive).length;
    document.getElementById('activeSessions').textContent = activeCount;
    document.getElementById('statSessions').textContent = activeCount;
  }

  connectToSession(sessionId) {
    if (!sessionId) return;

    this.currentSession = sessionId;
    this.terminal.clear();

    // Fit terminal before connecting
    setTimeout(() => {
      this.resizeTerminal();
      this.socket.emit('attach-session', sessionId);
      this.updateTerminalStatus('Connecting...', sessionId);
    }, 100);

    // Switch to terminal view
    this.showView('terminal');
  }

  deleteSession(sessionId) {
    if (!confirm('Are you sure you want to delete this session?')) return;

    fetch(`/api/session/${sessionId}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          this.showToast('Session deleted', 'success');
          if (this.currentSession === sessionId) {
            this.currentSession = null;
            this.updateTerminalStatus('Disconnected');
          }
          this.loadSessions();
        }
      })
      .catch(err => {
        console.error('Error deleting session:', err);
        this.showToast('Error deleting session', 'error');
      });
  }

  deleteCurrentSession() {
    if (this.currentSession) {
      this.deleteSession(this.currentSession);
    } else {
      this.showToast('No session selected', 'error');
    }
  }

  // ==================== DASHBOARD ====================

  async loadDashboard() {
    await this.loadStats();
  }

  async loadStats() {
    try {
      const response = await fetch('/api/stats');
      const stats = await response.json();

      // Update dashboard
      document.getElementById('cpuUsage').textContent = stats.cpuUsage + '%';
      document.getElementById('memUsage').textContent = stats.memUsage + '%';
      document.getElementById('uptime').textContent = stats.uptime;

      document.getElementById('cpuBar').style.width = stats.cpuUsage + '%';
      document.getElementById('memBar').style.width = stats.memUsage + '%';

      document.getElementById('hostname').textContent = stats.hostname;
      document.getElementById('platform').textContent = stats.platform;
      document.getElementById('arch').textContent = stats.arch;
      document.getElementById('totalMem').textContent = stats.totalMem;
      document.getElementById('usedMem').textContent = stats.usedMem;
      document.getElementById('freeMem').textContent = stats.freeMem;

      // Update sidebar stats
      document.getElementById('statCPU').textContent = stats.cpuUsage + '%';
      document.getElementById('statRAM').textContent = stats.memUsage + '%';
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  }

  startStatsPolling() {
    this.statsInterval = setInterval(() => {
      this.loadStats();
    }, 5000);
  }

  // ==================== FILE MANAGER ====================

  async loadFiles(path) {
    try {
      const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      const data = await response.json();

      this.currentPath = data.path;
      this.renderFiles(data.items);
      this.renderBreadcrumb(data.path);
    } catch (err) {
      console.error('Error loading files:', err);
      this.showToast('Error loading files', 'error');
    }
  }

  renderFiles(items) {
    const listEl = document.getElementById('fileList');

    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📂</span>
          <p>This folder is empty</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = items.map(item => `
      <div class="file-item ${item.isDirectory ? 'directory' : 'file'}"
           data-path="${item.path}"
           data-is-dir="${item.isDirectory}"
           onclick="app.handleFileClick('${item.path}', ${item.isDirectory})">
        <span class="file-icon">${item.isDirectory ? '📁' : this.getFileIcon(item.name)}</span>
        <span class="file-name">${item.name}</span>
        <span class="file-size">${item.isDirectory ? '-' : this.formatSize(item.size)}</span>
        <span class="file-date">${item.modified ? new Date(item.modified).toLocaleDateString() : '-'}</span>
        <span class="file-perms">${item.permissions}</span>
      </div>
    `).join('');
  }

  renderBreadcrumb(path) {
    const breadcrumb = document.getElementById('fileBreadcrumb');
    const parts = path.split('/').filter(p => p);

    let html = `<button class="breadcrumb-item" data-path="/">/</button>`;
    let currentPath = '';

    parts.forEach(part => {
      currentPath += '/' + part;
      html += `<span class="breadcrumb-sep">/</span><button class="breadcrumb-item" data-path="${currentPath}">${part}</button>`;
    });

    breadcrumb.innerHTML = html;

    // Add click handlers
    breadcrumb.querySelectorAll('.breadcrumb-item').forEach(btn => {
      btn.addEventListener('click', () => this.loadFiles(btn.dataset.path));
    });
  }

  handleFileClick(path, isDir) {
    if (isDir) {
      this.loadFiles(path);
    } else {
      this.selectFile(path);
    }
  }

  selectFile(path) {
    this.selectedFile = path;
    document.getElementById('previewActions').style.display = 'flex';
    document.getElementById('editFilePath').value = path;

    // Preview file content
    this.previewFile(path);
  }

  async previewFile(path) {
    const previewContent = document.getElementById('previewContent');
    previewContent.innerHTML = '<p>Loading...</p>';

    try {
      const response = await fetch(`/api/files/read?path=${encodeURIComponent(path)}`);
      const data = await response.json();

      const extension = path.split('.').pop().toLowerCase();
      const textExtensions = ['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'yaml', 'yml', 'sh', 'py', 'txt', 'log'];

      if (textExtensions.includes(extension)) {
        previewContent.innerHTML = `<pre class="code-preview">${this.escapeHtml(data.content)}</pre>`;
      } else {
        previewContent.innerHTML = `<div class="binary-preview">
          <p>Binary file: ${data.path}</p>
          <p>Size: ${this.formatSize(data.size)}</p>
          <p>Modified: ${new Date(data.modified).toLocaleString()}</p>
        </div>`;
      }
    } catch (err) {
      previewContent.innerHTML = `<p class="error">Error reading file: ${err.message}</p>`;
    }
  }

  async editFile() {
    if (!this.selectedFile) return;

    try {
      const response = await fetch(`/api/files/read?path=${encodeURIComponent(this.selectedFile)}`);
      const data = await response.json();

      document.getElementById('editFilePath').value = data.path;
      document.getElementById('fileContent').value = data.content;

      this.showModal('editFileModal');
    } catch (err) {
      this.showToast('Error reading file', 'error');
    }
  }

  async saveFile() {
    const path = document.getElementById('editFilePath').value;
    const content = document.getElementById('fileContent').value;

    try {
      const response = await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content })
      });

      if (response.ok) {
        this.showToast('File saved successfully', 'success');
        this.closeModal('editFileModal');
        this.previewFile(path);
      }
    } catch (err) {
      this.showToast('Error saving file', 'error');
    }
  }

  async deleteFile() {
    if (!this.selectedFile) return;
    if (!confirm(`Are you sure you want to delete "${this.selectedFile}"?`)) return;

    try {
      const response = await fetch(`/api/files?path=${encodeURIComponent(this.selectedFile)}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        this.showToast('File deleted', 'success');
        this.closeFilePreview();
        this.loadFiles(this.currentPath);
      }
    } catch (err) {
      this.showToast('Error deleting file', 'error');
    }
  }

  downloadFile() {
    if (!this.selectedFile) return;

    window.open(`/api/files/read?path=${encodeURIComponent(this.selectedFile)}`, '_blank');
  }

  closeFilePreview() {
    this.selectedFile = null;
    document.getElementById('previewContent').innerHTML = '<p class="placeholder">Select a file to preview</p>';
    document.getElementById('previewActions').style.display = 'none';
  }

  async handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];

      try {
        const response = await fetch('/api/files/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: this.currentPath,
            filename: file.name,
            file: base64
          })
        });

        if (response.ok) {
          this.showToast('File uploaded successfully', 'success');
          this.loadFiles(this.currentPath);
        }
      } catch (err) {
        this.showToast('Error uploading file', 'error');
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
      js: '📜', ts: '📜', jsx: '⚛️', tsx: '⚛️',
      html: '🌐', css: '🎨', scss: '🎨',
      json: '📋', xml: '📋',
      md: '📝', txt: '📝', doc: '📝',
      png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️',
      mp4: '🎬', mp3: '🎵', wav: '🎵',
      zip: '📦', tar: '📦', gz: '📦', rar: '📦',
      pdf: '📕', docx: '📘', xlsx: '📗',
      sh: '⚡', py: '🐍', rb: '💎', go: '🐹', rs: '🦀',
      default: '📄'
    };
    return icons[ext] || icons.default;
  }

  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==================== CRON JOBS ====================

  async loadCronJobs() {
    try {
      const response = await fetch('/api/cron');
      this.cronJobs = await response.json();
      this.renderCronJobs();
    } catch (err) {
      console.error('Error loading cron jobs:', err);
      this.showToast('Error loading cron jobs', 'error');
    }
  }

  renderCronJobs() {
    const listEl = document.getElementById('cronList');

    if (this.cronJobs.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">⏰</span>
          <p>No cron jobs scheduled. Add one to get started!</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = this.cronJobs.map(job => `
      <div class="cron-card">
        <div class="cron-info">
          <h3>${job.name}</h3>
          <p class="cron-schedule">${job.schedule}</p>
          <p class="cron-command">${job.command}</p>
        </div>
        <div class="cron-actions">
          <button class="btn small ${job.status === 'scheduled' ? 'primary' : ''}" onclick="app.toggleCron('${job.id}')">
            ${job.status === 'scheduled' ? 'Pause' : 'Resume'}
          </button>
          <button class="btn small danger" onclick="app.deleteCron('${job.id}')">
            Delete
          </button>
        </div>
      </div>
    `).join('');
  }

  async addCronJob(name, schedule, command) {
    try {
      const response = await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, schedule, command })
      });

      if (response.ok) {
        this.showToast('Cron job added', 'success');
        this.loadCronJobs();
      }
    } catch (err) {
      this.showToast('Error adding cron job', 'error');
    }
  }

  async toggleCron(id) {
    try {
      const response = await fetch(`/api/cron/${id}/toggle`, { method: 'POST' });
      if (response.ok) {
        this.loadCronJobs();
      }
    } catch (err) {
      this.showToast('Error toggling cron job', 'error');
    }
  }

  async deleteCron(id) {
    if (!confirm('Are you sure you want to delete this cron job?')) return;

    try {
      const response = await fetch(`/api/cron/${id}`, { method: 'DELETE' });
      if (response.ok) {
        this.showToast('Cron job deleted', 'success');
        this.loadCronJobs();
      }
    } catch (err) {
      this.showToast('Error deleting cron job', 'error');
    }
  }

  // ==================== VNC ====================

  async startVNC() {
    const container = document.getElementById('vncContainer');
    container.innerHTML = `
      <div class="vnc-loading">
        <div class="spinner"></div>
        <p>Starting VNC server...</p>
      </div>
    `;

    // For now, show a placeholder message
    // In a real implementation, this would start a VNC server and connect to it
    setTimeout(() => {
      container.innerHTML = `
        <div class="vnc-placeholder">
          <div class="vnc-icon">🖥️</div>
          <h3>VNC Configuration Required</h3>
          <p>VNC requires additional server-side setup.</p>
          <p>To enable VNC:</p>
          <ol>
            <li>Install x11vnc or tigervnc on the server</li>
            <li>Configure VNC server to run on a specific port</li>
            <li>Update the application to connect to the VNC server</li>
          </ol>
          <button class="btn" onclick="app.loadVNC()">Go Back</button>
        </div>
      `;
    }, 2000);
  }

  refreshVNC() {
    this.loadVNC();
  }

  loadVNC() {
    const container = document.getElementById('vncContainer');
    container.innerHTML = `
      <div class="vnc-placeholder">
        <div class="vnc-icon">🖥️</div>
        <h3>VNC Desktop Access</h3>
        <p>Click "Start VNC" to launch a remote desktop session</p>
        <p class="note">Note: VNC requires additional configuration on the server</p>
        <button class="btn primary" onclick="app.startVNC()">
          <span>▶️</span> Start VNC
        </button>
      </div>
    `;
  }

  // ==================== MODALS ====================

  initModals() {
    const overlay = document.getElementById('modalOverlay');

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeAllModals();
      }
    });

    // Close on X button
    document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.modal;
        if (modalId) {
          this.closeModal(modalId);
        }
      });
    });

    // Modal confirm buttons
    document.getElementById('confirmNewSession').addEventListener('click', () => this.createNewSession());
    document.getElementById('confirmNewFolder').addEventListener('click', () => this.createNewFolder());
    document.getElementById('confirmCron').addEventListener('click', () => this.submitCronJob());
    document.getElementById('saveFileBtn').addEventListener('click', () => this.saveFile());
    document.getElementById('confirmUpload').addEventListener('click', () => this.uploadFromModal());
  }

  showModal(modalId) {
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById(modalId).classList.add('active');
  }

  closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    document.getElementById('modalOverlay').classList.remove('active');
  }

  closeAllModals() {
    document.querySelectorAll('.modal.active').forEach(modal => {
      modal.classList.remove('active');
    });
    document.getElementById('modalOverlay').classList.remove('active');
  }

  showNewSessionModal() {
    document.getElementById('sessionName').value = '';
    document.getElementById('sessionDir').value = '/root';
    this.showModal('newSessionModal');
  }

  showNewFolderModal() {
    document.getElementById('folderName').value = '';
    this.showModal('newFolderModal');
  }

  showCronModal() {
    document.getElementById('cronName').value = '';
    document.getElementById('cronSchedule').value = '* * * * *';
    document.getElementById('cronCommand').value = '';
    this.showModal('cronModal');
  }

  async createNewSession() {
    const name = document.getElementById('sessionName').value || `Terminal ${Date.now()}`;
    const workingDir = document.getElementById('sessionDir').value || '/root';

    try {
      const response = await fetch('/api/new-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, workingDir })
      });

      const data = await response.json();

      if (data.success) {
        this.showToast('Session created', 'success');
        this.closeModal('newSessionModal');
        this.connectToSession(data.session.id);
      }
    } catch (err) {
      console.error('Error creating session:', err);
      this.showToast('Error creating session', 'error');
    }
  }

  async createNewFolder() {
    const name = document.getElementById('folderName').value;
    if (!name) {
      this.showToast('Please enter a folder name', 'error');
      return;
    }

    const folderPath = this.currentPath === '/' ? '/' + name : this.currentPath + '/' + name;

    try {
      const response = await fetch('/api/files/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath })
      });

      if (response.ok) {
        this.showToast('Folder created', 'success');
        this.closeModal('newFolderModal');
        this.loadFiles(this.currentPath);
      }
    } catch (err) {
      this.showToast('Error creating folder', 'error');
    }
  }

  submitCronJob() {
    const name = document.getElementById('cronName').value;
    const schedule = document.getElementById('cronSchedule').value;
    const command = document.getElementById('cronCommand').value;

    if (!name || !schedule || !command) {
      this.showToast('Please fill in all fields', 'error');
      return;
    }

    this.addCronJob(name, schedule, command);
    this.closeModal('cronModal');
  }

  uploadFromModal() {
    const input = document.getElementById('fileInput');
    if (input.files.length === 0) {
      this.showToast('Please select a file', 'error');
      return;
    }

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];

      try {
        const response = await fetch('/api/files/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: this.currentPath,
            filename: file.name,
            file: base64
          })
        });

        if (response.ok) {
          this.showToast('File uploaded successfully', 'success');
          this.closeModal('uploadModal');
          this.loadFiles(this.currentPath);
        }
      } catch (err) {
        this.showToast('Error uploading file', 'error');
      }
    };
    reader.readAsDataURL(file);
  }

  // ==================== UI HELPERS ====================

  toggleFullscreen() {
    const wrapper = document.getElementById('terminalWrapper');

    if (!document.fullscreenElement) {
      wrapper.requestFullscreen().then(() => {
        setTimeout(() => this.resizeTerminal(), 100);
      });
    } else {
      document.exitFullscreen();
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
      <span class="toast-message">${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

// Initialize app
const app = new VPSProApp();
