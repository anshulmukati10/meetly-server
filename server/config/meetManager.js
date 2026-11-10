import { randomUUID } from "node:crypto";

const meetings = new Map();

export function createMeeting() {
    const meetingId = randomUUID();

    meetings.set(meetingId, {
        id: meetingId,
        participants: new Map(),
        screenSharers: new Map(),
        createdAt: new Date(),
    });

    return meetingId;
}

export function getMeeting(meetingId) {
    return meetings.get(meetingId);
}

export function deleteMeeting(meetingId) {
    return meetings.delete(meetingId);
}

export { meetings };