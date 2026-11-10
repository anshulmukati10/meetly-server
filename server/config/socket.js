import { Server } from "socket.io";
import { createMeeting, getMeeting, deleteMeeting } from "./meetManager.js";

let io;

const configuredOrigins = process.env.CORS_ORIGIN?.trim();
const corsOrigin = configuredOrigins
  ? configuredOrigins === "*"
    ? "*"
    : configuredOrigins.includes(",")
      ? configuredOrigins.split(",").map((origin) => origin.trim()).filter(Boolean)
      : configuredOrigins
  : false;

if (!configuredOrigins) {
  console.warn("CORS_ORIGIN is not set; cross-origin requests are disabled.");
}

export const socketInit = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    function leaveMeeting() {
      const meetingId = socket.data.meetingId;
      const meeting = getMeeting(meetingId);
      if (!meeting) {
        socket.data.meetingId = null;
        return;
      }

      const participant = meeting.participants.get(socket.id);
      if (meeting.screenSharers.delete(socket.id)) {
        socket.to(`meeting${meetingId}`).emit("screen-share-stopped", {
          name: participant?.name || "Guest",
        });
      }

      meeting.participants.delete(socket.id);
      socket.to(`meeting${meetingId}`).emit("meeting:participant-left", {
        socketId: socket.id,
      });
      socket.leave(`meeting${meetingId}`);
      socket.data.meetingId = null;
      socket.data.name = null;

      if (meeting.participants.size === 0) {
        deleteMeeting(meetingId);
      }
    }

    socket.on("disconnect", () => {
      leaveMeeting();
      console.log(`User is disconnected on ${socket.id}`);
    });

    socket.on("meeting:create", (payload, callback) => {
      const name = getDisplayName(payload?.name);
      leaveMeeting();
      const meetingId = createMeeting();
      const meeting = getMeeting(meetingId);
      const participant = { socketId: socket.id, name };
      meeting.participants.set(socket.id, participant);
      socket.data.meetingId = meetingId;
      socket.data.name = name;
      socket.join(`meeting${meetingId}`);
      callback?.({ ok: true, meetingId });
    });

    function broadcastScreenShareEvent(eventName) {
      const meetingId = socket.data.meetingId;
      const meeting = getMeeting(meetingId);
      const participant = meeting?.participants.get(socket.id);
      if (!meeting || !participant) return;

      if (eventName === "screen-share-started") {
        meeting.screenSharers.set(socket.id, participant);
      } else if (!meeting.screenSharers.delete(socket.id)) {
        return;
      }

      socket.to(`meeting${meetingId}`).emit(eventName, {
        name: participant.name,
      });
    }

    socket.on("screen-share-started", () => {
      broadcastScreenShareEvent("screen-share-started");
    });

    socket.on("screen-share-stopped", () => {
      broadcastScreenShareEvent("screen-share-stopped");
    });

    socket.on("meeting:join", (meetingId, payload, callback) => {
      if (typeof payload === "function") {
        callback = payload;
        payload = {};
      }

      const meeting = getMeeting(meetingId);
      if (!meeting) {
        callback?.({ ok: false, message: "Meeting not found." });
        return;
      }

      const name = getDisplayName(payload?.name);
      if (socket.data.meetingId === meetingId && meeting.participants.has(socket.id)) {
        callback?.({
          ok: true,
          existingParticipants: [...meeting.participants.values()].filter(
            (participant) => participant.socketId !== socket.id,
          ),
          screenShares: [...meeting.screenSharers.values()].map(({ name: sharerName }) => ({
            name: sharerName,
          })),
        });
        return;
      }

      leaveMeeting();
      const existingParticipants = [...meeting.participants.values()];
      const participant = { socketId: socket.id, name };
      meeting.participants.set(socket.id, participant);
      socket.data.meetingId = meetingId;
      socket.data.name = name;
      socket.join(`meeting${meetingId}`);
      socket.to(`meeting${meetingId}`).emit("meeting:participant-joined", participant);
      callback?.({
        ok: true,
        existingParticipants,
        screenShares: [...meeting.screenSharers.values()].map(({ name: sharerName }) => ({
          name: sharerName,
        })),
      });
    });

    function relaySignal(target, event, payload) {
      const meeting = getMeeting(socket.data.meetingId);
      if (!meeting || !meeting.participants.has(socket.id) || !meeting.participants.has(target)) {
        return;
      }
      io.to(target).emit(event, { sender: socket.id, ...payload });
    }

    socket.on("webrtc:offer", ({ target, offer }) => {
      relaySignal(target, "webrtc:offer", { offer });
    });

    socket.on("webrtc:answer", ({ target, answer }) => {
      relaySignal(target, "webrtc:answer", { answer });
    });

    socket.on("webrtc:ice-candidate", ({ target, candidate }) => {
      relaySignal(target, "webrtc:ice-candidate", { candidate });
    });

    socket.on("meeting:leave", leaveMeeting);
  });

  return io;
};

function getDisplayName(name) {
  return typeof name === "string" && name.trim() ? name.trim() : "Guest";
}

export const getIo = () => {
  if (!io) {
    throw new Error("Socket.io is not initialized");
  }
  return io;
};
