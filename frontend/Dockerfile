# syntax=docker/dockerfile:1

FROM rust:1-alpine AS defmt-decoder

RUN apk add --no-cache bash build-base

RUN cargo install wasm-pack --locked

WORKDIR /workspace

COPY frontend/scripts/build-defmt-decoder.sh frontend/scripts/build-defmt-decoder.sh
COPY esp32-mainboard esp32-mainboard

RUN frontend/scripts/build-defmt-decoder.sh

FROM node:22-alpine AS frontend-build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./
COPY --from=defmt-decoder \
  /workspace/frontend/public/defmt-mqtt-decoder \
  public/defmt-mqtt-decoder

RUN npm run build:vite

FROM node:22-alpine AS frontend-preview

WORKDIR /app
ENV NODE_ENV=production

COPY --from=frontend-build /app/package.json /app/package-lock.json ./
COPY --from=frontend-build /app/node_modules node_modules
COPY --from=frontend-build /app/dist dist
COPY --from=frontend-build /app/vite.config.ts vite.config.ts

EXPOSE 3000

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
