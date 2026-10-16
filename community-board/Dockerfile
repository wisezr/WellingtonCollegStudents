FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.js board.html style.css script.js ./
RUN mkdir -p /app/data && chown node:node /app/data
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
