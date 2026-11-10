# Meetly meeting SDK

React components and a hook for joining video meetings.

## Configuration

Pass `serverUrl` to `MeetingRoom` or `MeetingLobby` to choose the signaling server.
The SDK's default server URL is set at build time from `MEETLY_DEFAULT_SERVER_URL`
in `sdk/.env`; SDK consumers do not need an environment variable for this default.

Pass `iceServers` to `MeetingRoom`, `MeetingLobby`, or as the fourth argument to
`useWebRTC(meetingId, name, serverUrl, iceServers)` to override the default ICE server
list. The default list is set at SDK build time from
`MEETLY_DEFAULT_ICE_SERVERS` in `sdk/.env`. TURN credentials must never be embedded
in the SDK build because published package contents are public; pass credentialed
TURN `iceServers` directly from your application at runtime instead.

`serverUrl` and `iceServers` passed to components/hooks override the build-time
defaults. `getSocket(serverUrl)` requires an explicit URL.
