import express from "express";
import http from "http";
import path from "path";
import { Server, Socket } from "socket.io";
import { createServer as createViteServer } from "vite";
import { Room, User, Message } from "./src/types.js"; // Use ts extensions or fully-resolved relative imports

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3000;

// Ephemeral memory storage for rooms and messages
const rooms: Record<string, Room> = {};
const roomMessages: Record<string, Message[]> = {};

// Helper to generate a random room ID or match format
function generateSystemMessage(text: string, roomId: string): Message {
  return {
    id: `sys-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    userId: "system",
    userName: "System",
    userAvatar: "",
    text,
    timestamp: Date.now(),
    isSystem: true
  };
}

// Socket.io signalling and events
io.on("connection", (socket: Socket) => {
  let currentRoomId: string | null = null;
  let currentUser: User | null = null;

  // Connection latency measurement ping response
  socket.on("ping", (clientTimestamp: number, ack: (t: number) => void) => {
    if (typeof ack === "function") {
      ack(clientTimestamp);
    }
  });

  socket.on("room:join", ({ roomId, name, email, avatarUrl, cameraActive = false, micActive = false }) => {
    // Basic sanitization
    if (!roomId || !name) return;

    currentRoomId = roomId;
    currentUser = {
      socketId: socket.id,
      name,
      email,
      avatarUrl,
      cameraActive,
      micActive
    };

    // Join Socket.io room
    socket.join(roomId);

    // Initialize room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        hostId: socket.id,
        everyoneCanControl: false,
        videoUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", // Default starter video
        playing: false,
        currentTime: 0,
        lastUpdated: Date.now(),
        playbackSpeed: 1.0,
        screenShare: null,
        members: []
      };
      roomMessages[roomId] = [];
    }

    const room = rooms[roomId];
    
    // Check if user is already in the list
    const existingIndex = room.members.findIndex(m => m.socketId === socket.id);
    if (existingIndex >= 0) {
      room.members[existingIndex] = currentUser;
    } else {
      room.members.push(currentUser);
    }

    // Assign host if the room doesn't have a valid host (e.g. host disconnected)
    const hostActive = room.members.some(m => m.socketId === room.hostId);
    if (!hostActive) {
      room.hostId = socket.id;
    }

    // Add join system message
    const sysMsg = generateSystemMessage(`${name} joined the room.`, roomId);
    roomMessages[roomId].push(sysMsg);
    if (roomMessages[roomId].length > 100) roomMessages[roomId].shift();

    // Send latest state back to the user
    socket.emit("room:state", room);
    socket.emit("room:chat_history", roomMessages[roomId]);

    // Broadcast join to others in the room
    socket.to(roomId).emit("user:joined", {
      user: currentUser,
      systemMessage: sysMsg
    });

    // Notify all members about updated list
    io.to(roomId).emit("room:members_updated", room.members);
    io.to(roomId).emit("room:state_broadcast", room);
  });

  // Handle Playback State changes (Play/Pause/URL / Speed / Control Mode)
  socket.on("room:state_change", (updates: Partial<Room>) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;

    const room = rooms[currentRoomId];
    // Security/Host check
    const isHost = room.hostId === socket.id;
    if (!isHost && !room.everyoneCanControl) {
      return; // Not authorized
    }

    // Update keys
    if (updates.videoUrl !== undefined) {
      room.videoUrl = updates.videoUrl;
      room.currentTime = 0; // Reset time for new URLs
      room.playing = false;
      const sysMsg = generateSystemMessage(`Video source changed to: ${updates.videoUrl}`, currentRoomId);
      roomMessages[currentRoomId].push(sysMsg);
      io.to(currentRoomId).emit("room:chat_broadcast", sysMsg);
    }

    if (updates.playing !== undefined) {
      room.playing = updates.playing;
    }

    if (updates.currentTime !== undefined) {
      room.currentTime = updates.currentTime;
    }

    if (updates.playbackSpeed !== undefined) {
      room.playbackSpeed = updates.playbackSpeed;
    }

    if (updates.everyoneCanControl !== undefined && isHost) {
      room.everyoneCanControl = updates.everyoneCanControl;
      const sysMsg = generateSystemMessage(
        room.everyoneCanControl ? "Everyone can now control the video." : "Host-only control enabled.", 
        currentRoomId
      );
      roomMessages[currentRoomId].push(sysMsg);
      io.to(currentRoomId).emit("room:chat_broadcast", sysMsg);
    }

    room.lastUpdated = Date.now();

    // Broadcast updated state to room
    io.to(currentRoomId).emit("room:state_broadcast", room);
  });

  // Handle Seek commands
  socket.on("room:seek", ({ currentTime }) => {
    if (!currentRoomId || !rooms[currentRoomId] || typeof currentTime !== "number") return;

    const room = rooms[currentRoomId];
    const isHost = room.hostId === socket.id;
    if (!isHost && !room.everyoneCanControl) return;

    room.currentTime = currentTime;
    room.lastUpdated = Date.now();

    // Broadcast seek event to sync everyone
    io.to(currentRoomId).emit("room:seek_broadcast", { currentTime, lastUpdated: room.lastUpdated });
  });

  // Handle user toggling micro/camera states
  socket.on("user:status_change", ({ cameraActive, micActive }) => {
    if (!currentRoomId || !rooms[currentRoomId] || !currentUser) return;

    const room = rooms[currentRoomId];
    const member = room.members.find(m => m.socketId === socket.id);
    if (member) {
      member.cameraActive = cameraActive;
      member.micActive = micActive;
      currentUser.cameraActive = cameraActive;
      currentUser.micActive = micActive;

      io.to(currentRoomId).emit("room:members_updated", room.members);
    }
  });

  // Host transfer permissions
  socket.on("room:transfer_host", ({ targetSocketId }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;

    const room = rooms[currentRoomId];
    if (room.hostId !== socket.id) return; // Only current host can transfer

    const targetUser = room.members.find(m => m.socketId === targetSocketId);
    if (!targetUser) return;

    room.hostId = targetSocketId;
    const sysMsg = generateSystemMessage(`Host permissions transferred to ${targetUser.name}.`, currentRoomId);
    roomMessages[currentRoomId].push(sysMsg);

    io.to(currentRoomId).emit("room:state_broadcast", room);
    io.to(currentRoomId).emit("room:chat_broadcast", sysMsg);
  });

  // Chat System
  socket.on("room:chat", ({ text }) => {
    if (!currentRoomId || !rooms[currentRoomId] || !currentUser) return;

    const msg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      userId: currentUser.socketId,
      userName: currentUser.name,
      userAvatar: currentUser.avatarUrl,
      text,
      timestamp: Date.now()
    };

    roomMessages[currentRoomId].push(msg);
    if (roomMessages[currentRoomId].length > 100) roomMessages[currentRoomId].shift();

    io.to(currentRoomId).emit("room:chat_broadcast", msg);
  });

  // Screen Share state toggle
  socket.on("room:screen_share", ({ active, sharerName }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;

    const room = rooms[currentRoomId];
    if (active) {
      room.screenShare = {
        sharerId: socket.id,
        sharerName: sharerName || "Participant",
        active: true
      };
      const sysMsg = generateSystemMessage(`${sharerName} started screen sharing.`, currentRoomId);
      roomMessages[currentRoomId].push(sysMsg);
      io.to(currentRoomId).emit("room:chat_broadcast", sysMsg);
    } else {
      if (room.screenShare?.sharerId === socket.id) {
        room.screenShare = null;
        const sysMsg = generateSystemMessage(`${sharerName} stopped screen sharing.`, currentRoomId);
        roomMessages[currentRoomId].push(sysMsg);
        io.to(currentRoomId).emit("room:chat_broadcast", sysMsg);
      }
    }

    io.to(currentRoomId).emit("room:state_broadcast", room);
  });

  // WebRTC Signal proxying
  socket.on("webrtc:signal", ({ targetSocketId, signal }) => {
    if (!currentRoomId) return;
    io.to(targetSocketId).emit("webrtc:signal", {
      senderSocketId: socket.id,
      signal
    });
  });

  // Disconnect handling
  socket.on("disconnect", () => {
    if (!currentRoomId || !rooms[currentRoomId] || !currentUser) return;

    const roomId = currentRoomId;
    const room = rooms[roomId];

    // Remove member
    room.members = room.members.filter(m => m.socketId !== socket.id);

    const leaveMsg = generateSystemMessage(`${currentUser.name} left the room.`, roomId);
    roomMessages[roomId].push(leaveMsg);

    // If screen-sharing user disconnects
    if (room.screenShare?.sharerId === socket.id) {
      room.screenShare = null;
    }

    if (room.members.length === 0) {
      // Cleanup room if empty
      delete rooms[roomId];
      delete roomMessages[roomId];
    } else {
      // Reassign host if needed
      if (room.hostId === socket.id) {
        room.hostId = room.members[0].socketId;
        const sysAssign = generateSystemMessage(`${room.members[0].name} has been promoted to Host.`, roomId);
        roomMessages[roomId].push(sysAssign);
        io.to(roomId).emit("room:chat_broadcast", sysAssign);
      }

      // Notify remaining members
      socket.to(roomId).emit("user:left", {
        userId: socket.id,
        systemMessage: leaveMsg
      });
      io.to(roomId).emit("room:members_updated", room.members);
      io.to(roomId).emit("room:state_broadcast", room);
    }
  });
});

// Serve health status
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    rooms: Object.keys(rooms).length,
    timestamp: Date.now()
  });
});

// Serve direct playable stream link resolved server-side from hdstream4u
app.get("/api/hdstream-resolve", async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  try {
    let embedUrl = url;
    if (url.includes("hdstream4u.com/file/")) {
      const match = url.match(/hdstream4u\.com\/file\/([a-zA-Z0-9]+)/i);
      if (match) {
        embedUrl = `https://hdstream4u.com/embed/${match[1]}`;
      }
    }

    const response = await fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://hdstream4u.com/"
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Downstream returned status ${response.status}` });
    }

    const html = await response.text();

    const startIndex = html.indexOf("eval(function(p,a,c,k,e,d)");
    if (startIndex === -1) {
      return res.status(404).json({ error: "No packed player configuration found in stream page" });
    }

    const endIndex = html.indexOf("</script>", startIndex);
    if (endIndex === -1) {
      return res.status(500).json({ error: "Missing player configuration end marker" });
    }

    let packedCode = html.substring(startIndex, endIndex).trim();
    if (packedCode.endsWith(";")) {
      packedCode = packedCode.slice(0, -1);
    }

    const executableCode = "dummyEval(" + packedCode.substring(5);

    let unpackedValue = "";
    const dummyEval = (code: string) => {
      unpackedValue = code;
    };

    // Safely evaluate local decoder mapping
    eval(executableCode);

    if (!unpackedValue) {
      return res.status(500).json({ error: "Unpacking configuration returned empty result" });
    }

    // Capture standard formats
    const m3u8Match = unpackedValue.match(/(https?:\/\/[^\s"'`]+(?:master\.m3u8|index\.m3u8)[^\s"'`]*)/i);
    const anyM3u8Match = unpackedValue.match(/(https?:\/\/[^\s"'`]+\.m3u8[^\s"'`]*)/i);
    const mp4Match = unpackedValue.match(/(https?:\/\/[^\s"'`]+\.mp4[^\s"'`]*)/i);

    const resolvedUrl = m3u8Match?.[1] || anyM3u8Match?.[1] || mp4Match?.[1] || null;

    if (!resolvedUrl) {
      return res.status(404).json({ error: "No direct playable video stream found in player" });
    }

    const titleExtract = unpackedValue.match(/title:\s*"([^"]+)"/)?.[1] || "HDStream4U Stream";
    const imageExtract = unpackedValue.match(/image:\s*"([^"]+)"/)?.[1] || null;

    return res.json({
      resolvedUrl,
      title: titleExtract,
      image: imageExtract
    });
  } catch (err: any) {
    console.error("Failed resolving stream server-side:", err);
    return res.status(500).json({ error: `Server error resolving stream link: ${err.message}` });
  }
});

// Configure Vite integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    // Build serves out of /dist
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Watch Party Server] operational on http://localhost:${PORT}`);
  });
}

startServer();
