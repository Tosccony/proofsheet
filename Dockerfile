# Minimal Dockerfile for proofsheet HTTP MCP server on Fly.io.
#
# Because bin/proofsheet.js is already bundled with all runtime dependencies
# via esbuild (everything inlined including @modelcontextprotocol/sdk), we
# don't need npm install at image build time. The image is small and the
# build is fast.

FROM node:20-alpine

WORKDIR /app

# Copy only the runtime artifacts.
COPY bin/ ./bin/
COPY themes/ ./themes/
COPY package.json ./

# Fly's default port. proofsheet binds via the --port flag below.
EXPOSE 8080

# 0.0.0.0 so external traffic reaches the server; 127.0.0.1 (the stdio default)
# would only accept connections from inside the container.
CMD ["node", "bin/proofsheet.js", "--transport", "http", "--host", "0.0.0.0", "--port", "8080"]
