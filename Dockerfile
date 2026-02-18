FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install base tools
RUN apt-get update && apt-get install -y \
    curl git build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 LTS via nvm, global CLI tools, and PATH symlinks.
# Everything is in one layer so nvm shell functions are available for `nvm which`.
ENV NVM_DIR=/root/.nvm
ENV NODE_VERSION=22
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash \
    && . $NVM_DIR/nvm.sh \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default \
    && npm install -g @anthropic-ai/claude-code vercel \
    # Symlink using `nvm which default` — deterministic, no glob needed.
    && ln -s "$(nvm which default)" /usr/local/bin/node \
    && ln -s "$(dirname "$(nvm which default)")/npm" /usr/local/bin/npm \
    && ln -s "$(dirname "$(nvm which default)")/npx" /usr/local/bin/npx

# Note: running as root is intentional — this is an isolated dev sandbox container
# where Claude Code and user scripts require full system access (apt, npm -g, etc.).
WORKDIR /workspace
