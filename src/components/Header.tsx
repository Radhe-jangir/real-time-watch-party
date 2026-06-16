import { useState } from "react";
import { Link2, Users, Crown, Wifi, WifiOff, Sparkles, Check, RefreshCw } from "lucide-react";
import { User, Room } from "../types";

interface HeaderProps {
  room: Room | null;
  currentUserSocketId: string | null;
  myUser: { name: string; avatarUrl: string } | null;
  connected: boolean;
  ping?: number | null;
  onTransferHost: (targetSocketId: string) => void;
  onExitRoom: () => void;
}

export function Header({
  room,
  currentUserSocketId,
  myUser,
  connected,
  ping,
  onTransferHost,
  onExitRoom
}: HeaderProps) {
  const [copied, setCopied] = useState(false);
  const [showHostMenu, setShowHostMenu] = useState(false);

  const getInviteUrl = () => {
    if (!room) return "";
    // Build invitation matching preview routes or standard host address
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?room=${room.id}`;
  };

  const handleCopy = async () => {
    const url = getInviteUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("Failed to copy using clipboard API:", err);
    }
  };

  const isHost = room && room.hostId === currentUserSocketId;
  const activeHostName = room?.members.find(m => m.socketId === room.hostId)?.name || "Host";

  return (
    <header className="h-16 flex items-center justify-between px-3 sm:px-6 border-b border-white/10 backdrop-blur-xl bg-black/30 z-20 select-none shrink-0 gap-2">
      {/* Brand Logo & Portal */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-black tracking-tighter text-xs sm:text-sm shrink-0">
          WP
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="hidden xs:inline font-extrabold text-xs sm:text-sm text-white font-sans tracking-wide truncate">WatchParty</span>
            <div className="flex items-center gap-1 text-[8px] sm:text-[9px] font-semibold font-mono uppercase bg-white/5 px-1.5 sm:px-2 py-0.5 rounded-full border border-white/10 text-slate-300">
              {connected ? (
                <>
                  <Wifi className="w-2.5 h-2.5 text-green-400 animate-pulse" />
                  <span className="text-green-400">Live</span>
                  {ping !== undefined && ping !== null && (
                    <span className="hidden md:inline text-slate-400 border-l border-white/10 pl-1.5 ml-0.5 font-bold tracking-tight">
                      {ping}ms
                    </span>
                  )}
                </>
              ) : (
                <>
                  <WifiOff className="w-2.5 h-2.5 text-rose-400" />
                  <span className="text-rose-400">Offline</span>
                </>
              )}
            </div>
          </div>
          {room && (
            <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5 min-w-0">
              <span className="hidden sm:inline">Room ID:</span>
              <code className="text-indigo-400 font-mono font-bold bg-indigo-500/10 px-1.5 py-0.2 border border-indigo-500/20 rounded-full uppercase text-[9px] truncate">
                {room.id}
              </code>
            </div>
          )}
        </div>
      </div>

      {/* Main interactive controls */}
      {room ? (
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Invite Copy Mechanism */}
          <button
            id="header-invite-btn"
            onClick={handleCopy}
            className="flex items-center gap-1 sm:gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-lg shadow-indigo-600/30 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-indigo-200 hidden sm:inline">Copied!</span>
                <span className="text-indigo-200 sm:hidden">Copied</span>
              </>
            ) : (
              <>
                <Link2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Invite Friends</span>
                <span className="sm:hidden">Invite</span>
              </>
            )}
          </button>

          {/* Attendee indicators */}
          <div className="flex items-center gap-1 sm:gap-2 bg-white/5 border border-white/10 rounded-full px-2 sm:px-3 py-1.5 text-xs font-medium text-slate-200">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>{room.members.length}</span>
            <span className="hidden sm:inline">Online</span>
          </div>

          {/* Host Administration dropdown */}
          {isHost ? (
            <div className="relative">
              <button
                id="header-host-btn"
                onClick={() => setShowHostMenu(!showHostMenu)}
                className="flex items-center gap-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-full px-2 sm:px-3 py-1.5 text-xs font-medium transition-all cursor-pointer"
              >
                <Crown className="w-3.5 h-3.5 fill-current text-yellow-500" />
                <span className="hidden sm:inline">You are Host</span>
                <span className="sm:hidden">Host</span>
              </button>

              {showHostMenu && (
                <div className="absolute right-0 mt-2 w-52 sm:w-56 bg-slate-950/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl py-2.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-4 py-2 border-b border-white/10">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest font-mono">Transfer Crown</p>
                    <p className="text-[10px] text-gray-400">Pick a member to promote:</p>
                  </div>
                  <div className="max-h-40 overflow-y-auto mt-1 px-2 space-y-1">
                    {room.members.filter(m => m.socketId !== currentUserSocketId).length === 0 ? (
                      <div className="text-xs text-gray-400 italic p-3 text-center">
                        Waiting for friends to join...
                      </div>
                    ) : (
                      room.members
                        .filter(m => m.socketId !== currentUserSocketId)
                        .map(member => (
                          <button
                            key={member.socketId}
                            onClick={() => {
                              onTransferHost(member.socketId);
                              setShowHostMenu(false);
                            }}
                            className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 hover:bg-white/10 rounded-xl text-xs text-slate-200 hover:text-white transition-all cursor-pointer"
                          >
                            <img
                              src={member.avatarUrl}
                              alt={member.name}
                              referrerPolicy="no-referrer"
                              className="w-5 h-5 object-contain bg-black/40 rounded border border-white/10"
                            />
                            <span className="truncate flex-1 font-medium">{member.name}</span>
                          </button>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 px-2 sm:px-3 py-1.5 rounded-full text-xs font-medium text-slate-300 max-w-[80px] sm:max-w-none">
              <Crown className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
              <span className="truncate hidden sm:inline">Host: <b className="text-indigo-300">{activeHostName}</b></span>
              <span className="truncate sm:hidden text-indigo-300 font-bold">{activeHostName}</span>
            </div>
          )}

          {/* Exit / Leave room shortcut button */}
          <button
            id="header-leave-btn"
            onClick={onExitRoom}
            className="px-2.5 sm:px-3.5 py-1.5 bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/30 rounded-lg text-xs font-semibold text-slate-300 transition-all cursor-pointer"
          >
            <span className="hidden sm:inline">Leave Party</span>
            <span className="sm:hidden">Exit</span>
          </button>
        </div>
      ) : (
        myUser && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 font-medium font-mono uppercase tracking-widest">Lobby</span>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
              <img
                src={myUser.avatarUrl}
                alt={myUser.name}
                referrerPolicy="no-referrer"
                className="w-6 h-6 rounded bg-black/40 border border-white/10 object-contain"
              />
              <span className="text-xs text-slate-200 font-semibold">{myUser.name}</span>
            </div>
          </div>
        )
      )}
    </header>
  );
}
