import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PlayerState, Track } from '../../models/interfaces';
import { ApiService } from './api.service';

const DEFAULT_STATE: PlayerState = {
  track: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  isMuted: false,
  shuffle: false,
  repeat: 'none',
};

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private audio = new Audio();
  private _state = new BehaviorSubject<PlayerState>({ ...DEFAULT_STATE });
  readonly state$ = this._state.asObservable();

  // Legacy compat — components that subscribe to currentTrack$
  get currentTrack$() { return new BehaviorSubject(this._state.value.track).asObservable(); }

  private lastSyncTime = 0;
  private lastSyncSeconds = 0;

  constructor(private api: ApiService) {
    this.audio.volume = DEFAULT_STATE.volume;
    this.audio.ontimeupdate = () => this.handleTimeUpdate();
    this.audio.ondurationchange = () => this.patch({ duration: this.audio.duration || 0 });
    this.audio.onended = () => this.handleEnded();
    this.audio.onerror = () => this.patch({ isPlaying: false });
    
    // Once audio is ready, apply resume time if applicable
    this.audio.onloadedmetadata = () => {
      const track = this.snap.track;
      if (track?.is_audiobook && track.resume_time && track.resume_time > 0) {
        this.audio.currentTime = track.resume_time;
      }
    };
  }

  private handleTimeUpdate() {
    const currentTime = this.audio.currentTime;
    this.patch({ currentTime });

    const track = this.snap.track;
    if (track?.is_audiobook && this.snap.isPlaying) {
      const now = Date.now();
      // Sync every 10 seconds or 10 seconds difference
      if (now - this.lastSyncTime > 10000 || Math.abs(currentTime - this.lastSyncSeconds) > 10) {
        this.lastSyncTime = now;
        this.lastSyncSeconds = currentTime;
        this.api.updateAudiobookProgress(track.id, Math.floor(currentTime)).subscribe();
        // Update local state copy
        track.resume_time = Math.floor(currentTime);
      }
    }
  }

  get snap() { return this._state.value; }

  // ── Play a track (with optional queue context) ────────────────────────────
  playTrack(track: Track, queue: Track[] = []) {
    const q = queue.length ? queue : [track];
    const idx = q.findIndex(t => t.id === track.id);
    this.patch({ track, queue: q, queueIndex: Math.max(0, idx) });
    this.load(track);
  }

  play() {
    this.audio.play().then(() => this.patch({ isPlaying: true })).catch(() => {});
  }

  pause() {
    this.audio.pause();
    this.patch({ isPlaying: false });
  }

  toggle() {
    this.snap.isPlaying ? this.pause() : this.play();
  }

  next() {
    const { queue, queueIndex, shuffle } = this.snap;
    if (!queue.length) return;
    const idx = shuffle
      ? Math.floor(Math.random() * queue.length)
      : (queueIndex + 1) % queue.length;
    this.patch({ queueIndex: idx });
    this.load(queue[idx]);
  }

  prev() {
    if (this.audio.currentTime > 3) { this.audio.currentTime = 0; return; }
    const { queue, queueIndex } = this.snap;
    if (!queue.length) return;
    const idx = queueIndex <= 0 ? queue.length - 1 : queueIndex - 1;
    this.patch({ queueIndex: idx });
    this.load(queue[idx]);
  }

  seek(s: number) { this.audio.currentTime = s; }

  setVolume(v: number) {
    this.audio.volume = v;
    this.patch({ volume: v, isMuted: v === 0 });
  }

  toggleMute() {
    const m = !this.snap.isMuted;
    this.audio.muted = m;
    this.patch({ isMuted: m });
  }

  toggleShuffle() { this.patch({ shuffle: !this.snap.shuffle }); }

  toggleRepeat() {
    const map: Record<string, PlayerState['repeat']> = { none: 'all', all: 'one', one: 'none' };
    this.patch({ repeat: map[this.snap.repeat] });
  }

  format(s: number) {
    if (!s || isNaN(s)) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  private load(track: Track) {
    // Use /api/stream/:id for on-the-fly decompression
    this.audio.src = `/api/stream/${track.id}`;
    this.audio.load();
    this.audio.play()
      .then(() => this.patch({ isPlaying: true, track }))
      .catch(() => this.patch({ isPlaying: false }));
  }

  private handleEnded() {
    const { repeat, queue, queueIndex } = this.snap;
    if (repeat === 'one') { this.audio.currentTime = 0; this.audio.play(); return; }
    if (repeat === 'all' || queueIndex < queue.length - 1) { this.next(); return; }
    this.patch({ isPlaying: false });
  }

  private patch(partial: Partial<PlayerState>) {
    this._state.next({ ...this._state.value, ...partial });
  }
}
