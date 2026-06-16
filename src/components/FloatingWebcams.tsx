import { useEffect, useRef, useState } from "react";
import { Video, Minimize2, Maximize2, Plus, Minus, VideoOff } from "lucide-react";
import { Room } from "../types";

interface FloatingWebcamsProps {
  room: Room | null;
  currentUserSocketId: string | null;
  localStream: MediaStream | null;
  remoteStreams: { [socketId: string]: MediaStream };
  cameraActive: boolean;
  micActive: boolean;
  isFullscreenOverlay?: boolean;
}

function StreamVideo({ stream, isMuted }: { stream: MediaStream; isMuted: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isMuted}
      className="w-full h-full object-cover rounded-xl"
    />
  );
}

export function FloatingWebcams({
  room,
  currentUserSocketId,
  localStream,
  remoteStreams,
  cameraActive,
  micActive,
  isFullscreenOverlay = false
}: FloatingWebcamsProps) {
  const [showPip, setShowPip] = useState(true);
  const [sizePreset, setSizePreset] = useState<"sm" | "md" | "lg" | "xl">("sm");

  const hasActiveLocal = cameraActive && !!localStream;
  const activeRemotes = room?.members.filter(
    (m) => m.socketId !== currentUserSocketId && m.cameraActive && remoteStreams[m.socketId]
  ) || [];
  const hasAnyActiveCamera = hasActiveLocal || activeRemotes.length > 0;

  if (!hasAnyActiveCamera) return null;

  // Define size specifications
  const sizeClasses = {
    sm: { box: "w-14 h-14", avatar: "w-8 h-8", text: "text-[7px]", label: "sm" },
    md: { box: "w-20 h-20", avatar: "w-11 h-11", text: "text-[9px]", label: "md" },
    lg: { box: "w-28 h-28", avatar: "w-16 h-16", text: "text-[11px]", label: "lg" },
    xl: { box: "w-36 h-36", avatar: "w-20 h-20", text: "text-[12px]", label: "xl" }
  };

  const currentSize = sizeClasses[sizePreset];

  const handleDecreaseSize = () => {
    if (sizePreset === "xl") setSizePreset("lg");
    else if (sizePreset === "lg") setSizePreset("md");
    else if (sizePreset === "md") setSizePreset("sm");
  };

  const handleIncreaseSize = () => {
    if (sizePreset === "sm") setSizePreset("md");
    else if (sizePreset === "md") setSizePreset("lg");
    else if (sizePreset === "lg") setSizePreset("xl");
  };

  if (!showPip) {
    return (
      <button
        id="restore-pip-button"
        type="button"
        onClick={() => setShowPip(true)}
        className={`absolute bottom-3 right-3 z-50 bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-full shadow-2xl flex items-center justify-center border border-indigo-500/30 cursor-pointer hover:scale-110 active:scale-95 transition-all ${
          isFullscreenOverlay ? "scale-125" : ""
        }`}
        title="Show Floating Webcams"
      >
        <Video className="w-4 h-4 sm:w-5 h-5" />
        <span className="w-2.5 h-2.5 bg-rose-500 rounded-full absolute -top-0.5 -right-0.5 animate-pulse border border-slate-900" />
      </button>
    );
  }

  return (
    <div
      className={`absolute z-50 bg-[#07080c]/95 border border-indigo-500/35 p-2 rounded-2xl shadow-3xl backdrop-blur-xl flex flex-col gap-2 shrink-0 animate-in fade-in zoom-in-95 duration-150 select-none ${
        isFullscreenOverlay
          ? "bottom-5 right-5 max-w-[340px] md:max-w-[480px]"
          : "bottom-16 right-3 max-w-[200px]"
      }`}
    >
      {/* Header controls inside PiP bubble card */}
      <div className="flex items-center justify-between gap-3 px-1 text-[8px] font-mono font-bold text-indigo-400 select-none pb-1 border-b border-white/10 shrink-0">
        <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Webcams ({activeRemotes.length + (hasActiveLocal ? 1 : 0)})
        </span>
        
        {/* Resize Controls (+ & -) */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleDecreaseSize}
            disabled={sizePreset === "sm"}
            className="p-1 hover:bg-white/10 text-slate-400 hover:text-white rounded disabled:opacity-20 cursor-pointer flex items-center justify-center transition-all"
            title="Decrease Webcam Size"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-[9px] font-bold text-slate-300 min-w-[20px] text-center uppercase">
            {currentSize.label}
          </span>
          <button
            type="button"
            onClick={handleIncreaseSize}
            disabled={sizePreset === "xl"}
            className="p-1 hover:bg-white/10 text-slate-400 hover:text-white rounded disabled:opacity-20 cursor-pointer flex items-center justify-center transition-all"
            title="Increase Webcam Size"
          >
            <Plus className="w-3 h-3" />
          </button>
          
          {/* Close button to hide */}
          <button
            type="button"
            onClick={() => setShowPip(false)}
            className="ml-1 p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded cursor-pointer flex items-center justify-center transition-all text-[10px] font-bold"
            title="Hide PiP Window"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Grid loop of webcam videos */}
      <div className="flex gap-2.5 overflow-x-auto scrollbar-none py-0.5 px-0.5 snap-x">
        {/* Render local user */}
        {hasActiveLocal && localStream && (
          <div className="flex flex-col items-center gap-1 shrink-0 snap-center">
            <div className={`relative ${currentSize.box} bg-black/50 border border-indigo-500/50 rounded-xl overflow-hidden shadow-lg transition-all duration-300`}>
              <StreamVideo stream={localStream} isMuted={true} />
              <div className={`absolute bottom-1 left-1 ${currentSize.text} font-bold text-white bg-black/70 px-1.5 py-0.5 rounded shadow truncate max-w-[80%]`} title="You">
                You
              </div>
            </div>
          </div>
        )}

        {/* Render remote users */}
        {activeRemotes.map((member) => {
          const stream = remoteStreams[member.socketId];
          return (
            <div key={member.socketId} className="flex flex-col items-center gap-1 shrink-0 snap-center">
              <div className={`relative ${currentSize.box} bg-black/50 border border-white/10 rounded-xl overflow-hidden shadow-lg transition-all duration-300`}>
                <StreamVideo stream={stream} isMuted={false} />
                <div className={`absolute bottom-1 left-1 ${currentSize.text} font-bold text-white bg-black/70 px-1.5 py-0.5 rounded shadow truncate max-w-[80%]`} title={member.name}>
                  {member.name}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
