import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { PlayerService } from '../../core/services/player.service';
import { ToastService } from '../../core/services/toast.service';
import { WebsocketService } from '../../core/services/websocket.service';
import { ModalService } from '../../core/services/modal.service';
import { Track, Playlist } from '../../models/interfaces';

@Component({
  selector: 'app-library',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <h1 class="page__title">Biblioteca</h1>

      <table class="track-table" *ngIf="tracks.length">
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
            <td class="track-table__actions" style="position:relative; display:flex; gap: 4px; align-items:center; justify-content:flex-end; padding-right: 24px; padding-top: 12px;" (click)="$event.stopPropagation()">
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

      <!-- Floating Bulk Action Bar -->
      <div class="bulk-bar" *ngIf="selectedTracks.size > 0">
        <span class="bulk-bar__count">{{ selectedTracks.size }} música(s) selecionada(s)</span>
        <div class="bulk-bar__actions">
          <button class="btn btn-outline" (click)="openBulkEdit()">Editar em Lote</button>
          <button class="btn btn-outline" style="border-color:#ff4444; color:#ff4444" (click)="bulkDelete()">Excluir</button>
          <button class="btn btn-accent" (click)="clearSelection()">Cancelar</button>
        </div>
      </div>

      <!-- Bulk Edit Modal -->
      <div class="modal-overlay" *ngIf="showBulkEditModal" (click)="showBulkEditModal = false">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Editar em Lote</h3>
            <button class="btn-icon" (click)="showBulkEditModal = false">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div style="display:flex; flex-direction:column; gap:16px;">
              <div>
                <label style="display:block; margin-bottom:8px; font-weight:600; color:var(--text-sub);">Novo Artista</label>
                <input class="input" [(ngModel)]="bulkArtist" placeholder="Deixe em branco para não alterar" (keyup.enter)="saveBulkEdit()">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" (click)="showBulkEditModal = false">Cancelar</button>
            <button class="btn btn-accent" (click)="saveBulkEdit()">Salvar</button>
          </div>
        </div>
      </div>

      <div class="empty" *ngIf="!loading && !tracks.length">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <h3>Sua biblioteca está vazia</h3>
        <p>Vá para a Busca e baixe algumas músicas.</p>
      </div>
    </div>
  `,
  styles: [`
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
    .empty { padding: 96px 0; text-align: center; color: var(--text-muted); display:flex;flex-direction:column;align-items:center;gap:16px; h3{color:var(--text);font-size:22px;} svg { color: var(--accent-cyan); filter: drop-shadow(0 0 8px rgba(0, 191, 255, 0.3)); } }

    .dropdown-menu {
      position: absolute; right: 0; top: calc(100% + 4px); z-index: 50;
      background: var(--bg-elevated); border: 1.5px solid var(--border);
      border-radius: var(--radius); padding: 8px 0; min-width: 210px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      animation: fadeIn 0.2s ease;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .dropdown-header {
      padding: 6px 16px 10px; font-size: 10px; font-weight: 800;
      text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px;
      border-bottom: 1px solid var(--border-subtle); margin-bottom: 6px;
    }
    .dropdown-item {
      padding: 10px 16px; font-size: 13px; color: var(--text-sub); cursor: pointer;
      display: flex; align-items: center; gap: 12px; transition: var(--trans);
      &:hover { background: var(--bg-hover); color: var(--text); }
    }
    .dropdown-icon {
      width: 24px; height: 24px; border-radius: 6px; background: var(--bg-highlight);
      display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--text-muted);
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

  // Selection states
  selectedTracks = new Set<string>();
  showBulkEditModal = false;
  bulkArtist = '';

  constructor(
    public api: ApiService,
    private ps: PlayerService,
    private toast: ToastService,
    private ws: WebsocketService,
    private modal: ModalService
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

  async remove(t: Track, ev: Event) {
    ev.stopPropagation();
    this.activeMenu = null;
    const confirmed = await this.modal.confirm('Excluir Música', `Deseja realmente excluir "${t.title}" da biblioteca?`);
    if (confirmed) {
      this.api.deleteTrack(t.id).subscribe({
        next: () => { 
          this.tracks = this.tracks.filter(x => x.id !== t.id); 
          this.selectedTracks.delete(t.id);
          this.toast.show('Removida da biblioteca'); 
        },
        error: () => this.toast.show('Erro ao remover', 'error')
      });
    }
  }

  async edit(t: Track, ev: Event) {
    ev.stopPropagation();
    this.activeMenu = null;
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

  openBulkEdit() {
    this.bulkArtist = '';
    this.showBulkEditModal = true;
  }

  saveBulkEdit() {
    const ids = Array.from(this.selectedTracks);
    if (ids.length === 0) return;

    this.showBulkEditModal = false;
    const artist = this.bulkArtist.trim();
    if (!artist) {
      this.toast.show('Digite um nome de artista válido', 'info');
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const promises = ids.map(id => {
      const track = this.tracks.find(t => t.id === id);
      const title = track ? track.title : '';
      return new Promise<void>((resolve) => {
        this.api.updateTrack(id, title, artist).subscribe({
          next: () => {
            successCount++;
            if (track) {
              track.artist = artist;
            }
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
        this.toast.show(`${successCount} música(s) atualizada(s)`, 'success');
      }
      if (errorCount > 0) {
        this.toast.show(`Erro ao atualizar ${errorCount} música(s)`, 'error');
      }
      this.clearSelection();
    });
  }

  async bulkDelete() {
    const ids = Array.from(this.selectedTracks);
    if (ids.length === 0) return;

    const confirmed = await this.modal.confirm('Excluir Músicas', `Deseja realmente excluir as ${ids.length} música(s) selecionada(s) da biblioteca?`);
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
