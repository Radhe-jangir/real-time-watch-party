import { useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import { User } from "../types";

interface UseWebRTCProps {
  socket: Socket | null;
  roomId: string;
  myUser: { name: string; avatarUrl: string } | null;
  cameraActive: boolean;
  micActive: boolean;
  screenShareActive: boolean;
  onScreenShareStateChange?: (active: boolean) => void;
  onScreenShareError?: (err: any) => void;
}

export function useWebRTC({
  socket,
  roomId,
  myUser,
  cameraActive,
  micActive,
  screenShareActive,
  onScreenShareStateChange,
  onScreenShareError
}: UseWebRTCProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, { stream: MediaStream; userName: string; avatar: string }>>({});
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Record<string, { stream: MediaStream; userName: string }>>({});

  // Refs for WebRTC coordination to prevent race conditions during component updates
  const localStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({}); // socketId -> RTCPeerConnection (webcam/mic)
  const screenPeersRef = useRef<Record<string, RTCPeerConnection>>({}); // socketId -> RTCPeerConnection (screen share)
  const membersRef = useRef<User[]>([]);

  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" }
  ];

  // 1. Initialize local camera and mic stream
  useEffect(() => {
    let active = true;

    async function initMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, frameRate: 15 },
          audio: true
        });
        
        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);

        // Apply initial permission states
        stream.getVideoTracks().forEach(t => { t.enabled = cameraActive; });
        stream.getAudioTracks().forEach(t => { t.enabled = micActive; });

        // Update tracks in existing peer connections if any
        Object.entries(peersRef.current).forEach(([peerId, pcItem]) => {
          const pc = pcItem as RTCPeerConnection;
          stream.getTracks().forEach(track => {
            const senders = pc.getSenders();
            const exists = senders.some(s => s.track === track);
            if (!exists) {
              pc.addTrack(track, stream);
            }
          });
        });

      } catch (err) {
        console.warn("Could not access camera or microphone, falling back to audio-only or screen:", err);
        // Fallback to audio-only if camera fails
        try {
          const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (!active) {
            audioOnlyStream.getTracks().forEach(t => t.stop());
            return;
          }
          localStreamRef.current = audioOnlyStream;
          setLocalStream(audioOnlyStream);
          audioOnlyStream.getAudioTracks().forEach(t => { t.enabled = micActive; });
        } catch (audioErr) {
          console.warn("Could not access microphone either:", audioErr);
        }
      }
    }

    initMedia();

    return () => {
      active = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // 2. Monitor local mic and camera toggles
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = cameraActive;
      });
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = micActive;
      });
    }

    if (socket && socket.connected) {
      socket.emit("user:status_change", { cameraActive, micActive });
    }
  }, [cameraActive, micActive, socket]);

  // 3. Monitor local Screen Share toggle
  useEffect(() => {
    let active = true;

    async function startScreenShare() {
      if (screenShareActive) {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
          });

          if (!active) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }

          localScreenStreamRef.current = stream;
          setLocalScreenStream(stream);

          // Handle screen track stop (e.g. user clicks "Stop Sharing" browser banner)
          stream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
          };

          // Notify socket server
          if (socket) {
            socket.emit("room:screen_share", { active: true, sharerName: myUser?.name || "Participant" });
          }

          // Force-negotiate with all existing participants
          Object.keys(peersRef.current).forEach(peerSocketId => {
            initiateScreenPeerConnection(peerSocketId, stream);
          });

        } catch (err) {
          console.error("Screen sharing cancelled or failed:", err);
          stopScreenShare();
          onScreenShareError?.(err);
        }
      } else {
        stopScreenShare();
      }
    }

    function stopScreenShare() {
      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach(t => t.stop());
        localScreenStreamRef.current = null;
        setLocalScreenStream(null);
      }
      
      // Close all screen peers
      Object.keys(screenPeersRef.current).forEach(id => {
        screenPeersRef.current[id].close();
        delete screenPeersRef.current[id];
      });

      if (socket) {
        socket.emit("room:screen_share", { active: false, sharerName: myUser?.name || "" });
      }

      onScreenShareStateChange?.(false);
    }

    startScreenShare();

    return () => {
      active = false;
    };
  }, [screenShareActive]);

  // 4. WebRTC Webcams Peer Connection builder
  const createWebcamPeer = (targetSocketId: string, isInitiator: boolean) => {
    if (peersRef.current[targetSocketId]) {
      return peersRef.current[targetSocketId];
    }

    const pc = new RTCPeerConnection({ iceServers });
    peersRef.current[targetSocketId] = pc;

    // Attach local media stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // ICE gathering
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("webrtc:signal", {
          targetSocketId,
          signal: { type: "ice", candidate: event.candidate, channel: "webcam" }
        });
      }
    };

    // Receive remote video/audio track
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      const peerInfo = membersRef.current.find(m => m.socketId === targetSocketId);
      
      setRemoteStreams(prev => ({
        ...prev,
        [targetSocketId]: {
          stream: remoteStream,
          userName: peerInfo?.name || "Friend",
          avatar: peerInfo?.avatarUrl || ""
        }
      }));
    };

    // Connection state checks
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        removePeer(targetSocketId);
      }
    };

    // Initiator goes first and sends SDP Offer
    if (isInitiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (socket) {
            socket.emit("webrtc:signal", {
              targetSocketId,
              signal: { type: "offer", sdp: pc.localDescription, channel: "webcam" }
            });
          }
        } catch (err) {
          console.error("Error creating webcam SDP offer:", err);
        }
      };
    }

    return pc;
  };

  // 5. Screen Share Peer Connection builder
  const initiateScreenPeerConnection = async (targetSocketId: string, stream: MediaStream) => {
    if (screenPeersRef.current[targetSocketId]) {
      screenPeersRef.current[targetSocketId].close();
    }

    const pc = new RTCPeerConnection({ iceServers });
    screenPeersRef.current[targetSocketId] = pc;

    // Attach local screen tracks
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("webrtc:signal", {
          targetSocketId,
          signal: { type: "ice", candidate: event.candidate, channel: "screen" }
        });
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (socket) {
          socket.emit("webrtc:signal", {
            targetSocketId,
            signal: { type: "offer", sdp: pc.localDescription, channel: "screen" }
          });
        }
      } catch (err) {
        console.error("Error creating screen SDP offer:", err);
      }
    };

    return pc;
  };

  const createIncomingScreenPeer = (targetSocketId: string) => {
    if (screenPeersRef.current[targetSocketId]) {
      return screenPeersRef.current[targetSocketId];
    }

    const pc = new RTCPeerConnection({ iceServers });
    screenPeersRef.current[targetSocketId] = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("webrtc:signal", {
          targetSocketId,
          signal: { type: "ice", candidate: event.candidate, channel: "screen" }
        });
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      const peerInfo = membersRef.current.find(m => m.socketId === targetSocketId);

      setRemoteScreenStreams(prev => ({
        ...prev,
        [targetSocketId]: {
          stream: remoteStream,
          userName: peerInfo?.name || "Someone"
        }
      }));
    };

    return pc;
  };

  // 6. Cleanup peers
  const removePeer = (targetSocketId: string) => {
    if (peersRef.current[targetSocketId]) {
      peersRef.current[targetSocketId].close();
      delete peersRef.current[targetSocketId];
    }
    if (screenPeersRef.current[targetSocketId]) {
      screenPeersRef.current[targetSocketId].close();
      delete screenPeersRef.current[targetSocketId];
    }

    setRemoteStreams(prev => {
      const updated = { ...prev };
      delete updated[targetSocketId];
      return updated;
    });

    setRemoteScreenStreams(prev => {
      const updated = { ...prev };
      delete updated[targetSocketId];
      return updated;
    });
  };

  // 7. Master signaling engine hook
  useEffect(() => {
    if (!socket) return;

    // Listen to changes in participants list
    socket.on("room:members_updated", (members: User[]) => {
      membersRef.current = members;

      // Ensure we have webcam peer connections for everyone
      members.forEach(member => {
        if (
            member.socketId !== socket.id &&
            !peersRef.current[member.socketId]
      ) {
        const amInitiator = socket.id! > member.socketId;
        createWebcamPeer(member.socketId, amInitiator);
      }
      if (
        screenShareActive &&
        localScreenStreamRef.current
      ) {
        initiateScreenPeerConnection(
          member.socketId,
          localScreenStreamRef.current
        );
}
    });
    });

      // Handle incoming WebRTC signals
      socket.on("webrtc:signal", async ({ senderSocketId, signal }) => {
        const channel = signal.channel || "webcam";

      if (signal.type === "offer") {
        try {
          if (channel === "webcam") {
            const pc = createWebcamPeer(senderSocketId, false);
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("webrtc:signal", {
              targetSocketId: senderSocketId,
              signal: { type: "answer", sdp: pc.localDescription, channel: "webcam" }
            });
          } else if (channel === "screen") {
            const pc = createIncomingScreenPeer(senderSocketId);
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("webrtc:signal", {
              targetSocketId: senderSocketId,
              signal: { type: "answer", sdp: pc.localDescription, channel: "screen" }
            });
          }
        } catch (err) {
          console.error("Error responding to WebRTC SDP Offer:", err);
        }

      } else if (signal.type === "answer") {
        try {
          const pc = channel === "webcam" 
            ? peersRef.current[senderSocketId] 
            : screenPeersRef.current[senderSocketId];

          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          }
        } catch (err) {
          console.error("Error setting WebRTC SDP Answer:", err);
        }

      } else if (signal.type === "ice") {
        try {
          const pc = channel === "webcam" 
            ? peersRef.current[senderSocketId] 
            : screenPeersRef.current[senderSocketId];

          if (pc && signal.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        } catch (err) {
          console.error("Error adding ICE Candidate:", err);
        }
      }
    });

    // Cleanup peer on leave
    socket.on("user:left", ({ userId }) => {
      removePeer(userId);
    });

    return () => {
      socket.off("room:members_updated");
      socket.off("webrtc:signal");
      socket.off("user:left");

      // Stop all active peers
      Object.keys(peersRef.current).forEach(id => {
        peersRef.current[id].close();
      });
      Object.keys(screenPeersRef.current).forEach(id => {
        screenPeersRef.current[id].close();
      });

      peersRef.current = {};
      screenPeersRef.current = {};
    };
  }, [socket]);

  return {
    localStream,
    localScreenStream,
    remoteStreams,
    remoteScreenStreams
  };
}
