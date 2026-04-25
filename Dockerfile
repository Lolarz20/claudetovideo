# Playwright's official image bundles Chromium + every Linux dep it needs.
# Pin to the same version as package.json so the browser build matches the
# client library — mismatches cause "browserType.launch: Executable doesn't
# exist" at runtime.
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# Install JS dependencies first so Docker can cache this layer across
# source-only changes. --ignore-scripts skips the postinstall that would
# otherwise redownload Chromium (already in the base image).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# App source.
COPY bin ./bin
COPY src ./src
COPY server.js ./
COPY public ./public

# Cloud Run injects $PORT; default to 8080 for local docker runs.
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/tmp/jobs

EXPOSE 8080

# Run as the non-root `pwuser` that the Playwright image already provides.
USER pwuser

CMD ["node", "server.js"]
