import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "./meetingSocket.js";
import { DEFAULT_ICE_SERVERS, DEFAULT_SERVER_URL } from "../config.js";

export function useWebRTC(
  meetingId,
  name = "Guest",
  serverUrl = DEFAULT_SERVER_URL,
) {
  const socket = getSocket(serverUrl);
  const [localStream, setLocalStream] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [screenStream, setScreenStream] = useState(null);
  const [screenShareNotification, setScreenShareNotification] = useState(null);
  const peers = useRef(new Map());
  const pendingCandidates = useRef(new Map());
  const streamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const mountedRef = useRef(false);
  const notificationTimeoutRef = useRef(null);
  const cleanupRef = useRef(() => {});

  const stopScreenShare = useCallback(async () => {
    const displayStream = screenStreamRef.current;
    if (!displayStream) return;

    screenStreamRef.current = null;
    if (mountedRef.current) setScreenStream(null);
    if (socket.connected) socket.emit("screen-share-stopped");
    const cameraTrack = streamRef.current?.getVideoTracks()[0] || null;

    try {
      const results = await Promise.allSettled(
        [...peers.current.values()].map(async (peer) => {
          const sender = peer
            .getTransceivers()
            .find((transceiver) => transceiver.receiver.track.kind === "video")
            ?.sender;
          if (sender) await sender.replaceTrack(cameraTrack);
        }),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure) {
        console.error("Unable to restore video after screen sharing:", failure.reason);
        if (mountedRef.current) {
          setError("Screen sharing stopped, but a participant's video could not be restored.");
        }
      }
    } finally {
      displayStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
    }
  }, [socket]);

  const startScreenShare = useCallback(async () => {
    let displayStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: false,
      });
      if (!mountedRef.current) {
        displayStream.getTracks().forEach((track) => track.stop());
        return;
      }

      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) throw new Error("No screen video track was selected.");
      screenTrack.onended = () => {
        stopScreenShare().catch((shareError) => {
          console.error("Unable to stop screen sharing:", shareError);
        });
      };

      screenStreamRef.current = displayStream;
      setScreenStream(displayStream);

      for (const [target, peer] of peers.current) {
        if (!mountedRef.current || screenStreamRef.current !== displayStream) return;
        const sender = peer
          .getTransceivers()
          .find((transceiver) => transceiver.receiver.track.kind === "video")
          ?.sender;
        if (sender) {
          await sender.replaceTrack(screenTrack);
        } else {
          peer.addTrack(screenTrack, displayStream);
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          if (mountedRef.current) {
            socket.emit("webrtc:offer", { target, offer: peer.localDescription });
          }
        }
      }

      if (mountedRef.current && screenStreamRef.current === displayStream) {
        socket.emit("screen-share-started");
      }
    } catch (shareError) {
      displayStream?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      if (screenStreamRef.current === displayStream) screenStreamRef.current = null;
      if (mountedRef.current) {
        setScreenStream(null);
        setError(shareError.message || "Unable to share your screen.");
      }
    }
  }, [socket, stopScreenShare]);

  useEffect(() => {
    let active = true;
    let joinRequested = false;
    mountedRef.current = true;
    setStatus("connecting");
    setError("");
    setMediaError("");

    const updateParticipant = (socketId, stream, participantName) => {
      if (!active) return;
      setParticipants((current) => {
        const existing = current.find((participant) => participant.socketId === socketId);
        if (existing) {
          return current.map((participant) =>
            participant.socketId === socketId
              ? {
                  ...participant,
                  stream: stream || participant.stream,
                  name: participantName || participant.name,
                }
              : participant,
          );
        }
        return [...current, { socketId, stream, name: participantName || "Guest" }];
      });
    };

    const removeParticipant = (socketId) => {
      const peer = peers.current.get(socketId);
      peers.current.delete(socketId);
      pendingCandidates.current.delete(socketId);
      peer?.close();
      if (active) {
        setParticipants((current) =>
          current.filter((participant) => participant.socketId !== socketId),
        );
      }
    };

    const createPeer = (target, shouldCreateOffer) => {
      if (peers.current.has(target)) return peers.current.get(target);
      const peer = new RTCPeerConnection({ iceServers });
      peers.current.set(target, peer);
      streamRef.current?.getTracks()
        .filter((track) => track.kind !== "video" || !screenStreamRef.current)
        .forEach((track) => peer.addTrack(track, streamRef.current));
      screenStreamRef.current?.getVideoTracks().forEach((track) => {
        peer.addTrack(track, screenStreamRef.current);
      });
      peer.ontrack = (event) => updateParticipant(target, event.streams[0]);
      peer.onicecandidate = (event) => {
        if (event.candidate && active) {
          socket.emit("webrtc:ice-candidate", {
            target,
            candidate: event.candidate,
          });
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed" || peer.connectionState === "closed") {
          removeParticipant(target);
        }
      };
      if (shouldCreateOffer) {
        peer
          .createOffer()
          .then((offer) => peer.setLocalDescription(offer))
          .then(() => {
            if (active) {
              socket.emit("webrtc:offer", {
                target,
                offer: peer.localDescription,
              });
            }
          })
          .catch((offerError) => {
            console.error("Unable to start the video connection:", offerError);
            if (active) setError("Unable to connect your video to a participant.");
          });
      }
      return peer;
    };

    const joinMeeting = () => {
      if (!active || joinRequested) return;
      joinRequested = true;
      setStatus("joining");
      socket.timeout(10000).emit(
        "meeting:join",
        meetingId,
        { name },
        (timeoutError, response) => {
          if (!active) return;
          if (timeoutError || !response?.ok) {
            setStatus("error");
            setError(response?.message || "Unable to join this meeting. Check the link and try again.");
            return;
          }
          setStatus("joined");
          (response.existingParticipants || []).forEach((participant) => {
            updateParticipant(participant.socketId, null, participant.name);
            createPeer(participant.socketId, true);
          });
          if (response.screenShares?.length) {
            const names = response.screenShares.map((share) => share.name || "A participant");
            setScreenShareNotification({
              message: `${names.join(", ")} ${names.length === 1 ? "is" : "are"} sharing their screen.`,
              isSharing: true,
            });
          }
        },
      );
    };

    const addPendingCandidates = async (peer, sender) => {
      const candidates = pendingCandidates.current.get(sender) || [];
      pendingCandidates.current.delete(sender);
      for (const candidate of candidates) {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    const handleOffer = async ({ sender, offer }) => {
      try {
        const peer = createPeer(sender, false);
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        await addPendingCandidates(peer, sender);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        if (active) {
          socket.emit("webrtc:answer", { target: sender, answer: peer.localDescription });
        }
      } catch (offerError) {
        console.error("Unable to answer a video connection:", offerError);
        if (active) setError("Unable to connect your video to a participant.");
      }
    };

    const handleAnswer = async ({ sender, answer }) => {
      try {
        const peer = peers.current.get(sender);
        if (peer) {
          await peer.setRemoteDescription(new RTCSessionDescription(answer));
          await addPendingCandidates(peer, sender);
        }
      } catch (answerError) {
        console.error("Unable to accept a video connection:", answerError);
        if (active) setError("Unable to connect your video to a participant.");
      }
    };

    const handleCandidate = async ({ sender, candidate }) => {
      try {
        const peer = peers.current.get(sender);
        if (!candidate) return;
        if (!peer || !peer.remoteDescription) {
          const candidates = pendingCandidates.current.get(sender) || [];
          candidates.push(candidate);
          pendingCandidates.current.set(sender, candidates);
          return;
        }
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (candidateError) {
        console.error("Unable to add a video connection candidate:", candidateError);
        if (active) setError("A video connection could not be completed.");
      }
    };

    const handleParticipantJoined = ({ socketId, name: participantName }) => {
      updateParticipant(socketId, null, participantName);
    };
    const handleParticipantLeft = ({ socketId }) => removeParticipant(socketId);
    const handleScreenShareStarted = ({ name: sharerName }) => {
      if (!active) return;
      if (notificationTimeoutRef.current !== null) {
        window.clearTimeout(notificationTimeoutRef.current);
      }
      setScreenShareNotification({
        message: `${sharerName || "A participant"} started sharing their screen.`,
        isSharing: true,
      });
    };
    const handleScreenShareStopped = ({ name: sharerName }) => {
      if (!active) return;
      setScreenShareNotification({
        message: `${sharerName || "A participant"} stopped sharing their screen.`,
        isSharing: false,
      });
      notificationTimeoutRef.current = window.setTimeout(() => {
        if (active) setScreenShareNotification(null);
        notificationTimeoutRef.current = null;
      }, 4000);
    };
    const handleConnectError = (connectionError) => {
      if (!active) return;
      setStatus("error");
      setError(connectionError.message || "Unable to connect to the meeting service.");
    };
    const handleDisconnect = () => {
      if (!active) return;
      joinRequested = false;
      setStatus("connecting");
      peers.current.forEach((peer) => peer.close());
      peers.current.clear();
      pendingCandidates.current.clear();
      setParticipants([]);
    };

    socket.on("connect", joinMeeting);
    socket.on("connect_error", handleConnectError);
    socket.on("disconnect", handleDisconnect);
    socket.on("webrtc:offer", handleOffer);
    socket.on("webrtc:answer", handleAnswer);
    socket.on("webrtc:ice-candidate", handleCandidate);
    socket.on("meeting:participant-joined", handleParticipantJoined);
    socket.on("meeting:participant-left", handleParticipantLeft);
    socket.on("screen-share-started", handleScreenShareStarted);
    socket.on("screen-share-stopped", handleScreenShareStopped);

    async function acquireMedia() {
      let stream;
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera and microphone access is not available in this browser.");
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (mediaAccessError) {
          if (!active) return;
          if (!["NotFoundError", "DevicesNotFoundError", "OverconstrainedError"].includes(mediaAccessError.name)) {
            throw mediaAccessError;
          }
          const tracks = [];
          const errors = [];
          for (const constraint of [{ audio: true }, { video: true }]) {
            try {
              const deviceStream = await navigator.mediaDevices.getUserMedia(constraint);
              if (!active) {
                deviceStream.getTracks().forEach((track) => track.stop());
                tracks.forEach((track) => track.stop());
                return;
              }
              tracks.push(...deviceStream.getTracks());
            } catch (deviceError) {
              if (!active) {
                tracks.forEach((track) => track.stop());
                return;
              }
              errors.push(deviceError);
            }
          }
          if (tracks.length) {
            stream = new MediaStream(tracks);
          } else if (active) {
            const denied = errors.some((deviceError) => deviceError.name === "NotAllowedError");
            setMediaError(
              denied
                ? "Camera and microphone access was denied. You can still join without them."
                : "No camera or microphone was found. You can still join without them.",
            );
          }
        }

        if (!active) {
          stream?.getTracks().forEach((track) => track.stop());
          return;
        }
        if (stream) {
          streamRef.current = stream;
          setLocalStream(stream);
          if (!stream.getVideoTracks().length || !stream.getAudioTracks().length) {
            setMediaError(
              !stream.getVideoTracks().length && !stream.getAudioTracks().length
                ? "No camera or microphone was found. You can still join without them."
                : !stream.getVideoTracks().length
                  ? "No camera was found. You joined with your microphone only."
                  : "No microphone was found. You joined with your camera only.",
            );
          }
        }
      } catch (mediaAccessError) {
        if (active) {
          setMediaError(
            mediaAccessError.name === "NotAllowedError"
              ? "Camera and microphone access was denied. You can still join without them."
              : mediaAccessError.name === "NotReadableError"
                ? "Your camera or microphone is unavailable or already in use. You can still join without them."
                : mediaAccessError.message || "Camera or microphone access failed. You can still join without them.",
          );
        }
      }

      if (!active) return;
      if (socket.connected) joinMeeting();
      else socket.connect();
    }

    acquireMedia();

    const cleanup = () => {
      if (!active) return;
      active = false;
      mountedRef.current = false;
      socket.off("connect", joinMeeting);
      socket.off("connect_error", handleConnectError);
      socket.off("disconnect", handleDisconnect);
      socket.off("webrtc:offer", handleOffer);
      socket.off("webrtc:answer", handleAnswer);
      socket.off("webrtc:ice-candidate", handleCandidate);
      socket.off("meeting:participant-joined", handleParticipantJoined);
      socket.off("meeting:participant-left", handleParticipantLeft);
      socket.off("screen-share-started", handleScreenShareStarted);
      socket.off("screen-share-stopped", handleScreenShareStopped);
      if (socket.connected) {
        if (screenStreamRef.current) socket.emit("screen-share-stopped");
        socket.emit("meeting:leave");
      }
      peers.current.forEach((peer) => peer.close());
      peers.current.clear();
      pendingCandidates.current.clear();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      screenStreamRef.current?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      screenStreamRef.current = null;
      if (notificationTimeoutRef.current !== null) {
        window.clearTimeout(notificationTimeoutRef.current);
        notificationTimeoutRef.current = null;
      }
      socket.disconnect();
    };
    cleanupRef.current = cleanup;
    return cleanup;
  }, [meetingId, name, socket, iceServers]);

  const leave = useCallback(() => {
    if (mountedRef.current) setStatus("left");
    cleanupRef.current();
  }, []);

  return {
    localStream,
    participants,
    status,
    error,
    mediaError,
    screenStream,
    startScreenShare,
    stopScreenShare,
    screenShareNotification,
    leave,
  };
}

export default useWebRTC;
