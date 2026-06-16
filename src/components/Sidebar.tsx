import React, { useState, useRef, useEffect } from "react";
import { Users, MessageSquare, Send, Crown, Mic, MicOff, Video, VideoOff, Volume2, Gamepad, Share2, Check } from "lucide-react";
import { User, Room, Message } from "../types";
import { FloatingWebcams } from "./FloatingWebcams";

interface SidebarProps {
  room: Room | null;
  currentUserSocketId: string | null;
  messages: Message[];
  onSendMessage: (text: string) => void;
  onTransferHost: (targetSocketId: string) => void;
  micActive: boolean;
  cameraActive: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  localStream: MediaStream | null;
  remoteStreams: { [socketId: string]: MediaStream };
  className?: string;
}

const QUICK_EMOJIS = ["🍿", "😂", "🎉", "🔥", "👍", "😮", "❤️", "😭"];

export function Sidebar({
  room,
  currentUserSocketId,
  messages,
  onSendMessage,
  onTransferHost,
  micActive,
  cameraActive,
  onToggleMic,
  onToggleCamera,
  localStream,
  remoteStreams,
  className = ""
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "participants">("chat");
  const [inputText, setInputText] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat to latest messages on entry or tabs swap
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText("");
  };

  const handleQuickEmoji = (emoji: string) => {
    onSendMessage(emoji);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

    return (
    <aside className={`w-full lg:w-80 bg-white/5 backdrop-blur-2xl border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col h-full lg:h-[85vh] rounded-none lg:rounded-3xl overflow-hidden select-none relative z-10 ${className}`}>
      {/* Tab Navigation header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-1 gap-1 shrink-0">
        <div className="flex flex-1 gap-1">
          <button
            id="sidebar-tab-chat"
            onClick={() => setActiveTab("chat")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "chat"
                ? "bg-white/5 border border-white/10 text-indigo-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
            {messages.filter(m => !m.isSystem).length > 0 && (
              <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] px-1.5 py-0.2 rounded-full font-mono">
                {messages.filter(m => !m.isSystem).length}
              </span>
            )}
          </button>
          <button
            id="sidebar-tab-participants"
            onClick={() => setActiveTab("participants")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "participants"
                ? "bg-white/5 border border-white/10 text-indigo-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>People</span>
            <span className="bg-white/10 text-slate-300 text-[9px] px-1.5 py-0.2 rounded-full font-mono">
              {room?.members.length || 0}
            </span>
          </button>
        </div>

        {/* Persistent Mic & Camera controls */}
        <div className="flex items-center gap-1.5 px-1.5 border-l border-white/10 shrink-0">
          <button
            id="sidebar-toggle-mic"
            onClick={onToggleMic}
            className={`p-1.5 rounded-lg border transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center ${
              micActive
                ? "bg-indigo-600/20 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/30"
                : "bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30"
            }`}
            title={micActive ? "Mute Microphone" : "Unmute Microphone"}
          >
            {micActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
          </button>

          <button
            id="sidebar-toggle-cam"
            onClick={onToggleCamera}
            className={`p-1.5 rounded-lg border transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center ${
              cameraActive
                ? "bg-indigo-600/20 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/30"
                : "bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30"
            }`}
            title={cameraActive ? "Disable Front Camera" : "Enable Front Camera"}
          >
            {cameraActive ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Tabs Content dynamic screens */}
      <div className="flex-1 flex flex-col min-h-0 bg-transparent">
        {activeTab === "chat" ? (
          <div className="flex-1 flex flex-col min-h-0 relative">
            {/* Scrollable messages history container */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 max-w-[200px] mx-auto space-y-2">
                  <MessageSquare className="w-8 h-8 text-slate-700" />
                  <p className="text-xs font-semibold text-slate-400">Quiet Lounge</p>
                  <p className="text-[11px] text-slate-550">Say hello and start the conversation!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  if (msg.isSystem) {
                    return (
                      <div
                        id={`chat-msg-${msg.id}`}
                        key={msg.id}
                        className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-center font-mono text-[10px] text-indigo-400 flex items-center justify-center gap-2"
                      >
                        <Volume2 className="w-3.5 h-3.5 opacity-85" />
                        <span>{msg.text}</span>
                      </div>
                    );
                  }

                  const isMe = msg.userId === currentUserSocketId;

                  return (
                    <div
                      id={`chat-msg-${msg.id}`}
                      key={msg.id}
                      className={`flex gap-2.5 max-w-[85%] ${isMe ? "ml-auto flex-row-reverse" : "mr-auto"}`}
                    >
                      {/* Avatar */}
                      <img
                        src={msg.userAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${msg.userName}`}
                        alt={msg.userName}
                        referrerPolicy="no-referrer"
                        className="w-7 h-7 object-contain bg-black/40 rounded border border-white/10 shrink-0"
                      />

                      {/* Content block */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[11px] font-bold ${isMe ? "text-indigo-400" : "text-slate-300"}`}>
                            {msg.userName}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono">
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>
                        <div className={`p-2.5 text-xs rounded-2xl ${
                          isMe 
                            ? "bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-500/15" 
                            : "bg-white/5 text-slate-200 border border-white/5 rounded-tl-none"
                        } break-all`}>
                          {msg.text}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Floating Picture-in-Picture webcam feeds in Chat */}
            <FloatingWebcams
              room={room}
              currentUserSocketId={currentUserSocketId}
              localStream={localStream}
              remoteStreams={remoteStreams}
              cameraActive={cameraActive}
              micActive={micActive}
            />

            {/* Quick reaction bar */}
            <div className="px-4 py-1.5 bg-white/5 border-t border-b border-white/10 flex gap-1 items-center overflow-x-auto scrollbar-none shrink-0">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  id={`emoji-reaction-${emoji}`}
                  key={emoji}
                  onClick={() => handleQuickEmoji(emoji)}
                  className="p-1 hover:bg-white/10 active:scale-90 text-sm rounded transition-all cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Form messaging input */}
            <form onSubmit={handleSend} className="p-4 bg-white/5 border-t border-white/10 flex gap-2 shrink-0">
              <input
                id="chat-input-field"
                type="text"
                maxLength={200}
                placeholder="Type a message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 bg-black/40 border border-white/10 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-xs text-slate-105 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
              />
              <button
                id="chat-send-btn"
                type="submit"
                disabled={!inputText.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 p-2.5 text-white rounded-xl select-none active:scale-95 transition-all cursor-pointer shadow-lg shadow-indigo-600/30"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        ) : (
          /* Participants tab pane */
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            
            {/* Room Info and Copy Link Widget */}
            {room && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 mb-2.5 space-y-2.5 select-none shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 font-mono font-bold tracking-wider uppercase">Active Room</span>
                  <span className="text-xs font-mono font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 uppercase">{room.id}</span>
                </div>
                <button
                  id="sidebar-copy-room-link-btn"
                  onClick={() => {
                    const baseUrl = window.location.origin + window.location.pathname;
                    const url = `${baseUrl}?room=${room.id}`;
                    navigator.clipboard.writeText(url);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-indigo-600/20 active:scale-95"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-indigo-200" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? "Link Copied!" : "Copy Invite Link"}</span>
                </button>
              </div>
            )}

            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono mb-3">Room Members ({room?.members.length || 0})</div>
            {room?.members.map((member) => {
              const isHost = member.socketId === room.hostId;
              const isMe = member.socketId === currentUserSocketId;

              return (
                <div
                  id={`member-row-${member.socketId}`}
                  key={member.socketId}
                  className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-all duration-150"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={member.avatarUrl}
                      alt={member.name}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 bg-black/40 border border-white/10 rounded object-contain"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold text-slate-200 truncate max-w-[110px]">{member.name}</span>
                        {isMe && <span className="text-[9px] text-indigo-400 font-bold font-mono">(You)</span>}
                      </div>
                      <span className="text-[9px] text-gray-400 block truncate">{member.email || "Guest Participant"}</span>
                    </div>
                  </div>

                  {/* Status Badges or Host Transfer tools */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Camera indicator */}
                    {member.cameraActive ? (
                      <Video className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <VideoOff className="w-3.5 h-3.5 text-slate-500 opacity-60" />
                    )}

                    {/* Microphone indicator */}
                    {member.micActive ? (
                      <Mic className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <MicOff className="w-3.5 h-3.5 text-slate-500 opacity-60" />
                    )}

                    {/* Crown badge */}
                    {isHost ? (
                      <Crown className="w-4 h-4 text-yellow-500 fill-current" />
                    ) : (
                      onTransferHost && room.hostId === currentUserSocketId && (
                        <button
                          id={`promote-host-${member.socketId}`}
                          onClick={() => onTransferHost(member.socketId)}
                          className="p-1 hover:bg-white/15 rounded text-slate-400 hover:text-yellow-500 transition-all"
                          title="Transfer crown"
                        >
                          <Crown className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
