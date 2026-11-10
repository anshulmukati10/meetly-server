import { defineConfig } from "tsup";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("./.env", import.meta.url));
if (typeof process.loadEnvFile !== "function") {
  throw new Error("Building the SDK requires Node.js 20.6 or newer (process.loadEnvFile).");
}

try {
  process.loadEnvFile(envPath);
} catch (error) {
  if (error.code === "ENOENT") {
    throw new Error("Missing sdk/.env. Copy sdk/.env.example and set the SDK build variables.");
  }
  throw error;
}

const serverUrl = process.env.MEETLY_DEFAULT_SERVER_URL?.trim();
if (!serverUrl) {
  throw new Error("MEETLY_DEFAULT_SERVER_URL is required in sdk/.env.");
}

let parsedServerUrl;
try {
  parsedServerUrl = new URL(serverUrl);
} catch {
  throw new Error("MEETLY_DEFAULT_SERVER_URL must be a valid absolute URL.");
}

if (
  !["http:", "https:"].includes(parsedServerUrl.protocol)
  || /your-server|example\.com|placeholder|replace-me/i.test(serverUrl)
) {
  throw new Error(
    "MEETLY_DEFAULT_SERVER_URL is still a placeholder; set your real server URL in sdk/.env.",
  );
}

const iceServersValue = process.env.MEETLY_DEFAULT_ICE_SERVERS?.trim();
if (!iceServersValue) {
  throw new Error("MEETLY_DEFAULT_ICE_SERVERS is required in sdk/.env.");
}

let iceServers;
try {
  iceServers = JSON.parse(iceServersValue);
} catch {
  throw new Error("MEETLY_DEFAULT_ICE_SERVERS must be a valid JSON array.");
}

if (
  !Array.isArray(iceServers)
  || iceServers.length === 0
  || iceServers.some((server) => server.username || server.credential)
) {
  throw new Error(
    "MEETLY_DEFAULT_ICE_SERVERS must be a non-empty array without TURN credentials.",
  );
}

export default defineConfig((options) => ({
  entry: ["src/index.js"],
  format: ["esm", "cjs"],
  external: ["react", "react-dom", "react/jsx-runtime"],
  injectStyle: true,       
  clean: !options.watch,
  sourcemap: true,
  minify: false,
  define: {
    MEETLY_DEFAULT_SERVER_URL: JSON.stringify(serverUrl),
    MEETLY_DEFAULT_ICE_SERVERS: JSON.stringify(JSON.stringify(iceServers)),
  },
  esbuildOptions(options) {
    options.jsx = "automatic";
    options.loader = { ...options.loader, ".js": "jsx" }; 
  },
}));