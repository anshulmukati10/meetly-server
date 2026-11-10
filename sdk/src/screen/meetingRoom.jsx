import { useEffect, useRef, useState } from "react";
import {
  FiCheck,
  FiCopy,
  FiMic,
  FiMicOff,
  FiMonitor,
  FiPhoneOff,
  FiUsers,
  FiVideo,
  FiVideoOff,
} from "react-icons/fi";
import "../feature/meeting.css";
import useWebRTC from "../feature/webRTC.js";
import { DEFAULT_SERVER_URL } from "../config.js";

function initials(name) {
  return String(name || "Guest")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function VideoTile({ name, stream, isLocal = false, cameraEnabled = true }) {
  const videoRef = useRef(null);
  const hasVideo = Boolean(stream?.getVideoTracks().some((track) => track.enabled));

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null;
  }, [stream]);

  return (
    <article className={`meeting-video-tile${isLocal ? " meeting-video-local" : ""}`}>
      {stream && (
        <video
          autoPlay
          className={hasVideo && cameraEnabled ? "meeting-video-visible" : ""}
          muted={isLocal}
          playsInline
          ref={videoRef}
        />
      )}
      {(!hasVideo || !cameraEnabled) && (
        <div className="meeting-video-placeholder">
          <span className={`meeting-person-avatar ${isLocal ? "avatar-self" : ""}`}>
            {initials(name) || "?"}
          </span>
          {!stream && !isLocal && <span className="meeting-connecting-label">Connecting…</span>}
        </div>
      )}
      <div className="meeting-video-caption">
        <span className="meeting-caption-name">{name}{isLocal ? " (you)" : ""}</span>
      </div>
    </article>
  );
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export default function MeetingRoom({
  meetingId,
  name = "Guest",
  serverUrl = DEFAULT_SERVER_URL,
  iceServers,
  onLeave,
}) {
  const {
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
  } = useWebRTC(meetingId, name, serverUrl, iceServers);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const copyTimerRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!localStream) return;
    setCameraEnabled(localStream.getVideoTracks().some((track) => track.enabled));
    setMicrophoneEnabled(localStream.getAudioTracks().some((track) => track.enabled));
  }, [localStream]);

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  async function copyMeetingLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      if (!mountedRef.current) return;
      setCopied(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        if (mountedRef.current) setCopied(false);
        copyTimerRef.current = null;
      }, 1800);
    } catch (copyError) {
      console.error("Unable to copy the meeting link:", copyError);
    }
  }

  function toggleTrack(type, setEnabled, enabled) {
    const tracks = type === "audio"
      ? localStream?.getAudioTracks()
      : localStream?.getVideoTracks();
    const nextEnabled = !enabled;
    tracks?.forEach((track) => {
      track.enabled = nextEnabled;
    });
    setEnabled(nextEnabled);
  }

  function handleLeave() {
    leave();
    onLeave?.();
  }

  const meetingName = `Meeting ${String(meetingId || "").slice(0, 8)}`;
  const people = [
    { socketId: "local", name, local: true },
    ...participants.map((participant) => ({
      socketId: participant.socketId,
      name: participant.name || "Guest",
    })),
  ];

  return (
    <main className="meeting-room">
      <header className="meeting-room-header">
        <div className="meeting-room-title">
          <strong>{meetingName}</strong>
          <span>
            <i className={`meeting-status-dot ${status === "joined" ? "is-connected" : ""}`} />
            {status === "joined" ? "In this meeting" : status === "error" ? "Connection issue" : "Connecting"}
          </span>
        </div>
        <div className="meeting-room-header-actions">
          <div className="meeting-duration">{formatDuration(elapsedSeconds)}</div>
          <button className="meeting-share-button" onClick={copyMeetingLink} type="button">
            {copied ? <FiCheck size={15} /> : <FiCopy size={15} />}
            {copied ? "Copied" : "Share invite"}
          </button>
          <button
            aria-label="Show participants"
            aria-pressed={peopleOpen}
            className={`meeting-people-button${peopleOpen ? " is-active" : ""}`}
            onClick={() => setPeopleOpen((open) => !open)}
            type="button"
          >
            <FiUsers size={17} />
            <span>{people.length}</span>
          </button>
        </div>
      </header>

      {(error || mediaError) && (
        <div className={`meeting-room-alert${error ? " meeting-room-alert-error" : ""}`} role="status">
          <span>{error || mediaError}</span>
        </div>
      )}
      {screenShareNotification && (
        <div className="meeting-room-alert" role="status" aria-live="polite">
          <span>{screenShareNotification.message}</span>
        </div>
      )}

      <div className={`meeting-room-content${peopleOpen ? " people-panel-open" : ""}`}>
        <section className="meeting-stage" aria-label="Meeting video">
          <div className={`meeting-video-grid${participants.length ? " has-participants" : ""}`}>
            <VideoTile
              cameraEnabled={screenStream ? true : cameraEnabled}
              isLocal
              name={name}
              stream={screenStream || localStream}
            />
            {participants.map((participant) => (
              <VideoTile
                key={participant.socketId}
                name={participant.name || "Guest"}
                stream={participant.stream}
              />
            ))}
          </div>
          {!participants.length && status === "joined" && (
            <div className="meeting-invite-hint">
              <span>Just you for now</span>
              <button onClick={copyMeetingLink} type="button">
                {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
                Invite someone
              </button>
            </div>
          )}
        </section>

        {peopleOpen && (
          <aside className="meeting-people-panel" aria-label="Participants">
            <div className="meeting-people-heading">
              <div><h2>People</h2><span>{people.length} in this meeting</span></div>
              <button aria-label="Close participants" onClick={() => setPeopleOpen(false)} type="button">×</button>
            </div>
            <ul>
              {people.map((person) => (
                <li key={person.socketId}>
                  <span className="meeting-person-avatar small">{initials(person.name) || "?"}</span>
                  <span className="meeting-person-name">{person.name}{person.local ? " (you)" : ""}</span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      <footer className="meeting-controls">
        <div className="meeting-controls-meta">
          <span>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date())}</span>
          <span className="meeting-controls-divider" />
          <span>{meetingName}</span>
        </div>
        <div className="meeting-control-buttons">
          <button
            aria-label={microphoneEnabled ? "Mute microphone" : "Unmute microphone"}
            className={`meeting-control${!microphoneEnabled ? " is-off" : ""}`}
            disabled={!localStream?.getAudioTracks().length}
            onClick={() => toggleTrack("audio", setMicrophoneEnabled, microphoneEnabled)}
            type="button"
          >
            {microphoneEnabled ? <FiMic size={19} /> : <FiMicOff size={19} />}
            <span>{microphoneEnabled ? "Mute" : "Unmute"}</span>
          </button>
          <button
            aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
            className={`meeting-control${!cameraEnabled ? " is-off" : ""}`}
            disabled={!localStream?.getVideoTracks().length}
            onClick={() => toggleTrack("video", setCameraEnabled, cameraEnabled)}
            type="button"
          >
            {cameraEnabled ? <FiVideo size={19} /> : <FiVideoOff size={19} />}
            <span>{cameraEnabled ? "Stop video" : "Start video"}</span>
          </button>
          <button
            aria-label={screenStream ? "Stop screen sharing" : "Share screen"}
            className="meeting-control meeting-screen-control"
            onClick={screenStream ? stopScreenShare : startScreenShare}
            type="button"
          >
            <FiMonitor size={19} />
            <span>{screenStream ? "Stop sharing" : "Share screen"}</span>
          </button>
          <button
            aria-label="Leave meeting"
            className="meeting-leave-button"
            onClick={handleLeave}
            type="button"
          >
            <FiPhoneOff size={19} />
            <span>Leave</span>
          </button>
        </div>
        <div className="meeting-controls-spacer" />
      </footer>
    </main>
  );
}
