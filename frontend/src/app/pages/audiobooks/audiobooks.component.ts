import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { PlayerService } from '../../core/services/player.service';
import { Audiobook } from '../../models/interfaces';
import { ToastService } from '../../core/services/toast.service';
import { WebsocketService } from '../../core/services/websocket.service';

@Component({
  selector: 'app-audiobooks',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="view-header">
      <h1 class="view-title">Audiolivros</h1>
      <p class="view-subtitle">Sua coleção de audiolivros salvos.</p>
    </div>

    <div class="audiobooks-grid">
      <div class="audiobook-card" *ngFor="let ab of audiobooks">
        <div class="card-cover">
          <img *ngIf="ab.thumbnail_url" [src]="ab.thumbnail_url" alt="cover">
          <div class="cover-fallback" *ngIf="!ab.thumbnail_url">♪</div>
          <button class="btn-play-overlay" (click)="play(ab)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
        </div>
        <div class="card-info">
          <h3 class="card-title">{{ ab.title }}</h3>
          <p class="card-author">{{ ab.author || 'Desconhecido' }}</p>
          <div class="progress-bar">
            <div class="progress-fill" [style.width.%]="getProgressPct(ab)"></div>
          </div>
          <div class="card-meta">
            <span>{{ formatTime(ab.resume_time) }} / {{ formatTime(ab.duration) }}</span>
          </div>
          <div class="card-actions">
            <button class="btn-icon" (click)="delete(ab.id)" title="Excluir">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>
      
      <div *ngIf="audiobooks.length === 0" class="empty-state">
        <p>Nenhum audiolivro encontrado.</p>
      </div>
    </div>
  `,
  styles: [`
    .view-header { 
      padding: 32px 40px 16px; 
      position: sticky; top: 0; 
      background: rgba(11,13,25,0.85); 
      backdrop-filter: blur(12px); 
      -webkit-backdrop-filter: blur(12px); 
      z-index: 10; 
      border-bottom: 1.5px solid var(--border); 
    }
    .view-title { 
      font-size: 36px; 
      font-weight: 900; 
      margin-bottom: 8px; 
      background: var(--gradient-primary);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.5px;
    }
    .view-subtitle { color: var(--text-sub); font-size: 14px; font-weight: 500; }

    .audiobooks-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 24px;
      padding: 32px 40px;
    }

    .audiobook-card {
      background: var(--bg-card);
      border-radius: var(--radius-lg);
      padding: 16px;
      transition: var(--trans);
      position: relative;
      border: 1px solid rgba(255,255,255,0.04);
      box-shadow: 0 6px 18px rgba(0,0,0,0.3);

      &:hover {
        transform: translateY(-5px);
        background: var(--bg-hover);
        border-color: rgba(255, 18, 124, 0.3);
        box-shadow: 0 10px 25px rgba(255, 18, 124, 0.15);
        .btn-play-overlay { opacity: 1; transform: translateY(0); }
      }
    }

    .card-cover {
      position: relative;
      aspect-ratio: 1;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 14px;
      background: var(--bg-highlight);
      box-shadow: 0 6px 16px rgba(0,0,0,0.4);

      img { width: 100%; height: 100%; object-fit: cover; }
      .cover-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 40px; color: var(--text-muted); }
    }

    .btn-play-overlay {
      position: absolute;
      bottom: 12px; right: 12px;
      width: 44px; height: 44px;
      border-radius: 50%;
      background: var(--gradient-pink);
      color: var(--text);
      border: none;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      opacity: 0;
      transform: translateY(8px);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 6px 12px rgba(255,18,124,0.4);

      &:hover { transform: scale(1.1) !important; box-shadow: 0 8px 18px rgba(255,18,124,0.6); }
    }

    .card-title {
      font-size: 14px; font-weight: 700; color: var(--text);
      margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .card-author {
      font-size: 12px; color: var(--text-sub); margin-bottom: 12px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .progress-bar {
      height: 4px; background: rgba(255,255,255,0.1); border-radius: var(--radius-full); overflow: hidden; margin-bottom: 8px;
    }
    .progress-fill { height: 100%; background: var(--accent-cyan); box-shadow: 0 0 8px var(--accent-cyan); }

    .card-meta {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 11px; color: var(--text-muted); font-weight: 600;
    }

    .card-actions {
      position: absolute; top: 22px; right: 22px;
      display: flex; gap: 8px; opacity: 0; transition: var(--trans);
    }

    .audiobook-card:hover .card-actions { opacity: 1; }

    .btn-icon {
      width: 28px; height: 28px; border-radius: 50%; background: rgba(0,0,0,0.6);
      color: var(--text); border: none; display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: var(--trans);
      &:hover { background: var(--accent); color: var(--text); transform: scale(1.1); }
    }

    .empty-state { grid-column: 1 / -1; padding: 48px; text-align: center; color: var(--text-muted); font-size: 14px; }
  `]
})
export class AudiobooksComponent implements OnInit {
  audiobooks: Audiobook[] = [];

  constructor(private api: ApiService, private player: PlayerService, private toast: ToastService, private ws: WebsocketService) {}

  ngOnInit() {
    this.load();
    this.ws.messages$.subscribe(m => {
      if (m.event === 'download_progress' && m.payload && m.payload.status === 'completed') {
        this.load();
      }
    });
  }

  load() {
    this.api.getAudiobooks().subscribe(res => this.audiobooks = res);
  }

  play(ab: Audiobook) {
    // For now we map it to a track to use the existing player
    // In Phase 4, we will enhance PlayerService to handle Resume Time.
    const t = {
      id: ab.id,
      title: ab.title,
      artist: ab.author,
      album: 'Audiobook',
      duration: ab.duration,
      file_path: ab.file_path,
      thumbnail_url: ab.thumbnail_url,
      storage_type: 'mp3',
      added_at: ab.added_at,
      resume_time: ab.resume_time,
      is_audiobook: true
    };
    this.player.playTrack(t);
  }

  delete(id: string) {
    if (confirm('Tem certeza que deseja excluir este audiolivro?')) {
      this.api.deleteAudiobook(id).subscribe(() => {
        this.toast.show('Audiolivro excluído');
        this.load();
      });
    }
  }

  getProgressPct(ab: Audiobook): number {
    if (!ab.duration) return 0;
    return (ab.resume_time / ab.duration) * 100;
  }

  formatTime(secs: number): string {
    if (!secs) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
