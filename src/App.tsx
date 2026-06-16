import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useWebRTC } from "./lib/useWebRTC";
import { AuthScreen } from "./components/AuthScreen";
import { Header } from "./components/Header";
import { VideoPlayer } from "./components/VideoPlayer";
import { Controls } from "./components/Controls";
import { Sidebar } from "./components/Sidebar";
import { WebcamBubbles } from "./components/WebcamBubbles";
import { ScreenShareView } from "./components/ScreenShareView";
import { Room, Message } from "./types";
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Play, Pause, Flame, Sparkles, MonitorPlay, MessageSquare, Maximize, Minimize } from "lucide-react";
import { FloatingWebcams } from "./components/FloatingWebcams";

export default function App() {
  // Authentication & Presence State
  const [myUser, setMyUser] = useState<{ name: string; avatarUrl: string; email?: string } | null>(null);
  const [roomId, setRoomId] = useState("");
  const [connected, setConnected] = useState(false);
  const [ping, setPing] = useState<number | null>(null);

  // Active sync states
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [viewMode, setViewMode] = useState<"player" | "screen">("player");

  // Local media stream status controls
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(true);
  const [screenActive, setScreenActive] = useState(false);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);

  // Socket client reference
  const [socket, setSocket] = useState<Socket | null>(null);

  // Local video file screening state
  const [localVideoFile, setLocalVideoFile] = useState<{ name: string; blobUrl: string } | null>(null);

  // Responsive view layout state for mobile devices (Android)
  const [mobileTab, setMobileTab] = useState<"lounge" | "chat">("lounge");
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const mobileTabRef = useRef<"lounge" | "chat">("lounge");

  const [isFullscreen, setIsFullscreen] = useState(false);
  const mediaContainerRef = useRef<HTMLDivElement | null>(null);

  // Sync browser fullscreen status
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!mediaContainerRef.current) return;
    if (!document.fullscreenElement) {
      mediaContainerRef.current.requestFullscreen().catch((err) => {
        console.error("Error entering browser fullscreen:", err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error("Error exiting browser fullscreen:", err);
      });
    }
  };

  useEffect(() => {
    mobileTabRef.current = mobileTab;
    if (mobileTab === "chat") {
      setUnreadMessagesCount(0);
    }
  }, [mobileTab]);

  // Resolve room parameter from URL on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam) {
      setRoomId(roomParam.trim().toUpperCase());
    }
  }, []);

  // 1. Establish socket connection once user authenticates
  useEffect(() => {
    if (!myUser) return;

    // Connect to port 3000 (same as server host)
    const socketInstance = io({
      reconnectionDelayMax: 10000,
      autoConnect: true
    });

    setSocket(socketInstance);

    let pingInterval: any = null;

    socketInstance.on("connect", () => {
      setConnected(true);
      
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        const start = Date.now();
        socketInstance.emit("ping", start, (recv: any) => {
          const latency = Date.now() - recv;
          setPing(latency);
        });
      }, 3000);
    });

    socketInstance.on("disconnect", () => {
      setConnected(false);
      setPing(null);
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    });

    // Sync room records and user identities
    socketInstance.on("room:state", (initialRoom: Room) => {
      setRoom(initialRoom);
      // Auto-focus view mode depending on if sharing is active
      if (initialRoom.screenShare?.active) {
        setViewMode("screen");
      } else {
        setViewMode("player");
      }
    });

    // Synchronize updates
    socketInstance.on("room:state_broadcast", (updatedRoom: Room) => {
      setRoom(updatedRoom);
      if (updatedRoom.screenShare?.active) {
        // Auto toggler on screenshare start
        if (updatedRoom.screenShare.sharerId !== socketInstance.id) {
          setViewMode("screen");
        }
      } else {
        setViewMode("player");
      }
    });

    // Synchronize chat history logs
    socketInstance.on("room:chat_history", (history: Message[]) => {
      setMessages(history);
    });

    socketInstance.on("room:chat_broadcast", (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
      if (mobileTabRef.current !== "chat") {
        setUnreadMessagesCount((curr) => curr + 1);
      }
    });

    socketInstance.on("user:joined", ({ user, systemMessage }) => {
      if (systemMessage) {
        setMessages((prev) => [...prev, systemMessage]);
        if (mobileTabRef.current !== "chat") {
          setUnreadMessagesCount((curr) => curr + 1);
        }
      }
    });

    socketInstance.on("user:left", ({ userId, systemMessage }) => {
      if (systemMessage) {
        setMessages((prev) => [...prev, systemMessage]);
        if (mobileTabRef.current !== "chat") {
          setUnreadMessagesCount((curr) => curr + 1);
        }
      }
    });

    return () => {
      if (pingInterval) clearInterval(pingInterval);
      socketInstance.disconnect();
    };
  }, [myUser]);

  // 2. Setup WebRTC peer-to-peer AV mesh hook
  const {
    localStream,
    localScreenStream,
    remoteStreams,
    remoteScreenStreams
  } = useWebRTC({
    socket,
    roomId,
    myUser,
    cameraActive,
    micActive,
    screenShareActive: screenActive,
    onScreenShareStateChange: setScreenActive,
    onScreenShareError: (err) => {
      console.error("Screen sharing failed in hook:", err);
      let errorMsg = "Access to screen recording was denied.";
      if (err?.message?.includes("permissions policy") || err?.name === "NotAllowedError" || err?.message?.includes("disallowed")) {
        errorMsg = "Screen sharing is restricted by browser security policies in this frame. Open the app in a new tab or grant permissions to share your screen.";
      } else if (err?.message) {
        errorMsg = `Screen sharing failed: ${err.message}`;
      }
      setScreenShareError(errorMsg);
    }
  });

  // 3. Auto-rejoin room if socket reconnects
  useEffect(() => {
    if (!socket || !roomId || !myUser) return;

    const handleRejoin = () => {
      socket.emit("room:join", {
        roomId,
        name: myUser.name,
        email: myUser.email,
        avatarUrl: myUser.avatarUrl,
        cameraActive,
        micActive
      });
    };

    if (socket.connected) {
      handleRejoin();
    }

    socket.on("connect", handleRejoin);

    return () => {
      socket.off("connect", handleRejoin);
    };
  }, [socket, roomId, myUser, cameraActive, micActive]);

  // 4. Lobby actions
  const handleCreateRoom = () => {
    // Generate a 6 character uppercase alphabetic room identifier
    const uniqueId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(uniqueId);
    
    // Update browser URL query params dynamically so users can instantly share
    window.history.pushState({}, "", `?room=${uniqueId}`);
  };

  const handleJoinManual = (manualId: string) => {
    if (!manualId.trim()) return;
    const cleanId = manualId.trim().toUpperCase();
    setRoomId(cleanId);
    window.history.pushState({}, "", `?room=${cleanId}`);
  };

  const handleExitRoom = () => {
    if (socket) {
      socket.disconnect();
    }
    setRoom(null);
    setRoomId("");
    setMessages([]);
    setScreenActive(false);
    setCameraActive(false);
    setMicActive(true);
    setViewMode("player");
    // Clear URL query params
    window.history.pushState({}, "", window.location.pathname);
    
    // Re-connect a new slot if user re-enters later
    if (myUser) {
      const socketInstance = io();
      setSocket(socketInstance);
    }
  };

  // 5. Playback events dispatcher
  const handlePlayerStateChange = (updates: Partial<Room>) => {
    if (!socket) return;
    socket.emit("room:state_change", updates);
  };

  const handleLocalFileSelect = (file: File) => {
    if (localVideoFile) {
      URL.revokeObjectURL(localVideoFile.blobUrl);
    }
    const blobUrl = URL.createObjectURL(file);
    setLocalVideoFile({ name: file.name, blobUrl });

    // Automatically trigger screening URL update if they can control
    const canControl = room ? (room.hostId === socket?.id || room.everyoneCanControl) : false;
    if (canControl) {
      socket.emit("room:state_change", { videoUrl: `local://${file.name}` });
    }
  };

  const handleSeek = (time: number) => {
    if (!socket) return;
    socket.emit("room:seek", { currentTime: time });
  };

  const handleTransferHost = (targetSocketId: string) => {
    if (!socket) return;
    socket.emit("room:transfer_host", { targetSocketId });
  };

  const handleSendMessage = (text: string) => {
    if (!socket) return;
    socket.emit("room:chat", { text });
  };

  // 6. Action toggles
  const toggleMic = () => {
    setMicActive(!micActive);
  };

  const toggleCamera = () => {
    setCameraActive(!cameraActive);
  };

  const toggleScreenShare = () => {
    setScreenActive(!screenActive);
  };

  const handlePlayToggle = () => {
    if (!room) return;
    handlePlayerStateChange({ playing: !room.playing });
  };

  // Helper check
  const isHost = room ? room.hostId === socket?.id : false;
  const canControl = room ? (isHost || room.everyoneCanControl) : false;

  // First screen selection: Authenticate
  if (!myUser) {
    return <AuthScreen onLogin={setMyUser} />;
  }

  return (
    <div className="min-h-screen bg-[#0A0B10] text-gray-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white relative overflow-hidden">
      {/* Mesh Gradient Background Elements */}
      <div className="absolute top-[-100px] left-[-100px] w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[-50px] right-[-50px] w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[150px] pointer-events-none z-0"></div>

      {/* Top Banner and Navigation bar */}
      <Header
        room={room}
        currentUserSocketId={socket?.id || null}
        myUser={myUser}
        connected={connected}
        ping={ping}
        onTransferHost={handleTransferHost}
        onExitRoom={handleExitRoom}
      />

      {/* Main Sandbox router block */}
      {!room ? (
        /* Dynamic Welcome Dashboard / Lobby */
        <main className="flex-grow flex-1 w-full max-w-md mx-auto flex flex-col justify-center items-center px-4 py-8 sm:py-12 text-center select-none animate-in fade-in zoom-in-95 duration-200 relative z-10 min-h-[calc(100vh-100px)]">
          <div className="mb-4 inline-flex gap-2.5 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl shadow-inner relative backdrop-blur-md">
            <Sparkles className="w-8 h-8 text-indigo-400" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
          </div>

          <h2 className="text-2xl font-black tracking-tight mb-2 text-white">Create or Join a Lounge</h2>
          <p className="text-gray-400 text-sm max-w-sm mb-6 leading-relaxed">
            Invite friends to play media files, share screens, chat, and communicate securely over low-latency WebRTC streams.
          </p>

          <div className="w-full bg-white/5 border border-white/10 backdrop-blur-2xl p-6 rounded-3xl shadow-2xl space-y-6 relative">
            {/* Action 1: Create room instantly */}
            <div className="space-y-3">
              <button
                id="lobby-create-room-btn"
                onClick={handleCreateRoom}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-600/30 cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wide"
              >
                <Flame className="w-4 h-4 text-amber-300 fill-current animate-pulse" />
                Initialize Instant Party
              </button>
            </div>

            {/* Separator */}
            <div className="flex items-center gap-3">
              <div className="flex-grow h-[1px] bg-white/10" />
              <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-gray-500">OR JOIN WITH CODE</span>
              <div className="flex-grow h-[1px] bg-white/10" />
            </div>

            {/* Action 2: Join room using ID code */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const cleanId = (e.currentTarget.elements.namedItem("roomCode") as HTMLInputElement).value;
                handleJoinManual(cleanId);
              }}
              className="flex gap-2"
            >
              <input
                name="roomCode"
                id="join-code-input"
                type="text"
                placeholder="E.g. AX7B9"
                required
                maxLength={10}
                className="flex-1 bg-black/40 border border-white/10 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 rounded-xl px-4 text-center font-mono font-extrabold uppercase tracking-widest text-slate-100 placeholder-slate-700 focus:outline-none transition-all py-3 text-sm"
              />
              <button
                id="lobby-join-room-btn"
                type="submit"
                className="px-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-150 cursor-pointer"
              >
                Join
              </button>
            </form>
          </div>
        </main>
      ) : (
        /* Room Viewport Screen Layout */
        <>
          <main className="flex-grow flex flex-col lg:flex-row h-[calc(100vh-124px)] lg:h-[calc(100vh-64px)] overflow-hidden z-10 relative">
            
            {/* Unified Media Player & Controls Section: stationary video viewport on top, dynamic tab contents scrollable underneath */}
            <section className="flex-1 flex flex-col min-w-0 h-full overflow-hidden select-none">
              
              {/* Top sticky/fixed aspect-video media view block for mobile + tablet, standard block on desktop */}
              <div 
                ref={mediaContainerRef}
                className="w-full shrink-0 bg-black/95 border-b border-white/10 shadow-2xl relative z-30 aspect-video lg:rounded-2xl lg:mt-3 lg:mx-3 lg:w-[calc(100%-24px)] lg:border lg:border-white/10 lg:p-1 lg:bg-black/45"
              >
                {/* Fullscreen view toggle overlay */}
                <div className="absolute top-3 right-3 z-40 flex items-center gap-1 bg-black/85 border border-white/15 p-1 rounded-xl shadow-lg backdrop-blur-md">
                  <button
                    id="viewport-toggle-fullscreen"
                    type="button"
                    onClick={toggleFullscreen}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                    title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                  >
                    {isFullscreen ? (
                      <>
                        <Minimize className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Exit</span>
                      </>
                    ) : (
                      <>
                        <Maximize className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Theater</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Floating webcams theater / full screen layer overlay */}
                {isFullscreen && (
                  <FloatingWebcams
                    room={room}
                    currentUserSocketId={socket?.id || null}
                    localStream={localStream}
                    remoteStreams={remoteStreams}
                    cameraActive={cameraActive}
                    micActive={micActive}
                    isFullscreenOverlay={true}
                  />
                )}
                
                {/* View Mode Tabs (if screenshare active) */}
                {room.screenShare?.active && (
                  <div className="absolute top-3 left-3 z-40 flex bg-black/85 border border-white/15 p-1 rounded-xl gap-1 backdrop-blur-md shadow-lg">
                    <button
                      id="tab-view-player"
                      onClick={() => setViewMode("player")}
                      className={`px-3 py-1 text-[10px] sm:text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                        viewMode === "player"
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      📺 Sync Player
                    </button>
                    <button
                      id="tab-view-screen"
                      onClick={() => setViewMode("screen")}
                      className={`px-3 py-1 text-[10px] sm:text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                        viewMode === "screen"
                          ? "bg-indigo-600 text-white animate-pulse shadow-md shadow-indigo-500/20"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      🖥️ Screen ({room.screenShare.sharerName})
                    </button>
                  </div>
                )}

                {/* Main player/screen mount (Exactly 1 instantiation for stability) */}
                <div className="w-full h-full relative">
                  {viewMode === "player" ? (
                    <VideoPlayer
                      room={room}
                      currentUserSocketId={socket?.id || null}
                      isHost={isHost}
                      onPlayerStateChange={handlePlayerStateChange}
                      onSeek={handleSeek}
                      socket={socket}
                      localVideoFile={localVideoFile}
                      onLocalFileSelect={handleLocalFileSelect}
                    />
                  ) : (
                    <ScreenShareView
                      screenShare={room.screenShare}
                      currentUserSocketId={socket?.id || null}
                      localScreenStream={localScreenStream}
                      remoteScreenStreams={remoteScreenStreams}
                      onStopSharing={toggleScreenShare}
                    />
                  )}
                </div>

                {/* Direct alert banner for Screenshare error */}
                {screenShareError && (
                  <div className="absolute inset-x-0 bottom-0 bg-red-950/95 border-t border-red-500/30 text-red-200 p-2.5 flex items-center justify-between text-xs font-medium z-40 backdrop-blur select-none">
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="truncate">{screenShareError}</span>
                    </div>
                    <div className="flex gap-1.5 shrink-0 ml-2">
                      <button
                        onClick={() => window.open(window.location.href, "_blank")}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] rounded cursor-pointer"
                      >
                        New Tab
                      </button>
                      <button
                        onClick={() => setScreenShareError(null)}
                        className="px-2 py-1 bg-white/10 hover:bg-white/15 text-slate-300 font-bold text-[10px] rounded cursor-pointer"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Sub-content Container below the pinned player */}
              <div className="flex-1 min-h-0 flex flex-col relative w-full">
                
                {/* 1. Lounge Controls Viewport Overlay (shown when mobileTab === lounge) */}
                <div className={`flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 space-y-4 ${
                  mobileTab === "lounge" ? "block" : "hidden lg:block"
                }`}>
                  
                  {/* Quick Media Action Control Buttons Overlay (Mic, Camera, Screen, Host Play/Pause) styled to integrate video feeds directly */}
                  <div className="bg-white/5 border border-white/10 backdrop-blur-2xl rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Micro Toggle */}
                      <button
                        id="media-toggle-mic"
                        onClick={toggleMic}
                        className={`p-2.5 rounded-xl border transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                          micActive
                            ? "bg-indigo-600/20 border-indigo-500/30 text-indigo-400 hover:bg-slate-800/50"
                            : "bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30"
                        }`}
                        title={micActive ? "Mute Microphone" : "Unmute Microphone"}
                      >
                        {micActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                      </button>

                      {/* Camera Toggle */}
                      <button
                        id="media-toggle-cam"
                        onClick={toggleCamera}
                        className={`p-2.5 rounded-xl border transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                          cameraActive
                            ? "bg-indigo-600/20 border-indigo-500/30 text-indigo-400 hover:bg-slate-800/50"
                            : "bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30"
                        }`}
                        title={cameraActive ? "Disable Front Camera" : "Enable Front Camera"}
                      >
                        {cameraActive ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                      </button>

                      {/* Screen Share Toggle */}
                      <button
                        id="media-toggle-screenshare"
                        disabled={room.screenShare?.active && room.screenShare.sharerId !== socket?.id}
                        onClick={toggleScreenShare}
                        className={`p-2.5 rounded-xl border transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100 cursor-pointer ${
                          screenActive
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30"
                            : "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"
                        }`}
                        title={screenActive ? "Stop screen sharing" : "Share desktop, application window, or tab"}
                      >
                        {screenActive ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                      </button>
                    </div>

                    {/* Camera Circles and bubbles integrated directly in the same block */}
                    <div className="w-full md:w-auto flex justify-center py-2">
                      <WebcamBubbles
                        room={room}
                        currentUserSocketId={socket?.id || null}
                        localStream={localStream}
                        remoteStreams={remoteStreams}
                        cameraActive={cameraActive}
                        micActive={micActive}
                      />
                    </div>

                    {/* Host Media Control Toggles */}
                    {canControl && (
                      <button
                        id="media-toggle-playback"
                        onClick={handlePlayToggle}
                        className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold px-4 py-2 text-xs rounded-xl transition-all cursor-pointer shadow-lg shadow-indigo-600/30 tracking-wider uppercase shrink-0"
                      >
                        {room.playing ? (
                          <>
                            <Pause className="w-4 h-4 fill-white animate-pulse" />
                            <span>Pause Lounge</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 fill-white" />
                            <span>Resume Lounge</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Custom streams input card */}
                  <Controls
                    room={room}
                    currentUserSocketId={socket?.id || null}
                    isHost={isHost}
                    onPlayerStateChange={handlePlayerStateChange}
                    onSeek={handleSeek}
                    localVideoFile={localVideoFile}
                    onLocalFileSelect={handleLocalFileSelect}
                    setLocalVideoFile={setLocalVideoFile}
                  />
                </div>

                {/* 2. Embedded Mobile Chat & People navigation pane below player */}
                <div className={`flex-1 min-h-0 lg:hidden ${
                  mobileTab === "chat" ? "block" : "hidden"
                }`}>
                  <Sidebar
                    room={room}
                    currentUserSocketId={socket?.id || null}
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    onTransferHost={handleTransferHost}
                    micActive={micActive}
                    cameraActive={cameraActive}
                    onToggleMic={toggleMic}
                    onToggleCamera={toggleCamera}
                    localStream={localStream}
                    remoteStreams={remoteStreams}
                    className="border-none w-full bg-transparent h-full"
                  />
                </div>

              </div>

            </section>

            {/* Desktop persistent Sidebar panel */}
            <Sidebar
              room={room}
              currentUserSocketId={socket?.id || null}
              messages={messages}
              onSendMessage={handleSendMessage}
              onTransferHost={handleTransferHost}
              micActive={micActive}
              cameraActive={cameraActive}
              onToggleMic={toggleMic}
              onToggleCamera={toggleCamera}
              localStream={localStream}
              remoteStreams={remoteStreams}
              className="hidden lg:flex"
            />
          </main>

          {/* Mobile Bottom Floating Dock Navigation */}
          <div className="lg:hidden shrink-0 bg-[#0E0F16] border-t border-white/10 px-6 py-3 flex items-center justify-around gap-4 z-40 backdrop-blur-2xl">
            <button
              id="mobile-nav-lounge"
              onClick={() => setMobileTab("lounge")}
              className={`flex-grow flex flex-col items-center justify-center gap-1 py-1 text-[11px] font-bold select-none cursor-pointer transition-colors ${
                mobileTab === "lounge" ? "text-indigo-400 font-black scale-105" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <MonitorPlay className={`w-5 h-5 ${mobileTab === "lounge" ? "stroke-[2.5px]" : "stroke-[1.8px]"}`} />
              <span>Watch Lounge</span>
            </button>
            
            <button
              id="mobile-nav-chat"
              onClick={() => setMobileTab("chat")}
              className={`flex-grow flex flex-col items-center justify-center gap-1 py-1 text-[11px] font-bold select-none cursor-pointer transition-colors relative ${
                mobileTab === "chat" ? "text-indigo-400 font-black scale-105" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <MessageSquare className={`w-5 h-5 ${mobileTab === "chat" ? "stroke-[2.5px]" : "stroke-[1.8px]"}`} />
              <span>Chat & People</span>
              {unreadMessagesCount > 0 && (
                <span className="absolute top-0 right-1/4 translate-x-4 bg-indigo-600 text-white rounded-full text-[9px] px-1.5 py-0.2 font-extrabold shadow-md shadow-indigo-600/40 animate-bounce">
                  {unreadMessagesCount}
                </span>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
