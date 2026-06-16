export interface User {
  socketId: string;
  name: string;
  email?: string;
  avatarUrl: string;
  cameraActive: boolean;
  micActive: boolean;
  screenAccessActive?: boolean; // permission to share screen
}

export interface Room {
  id: string;
  hostId: string;
  everyoneCanControl: boolean;
  videoUrl: string;
  playing: boolean;
  currentTime: number;
  lastUpdated: number;
  playbackSpeed: number;
  screenShare: {
    sharerId: string;
    sharerName: string;
    active: boolean;
  } | null;
  members: User[];
}

export interface Message {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}
