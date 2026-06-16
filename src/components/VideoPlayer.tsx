import { useEffect, useRef, useState } from "react";
import { Play, Pause, AlertCircle, MonitorPlay } from "lucide-react";
import { Room } from "../types";

interface VideoPlayerProps {
  room: Room | null;
  currentUserSocketId: string | null;
  isHost: boolean;
  onPlayerStateChange: (updates: Partial<Room>) => void;
  onSeek: (time: number) => void;
  socket: any;
  localVideoFile: { name: string; blobUrl: string } | null;
  onLocalFileSelect: (file: File) => void;
}

export function VideoPlayer({
  room,
  currentUserSocketId,
  isHost,
  onPlayerStateChange,
  onSeek,
  socket,
  localVideoFile,
  onLocalFileSelect
}: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoType, setVideoType] = useState<"youtube" | "direct" | "iframe" | "local" | "unsupported">("direct");
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [resolvedStreamUrl, setResolvedStreamUrl] = useState<string | null>(null);

  // HTML5 Video Player ref and syncing guards
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytElementId = "yt-iframe-player";

  // Prevent event cycles between socket broadcasts and local event listeners
  const isSyncingFromSocket = useRef<boolean>(false);

  // Helper to extract YouTube video ID
  const parseYoutubeUrl = (url: string): string | null => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  // Determine media category and auto-detect
  useEffect(() => {
    if (!room?.videoUrl) {
      setVideoType("unsupported");
      setIframeUrl(null);
      setResolvedStreamUrl(null);
      return;
    }

    if (room.videoUrl.startsWith("local://")) {
      setVideoType("local");
      setYoutubeId(null);
      setIframeUrl(null);
      if (localVideoFile) {
        setResolvedStreamUrl(localVideoFile.blobUrl);
      } else {
        setResolvedStreamUrl(null);
      }
      return;
    }

    const ytId = parseYoutubeUrl(room.videoUrl);
    if (ytId) {
      setVideoType("youtube");
      setYoutubeId(ytId);
      setIframeUrl(null);
      setResolvedStreamUrl(null);
      return;
    }

    // Check if it appears to be a direct video URL
    const hasDirectVideoExtension = /\.(mp4|webm|ogg|m3u8|mp3|wav|mov|avi|ts)(\?|$)/i.test(room.videoUrl);
    if (hasDirectVideoExtension) {
      setVideoType("direct");
      setYoutubeId(null);
      setIframeUrl(null);
      setResolvedStreamUrl(room.videoUrl);
      return;
    }

    // Otherwise, treat as an iframe to support any third-party media / block / embed link directly
    setVideoType("iframe");
    setIframeUrl(room.videoUrl);
    setYoutubeId(null);
    setResolvedStreamUrl(null);
  }, [room?.videoUrl, localVideoFile]);

  // Hls.js initialization and stream routing
  const hlsRef = useRef<any>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolvedStreamUrl) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isM3u8 = resolvedStreamUrl.includes(".m3u8") || resolvedStreamUrl.includes(".urlset");

    if (isM3u8) {
      import("hls.js")
        .then((HlsModule) => {
          const Hls = HlsModule.default;
          if (Hls.isSupported()) {
            const hls = new Hls({
              maxMaxBufferLength: 10,
              enableWorker: true
            });
            hlsRef.current = hls;
            hls.loadSource(resolvedStreamUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              console.log("HLS stream parsed successfully");
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
              if (data.fatal) {
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.log("Fatal network error in HLS, attempting recovery...");
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.log("Fatal media error in HLS, attempting recovery...");
                    hls.recoverMediaError();
                    break;
                  default:
                    console.error("Fatal unrecoverable HLS error:", data);
                    break;
                }
              }
            });
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = resolvedStreamUrl;
          } else {
            console.error("This browser layout does not support HLS stream playback.");
          }
        })
        .catch((err) => {
          console.error("Failed loading hls.js bundle:", err);
        });
    } else {
      video.removeAttribute("src");
      video.src = resolvedStreamUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [resolvedStreamUrl]);

  // 1. YouTube Player API Setup
  useEffect(() => {
    if (videoType !== "youtube" || !youtubeId) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch (e) {}
        ytPlayerRef.current = null;
      }
      return;
    }

    let active = true;

    // Load YT API script
    const win = window as any;
    if (!win.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // Initialize/Bind player when YT API is ready
    const initYTPlayer = () => {
      if (!active) return;
      
      // Cleanup previous standard iframe if re-initializing
      const container = document.getElementById(ytElementId);
      if (!container) return;
      container.innerHTML = ""; // Clear existing child frames

      const playerDiv = document.createElement("div");
      playerDiv.id = "yt-player-target";
      container.appendChild(playerDiv);

      ytPlayerRef.current = new win.YT.Player("yt-player-target", {
        height: "100%",
        width: "100%",
        videoId: youtubeId,
        playerVars: {
          autoplay: room?.playing ? 1 : 0,
          controls: isHost || room?.everyoneCanControl ? 1 : 0,
          modestbranding: 1,
          rel: 0,
          origin: window.location.origin
        },
        events: {
          onReady: (event: any) => {
            if (!active) return;
            // Seek and start sync after frame is active
            syncYoutubeToRoom();
          },
          onStateChange: (event: any) => {
            if (isSyncingFromSocket.current) return;

            const playerState = event.data;
            const canControl = isHost || room?.everyoneCanControl;
            if (!canControl) {
              // Lock controls: force matching state if not host
              syncYoutubeToRoom();
              return;
            }

            if (playerState === win.YT.PlayerState.PLAYING) {
              const currentTime = ytPlayerRef.current.getCurrentTime();
              onPlayerStateChange({ playing: true, currentTime });
            } else if (playerState === win.YT.PlayerState.PAUSED) {
              const currentTime = ytPlayerRef.current.getCurrentTime();
              onPlayerStateChange({ playing: false, currentTime });
            }
          }
        }
      });
    };

    if (win.YT && win.YT.Player) {
      initYTPlayer();
    } else {
      win.onYouTubeIframeAPIReady = () => {
        initYTPlayer();
      };
    }

    return () => {
      active = false;
    };
  }, [videoType, youtubeId, isHost, room?.everyoneCanControl]);

  // Sync YouTube player with latest Room state
  const syncYoutubeToRoom = () => {
    if (!ytPlayerRef.current || typeof ytPlayerRef.current.getCurrentTime !== "function") return;

    isSyncingFromSocket.current = true;
    
    const roomState = room;
    if (!roomState) {
      isSyncingFromSocket.current = false;
      return;
    }

    // Compute latency-corrected playback offset for streams
    let targetTime = roomState.currentTime;
    if (roomState.playing) {
      const elapsed = (Date.now() - roomState.lastUpdated) / 1000;
      targetTime += elapsed;
    }

    const diff = Math.abs(ytPlayerRef.current.getCurrentTime() - targetTime);

    // Only align if deviation is over 1.5 seconds to avoid jitter matching
    if (diff > 1.5) {
      ytPlayerRef.current.seekTo(targetTime, true);
    }

    // Set playing/paused states
    if (roomState.playing) {
      ytPlayerRef.current.playVideo();
    } else {
      ytPlayerRef.current.pauseVideo();
    }

    // Adapt speed
    if (roomState.playbackSpeed !== undefined) {
      ytPlayerRef.current.setPlaybackRate(roomState.playbackSpeed);
    }

    setTimeout(() => {
      isSyncingFromSocket.current = false;
    }, 400);
  };

  // 2. HTML5 native `<video>` control sync
  const syncHtml5ToRoom = () => {
    const video = videoRef.current;
    if (!video || (videoType !== "direct" && videoType !== "local") || !room) return;

    isSyncingFromSocket.current = true;

    let targetTime = room.currentTime;
    if (room.playing) {
      const elapsed = (Date.now() - room.lastUpdated) / 1000;
      targetTime += elapsed;
    }

    const diff = Math.abs(video.currentTime - targetTime);
    if (diff > 1.5) {
      video.currentTime = targetTime;
    }

    if (room.playing && video.paused) {
      video.play().catch(() => {
        console.warn("Direct video autoplay restriction triggered. Waiting for user interaction.");
      });
    } else if (!room.playing && !video.paused) {
      video.pause();
    }

    if (video.playbackRate !== room.playbackSpeed) {
      video.playbackRate = room.playbackSpeed;
    }

    setTimeout(() => {
      isSyncingFromSocket.current = false;
    }, 400);
  };

  // 3. Monitor Room Updates via direct socket broadcasting listen
  useEffect(() => {
    if (!socket || !room) return;

    const handleStateBroadcast = (updatedRoom: Room) => {
      if (videoType === "youtube") {
        syncYoutubeToRoom();
      } else if (videoType === "direct" || videoType === "local") {
        syncHtml5ToRoom();
      }
    };

    const handleSeekBroadcast = ({ currentTime }: { currentTime: number }) => {
      isSyncingFromSocket.current = true;
      if (videoType === "youtube" && ytPlayerRef.current) {
        ytPlayerRef.current.seekTo(currentTime, true);
      } else if ((videoType === "direct" || videoType === "local") && videoRef.current) {
        videoRef.current.currentTime = currentTime;
      }
      setTimeout(() => {
        isSyncingFromSocket.current = false;
      }, 400);
    };

    socket.on("room:state_broadcast", handleStateBroadcast);
    socket.on("room:seek_broadcast", handleSeekBroadcast);

    // Also run a local sync whenever properties change
    if (videoType === "youtube") {
      syncYoutubeToRoom();
    } else if (videoType === "direct" || videoType === "local") {
      syncHtml5ToRoom();
    }

    return () => {
      socket.off("room:state_broadcast", handleStateBroadcast);
      socket.off("room:seek_broadcast", handleSeekBroadcast);
    };
  }, [socket, room, videoType]);

  // 4. HTML5 native listener triggers (Host sends events)
  const handleHtml5Play = () => {
    if (isSyncingFromSocket.current || !room) return;
    const canControl = isHost || room.everyoneCanControl;
    if (!canControl) {
      syncHtml5ToRoom();
      return;
    }
    onPlayerStateChange({ playing: true, currentTime: videoRef.current?.currentTime || 0 });
  };

  const handleHtml5Pause = () => {
    if (isSyncingFromSocket.current || !room) return;
    const canControl = isHost || room.everyoneCanControl;
    if (!canControl) {
      syncHtml5ToRoom();
      return;
    }
    onPlayerStateChange({ playing: false, currentTime: videoRef.current?.currentTime || 0 });
  };

  const handleHtml5Seeked = () => {
    if (isSyncingFromSocket.current || !room) return;
    const canControl = isHost || room.everyoneCanControl;
    if (!canControl) {
      syncHtml5ToRoom();
      return;
    }
    if (videoRef.current) {
      onSeek(videoRef.current.currentTime);
    }
  };

  return (
    <div className="w-full h-full bg-black/60 relative flex items-center justify-center rounded-3xl overflow-hidden aspect-video border border-white/10 shadow-2xl group z-10">
      {/* Player Frame views */}
      {videoType === "youtube" ? (
        <div id={ytElementId} className="w-full h-full absolute inset-0 bg-slate-950" />
      ) : (videoType === "direct" || videoType === "local") && resolvedStreamUrl ? (
        <video
          id="direct-video-player"
          ref={videoRef}
          className="w-full h-full object-contain absolute inset-0 bg-slate-950"
          controls={isHost || room?.everyoneCanControl}
          onPlay={handleHtml5Play}
          onPause={handleHtml5Pause}
          onSeeked={handleHtml5Seeked}
          playsInline
        />
      ) : videoType === "local" && !resolvedStreamUrl ? (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center bg-slate-950 absolute inset-0 text-slate-400">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl animate-pulse">
            <MonitorPlay className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-200">Synchronized Local Screening</p>
            <p className="text-xs text-slate-400 max-w-sm ml-auto mr-auto leading-relaxed">
              The host is screening a local video: <span className="text-indigo-400 font-mono font-semibold">"{room?.videoUrl ? room.videoUrl.replace("local://", "") : "video file"}"</span>.
              Select your copy of this video on your computer to watch together in sync:
            </p>
          </div>
          <label className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer hover:scale-105 active:scale-95 inline-block select-none">
            <span>Select Local Copy</span>
            <input
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
      ) : videoType === "iframe" && iframeUrl ? (
        <div className="w-full h-full absolute inset-0 bg-slate-950">
          <iframe
            src={iframeUrl}
            className="w-full h-full border-0 absolute inset-0 bg-black"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-slate-400">
          <AlertCircle className="w-10 h-10 text-indigo-400 animate-pulse" />
          <p className="text-sm font-semibold text-slate-300">No media is currently loaded in this party</p>
          <p className="text-xs text-slate-500 max-w-xs">Host, please enter a valid MP4 URL, YouTube link, or embed stream above to stream synchronized content!</p>
        </div>
      )}

      {/* Sync Status Floating Indicator */}
      <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-mono flex items-center gap-1.5 border border-white/10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>SYNC LOCKED</span>
      </div>
    </div>
  );
}
