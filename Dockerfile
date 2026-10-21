# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --omit=dev --cache /tmp/npm-cache; \
    else npm ci --omit=dev --cache /tmp/npm-cache; fi
COPY server ./server
COPY agents ./agents
COPY src ./src
COPY index.html ./
COPY playable ./playable
RUN chmod -R a+rX /app && mkdir -p /app/.data && chown -R node:node /app/.data
USER node
ENV BIND_HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/.data
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/app.mjs"]
