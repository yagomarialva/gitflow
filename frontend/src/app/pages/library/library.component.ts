import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { PlayerService } from '../../core/services/player.service';
import { ToastService } from '../../core/services/toast.service';
import { WebsocketService } from '../../core/services/websocket.service';
import { Track, Playlist } from '../../models/interfaces';

@Component({
  selector: 'app-library',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <h1 class="page__title">Biblioteca</h1>

      <table class="track-table" *ngIf="tracks.length">
        <thead>
          <tr>
            <th class="track-table__num">#</th>
            <th>Título</th>
            <th>Qualidade</th>
            <th class="track-table__dur">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </th>
            <th class="track-table__actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let t of tracks; let i = index" class="track-row" [class.is-playing]="playingId === t.id" (click)="play(t)">
            <td class="track-table__num">
              <span *ngIf="playingId !== t.id">{{ i + 1 }}</span>
              <svg *ngIf="playingId === t.id" width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </td>
            <td>
              <div style="display:flex;align-items:center;gap:12px">
                <img [src]="t.thumbnail_url" [alt]="t.title" class="track-table__thumb" *ngIf="t.thumbnail_url">
                <div class="track-table__thumb" *ngIf="!t.thumbnail_url" style="display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--text-muted)">♪</div>
                <div style="display:flex;flex-direction:column;gap:4px">
                  <span class="track-table__title" [class.accent]="playingId === t.id">{{ t.title }}</span>
                  <span class="track-table__artist">{{ t.artist || 'Artista Desconhecido' }}</span>
                </div>
              </div>
            </td>
            <td>
              <span class="badge">{{ t.storage_type === 'mp3_zip' ? 'Alta Compressão (ZIP)' : 'MP3' }}</span>
            </td>
            <td class="track-table__dur">{{ format(t.duration) }}</td>
            <td class="track-table__actions" style="position:relative; display:flex; gap: 4px; align-items:center; justify-content:flex-end; padding-right: 24px; padding-top: 12px;">
              <a [href]="api.streamUrl(t.id)" download class="btn-icon" title="Baixar MP3 / Salvar local" (click)="$event.stopPropagation()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </a>
              <button class="btn-icon" title="Editar Metadados" (click)="edit(t, $event)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
              </button>
              <button class="btn-icon" title="Opções de Playlist" (click)="toggleMenu(t.id, $event)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
              </button>
              <button class="btn-icon" title="Remover da Biblioteca" (click)="remove(t, $event)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              
              <!-- Dropdown menu -->
              <div class="dropdown-menu" *ngIf="activeMenu === t.id" (click)="$event.stopPropagation()">
                <div class="dropdown-header">Adicionar à Playlist</div>
                <div class="dropdown-item" *ngFor="let p of playlists" (click)="addToPlaylist(p, t)">
                  <div class="dropdown-icon" style="font-size:14px; padding-bottom: 2px;">♪</div> {{ p.name }}
                </div>
                <div class="dropdown-empty" *ngIf="!playlists.length">Nenhuma playlist criada.</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="empty" *ngIf="!loading && !tracks.length">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <h3>Sua biblioteca está vazia</h3>
        <p>Vá para a Busca e baixe algumas músicas.</p>
      </div>
    </div>
  `,
  styles: [`
    .badge {
      background: rgba(255,255,255,.1);
      color: var(--text-sub);
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: var(--radius-full);
      text-transform: uppercase;
      letter-spacing: .5px;
    }
    .empty { padding: 80px 0; text-align: center; color: var(--text-muted); display:flex;flex-direction:column;align-items:center;gap:16px; h3{color:var(--text);font-size:20px;} }

    .dropdown-menu {
      position: absolute; right: 0; top: 100%; z-index: 50;
      background: #2a2a3e; border: 1px solid var(--border);
      border-radius: var(--radius); padding: 8px 0; min-width: 200px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .dropdown-header {
      padding: 4px 16px 8px; font-size: 11px; font-weight: 700;
      text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px;
      border-bottom: 1px solid var(--border); margin-bottom: 8px;
    }
    .dropdown-item {
      padding: 8px 16px; font-size: 13px; color: var(--text); cursor: pointer;
      display: flex; align-items: center; gap: 12px; transition: var(--trans);
      &:hover { background: var(--bg-hover); }
    }
    .dropdown-icon {
      width: 24px; height: 24px; border-radius: 4px; background: var(--bg-highlight);
      display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--text-muted);
    }
    .dropdown-empty {
      padding: 12px 16px; font-size: 13px; color: var(--text-muted); font-style: italic;
    }
  `]
})
export class LibraryComponent implements OnInit {
  tracks: Track[] = [];
  playlists: Playlist[] = [];
  loading = true;
  playingId: string | null = null;
  activeMenu: string | null = null;

  constructor(
    public api: ApiService,
    private ps: PlayerService,
    private toast: ToastService,
    private ws: WebsocketService
  ) {}

  ngOnInit() {
    this.load();
    this.api.getPlaylists().subscribe(p => this.playlists = p);
    this.ps.state$.subscribe(s => this.playingId = s.track?.id ?? null);
    this.ws.messages$.subscribe(m => {
      if (m.event === 'download_progress' && m.payload?.status === 'completed') this.load();
    });
    
    // Close dropdown on click outside
    document.addEventListener('click', () => this.activeMenu = null);
  }

  load() {
    this.loading = true;
    this.api.getLibrary().subscribe(t => { this.tracks = t; this.loading = false; });
  }

  play(t: Track) { this.ps.playTrack(t, this.tracks); }

  remove(t: Track, ev: Event) {
    ev.stopPropagation();
    this.activeMenu = null;
    if (confirm(`Excluir "${t.title}" da biblioteca?`)) {
      this.api.deleteTrack(t.id).subscribe({
        next: () => { this.tracks = this.tracks.filter(x => x.id !== t.id); this.toast.show('Removida da biblioteca'); },
        error: () => this.toast.show('Erro ao remover', 'error')
      });
    }
  }

  edit(t: Track, ev: Event) {
    ev.stopPropagation();
    this.activeMenu = null;
    const newTitle = prompt('Editar Título da Música:', t.title);
    if (newTitle === null) return;
    const newArtist = prompt('Editar Artista da Música:', t.artist);
    if (newArtist === null) return;
    
    this.api.updateTrack(t.id, newTitle, newArtist).subscribe({
      next: () => {
        t.title = newTitle;
        t.artist = newArtist;
        this.toast.show('Música atualizada', 'success');
      },
      error: () => this.toast.show('Erro ao atualizar música', 'error')
    });
  }

  toggleMenu(trackId: string, ev: Event) {
    ev.stopPropagation();
    this.activeMenu = this.activeMenu === trackId ? null : trackId;
  }

  addToPlaylist(p: Playlist, t: Track) {
    this.activeMenu = null;
    this.api.addToPlaylist(p.id, t.id).subscribe({
      next: () => this.toast.show(`"${t.title}" adicionada à ${p.name}`, 'success'),
      error: () => this.toast.show('Erro ao adicionar à playlist', 'error')
    });
  }

  format(s: number) { return this.ps.format(s); }
}
