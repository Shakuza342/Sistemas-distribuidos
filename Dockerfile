FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY nodos ./nodos
COPY scripts ./scripts
RUN mkdir -p /app/datos
ENV VEEDURIA_CONFIG=nodos/docker/nodo1.json
EXPOSE 3001 3002 3003
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PUERTO||3001)+'/api/v1/estado').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["sh", "-c", "exec node --disable-warning=ExperimentalWarning src/server.js --config $VEEDURIA_CONFIG"]
