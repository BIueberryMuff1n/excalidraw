FROM --platform=${BUILDPLATFORM} node:24@sha256:8530f76a96d88820d288761f022e318970dda93d01536919fbc16076b7983e63 AS build

WORKDIR /opt/node_app

COPY . .

# do not ignore optional dependencies:
# Error: Cannot find module @rollup/rollup-linux-x64-gnu
RUN --mount=type=cache,target=/root/.cache/yarn \
    npm_config_target_arch=${TARGETARCH} yarn --frozen-lockfile --network-timeout 600000

ARG NODE_ENV=production

RUN npm_config_target_arch=${TARGETARCH} yarn build:app:docker

FROM node:24-alpine

WORKDIR /opt/excalidraw

COPY --from=build /opt/node_app/excalidraw-app/build /opt/excalidraw/build
COPY --from=build /opt/node_app/excalidraw-app/server /opt/excalidraw/server

RUN mkdir -p /data/boards /data/shares && chown -R node:node /data /opt/excalidraw

ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=/opt/excalidraw/build \
    DATA_DIR=/data

USER node

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "/opt/excalidraw/server/index.mjs"]
