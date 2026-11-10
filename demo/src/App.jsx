import { useState } from "react";
import { getSocket, MeetingRoom } from "your-meeting-sdk";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

export default function App() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState(window.location.hash.slice(1));
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = (e) => {
    e.preventDefault();
    setError("");

    const enteredRoomId = roomId.trim();
    if (enteredRoomId) {
      window.location.hash = enteredRoomId;
      setRoomId(enteredRoomId);
      setJoined(true);
      return;
    }

    try {
      const socket = getSocket(SERVER_URL);
      if (!socket.connected) socket.connect();
      socket.timeout(10000).emit(
        "meeting:create",
        { name: name || "Guest" },
        (timeoutError, response) => {
          if (timeoutError || !response?.ok) {
            setError(response?.message || "The meeting service did not respond. Please try again.");
            return;
          }
          window.location.hash = response.meetingId;
          setRoomId(response.meetingId);
          setJoined(true);
        },
      );
    } catch (createError) {
      setError(createError.message);
    }
  };

  if (joined) {
    return (
      <div style={{ height: "100%" }}>
        <MeetingRoom
          meetingId={roomId}
          name={name || "Guest"}
          serverUrl={SERVER_URL}
          onLeave={() => setJoined(false)}
        />
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <form onSubmit={handleJoin} style={styles.card}>
        <h1 style={{ margin: 0 }}>Join a meeting</h1>
        <input
          style={styles.input}
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          style={styles.input}
          placeholder="Room ID (leave empty to create one)"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        />
        <button style={styles.button} type="submit">
          {roomId.trim() ? "Join" : "Create and join"}
        </button>
        {error && <p role="alert">{error}</p>}
        <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
          After joining, share the page URL so others join the same room.
        </p>
      </form>
    </div>
  );
}

const styles = {
  page: { height: "100%", display: "grid", placeItems: "center" },
  card: {
    display: "flex", flexDirection: "column", gap: 12, width: 320,
    padding: 24, background: "#17171f", borderRadius: 12,
  },
  input: {
    padding: "10px 12px", borderRadius: 8, border: "1px solid #333",
    background: "#0b0b0f", color: "#fff", fontSize: 14,
  },
  button: {
    padding: "10px 12px", borderRadius: 8, border: 0,
    background: "#4f46e5", color: "#fff", fontSize: 14, cursor: "pointer",
  },
};