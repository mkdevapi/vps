# VPS Pro - Dockerfile for Render Deployment
# Based on Ubuntu with Node.js and full bash support

FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install base system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    nano \
    vim \
    htop \
    tree \
    jq \
    unzip \
    ca-certificates \
    gnupg \
    lsb-release \
    build-essential \
    python3 \
    python3-pip \
    # Node.js 18.x repository
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    # Install additional useful tools
    && apt-get install -y \
    zip \
    bzip2 \
    gzip \
    netcat \
    net-tools \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm install --production=false

# Copy application files
COPY . .

# Create necessary directories
RUN mkdir -p /root /home /tmp && \
    chmod 755 /app

# Create sessions.json if it doesn't exist
RUN if [ ! -f sessions.json ]; then \
    echo '{"sessions":[]}' > sessions.json; \
    fi

# Expose port (Render will set PORT env variable)
EXPOSE ${PORT:-3000}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Make keepalive script executable
RUN chmod +x /app/keepalive.sh

# Start script - runs keepalive in background and starts the server
CMD ["sh", "-c", "node keepalive.sh & node server.js"]
