import { useEffect, useRef } from "react";
import { MicOff, VideoOff, Crown } from "lucide-react";
import { User, Room } from "../types";

interface WebcamBubblesProps {
  room: Room | null;
  currentUserSocketId: string | null;
  localStream: MediaStream | null;
  remoteStreams: Record<string, { stream: MediaStream; userName: string; avatar: string }>;
  cameraActive: boolean;
  micActive: boolean;
}

// Sub-component to attach WebRTC source track to a video element securely
function StreamVideo({ stream, isMuted }: { stream: MediaStream; isMuted: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isMuted}
      className="w-full h-full object-cover rounded-3xl"
    />
  );
}

export function WebcamBubbles({
  room,
  currentUserSocketId,
  localStream,
  remoteStreams,
  cameraActive,
  micActive
}: WebcamBubblesProps) {
  if (!room) return null;

  return (
    <div className="flex flex-wrap gap-4 items-center justify-center py-2 px-1 select-none">
      {/* 1. Render Me (Local WebRTC bubble) */}
      {room.members.map((member) => {
        const isMe = member.socketId === currentUserSocketId;
        if (!isMe) return null;

        const isHost = member.socketId === room.hostId;

        return (
          <div
            id={`bubble-local-${member.socketId}`}
            key={member.socketId}
            className="flex flex-col items-center gap-1.5 relative group scale-100 hover:scale-[1.03] transition-all"
          >
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-white/5 backdrop-blur-md border border-indigo-500 shadow-inner flex items-center justify-center overflow-hidden">
              {cameraActive && localStream ? (
                <StreamVideo stream={localStream} isMuted={true} />
              ) : (
                <img
                  src={member.avatarUrl}
                  alt={member.name}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 sm:w-14 sm:h-14 object-contain rounded-xl"
                />
              )}

              {/* Badges/status overlay */}
              <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-3xl">
                <span className="text-[10px] font-bold text-white uppercase bg-indigo-600/80 px-2 py-0.5 rounded-lg">You</span>
              </div>

              {!micActive && (
                <div className="absolute bottom-1 right-1 p-1 bg-rose-600/95 border border-rose-500 rounded-lg text-white shadow-sm">
                  <MicOff className="w-3 h-3" />
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-1 max-w-[80px]">
              <span className="text-[10px] font-semibold text-slate-300 truncate">{member.name}</span>
              {isHost && <Crown className="w-2.5 h-2.5 text-amber-500" />}
            </div>
          </div>
        );
      })}

      {/* 2. Render friends (Remote WebRTC bubbles) */}
      {room.members.map((member) => {
        const isMe = member.socketId === currentUserSocketId;
        if (isMe) return null; // Already rendered block above

        const isHost = member.socketId === room.hostId;
        const remoteInfo = remoteStreams[member.socketId];
        const hasActiveStream = remoteInfo && remoteInfo.stream;

        return (
          <div
            id={`bubble-remote-${member.socketId}`}
            key={member.socketId}
            className="flex flex-col items-center gap-1.5 relative group scale-100 hover:scale-[1.03] transition-all"
          >
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-center overflow-hidden">
              {member.cameraActive && hasActiveStream ? (
                <StreamVideo stream={remoteInfo.stream} isMuted={false} />
              ) : (
                <img
                  src={member.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${member.name}`}
                  alt={member.name}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 sm:w-14 sm:h-14 object-contain rounded-xl"
                />
              )}

              {!member.micActive && (
                <div className="absolute bottom-1 right-1 p-1 bg-rose-600/95 border border-rose-500 rounded-lg text-white shadow-sm">
                  <MicOff className="w-3 h-3" />
                </div>
              )}

              {!member.cameraActive && (
                <div className="absolute top-1 left-1 p-1.5 bg-black/40 border border-white/10 rounded-lg text-slate-400">
                  <VideoOff className="w-3 h-3" />
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 max-w-[80px]">
              <span className="text-[10px] font-semibold text-slate-300 truncate">{member.name}</span>
              {isHost && <Crown className="w-2.5 h-2.5 text-amber-500" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
