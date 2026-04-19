const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const pty = require('node-pty');
const cron = require('node-cron');
const os = require('os');

// Initialize Express
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'DELETE']
  }
});

// Configuration
const PORT = process.env.PORT || 3000;
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
const SHELL = process.platform === 'win32' ? 'powershell.exe' : 'bash';
const HOME_DIR = process.env.HOME || '/root';
const ROOT_DIR = '/';

// Store active PTY processes and sessions
const activeProcesses = new Map();
const cronJobs = new Map();

// Initialize sessions file
async function initSessionsFile() {
  try {
    const exists = await fs.pathExists(SESSIONS_FILE);
    if (!exists) {
      await fs.writeJson(SESSIONS_FILE, { sessions: [] });
    }
  } catch (err) {
    console.error('Error initializing sessions file:', err);
  }
}

// Load sessions from file
async function loadSessions() {
  try {
    const data = await fs.readJson(SESSIONS_FILE);
    return data.sessions || [];
  } catch (err) {
    console.error('Error loading sessions:', err);
    return [];
  }
}

// Save sessions to file
async function saveSessions(sessions) {
  try {
    await fs.writeJson(SESSIONS_FILE, { sessions });
  } catch (err) {
    console.error('Error saving sessions:', err);
  }
}

// Generate unique session ID
function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// System stats
function getSystemStats() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePercent = ((usedMem / totalMem) * 100).toFixed(1);

  // Calculate CPU usage
  let cpuUsage = 0;
  cpus.forEach((cpu, index) => {
    const total = Object.values(cpu.times).reduce((acc, val) => acc + val, 0);
    const idle = cpu.times.idle;
    if (index === 0) {
      cpuUsage = ((1 - idle / total) * 100).toFixed(1);
    }
  });

  return {
    cpuUsage: cpuUsage || 0,
    memUsage: memUsagePercent,
    totalMem: formatBytes(totalMem),
    usedMem: formatBytes(usedMem),
    freeMem: formatBytes(freeMem),
    uptime: formatUptime(os.uptime()),
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch()
  };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

// ==================== API ENDPOINTS ====================

// Get system stats
app.get('/api/stats', (req, res) => {
  res.json(getSystemStats());
});

// Create new session
app.post('/api/new-session', async (req, res) => {
  try {
    const sessionId = generateSessionId();
    const sessionName = req.body.name || `Terminal ${sessionId.split('_')[1]}`;
    const workingDir = req.body.workingDir || HOME_DIR;

    // Create PTY process
    const ptyProcess = pty.spawn(SHELL, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: workingDir,
      env: process.env
    });

    // Store process
    activeProcesses.set(sessionId, ptyProcess);

    // Create session object
    const session = {
      id: sessionId,
      name: sessionName,
      workingDir: workingDir,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      pid: ptyProcess.pid,
      status: 'active'
    };

    // Save to file
    const sessions = await loadSessions();
    sessions.push(session);
    await saveSessions(sessions);

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`Session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
      activeProcesses.delete(sessionId);
      updateSessionStatus(sessionId, 'disconnected');
    });

    res.json({ success: true, session });
  } catch (err) {
    console.error('Error creating session:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await loadSessions();
    const sessionsWithStatus = sessions.map(session => ({
      ...session,
      isActive: activeProcesses.has(session.id),
      status: activeProcesses.has(session.id) ? 'active' : 'disconnected'
    }));
    res.json(sessionsWithStatus);
  } catch (err) {
    console.error('Error getting sessions:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete session
app.delete('/api/session/:id', async (req, res) => {
  try {
    const sessionId = req.params.id;

    // Kill PTY process if running
    if (activeProcesses.has(sessionId)) {
      const ptyProcess = activeProcesses.get(sessionId);
      ptyProcess.kill();
      activeProcesses.delete(sessionId);
    }

    // Remove from sessions file
    const sessions = await loadSessions();
    const filteredSessions = sessions.filter(s => s.id !== sessionId);
    await saveSessions(filteredSessions);

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting session:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resize terminal
app.post('/api/session/:id/resize', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { cols, rows } = req.body;

    if (activeProcesses.has(sessionId)) {
      const ptyProcess = activeProcesses.get(sessionId);
      ptyProcess.resize(cols, rows);
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'Session not found' });
    }
  } catch (err) {
    console.error('Error resizing terminal:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== FILE MANAGER ENDPOINTS ====================

// List directory
app.get('/api/files', async (req, res) => {
  try {
    const dirPath = req.query.path || HOME_DIR;
    const normalizedPath = path.normalize(dirPath);

    // Security: prevent directory traversal
    if (normalizedPath.includes('..')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const stats = await fs.stat(normalizedPath);

    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' });
    }

    const items = await fs.readdir(normalizedPath, { withFileTypes: true });
    const files = await Promise.all(items.map(async (item) => {
      const itemPath = path.join(normalizedPath, item.name);
      try {
        const itemStats = await fs.stat(itemPath);
        return {
          name: item.name,
          path: itemPath,
          isDirectory: item.isDirectory(),
          size: itemStats.size,
          modified: itemStats.mtime.toISOString(),
          permissions: itemStats.mode.toString(8).slice(-3)
        };
      } catch {
        return {
          name: item.name,
          path: itemPath,
          isDirectory: item.isDirectory(),
          size: 0,
          modified: null,
          permissions: '000'
        };
      }
    }));

    res.json({
      path: normalizedPath,
      items: files.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      })
    });
  } catch (err) {
    console.error('Error listing files:', err);
    res.status(500).json({ error: err.message });
  }
});

// Read file
app.get('/api/files/read', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'Path required' });
    }

    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const content = await fs.readFile(normalizedPath, 'utf-8');
    const stats = await fs.stat(normalizedPath);

    res.json({
      path: normalizedPath,
      content,
      size: stats.size,
      modified: stats.mtime.toISOString()
    });
  } catch (err) {
    console.error('Error reading file:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create/Write file
app.post('/api/files/write', async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'Path required' });
    }

    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await fs.writeFile(normalizedPath, content);
    res.json({ success: true, path: normalizedPath });
  } catch (err) {
    console.error('Error writing file:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create directory
app.post('/api/files/mkdir', async (req, res) => {
  try {
    const { path: dirPath } = req.body;
    if (!dirPath) {
      return res.status(400).json({ error: 'Path required' });
    }

    const normalizedPath = path.normalize(dirPath);
    if (normalizedPath.includes('..')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await fs.ensureDir(normalizedPath);
    res.json({ success: true, path: normalizedPath });
  } catch (err) {
    console.error('Error creating directory:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete file/directory
app.delete('/api/files', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'Path required' });
    }

    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const stats = await fs.stat(normalizedPath);
    if (stats.isDirectory()) {
      await fs.remove(normalizedPath);
    } else {
      await fs.remove(normalizedPath);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting file:', err);
    res.status(500).json({ error: err.message });
  }
});

// Upload file
app.post('/api/files/upload', async (req, res) => {
  try {
    if (!req.body || !req.body.file || !req.body.path) {
      return res.status(400).json({ error: 'File and path required' });
    }

    const { path: dirPath, file, filename } = req.body;
    const normalizedPath = path.normalize(dirPath);
    if (normalizedPath.includes('..')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = path.join(normalizedPath, filename);
    await fs.writeFile(filePath, Buffer.from(file, 'base64'));
    res.json({ success: true, path: filePath });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== CRON JOB ENDPOINTS ====================

// Get cron jobs
app.get('/api/cron', (req, res) => {
  const jobs = Array.from(cronJobs.entries()).map(([id, job]) => ({
    id,
    name: job.name,
    schedule: job.schedule,
    command: job.command,
    status: job.task.getStatus()
  }));
  res.json(jobs);
});

// Create cron job
app.post('/api/cron', (req, res) => {
  try {
    const { name, schedule, command } = req.body;
    if (!name || !schedule || !command) {
      return res.status(400).json({ error: 'Name, schedule, and command required' });
    }

    const id = 'cron_' + Date.now();
    const task = cron.schedule(schedule, async () => {
      try {
        console.log(`[CRON ${name}] Executing: ${command}`);
        const { exec } = require('child_process');
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error(`[CRON ${name}] Error:`, error.message);
          }
          if (stdout) console.log(`[CRON ${name}] Output:`, stdout);
          if (stderr) console.error(`[CRON ${name}] Stderr:`, stderr);
        });
      } catch (err) {
        console.error(`[CRON ${name}] Execution error:`, err);
      }
    }, {
      scheduled: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });

    cronJobs.set(id, {
      id,
      name,
      schedule,
      command,
      task,
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, id, job: { id, name, schedule, command } });
  } catch (err) {
    console.error('Error creating cron job:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete cron job
app.delete('/api/cron/:id', (req, res) => {
  try {
    const id = req.params.id;
    if (cronJobs.has(id)) {
      const job = cronJobs.get(id);
      job.task.stop();
      cronJobs.delete(id);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Cron job not found' });
    }
  } catch (err) {
    console.error('Error deleting cron job:', err);
    res.status(500).json({ error: err.message });
  }
});

// Toggle cron job
app.post('/api/cron/:id/toggle', (req, res) => {
  try {
    const id = req.params.id;
    if (cronJobs.has(id)) {
      const job = cronJobs.get(id);
      if (job.task.getStatus() === 'scheduled') {
        job.task.stop();
      } else {
        job.task.start();
      }
      res.json({ success: true, status: job.task.getStatus() });
    } else {
      res.status(404).json({ error: 'Cron job not found' });
    }
  } catch (err) {
    console.error('Error toggling cron job:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== WEBSOCKET HANDLERS ====================

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Attach PTY to socket
  socket.on('attach-session', (sessionId) => {
    console.log('Attaching to session:', sessionId);

    if (!activeProcesses.has(sessionId)) {
      socket.emit('error', { message: 'Session not found or disconnected' });
      return;
    }

    const ptyProcess = activeProcesses.get(sessionId);
    socket.sessionId = sessionId;
    socket.join(sessionId);

    // Send initial data
    socket.emit('session-attached', { sessionId, pid: ptyProcess.pid });

    // Handle terminal input
    socket.on('input', (data) => {
      if (activeProcesses.has(sessionId)) {
        activeProcesses.get(sessionId).write(data);
      }
    });

    // Handle resize
    socket.on('resize', ({ cols, rows }) => {
      if (activeProcesses.has(sessionId)) {
        activeProcesses.get(sessionId).resize(cols, rows);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      socket.leave(sessionId);
    });
  });

  // Create new session and attach
  socket.on('create-and-attach', async (data = {}) => {
    try {
      const sessionId = generateSessionId();
      const sessionName = data.name || `Terminal ${sessionId.split('_')[1]}`;
      const workingDir = data.workingDir || HOME_DIR;
      const cols = data.cols || 80;
      const rows = data.rows || 24;

      const ptyProcess = pty.spawn(SHELL, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: workingDir,
        env: process.env
      });

      activeProcesses.set(sessionId, ptyProcess);

      const session = {
        id: sessionId,
        name: sessionName,
        workingDir: workingDir,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        pid: ptyProcess.pid,
        status: 'active'
      };

      const sessions = await loadSessions();
      sessions.push(session);
      await saveSessions(sessions);

      ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`Session ${sessionId} exited`);
        activeProcesses.delete(sessionId);
        io.to(sessionId).emit('session-closed', { sessionId, exitCode, signal });
        updateSessionStatus(sessionId, 'disconnected');
      });

      ptyProcess.onData((data) => {
        io.to(sessionId).emit('output', data);
      });

      socket.emit('session-created', { session });
      socket.emit('session-attached', { sessionId, pid: ptyProcess.pid });
      socket.sessionId = sessionId;
      socket.join(sessionId);

      socket.on('input', (inputData) => {
        if (activeProcesses.has(sessionId)) {
          activeProcesses.get(sessionId).write(inputData);
        }
      });

      socket.on('resize', ({ cols: c, rows: r }) => {
        if (activeProcesses.has(sessionId)) {
          activeProcesses.get(sessionId).resize(c, r);
        }
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected from new session:', socket.id);
      });

    } catch (err) {
      console.error('Error creating session:', err);
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Helper function to update session status
async function updateSessionStatus(sessionId, status) {
  try {
    const sessions = await loadSessions();
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    if (sessionIndex !== -1) {
      sessions[sessionIndex].status = status;
      sessions[sessionIndex].lastActive = new Date().toISOString();
      await saveSessions(sessions);
    }
  } catch (err) {
    console.error('Error updating session status:', err);
  }
}

// ==================== VNC SUPPORT ====================

// Serve noVNC files (if installed)
app.get('/vnc', (req, res) => {
  const vncPath = path.join(__dirname, 'public', 'vnc');
  if (fs.existsSync(vncPath)) {
    res.sendFile(path.join(vncPath, 'vnc.html'));
  } else {
    res.status(404).json({ error: 'VNC not configured. Install noVNC to enable this feature.' });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    activeSessions: activeProcesses.size,
    cronJobs: cronJobs.size
  });
});

// ==================== STARTUP ====================

async function startServer() {
  await initSessionsFile();

  // Restore active sessions from file
  const sessions = await loadSessions();
  console.log(`Loaded ${sessions.length} saved sessions`);

  // Start HTTP server
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██████╗ ███████╗███╗   ███╗                               ║
║   ██╔══██╗██╔════╝████╗ ████║                               ║
║   ██████╔╝███████╗██╔████╔██║                               ║
║   ██╔═══╝ ╚════██║██║╚██╔╝██║                               ║
║   ██║     ███████║██║ ╚═╝ ██║                               ║
║   ╚═╝     ╚══════╝╚═╝     ╚═╝                               ║
║                                                           ║
║   Advanced VPS Panel v1.0.0                               ║
║   Running on port ${PORT}                                      ║
║   URL: http://localhost:${PORT}                               ║
║                                                           ║
║   Active Sessions: ${activeProcesses.size}                                 ║
║   System: ${os.platform()} ${os.arch()}                                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  });
}

startServer().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');

  // Kill all PTY processes
  for (const [sessionId, ptyProcess] of activeProcesses) {
    console.log(`Killing session: ${sessionId}`);
    ptyProcess.kill();
  }

  // Stop all cron jobs
  for (const [id, job] of cronJobs) {
    job.task.stop();
  }

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
