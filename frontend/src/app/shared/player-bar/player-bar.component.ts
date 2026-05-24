import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerService } from '../../core/services/player.service';
import { PlayerState } from '../../models/interfaces';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-player-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="bar" *ngIf="state$ | async as s">
    <!-- Track info -->
    <div class="bar__info">
      <div class="thumb">
        <img *ngIf="s.track?.thumbnail_url" [src]="s.track!.thumbnail_url" [alt]="s.track!.title">
        <div *ngIf="!s.track?.thumbnail_url" class="thumb__placeholder">♪</div>
      </div>
      <div class="meta" *ngIf="s.track; else noTrack">
        <span class="meta__title truncate">{{ s.track.title }}</span>
        <span class="meta__artist truncate">{{ s.track.artist }}</span>
      </div>
      <ng-template #noTrack>
        <span class="meta__title" style="color:var(--text-muted)">Nada tocando</span>
      </ng-template>
    </div>

    <!-- Center: controls + seek -->
    <div class="bar__center">
      <div class="controls">
        <button class="btn-icon" [class.active]="s.shuffle" (click)="ps.toggleShuffle()" title="Shuffle">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
        </button>
        <button class="btn-icon" (click)="ps.prev()" title="Anterior">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2"/></svg>
        </button>
        <button class="btn-play" (click)="ps.toggle()" [disabled]="!s.track">
          <svg *ngIf="!s.isPlaying" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <svg *ngIf="s.isPlaying" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </button>
        <button class="btn-icon" (click)="ps.next()" title="Próxima">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"/></svg>
        </button>
        <button class="btn-icon" [class.active]="s.repeat !== 'none'" (click)="ps.toggleRepeat()" title="Repetir">
          <svg *ngIf="s.repeat !== 'one'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
          <span *ngIf="s.repeat === 'one'" style="font-size:11px;font-weight:800;color:var(--accent)">1</span>
        </button>
      </div>

      <div class="seek">
        <span class="seek__time">{{ ps.format(s.currentTime) }}</span>
        <input type="range" [value]="s.currentTime" [max]="s.duration || 1" step="0.5"
          [style.background]="gradient(s.currentTime, s.duration)"
          (change)="ps.seek(+$any($event.target).value)">
        <span class="seek__time">{{ ps.format(s.duration) }}</span>
      </div>
    </div>

    <!-- Volume -->
    <div class="bar__vol">
      <button class="btn-icon" (click)="ps.toggleMute()">
        <svg *ngIf="!s.isMuted && s.volume > 0.5" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
        <svg *ngIf="!s.isMuted && s.volume <= 0.5 && s.volume > 0" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
        <svg *ngIf="s.isMuted || s.volume === 0" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
      </button>
      <input type="range" min="0" max="1" step="0.02"
        [value]="s.isMuted ? 0 : s.volume"
        [style.background]="gradient(s.isMuted ? 0 : s.volume, 1)"
        (input)="ps.setVolume(+$any($event.target).value)">
    </div>
  </div>
  `,
  styles: [`
    .bar {
      display: flex; align-items: center;
      height: 100%; padding: 0 20px;
      background: #181818; border-top: 1px solid var(--border);
      gap: 16px;
    }

    /* Track info */
    .bar__info {
      display: flex; align-items: center; gap: 12px;
      width: var(--sidebar-w); min-width: 0; flex-shrink: 0;
    }

    .thumb {
      width: 56px; height: 56px; border-radius: 4px; overflow: hidden;
      background: var(--bg-highlight); display: flex; align-items: center;
      justify-content: center; font-size: 20px; color: var(--text-muted); flex-shrink: 0;
      img { width: 100%; height: 100%; object-fit: cover; }
      &__placeholder { font-size: 24px; }
    }

    .meta {
      min-width: 0; display: flex; flex-direction: column; gap: 3px;
      &__title { font-size: 13px; font-weight: 600; display: block; }
      &__artist { font-size: 11px; color: var(--text-sub); display: block; }
    }

    /* Center controls */
    .bar__center {
      flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px;
    }

    .controls {
      display: flex; align-items: center; gap: 18px;
    }

    .btn-play {
      width: 36px; height: 36px; border-radius: 50%;
      background: var(--text); color: #000; border: none;
      display: flex; align-items: center; justify-content: center;
      transition: var(--trans);
      &:hover:not(:disabled) { transform: scale(1.06); background: #e8e8e8; }
      &:disabled { opacity: .35; cursor: default; }
    }

    .seek {
      display: flex; align-items: center; gap: 10px; width: 100%; max-width: 560px;
      &__time { font-size: 11px; color: var(--text-muted); width: 36px; text-align: center; flex-shrink: 0; }
      input { flex: 1; }
    }

    /* Volume */
    .bar__vol {
      display: flex; align-items: center; gap: 8px; width: 150px; flex-shrink: 0;
      input { flex: 1; }
    }
  `]
})
export class PlayerBarComponent {
  state$: Observable<PlayerState>;
  constructor(public ps: PlayerService) { this.state$ = ps.state$; }

  gradient(v: number, max: number): string {
    const p = max ? (v / max) * 100 : 0;
    return `linear-gradient(to right, var(--accent) ${p}%, rgba(255,255,255,.2) ${p}%)`;
  }
}
