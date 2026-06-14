import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { PlayerService } from '../../core/services/player.service';
import { ToastService } from '../../core/services/toast.service';
import { ModalService } from '../../core/services/modal.service';
import { Playlist, Track } from '../../models/interfaces';

@Component({
  selector: 'app-playlist',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="page" style="padding:0">
      
      <!-- Hero Header -->
      <div class="hero" *ngIf="pl">
        <div class="hero__cover">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" style="opacity:.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
        <div class="hero__info">
          <span class="hero__label">Playlist</span>
          <h1 class="hero__title">{{ pl.name }}</h1>
          <span class="hero__meta">{{ tracks.length }} música{{ tracks.length !== 1 ? 's' : '' }}</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="actions" *ngIf="pl">
        <button class="btn-play-all" (click)="playAll()" title="Tocar Playlist" *ngIf="tracks.length">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <a [href]="api.downloadPlaylistUrl(pl.id)" download class="btn-icon" style="background: rgba(255,255,255,0.1); border-radius: 50%; width: 56px; height: 56px;" title="Baixar Playlist (ZIP)" *ngIf="tracks.length">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </a>
        <button class="btn-icon" style="background: var(--bg-highlight); border-radius: 50%; width: 56px; height: 56px;" title="Adicionar Músicas" (click)="openAddModal()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <!-- Tracks Table -->
      <div class="table-wrap" *ngIf="tracks.length">
        <table class="track-table">
          <thead>
            <tr>
              <th class="track-table__checkbox" style="width: 40px; text-align: center;">
                <input type="checkbox" class="checkbox-custom" [checked]="isAllSelected()" (change)="toggleSelectAll()">
              </th>
              <th class="track-table__num">#</th>
              <th class="track-table__info-header">Título</th>
              <th class="track-table__quality-header">Qualidade</th>
              <th class="track-table__dur">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </th>
              <th class="track-table__actions"></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of tracks; let i = index" class="track-row" [class.is-playing]="playingId === t.id" (click)="play(t)">
              <td class="track-table__checkbox" style="width: 40px; text-align: center;" (click)="$event.stopPropagation()">
                <input type="checkbox" class="checkbox-custom" [checked]="selectedTracks.has(t.id)" (change)="toggleSelect(t.id)">
              </td>
              <td class="track-table__num">
                <span *ngIf="playingId !== t.id">{{ i + 1 }}</span>
                <svg *ngIf="playingId === t.id" width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </td>
              <td class="track-table__info">
                <div style="display:flex;align-items:center;gap:12px">
                  <img [src]="t.thumbnail_url" [alt]="t.title" class="track-table__thumb" *ngIf="t.thumbnail_url">
                  <div class="track-table__thumb" *ngIf="!t.thumbnail_url" style="display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--text-muted)">♪</div>
                  <div style="display:flex;flex-direction:column;gap:4px">
                    <span class="track-table__title" [class.accent]="playingId === t.id">{{ t.title }}</span>
                    <span class="track-table__artist">{{ t.artist || 'Artista Desconhecido' }}</span>
                  </div>
                </div>
              </td>
              <td class="track-table__quality">
                <span class="badge">{{ t.storage_type === 'mp3_zip' ? 'Alta Compressão (ZIP)' : 'MP3' }}</span>
              </td>
              <td class="track-table__dur">{{ format(t.duration) }}</td>
              <td class="track-table__actions" style="display:flex; gap: 4px; align-items:center; justify-content:flex-end; padding-right: 24px; padding-top: 12px;" (click)="$event.stopPropagation()">
                <a [href]="api.streamUrl(t.id)" download class="btn-icon" title="Baixar MP3 / Salvar local" (click)="$event.stopPropagation()">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </a>
                <button class="btn-icon" title="Editar Metadados" (click)="edit(t, $event)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                </button>
                <button class="btn-icon" title="Remover da Playlist" (click)="remove(t, $event)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Floating Bulk Action Bar -->
      <div class="bulk-bar" *ngIf="selectedTracks.size > 0">
        <span class="bulk-bar__count">{{ selectedTracks.size }} música(s) selecionada(s)</span>
        <div class="bulk-bar__actions">
          <button class="btn btn-outline" style="border-color:#ff9900; color:#ff9900" (click)="bulkRemove()">Remover da Playlist</button>
          <button class="btn btn-outline" style="border-color:#ff4444; color:#ff4444" (click)="bulkDelete()">Excluir da Biblioteca</button>
          <button class="btn btn-accent" (click)="clearSelection()">Cancelar</button>
        </div>
      </div>

      <div class="empty" *ngIf="!loading && !tracks.length && pl">
        <p class="text-muted" style="margin-bottom:16px;">Esta playlist está vazia. Adicione músicas da Biblioteca!</p>
        <button class="btn-primary" (click)="openAddModal()">Adicionar Músicas</button>
      </div>

      <!-- Add Music Modal -->
      <div class="modal-overlay" *ngIf="showModal" (click)="showModal = false">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Adicionar à Playlist</h3>
            <button class="btn-icon" (click)="showModal = false">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="modal-list" *ngIf="allTracks.length">
              <div class="modal-item" *ngFor="let t of allTracks">
                <img [src]="t.thumbnail_url" class="modal-thumb" *ngIf="t.thumbnail_url">
                <div class="modal-thumb" *ngIf="!t.thumbnail_url">♪</div>
                <div class="modal-item-info">
                  <div class="modal-title">{{ t.title }}</div>
                  <div class="modal-artist">{{ t.artist }}</div>
                </div>
                <button class="btn-outline-small" (click)="addTrackToPlaylist(t)">Adicionar</button>
              </div>
            </div>
            <div *ngIf="!allTracks.length" class="text-muted" style="text-align:center; padding: 20px;">Sua biblioteca está vazia.</div>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .hero {
      display: flex; align-items: flex-end; gap: 28px;
      padding: 64px 40px 28px;
      background: linear-gradient(to bottom, rgba(21, 25, 46, 0.9) 0%, var(--bg-base) 100%);
      border-bottom: 1.5px solid var(--border);
      position: relative;
      
      &__cover {
        width: 200px; height: 200px; border-radius: var(--radius-lg);
        background: var(--gradient-primary);
        box-shadow: 0 12px 36px rgba(0,0,0,.6), var(--shadow-neon);
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        svg { color: var(--text); filter: drop-shadow(0 0 8px rgba(255,255,255,0.4)); }
      }
      &__info { display: flex; flex-direction: column; gap: 6px; }
      &__label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--accent-cyan); text-shadow: 0 0 5px rgba(0, 191, 255, 0.3); }
      &__title { font-size: 48px; font-weight: 900; line-height: 1.15; letter-spacing: -1.5px; color: var(--text); }
      &__meta { font-size: 13px; color: var(--text-sub); margin-top: 6px; font-weight: 600; }
    }

    .actions { padding: 24px 40px; display: flex; gap: 20px; align-items: center; }
    .btn-play-all {
      width: 52px; height: 52px; border-radius: 50%;
      background: var(--gradient-pink); color: var(--text); border: none;
      display: flex; align-items: center; justify-content: center;
      transition: var(--trans); box-shadow: 0 8px 20px rgba(255, 18, 124, 0.4);
      &:hover { transform: scale(1.08); box-shadow: 0 10px 25px rgba(255, 18, 124, 0.6); }
    }

    .table-wrap { padding: 0 40px 40px; }

    .badge {
      background: rgba(0, 191, 255, 0.08);
      color: var(--accent-cyan);
      border: 1px solid rgba(0, 191, 255, 0.15);
      font-size: 10px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: var(--radius-full);
      text-transform: uppercase;
      letter-spacing: .5px;
    }
    
    .empty { padding: 64px 40px; font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
    
    .btn-primary {
      background: var(--gradient-pink); color: var(--text); font-weight: 700; padding: 12px 28px;
      border-radius: var(--radius-full); border: none; cursor: pointer; transition: var(--trans);
      box-shadow: 0 4px 12px rgba(255, 18, 124, 0.3);
      &:hover { transform: scale(1.04); box-shadow: 0 6px 18px rgba(255, 18, 124, 0.5); }
    }

    .modal-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center;
      z-index: 1000; padding: 20px;
      backdrop-filter: blur(8px);
    }
    .modal {
      background: var(--bg-elevated); width: 100%; max-width: 500px; border-radius: var(--radius-lg);
      border: 1.5px solid var(--border);
      box-shadow: 0 20px 50px rgba(0,0,0,0.6), var(--shadow-neon); display: flex; flex-direction: column; max-height: 80vh;
      animation: modalSlide 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    @keyframes modalSlide {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .modal-header {
      padding: 20px 24px; border-bottom: 1px solid var(--border-subtle); display: flex;
      justify-content: space-between; align-items: center;
      h3 { margin: 0; font-size: 20px; font-weight: 800; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    }
    .modal-body { padding: 12px 0; overflow-y: auto; }
    .modal-item {
      display: flex; align-items: center; gap: 14px; padding: 12px 24px;
      transition: var(--trans);
      &:hover { background: var(--bg-hover); }
    }
    .modal-thumb { width: 44px; height: 44px; border-radius: 6px; background: var(--bg-highlight); display: flex; align-items: center; justify-content: center; color: var(--text-muted); box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
    .modal-item-info { flex: 1; min-width: 0; }
    .modal-title { font-weight: 700; font-size: 14px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .modal-artist { font-size: 12px; color: var(--text-sub); }
    .btn-outline-small {
      padding: 6px 14px; border-radius: var(--radius-full); border: 1.5px solid var(--border);
      background: transparent; color: var(--text); font-size: 12px; font-weight: 700; cursor: pointer;
      transition: var(--trans);
      &:hover { border-color: var(--accent-cyan); background: rgba(0, 191, 255, 0.08); }
    }

    /* Responsive styles for Playlist Component */
    @media (max-width: 767px) {
      .hero {
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 32px 20px 20px;
        gap: 16px;
        
        &__cover {
          width: 120px;
          height: 120px;
          svg {
            width: 44px;
            height: 44px;
          }
        }

        &__title {
          font-size: 28px;
        }
      }

      .actions {
        padding: 16px 20px;
        justify-content: center;
        gap: 16px;
      }

      .table-wrap {
        padding: 0 16px 20px;
      }

      .empty {
        padding: 36px 20px;
        text-align: center;
      }
    }

    @media (max-width: 480px) {
      .modal {
        max-height: 90vh;
      }
      .modal-header {
        padding: 16px 20px;
        h3 { font-size: 18px; }
      }
      .modal-item {
        padding: 10px 20px;
        gap: 10px;
      }
      .modal-thumb {
        width: 36px; height: 36px;
      }
    }
  `]
})
export class PlaylistComponent implements OnInit {
  pl: Playlist | null = null;
  tracks: Track[] = [];
  allTracks: Track[] = [];
  playingId: string | null = null;
  loading = true;
  showModal = false;
  currentId: string | null = null;

  // Selection states
  selectedTracks = new Set<string>();

  constructor(
    private route: ActivatedRoute,
    public api: ApiService,
    private ps: PlayerService,
    private toast: ToastService,
    private modal: ModalService
  ) {}

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.currentId = id;
        this.clearSelection();
        this.load(id);
      }
    });
    this.ps.state$.subscribe(s => this.playingId = s.track?.id ?? null);
  }

  load(id: string) {
    this.loading = true;
    this.tracks = []; // clear previous tracks instantly to avoid visual bugs
    this.pl = null;
    
    this.api.getPlaylistTracks(id).subscribe({
      next: t => { 
        if (this.currentId === id) {
          this.tracks = t; 
          this.loading = false; 
        }
      },
      error: () => { 
        if (this.currentId === id) {
          this.toast.show('Erro ao carregar playlist', 'error'); 
          this.loading = false; 
        }
      }
    });
    
    this.api.getPlaylists().subscribe(pls => {
      if (this.currentId === id) {
        this.pl = pls.find(p => p.id === id) ?? null;
      }
    });
  }

  openAddModal() {
    this.showModal = true;
    this.api.getLibrary().subscribe(t => {
      // Filter out tracks already in the playlist
      const existingIds = new Set(this.tracks.map(x => x.id));
      this.allTracks = t.filter(x => !existingIds.has(x.id));
    });
  }

  addTrackToPlaylist(t: Track) {
    if (!this.pl) return;
    this.api.addToPlaylist(this.pl.id, t.id).subscribe({
      next: () => {
        this.toast.show(`Adicionada à playlist`, 'success');
        this.allTracks = this.allTracks.filter(x => x.id !== t.id);
        this.tracks.push(t);
      },
      error: () => this.toast.show('Erro ao adicionar', 'error')
    });
  }

  playAll() { if (this.tracks.length) this.ps.playTrack(this.tracks[0], this.tracks); }
  play(t: Track) { this.ps.playTrack(t, this.tracks); }
  
  async remove(t: Track, ev: Event) {
    ev.stopPropagation();
    if (!this.pl) return;
    const confirmed = await this.modal.confirm('Remover da Playlist', `Deseja realmente remover "${t.title}" desta playlist?`);
    if (confirmed) {
      this.api.removeFromPlaylist(this.pl.id, t.id).subscribe({
        next: () => { 
          this.tracks = this.tracks.filter(x => x.id !== t.id); 
          this.selectedTracks.delete(t.id);
          this.toast.show('Removida da playlist'); 
        },
        error: () => this.toast.show('Erro ao remover', 'error')
      });
    }
  }

  async edit(t: Track, ev: Event) {
    ev.stopPropagation();
    const newTitle = await this.modal.prompt('Editar Música', 'Editar Título da Música:', t.title);
    if (newTitle === null) return;
    const newArtist = await this.modal.prompt('Editar Música', 'Editar Artista da Música:', t.artist);
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

  format(s: number) { return this.ps.format(s); }

  // Selection methods
  isAllSelected(): boolean {
    return this.tracks.length > 0 && this.selectedTracks.size === this.tracks.length;
  }

  toggleSelectAll() {
    if (this.isAllSelected()) {
      this.selectedTracks.clear();
    } else {
      this.tracks.forEach(t => this.selectedTracks.add(t.id));
    }
  }

  toggleSelect(id: string) {
    if (this.selectedTracks.has(id)) {
      this.selectedTracks.delete(id);
    } else {
      this.selectedTracks.add(id);
    }
  }

  clearSelection() {
    this.selectedTracks.clear();
  }

  async bulkRemove() {
    const ids = Array.from(this.selectedTracks);
    if (ids.length === 0 || !this.pl) return;

    const confirmed = await this.modal.confirm('Remover da Playlist', `Deseja realmente remover as ${ids.length} música(s) selecionada(s) desta playlist?`);
    if (!confirmed) return;

    let successCount = 0;
    let errorCount = 0;
    const promises = ids.map(id => {
      return new Promise<void>((resolve) => {
        this.api.removeFromPlaylist(this.pl!.id, id).subscribe({
          next: () => {
            successCount++;
            this.tracks = this.tracks.filter(t => t.id !== id);
            resolve();
          },
          error: () => {
            errorCount++;
            resolve();
          }
        });
      });
    });

    Promise.all(promises).then(() => {
      if (successCount > 0) {
        this.toast.show(`${successCount} música(s) removida(s)`, 'success');
      }
      if (errorCount > 0) {
        this.toast.show(`Erro ao remover ${errorCount} música(s)`, 'error');
      }
      this.clearSelection();
    });
  }

  async bulkDelete() {
    const ids = Array.from(this.selectedTracks);
    if (ids.length === 0) return;

    const confirmed = await this.modal.confirm('Excluir Músicas', `Deseja realmente excluir as ${ids.length} música(s) selecionada(s) da biblioteca e de todas as playlists?`);
    if (!confirmed) return;

    let successCount = 0;
    let errorCount = 0;
    const promises = ids.map(id => {
      return new Promise<void>((resolve) => {
        this.api.deleteTrack(id).subscribe({
          next: () => {
            successCount++;
            this.tracks = this.tracks.filter(t => t.id !== id);
            resolve();
          },
          error: () => {
            errorCount++;
            resolve();
          }
        });
      });
    });

    Promise.all(promises).then(() => {
      if (successCount > 0) {
        this.toast.show(`${successCount} música(s) excluída(s)`, 'success');
      }
      if (errorCount > 0) {
        this.toast.show(`Erro ao excluir ${errorCount} música(s)`, 'error');
      }
      this.clearSelection();
    });
  }
}
