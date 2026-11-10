import { useState } from "react";
import { FiArrowRight, FiVideo } from "react-icons/fi";
import { getSocket } from "../feature/meetingSocket.js";
import MeetingRoom from "./meetingRoom.jsx";
import { DEFAULT_ICE_SERVERS, DEFAULT_SERVER_URL } from "../config.js";

export default function MeetingLobby({
  serverUrl = DEFAULT_SERVER_URL,
  iceServers = DEFAULT_ICE_SERVERS,
  name: initialName = "Guest",
}) {
  const [name, setName] = useState(initialName);
  const [meetingId, setMeetingId] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  function createMeeting() {
    if (isStarting) return;
    setError("");
    setIsStarting(true);
    try {
      const socket = getSocket(serverUrl);
      if (!socket.connected) socket.connect();
      socket.timeout(10000).emit("meeting:create", { name }, (timeoutError, response) => {
        setIsStarting(false);
        if (timeoutError || !response?.ok) {
          setError(response?.message || "The meeting service did not respond. Please try again.");
          return;
        }
        setMeetingId(response.meetingId);
      });
    } catch (meetingError) {
      setIsStarting(false);
      setError(meetingError.message);
    }
  }

  function joinMeeting(event) {
    event.preventDefault();
    const value = roomInput.trim().replace(/\/+$/, "").split("/").pop();
    if (!value) {
      setError("Enter a meeting link or ID to join.");
      return;
    }
    setError("");
    setMeetingId(value);
  }

  if (meetingId) {
    return (
      <MeetingRoom
        meetingId={meetingId}
        name={name || "Guest"}
        serverUrl={serverUrl}
        iceServers={iceServers}
        onLeave={() => setMeetingId("")}
      />
    );
  }

  return (
    <div className="mt-root meeting-lobby">
      {error && <div className="meeting-alert" role="alert">{error}</div>}
      <section className="meeting-welcome">
        <div className="meeting-welcome-copy">
          <span className="meeting-kicker"><span /> VIDEO MEETING</span>
          <h2>Meet face to face.</h2>
          <p>Start a meeting or join someone with their meeting link.</p>
          <label htmlFor="meeting-name">Your name</label>
          <input
            id="meeting-name"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <button
            className="meeting-primary-action"
            disabled={isStarting}
            onClick={createMeeting}
            type="button"
          >
            <FiVideo size={18} />
            {isStarting ? "Starting…" : "Start a meeting"}
            {!isStarting && <FiArrowRight size={17} />}
          </button>
        </div>
      </section>
      <form className="meeting-join-form" onSubmit={joinMeeting}>
        <input
          aria-label="Meeting link or ID"
          onChange={(event) => setRoomInput(event.target.value)}
          placeholder="Paste meeting link or ID"
          value={roomInput}
        />
        <button aria-label="Join meeting" type="submit"><FiArrowRight size={17} /></button>
      </form>
    </div>
  );
}
