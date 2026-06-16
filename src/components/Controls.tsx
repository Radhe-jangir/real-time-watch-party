import React, { useState } from "react";
import { Link2, ShieldAlert, Sparkles, Play, FastForward, Settings, UserCheck } from "lucide-react";
import { Room } from "../types";

interface ControlsProps {
  room: Room | null;
  currentUserSocketId: string | null;
  isHost: boolean;
  onPlayerStateChange: (updates: Partial<Room>) => void;
  onSeek: (time: number) => void;
  localVideoFile: { name: string; blobUrl: string } | null;
  onLocalFileSelect: (file: File) => void;
  setLocalVideoFile: (val: { name: string; blobUrl: string } | null) => void;
}

// Open-source public streams for easy watch-party instant testing
const QUICK_PRESETS = [
  { name: "Sintel Trailer (MP4)", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4" },
  { name: "Big Buck Bunny (MP4)", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" },
  { name: "Lofi Beats Chillout (YT)", url: "https://www.youtube.com/watch?v=jfKfPfyJRdk" },
  { name: "Synthwave Visuals (YT)", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" }
];

export function Controls({
  room,
  currentUserSocketId,
  isHost,
  onPlayerStateChange,
  onSeek,
  localVideoFile,
  onLocalFileSelect,
  setLocalVideoFile
}: ControlsProps) {
  const [urlInput, setUrlInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const canControl = isHost || room?.everyoneCanControl;

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || !canControl) return;
    onPlayerStateChange({ videoUrl: urlInput.trim() });
    setUrlInput("");
  };

  const handleApplyPreset = (url: string) => {
    if (!canControl) return;
    onPlayerStateChange({ videoUrl: url });
  };

  const handleToggleEveryoneControl = () => {
    if (!isHost || !room) return;
    onPlayerStateChange({ everyoneCanControl: !room.everyoneCanControl });
  };

  const handleChangeSpeed = (speed: number) => {
    if (!canControl) return;
    onPlayerStateChange({ playbackSpeed: speed });
  };

  const handleDeltaSeek = (seconds: number) => {
    if (!canControl || !room) return;
    const target = Math.max(0, room.currentTime + seconds);
    onSeek(target);
  };

  if (!room) return null;

  return (
    <div className="bg-white/5 border border-white/10 backdrop-blur-2xl rounded-2xl p-5 space-y-4 select-none relative z-10">
      {/* Video Source Input Box */}
      <div className="flex flex-col gap-2.5">
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-indigo-400" />
          <span>Stream Source Link</span>
        </label>
        
        <form onSubmit={handleUrlSubmit} className="flex gap-2.5">
          <input
            id="url-input-field"
            type="text"
            placeholder={
              canControl
                ? "Insert YouTube or direct MP4 stream URL..."
                : "Host has locked sources (Host Only Control)"
            }
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            disabled={!canControl}
            className="flex-1 bg-black/40 border border-white/10 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition-all duration-200 disabled:opacity-40"
          />
          <button
            id="url-apply-btn"
            type="submit"
            disabled={!canControl || !urlInput.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-transparent hover:scale-[1.01] active:scale-[0.98] disabled:border-white/5 disabled:scale-100 disabled:opacity-40 text-white text-xs font-bold px-5 rounded-xl border border-indigo-500/30 transition-all duration-150 cursor-pointer shadow-lg shadow-indigo-600/30"
          >
            Load
          </button>
        </form>
      </div>

      {/* Screen Local File Selector Widget */}
      <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Screen Local File</span>
          <span className="text-[9px] text-[#A78BFA] font-mono bg-purple-500/10 px-1.5 border border-purple-500/20 rounded">No Upload • Offline sync</span>
        </div>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Select an offline video (.mp4, .webm, etc.) from your device. Other participants can pick their copy of the file to join a perfect synchronized screening!
        </p>
        <div className="flex items-center gap-2.5">
          <label className="flex-1 px-4 py-2 bg-indigo-600/10 border border-indigo-500/20 hover:border-indigo-500/40 text-indigo-400 text-xs font-semibold rounded-xl transition-all cursor-pointer hover:bg-indigo-600/15 text-center">
            <span>Select Local Video</span>
            <input
              id="local-file-selector"
              type="file"
              accept="video/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onLocalFileSelect(file);
              }}
              className="sr-only"
            />
          </label>
        </div>
        {localVideoFile && (
          <div className="text-[11px] text-green-400 bg-green-500/5 border border-green-500/20 rounded-xl p-2.5 flex items-center justify-between">
            <span className="truncate max-w-[220px]">Matched: {localVideoFile.name}</span>
            <button
              id="clear-local-file"
              onClick={() => {
                setLocalVideoFile(null);
                if (canControl) {
                  onPlayerStateChange({ videoUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" });
                }
              }}
              className="text-red-400 hover:text-red-300 font-semibold cursor-pointer shrink-0"
            >
              Close Screening
            </button>
          </div>
        )}
      </div>

      {/* Quick Presets Grid */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-mono">Lounge Testing Presets</span>
          <span className="text-[9px] text-indigo-400 font-mono bg-indigo-500/10 px-1 border border-indigo-500/20 rounded">Instant Config</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {QUICK_PRESETS.map((p) => (
            <button
              id={`preset-${p.name.replace(/\s+/g, '-').toLowerCase()}`}
              key={p.name}
              disabled={!canControl}
              onClick={() => handleApplyPreset(p.url)}
              className="px-3 py-2 bg-black/40 border border-white/10 hover:border-indigo-500/50 text-slate-400 hover:text-indigo-400 rounded-lg text-[11px] font-medium truncate text-left transition-all duration-150 disabled:opacity-40 disabled:hover:border-white/10 cursor-pointer"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Control Actions & Settings */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          {/* Seekers */}
          <button
            id="control-seek-back"
            disabled={!canControl}
            onClick={() => handleDeltaSeek(-10)}
            className="px-3 py-1.5 bg-black/40 border border-white/10 hover:bg-white/5 text-slate-300 rounded-lg text-xs font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30 cursor-pointer"
          >
            -10s
          </button>
          <button
            id="control-seek-forward"
            disabled={!canControl}
            onClick={() => handleDeltaSeek(30)}
            className="px-3 py-1.5 bg-black/40 border border-white/10 hover:bg-white/5 text-slate-300 rounded-lg text-xs font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30 cursor-pointer"
          >
            +30s
          </button>

          {/* Speed settings selectors */}
          <div className="flex bg-black/40 p-1 border border-white/10 rounded-lg text-[10px] sm:text-xs">
            {[0.5, 1.0, 1.25, 1.5, 2.0].map((speed) => (
              <button
                id={`speed-${speed}`}
                key={speed}
                disabled={!canControl}
                onClick={() => handleChangeSpeed(speed)}
                className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                  room.playbackSpeed === speed
                    ? "bg-indigo-600/20 text-indigo-400 font-bold"
                    : "text-slate-500 hover:text-slate-300"
                } disabled:opacity-30`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Permission Switch Configuration (Host exclusive toggle) */}
        <div className="flex items-center gap-4">
          {isHost ? (
            <button
              id="everyone-control-toggle"
              onClick={handleToggleEveryoneControl}
              className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all duration-200 cursor-pointer ${
                room.everyoneCanControl
                  ? "bg-indigo-600/20 border-indigo-500/30 text-indigo-400"
                  : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{room.everyoneCanControl ? "Everyone Can Control" : "Host-Only Control"}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              <span>{room.everyoneCanControl ? "Collaborative Stream" : "Host Controlled Playback"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
