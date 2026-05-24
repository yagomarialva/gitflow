export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  file_path: string;
  thumbnail_url: string;
  storage_type: string;
  added_at: string;
}

export interface Download {
  id: string;
  source_url: string;
  title: string;
  artist: string;
  status: 'pending' | 'searching' | 'downloading' | 'converting' | 'completed' | 'failed';
  source: 'chromedp' | 'ytdlp' | 'torrent' | string;
  progress: number;
  error?: string;
  file_path?: string;
  created_at: string;
  completed_at?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  artist: string;
  source_url: string;
  thumbnail_url: string;
  duration: number;
  file_size: string;
}

export interface Playlist {
  id: string;
  name: string;
  created_at: string;
}

export interface PlayerState {
  track: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: 'none' | 'one' | 'all';
}
