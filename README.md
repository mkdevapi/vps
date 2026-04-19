# VPS Pro - Advanced Web-Based VPS Panel

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/Node.js-18+-green.svg" alt="Node.js">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License">
</p>

<p align="center">
  ⚡ Advanced Web-based VPS Panel with persistent terminal sessions, VNC support, file manager, cron jobs, and modern dashboard UI.
</p>

---

## Features

### Core Features
- **Interactive Terminal**: Full Ubuntu bash shell with xterm.js
- **Persistent Sessions**: Sessions stay alive 24/7 until manually deleted
- **Multiple Sessions**: Create and manage multiple terminal sessions
- **Session Reconnection**: Reconnect to existing sessions on page refresh
- **WebSocket Real-time Communication**: Instant terminal response

### File Manager
- Browse server filesystem
- Upload, download, and delete files
- Create directories
- View file contents with syntax highlighting
- File preview for text and binary files

### Cron Job System
- Schedule recurring tasks
- Visual cron expression editor
- Start/pause/delete cron jobs
- Preset templates for common schedules

### System Dashboard
- Real-time CPU and RAM usage
- System information display
- Active sessions counter
- Uptime monitoring

### VNC Support (Optional)
- Remote desktop access
- Browser-based VNC client integration

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- For VNC: x11vnc or tigervnc (optional)

### Installation

```bash
# Clone or download the project
cd vps-pro

# Install dependencies
npm install

# Start the server
npm start
```

The application will be available at `http://localhost:3000`

### Development Mode

```bash
npm run dev
```

---

## Deployment to Render

### Method 1: Docker Deployment (Recommended)

1. Push the project to a GitHub repository
2. Log in to [Render](https://render.com)
3. Create a new **Web Service**
4. Connect your GitHub repository
5. Configure the service:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Environment**: Node
6. Set environment variable `PORT` (Render sets this automatically)
7. Click **Deploy**

### Method 2: Dockerfile Deployment

1. Push the project to GitHub
2. On Render, create a new **Docker** web service
3. Connect your repository
4. Render will automatically detect the Dockerfile
5. Deploy!

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `HOME` | Home directory for sessions | `/root` |

---

## Keep Alive Configuration

The `keepalive.sh` script pings your deployment URLs to prevent Render's free tier from sleeping.

### Update URLs

Edit `keepalive.sh` and replace the placeholder URLs:

```bash
URLS=(
    "https://your-app.onrender.com/"
)
```

### Interval

The default interval is 180 seconds (3 minutes). Adjust based on your Render plan:
- Free tier: 180-300 seconds (Render sleeps after 15 min)
- Paid tier: Can be longer or disabled

---

## Project Structure

```
vps-pro/
├── Dockerfile          # Container configuration
├── server.js          # Express + WebSocket + node-pty backend
├── package.json       # Node.js dependencies
├── keepalive.sh       # Keep-alive ping script
├── sessions.json      # Persistent session storage
└── public/
    ├── index.html     # Main dashboard HTML
    ├── app.js         # Frontend JavaScript
    └── style.css      # Dark theme CSS
```

---

## API Endpoints

### Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/new-session` | Create new terminal session |
| GET | `/api/sessions` | List all sessions |
| DELETE | `/api/session/:id` | Delete a session |
| POST | `/api/session/:id/resize` | Resize terminal |

### File Manager
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files?path=/dir` | List directory contents |
| GET | `/api/files/read?path=/file` | Read file contents |
| POST | `/api/files/write` | Write/create file |
| POST | `/api/files/mkdir` | Create directory |
| POST | `/api/files/upload` | Upload file |
| DELETE | `/api/files?path=/path` | Delete file/directory |

### Cron Jobs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cron` | List all cron jobs |
| POST | `/api/cron` | Create new cron job |
| DELETE | `/api/cron/:id` | Delete cron job |
| POST | `/api/cron/:id/toggle` | Pause/resume job |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats` | System statistics |
| GET | `/health` | Health check |

---

## WebSocket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `attach-session` | `{sessionId}` | Attach to existing session |
| `create-and-attach` | `{name, cols, rows}` | Create and attach new session |
| `input` | `string` | Send terminal input |
| `resize` | `{cols, rows}` | Resize terminal |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `output` | `string` | Terminal output |
| `session-attached` | `{sessionId, pid}` | Session attached confirmation |
| `session-created` | `{session}` | New session created |
| `session-closed` | `{sessionId, exitCode, signal}` | Session closed |
| `error` | `{message}` | Error occurred |

---

## Technologies Used

### Backend
- **Express.js** - Web framework
- **Socket.io** - WebSocket communication
- **node-pty** - PTY handling for terminal
- **node-cron** - Cron job scheduling
- **fs-extra** - Enhanced filesystem operations

### Frontend
- **xterm.js** - Terminal emulator
- **Socket.io Client** - WebSocket client
- **Modern CSS** - Dark theme UI

---

## Security Notes

> ⚠️ **Important**: This panel provides direct server access. Consider implementing:

1. **Authentication**: Add password protection
2. **Rate limiting**: Prevent brute force
3. **Session timeouts**: Auto-disconnect inactive sessions
4. **Directory restrictions**: Limit filesystem access
5. **Command filtering**: Restrict dangerous commands

---

## Troubleshooting

### Terminal not working
- Ensure `node-pty` native module is installed
- Check if bash is available in the container

### Sessions not persisting
- Verify `sessions.json` has write permissions
- Check disk space availability

### VNC not connecting
- Install x11vnc: `apt-get install x11vnc`
- Configure VNC server password
- Open VNC port (5900+)

---

## License

MIT License - See LICENSE file for details.

---

## Author

Created by **MiniMax Agent**

---

<p align="center">
  <sub>If you find this project useful, please give it a ⭐</sub>
</p>
