import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { SearchResult } from '../../models/interfaces';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <h1 class="page__title">Buscar</h1>

      <form class="search-box" (ngSubmit)="search()">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input 
          class="search-box__input" 
          name="query"
          [(ngModel)]="query" 
          placeholder="O que você quer ouvir? (Nome da música ou link do YouTube)"
          autofocus
        >
        <button type="submit" class="btn btn-accent" style="padding: 12px 24px" [disabled]="loading || !query.trim()">
          {{ loading ? 'Buscando...' : 'Buscar' }}
        </button>
      </form>

      <!-- Skeletons -->
      <div class="results" *ngIf="loading">
        <div class="skeleton-card skeleton" *ngFor="let i of [1,2,3,4]"></div>
      </div>

      <!-- Results -->
      <div class="results" *ngIf="!loading && results.length">
        <div class="result-card" *ngFor="let r of results">
          <img class="result-card__img" [src]="r.thumbnail_url" [alt]="r.title" loading="lazy" *ngIf="r.thumbnail_url">
          <div class="result-card__placeholder" *ngIf="!r.thumbnail_url">♪</div>
          
          <div class="result-card__info">
            <span class="result-card__title truncate" [title]="r.title">{{ r.title }}</span>
            <span class="result-card__artist truncate">{{ r.artist }}</span>
            <span class="result-card__meta">{{ formatDur(r.duration) }}</span>
          </div>

          <button 
            class="btn-icon result-card__dl" 
            [class.active]="queued.has(r.id)"
            (click)="download(r)"
            [title]="queued.has(r.id) ? 'Na fila' : 'Baixar'"
          >
            <svg *ngIf="!queued.has(r.id)" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <svg *ngIf="queued.has(r.id)" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        </div>
      </div>

      <!-- Empty -->
      <div class="empty" *ngIf="!loading && !results.length && searched">
        <p class="text-muted">Nenhum resultado encontrado para "{{ lastQuery }}".</p>
      </div>
    </div>
  `,
  styles: [`
    .search-box {
      display: flex; align-items: center; gap: 12px;
      background: #242424; padding: 6px 6px 6px 20px;
      border-radius: var(--radius-full); margin-bottom: 32px;
      max-width: 600px; transition: var(--trans);
      border: 2px solid transparent;

      &:focus-within { border-color: #333; background: #2a2a2a; }
      svg { color: var(--text-muted); flex-shrink: 0; }

      &__input {
        flex: 1; background: none; border: none; color: var(--text);
        font-size: 15px; outline: none;
        &::placeholder { color: var(--text-sub); }
      }
    }

    .results {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 20px;
    }

    .result-card {
      background: var(--bg-card);
      border-radius: var(--radius);
      padding: 16px;
      transition: var(--trans);
      position: relative;
      cursor: pointer;

      &:hover {
        background: var(--bg-hover);
        .result-card__dl { opacity: 1; transform: translateY(0); }
      }

      &__img, &__placeholder {
        width: 100%; aspect-ratio: 1; border-radius: 4px;
        object-fit: cover; margin-bottom: 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,.5);
      }
      &__placeholder {
        background: var(--bg-highlight); display: flex; align-items: center;
        justify-content: center; font-size: 40px; color: var(--text-muted);
      }

      &__info { display: flex; flex-direction: column; gap: 4px; }
      &__title { font-weight: 700; font-size: 15px; }
      &__artist { font-size: 13px; color: var(--text-sub); }
      &__meta { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

      &__dl {
        position: absolute; right: 16px; bottom: 16px;
        background: var(--accent); color: #000;
        width: 40px; height: 40px;
        box-shadow: 0 4px 12px rgba(0,0,0,.3);
        opacity: 0; transform: translateY(8px);
        &:hover { transform: scale(1.05) !important; background: var(--accent-hover); }
        &.active { opacity: 1; transform: translateY(0); background: var(--bg-highlight); color: var(--accent); }
      }
    }

    .skeleton-card { height: 260px; }

    .empty { padding: 40px 0; text-align: center; }
  `]
})
export class SearchComponent {
  query = '';
  lastQuery = '';
  results: SearchResult[] = [];
  loading = false;
  searched = false;
  queued = new Set<string>();

  constructor(private api: ApiService, private toast: ToastService) {}

  search() {
    const q = this.query.trim();
    if (!q || this.loading) return;
    
    this.loading = true;
    this.searched = true;
    this.lastQuery = q;
    this.results = [];

    this.api.search(q).subscribe({
      next: r => {
        this.results = r || [];
        this.loading = false;
        if (this.results.length === 0) {
          this.toast.show('Nenhum resultado encontrado.', 'info');
        } else {
          this.toast.show(`${this.results.length} resultados encontrados.`, 'success');
        }
      },
      error: (err) => { 
        this.loading = false; 
        this.toast.show('Erro na busca. Tente novamente.', 'error');
        console.error('Search error:', err);
      }
    });
  }

  download(r: SearchResult) {
    if (this.queued.has(r.id)) return;
    this.queued.add(r.id);
    this.api.startDownload(r).subscribe({
      next: () => this.toast.show('Adicionado à fila', 'success'),
      error: () => { this.queued.delete(r.id); this.toast.show('Erro ao baixar', 'error'); }
    });
  }

  formatDur(s: number) {
    if (!s) return '';
    const m = Math.floor(s / 60);
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }
}
