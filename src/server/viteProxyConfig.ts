import type { ProxyOptions } from "vite";
import { GENPOSTER_BACKEND_PORT } from "./devPorts";

const BACKEND_HTTP_TARGET = `http://127.0.0.1:${GENPOSTER_BACKEND_PORT}`;
const BACKEND_WS_TARGET = `ws://127.0.0.1:${GENPOSTER_BACKEND_PORT}`;

export function createLocalBackendProxy(): Record<string, ProxyOptions> {
  return {
    "/api": {
      target: BACKEND_HTTP_TARGET,
      changeOrigin: true,
    },
    "/ws": {
      target: BACKEND_WS_TARGET,
      ws: true,
    },
  };
}
