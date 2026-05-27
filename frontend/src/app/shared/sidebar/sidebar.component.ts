import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { WebsocketService } from '../../core/services/websocket.service';
import { Playlist } from '../../models/interfaces';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <nav class="sidebar">
      <!-- Logo -->
      <div class="logo">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="var(--accent)">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
        </svg>
        <span>AresFlow</span>
      </div>

      <!-- Main nav -->
      <ul class="nav">
        <li><a routerLink="/search" routerLinkActive="active" class="nav__item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Buscar
        </a></li>
        <li><a routerLink="/library" routerLinkActive="active" class="nav__item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          Biblioteca
        </a></li>
        <li><a routerLink="/audiobooks" routerLinkActive="active" class="nav__item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
          Audiolivros
        </a></li>
        <li><a routerLink="/downloads" routerLinkActive="active" class="nav__item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Downloads
          <span *ngIf="activeCount > 0" class="badge">{{ activeCount }}</span>
        </a></li>
      </ul>

      <div class="divider"></div>

      <!-- Playlists header -->
      <div class="pl-header">
        <span>Playlists</span>
        <button class="btn-icon" title="Nova playlist" (click)="showForm = !showForm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <!-- New playlist form -->
      <div *ngIf="showForm" class="pl-form">
        <input class="input" [(ngModel)]="newName" placeholder="Nome da playlist" (keyup.enter)="create()">
        <button class="btn btn-accent" style="margin-top:8px;width:100%;padding:8px" (click)="create()">Criar</button>
      </div>

      <!-- Playlist list -->
      <ul class="pl-list">
        <li *ngFor="let p of playlists">
          <div class="pl-item-wrapper">
            <a [routerLink]="['/playlist', p.id]" routerLinkActive="active" class="pl-item" title="{{ p.name }}">
              <div class="pl-icon">♪</div>
              <span class="truncate" *ngIf="editId !== p.id">{{ p.name }}</span>
              <input *ngIf="editId === p.id" class="input edit-input" [(ngModel)]="editName" (keyup.enter)="saveEdit(p)" (blur)="saveEdit(p)" (click)="$event.stopPropagation()">
            </a>
            <div class="pl-actions" *ngIf="editId !== p.id">
              <button class="btn-icon-small" title="Renomear" (click)="startEdit(p, $event)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
              </button>
              <button class="btn-icon-small" title="Excluir" (click)="deletePlaylist(p, $event)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        </li>
        <li *ngIf="!playlists.length" class="pl-empty">
          Nenhuma playlist ainda
        </li>
      </ul>
    </nav>
  `,
  styles: [`
    .sidebar {
      display: flex; flex-direction: column; height: 100%;
      background: var(--bg-sidebar); padding: 0 0 12px;
    }

    .logo {
      display: flex; align-items: center; gap: 10px;
      padding: 22px 20px 20px; font-size: 18px; font-weight: 800; color: var(--text);
    }

    .nav {
      list-style: none; padding: 0 10px; margin-bottom: 8px;

      &__item {
        display: flex; align-items: center; gap: 14px;
        padding: 10px 12px; border-radius: var(--radius);
        color: var(--text-sub); font-weight: 500; font-size: 14px;
        transition: var(--trans); position: relative;
        cursor: pointer !important; text-decoration: none;

        &:hover { color: var(--text); background: var(--bg-hover); }
        &.active { color: var(--text); font-weight: 700;
          svg { stroke: var(--accent); }
        }

        .badge {
          margin-left: auto; background: var(--accent); color: #000;
          border-radius: var(--radius-full); padding: 2px 8px;
          font-size: 10px; font-weight: 800;
        }
      }
    }

    .divider { height: 1px; background: var(--border); margin: 10px 16px; }

    .pl-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 20px 8px 20px; font-size: 11px; font-weight: 700;
      letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-muted);
    }

    .pl-form { padding: 0 10px 12px; }

    .pl-list {
      list-style: none; padding: 0 10px; flex: 1; overflow-y: auto;
    }

    .pl-item-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      &:hover .pl-actions { opacity: 1; pointer-events: auto; }
    }

    .pl-item {
      display: flex; align-items: center; gap: 12px; flex: 1;
      padding: 8px 12px; border-radius: var(--radius);
      color: var(--text-sub); font-size: 13px; transition: var(--trans);
      text-decoration: none; cursor: pointer !important;
      &:hover { color: var(--text); background: var(--bg-hover); }
      &.active { color: var(--text); background: var(--bg-highlight); }
    }

    .pl-actions {
      position: absolute; right: 8px;
      display: flex; gap: 4px; opacity: 0; pointer-events: none; transition: var(--trans);
      background: var(--bg-hover); padding-left: 4px; border-radius: 4px;
    }

    .btn-icon-small {
      width: 24px; height: 24px; border-radius: 4px; border: none; background: transparent;
      color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
      &:hover { color: var(--accent); background: rgba(255,255,255,0.1); }
    }

    .edit-input {
      padding: 4px; font-size: 13px; width: 100%; margin: 0;
    }

    .pl-icon {
      width: 36px; height: 36px; border-radius: 4px;
      background: var(--bg-highlight); display: flex; align-items: center;
      justify-content: center; font-size: 14px; flex-shrink: 0; color: var(--text-muted);
    }

    .pl-empty { padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center; }
  `]
})
export class SidebarComponent implements OnInit {
  playlists: Playlist[] = [];
  activeCount = 0;
  showForm = false;
  newName = '';
  editId: string | null = null;
  editName = '';

  constructor(private api: ApiService, private toast: ToastService, private router: Router, private ws: WebsocketService) {}

  ngOnInit() { 
    this.load(); 
    this.ws.messages$.subscribe(m => {
      if (m.event === 'download_progress') {
        if (m.payload.status === 'completed') {
          this.load();
        }
      }
    });
  }

  load() { this.api.getPlaylists().subscribe(p => { this.playlists = p; }); }

  nav(path: string) {
    this.router.navigateByUrl(path);
  }

  isActive(path: string): boolean {
    return this.router.url === path;
  }

  create() {
    const n = this.newName.trim();
    if (!n) return;
    this.api.createPlaylist(n).subscribe({
      next: () => { this.toast.show('Playlist criada!', 'success'); this.newName = ''; this.showForm = false; this.load(); },
      error: () => this.toast.show('Erro ao criar playlist', 'error')
    });
  }

  startEdit(p: Playlist, ev: Event) {
    ev.stopPropagation();
    this.editId = p.id;
    this.editName = p.name;
  }

  saveEdit(p: Playlist) {
    if (!this.editId) return;
    const n = this.editName.trim();
    if (n && n !== p.name) {
      this.api.updatePlaylist(p.id, n).subscribe({
        next: () => { this.toast.show('Playlist atualizada'); this.editId = null; this.load(); },
        error: () => this.toast.show('Erro ao atualizar', 'error')
      });
    } else {
      this.editId = null;
    }
  }

  deletePlaylist(p: Playlist, ev: Event) {
    ev.stopPropagation();
    if (confirm(`Excluir playlist "${p.name}"?`)) {
      this.api.deletePlaylist(p.id).subscribe({
        next: () => { this.toast.show('Playlist excluída'); this.load(); if (this.isActive('/playlist/'+p.id)) this.nav('/library'); },
        error: () => this.toast.show('Erro ao excluir', 'error')
      });
    }
  }
}
