FROM ubuntu:24.04

# Install base tools
RUN apt-get update && apt-get install -y \
    curl git build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js via nvm
ENV NVM_DIR=/root/.nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash \
    && . $NVM_DIR/nvm.sh \
    && nvm install --lts \
    && nvm use --lts \
    && npm install -g @anthropic-ai/claude-code vercel

# Make node/npm available without sourcing nvm
RUN ln -s $NVM_DIR/versions/node/$(ls $NVM_DIR/versions/node)/bin/node /usr/local/bin/node \
    && ln -s $NVM_DIR/versions/node/$(ls $NVM_DIR/versions/node)/bin/npm /usr/local/bin/npm \
    && ln -s $NVM_DIR/versions/node/$(ls $NVM_DIR/versions/node)/bin/npx /usr/local/bin/npx

# Set up workspace
WORKDIR /workspace
