import { createServer } from "http";
import { socketInit } from "./config/socket.js";

const PORT = Number.parseInt(process.env.PORT || "8000", 10);
export const MAX_PARTICIPANTS = Number.parseInt(process.env.MAX_PARTICIPANTS || "6", 10);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
}
if (!Number.isInteger(MAX_PARTICIPANTS) || MAX_PARTICIPANTS < 1) {
    throw new Error("MAX_PARTICIPANTS must be a positive integer.");
}

const httpServer = createServer((request, response) => {
    if (request.url === "/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        return;
    }

    response.writeHead(404);
    response.end();
});
socketInit(httpServer);



httpServer.listen(PORT, () => {
    console.log(`server is running on port ${PORT}`);
});
