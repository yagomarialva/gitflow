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
        <select class="search-box__select" name="type" [(ngModel)]="searchType">
          <option value="music">Música</option>
          <option value="playlist">Playlist</option>
          <option value="audiobook">Audiolivro</option>
        </select>
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
      display: flex; align-items: center; gap: 14px;
      background: var(--bg-card); padding: 8px 8px 8px 24px;
      border-radius: var(--radius-full); margin-bottom: 36px;
      max-width: 650px; transition: var(--trans);
      border: 2px solid rgba(255, 18, 124, 0.1);
      box-shadow: var(--shadow);

      &:focus-within { 
        border-color: var(--accent); 
        background: var(--bg-hover);
        box-shadow: 0 0 20px rgba(255, 18, 124, 0.25);
      }
      
      svg { color: var(--accent-cyan); flex-shrink: 0; filter: drop-shadow(0 0 4px rgba(0, 191, 255, 0.4)); }

      &__input {
        flex: 1; background: none; border: none; color: var(--text);
        font-size: 15px; outline: none; font-weight: 500;
        &::placeholder { color: var(--text-sub); }
      }

      &__select {
        background: var(--bg-highlight); color: var(--text); border: none; 
        padding: 8px 16px; border-radius: var(--radius-full); outline: none;
        cursor: pointer; font-size: 13px; font-weight: 600;
        transition: var(--trans);
        &:hover { background: var(--bg-hover); }
      }
    }

    .results {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 24px;
    }

    .result-card {
      background: var(--bg-card);
      border-radius: var(--radius-lg);
      padding: 16px;
      transition: var(--trans);
      position: relative;
      cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.04);
      box-shadow: 0 6px 18px rgba(0,0,0,0.3);

      &:hover {
        transform: translateY(-5px);
        background: var(--bg-hover);
        border-color: rgba(255, 18, 124, 0.3);
        box-shadow: 0 10px 25px rgba(255, 18, 124, 0.15);
        .result-card__dl { opacity: 1; transform: translateY(0); }
      }

      &__img, &__placeholder {
        width: 100%; aspect-ratio: 1; border-radius: 10px;
        object-fit: cover; margin-bottom: 14px;
        box-shadow: 0 6px 16px rgba(0,0,0,.4);
      }
      &__placeholder {
        background: var(--bg-highlight); display: flex; align-items: center;
        justify-content: center; font-size: 40px; color: var(--text-muted);
      }

      &__info { display: flex; flex-direction: column; gap: 3px; }
      &__title { font-weight: 700; font-size: 14px; color: var(--text); }
      &__artist { font-size: 12px; color: var(--text-sub); }
      &__meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; font-weight: 600; }

      &__dl {
        position: absolute; right: 20px; bottom: 20px;
        background: var(--gradient-pink); color: var(--text);
        width: 38px; height: 38px;
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(255, 18, 124, 0.4);
        opacity: 0; transform: translateY(8px);
        display: flex; align-items: center; justify-content: center;
        &:hover { transform: scale(1.1) !important; box-shadow: 0 6px 16px rgba(255, 18, 124, 0.6); }
        &.active { 
          opacity: 1; 
          transform: translateY(0); 
          background: rgba(0, 191, 255, 0.15); 
          color: var(--accent-cyan);
          border: 1.5px solid var(--accent-cyan);
          box-shadow: 0 0 10px rgba(0, 191, 255, 0.3);
        }
      }
    }

    .skeleton-card { height: 260px; border-radius: var(--radius-lg); }

    .empty { padding: 48px 0; text-align: center; }

    /* Responsive styles for search */
    @media (max-width: 767px) {
      .results {
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
        gap: 12px;
      }
      .result-card {
        padding: 10px;
        &__img, &__placeholder {
          margin-bottom: 8px;
        }
        &__title {
          font-size: 13px;
        }
        &__artist {
          font-size: 11px;
        }
        &__dl {
          right: 12px;
          bottom: 12px;
          width: 32px;
          height: 32px;
          svg {
            width: 16px;
            height: 16px;
          }
        }
      }
      .skeleton-card {
        height: 200px;
      }
    }

    @media (max-width: 599px) {
      .search-box {
        flex-direction: column;
        align-items: stretch;
        border-radius: var(--radius-lg);
        padding: 16px;
        gap: 12px;
        max-width: none;
        
        svg { display: none; }
        
        &__input {
          width: 100%;
          padding: 10px;
          background: var(--bg-highlight);
          border-radius: var(--radius);
          border: 1.5px solid var(--border-subtle);
          &:focus { border-color: var(--accent); }
        }
        
        &__select {
          width: 100%;
          border-radius: var(--radius);
          padding: 10px 16px;
          background: var(--bg-highlight);
          margin: 0;
        }
        
        button {
          width: 100%;
          border-radius: var(--radius-full);
          padding: 12px !important;
          margin: 0;
        }
      }
    }

    /* Force download button to display on touch devices */
    @media (hover: none) {
      .result-card__dl {
        opacity: 1 !important;
        transform: translateY(0) !important;
      }
    }
  `]
})
export class SearchComponent {
  query = '';
  searchType = 'music';
  lastQuery = '';
  results: SearchResult[] = [];
  loading = false;
  searched = false;
  queued = new Set<string>();

  constructor(private api: ApiService, private toast: ToastService) {}

  search() {
    let q = this.query.trim();
    if (!q || this.loading) return;

    if (q.includes('youtube.com/') && q.includes('list=')) {
      this.searchType = 'playlist';
    } else if (q.toLowerCase().includes('playlist')) {
      this.searchType = 'playlist';
    }
    
    this.loading = true;
    this.searched = true;
    this.lastQuery = q;
    this.results = [];

    this.api.search(q, this.searchType).subscribe({
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
