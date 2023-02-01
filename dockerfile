FROM node:latest
WORKDIR /source
COPY source /source
RUN npm install
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:3000 || exit 1
ENTRYPOINT [ "node", "index.js" ]
