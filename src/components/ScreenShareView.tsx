import { useEffect, useRef } from "react";
import { Monitor, VideoOff, Play } from "lucide-react";

interface ScreenShareViewProps {
  screenShare: { sharerId: string; sharerName: string; active: boolean } | null;
  currentUserSocketId: string | null;
  localScreenStream: MediaStream | null;
  remoteScreenStreams: Record<string, { stream: MediaStream; userName: string }>;
  onStopSharing: () => void;
}

export function ScreenShareView({
  screenShare,
  currentUserSocketId,
  localScreenStream,
  remoteScreenStreams,
  onStopSharing
}: ScreenShareViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const isMeSharer = screenShare?.sharerId === currentUserSocketId;
  const activeStream = isMeSharer
    ? localScreenStream
    : screenShare
    ? remoteScreenStreams[screenShare.sharerId]?.stream
    : null;

  useEffect(() => {
    if (videoRef.current && activeStream) {
      videoRef.current.srcObject = activeStream;
    }
  }, [activeStream]);

  if (!screenShare) return null;

  return (
    <div className="w-full h-full bg-black/60 relative flex flex-col items-center justify-center rounded-3xl overflow-hidden aspect-video border border-white/10 shadow-2xl select-none group z-10">
      {/* Stream Render or empty fallback */}
      {activeStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isMeSharer} // Must suppress echo for sharing user
          className="w-full h-full object-contain bg-black"
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-slate-400">
          <Monitor className="w-10 h-10 text-indigo-400 animate-pulse" />
          <p className="text-sm font-semibold text-slate-300">Warming up screen stream...</p>
          <p className="text-xs text-slate-500 max-w-xs">Waiting for WebRTC stream connection packets from {screenShare.sharerName}</p>
        </div>
      )}

      {/* Sharing Details Overlay Card */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between p-3 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 pointer-events-auto shadow-lg">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg animate-pulse">
            <Monitor className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-100 truncate">
              {screenShare.sharerName}'s Screen
            </p>
            <p className="text-[10px] text-slate-400 font-mono">
              WebRTC Smooth Low-Latency Feed
            </p>
          </div>
        </div>

        {isMeSharer ? (
          <button
            id="screenshare-stop-btn"
            onClick={onStopSharing}
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold rounded-lg transition-all shadow-md active:scale-95 cursor-pointer"
          >
            Stop Sharing Screen
          </button>
        ) : (
          <div className="text-[10px] font-bold text-green-400 bg-green-550/10 border border-green-500/20 px-2 py-0.5 rounded-md font-mono select-none">
            ● LIVE FEED
          </div>
        )}
      </div>
    </div>
  );
}
