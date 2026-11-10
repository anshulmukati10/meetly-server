import { io } from "socket.io-client";

let socket;
let socketUrl;

export function getSocket(serverUrl) {
  if (typeof serverUrl !== "string" || !serverUrl.trim()) {
    throw new Error("A serverUrl is required to connect to the meeting server.");
  }

  const normalizedUrl = serverUrl.replace(/\/+$/, "");
  if (socket && socketUrl !== normalizedUrl) {
    socket.disconnect();
    socket = undefined;
  }

  if (!socket) {
    socketUrl = normalizedUrl;
    socket = io(normalizedUrl, {
      autoConnect: false,
      transports: ["websocket", "polling"],
    });
  }

  return socket;
}
