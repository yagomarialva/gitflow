import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { WebsocketService } from '../../core/services/websocket.service';
import { Download } from '../../models/interfaces';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-downloads',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <h1 class="page__title">Downloads</h1>

      <div class="dls" *ngIf="dls.length">
        <div *ngFor="let d of dls" class="dl-card" [ngClass]="'dl-card--' + d.status">
          <div class="dl-card__info">
            <div class="dl-header">
              <span class="title truncate" [title]="d.title || d.source_url">{{ d.title || d.source_url }}</span>
              <span class="badge" [ngClass]="'badge--' + d.status">{{ status(d.status) }}</span>
            </div>
            
            <div class="meta">
              <span class="source">Fonte: {{ d.source | uppercase }}</span>
              <span class="artist truncate">{{ d.artist || 'Processando...' }}</span>
            </div>

            <!-- Progress -->
            <div class="prog" *ngIf="['pending','downloading','converting'].includes(d.status)">
              <div class="prog__bar">
                <div class="prog__fill" [style.width.%]="d.progress" [class.indeterminate]="d.progress === 0"></div>
              </div>
              <span class="prog__pct">{{ d.progress | number:'1.0-0' }}%</span>
            </div>

            <div class="error" *ngIf="d.status === 'failed'">{{ d.error }}</div>
          </div>

          <button class="btn-icon" (click)="remove(d)" title="Remover">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <div class="empty" *ngIf="!dls.length">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <h3>Nenhum download</h3>
      </div>
    </div>
  `,
  styles: [`
    .dls { display: flex; flex-direction: column; gap: 14px; max-width: 800px; }

    .dl-card {
      display: flex; align-items: center; gap: 20px;
      padding: 18px 24px; background: var(--bg-card);
      border-radius: var(--radius-lg); border-left: 4px solid transparent;
      border-top: 1px solid rgba(255, 255, 255, 0.03);
      border-right: 1px solid rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      transition: var(--trans); 
      box-shadow: 0 6px 18px rgba(0,0,0,0.3);

      &--completed   { 
        border-left-color: var(--accent); 
        box-shadow: 0 6px 18px rgba(255, 18, 124, 0.1); 
      }
      &--failed      { 
        border-left-color: #ff3355; 
        box-shadow: 0 6px 18px rgba(255, 51, 85, 0.1); 
      }
      &--downloading { 
        border-left-color: var(--accent-cyan); 
        box-shadow: 0 6px 18px rgba(0, 191, 255, 0.1); 
      }
      &--converting  { 
        border-left-color: var(--accent-cyan); 
        box-shadow: 0 6px 18px rgba(0, 191, 255, 0.1); 
      }

      &:hover {
        transform: translateY(-2px);
        background: var(--bg-hover);
      }

      &__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
    }

    .dl-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .title { font-weight: 700; font-size: 15px; color: var(--text); }
    
    .badge {
      font-size: 10px; font-weight: 800; padding: 4px 12px;
      border-radius: var(--radius-full); text-transform: uppercase; letter-spacing: .8px;
      
      &--pending     { background: rgba(255,255,255,.08); color: var(--text-sub); }
      &--downloading { background: rgba(0, 191, 255, 0.1); color: var(--accent-cyan); border: 1px solid rgba(0, 191, 255, 0.15); }
      &--converting  { background: rgba(0, 191, 255, 0.1); color: var(--accent-cyan); border: 1px solid rgba(0, 191, 255, 0.15); }
      &--completed   { background: var(--accent-dim); color: var(--accent); border: 1px solid rgba(255, 18, 124, 0.15); }
      &--failed      { background: rgba(255, 51, 85, 0.1); color: #ff3355; border: 1px solid rgba(255, 51, 85, 0.15); }
    }

    .meta { display: flex; align-items: center; gap: 14px; font-size: 12px; color: var(--text-sub); }
    .source { background: rgba(255, 255, 255, 0.05); padding: 2px 8px; border-radius: 4px; font-weight: 700; color: var(--accent-cyan); font-size: 10px; letter-spacing: 0.5px; }
    .artist { font-weight: 500; }

    .prog { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
    .prog__bar { flex: 1; height: 6px; background: rgba(255, 255, 255, 0.08); border-radius: var(--radius-full); overflow: hidden; }
    .prog__fill { height: 100%; background: var(--gradient-primary); border-radius: var(--radius-full); transition: width .3s ease; box-shadow: 0 0 8px rgba(0, 191, 255, 0.3); }
    .prog__pct { font-size: 11px; font-weight: 700; width: 36px; text-align: right; color: var(--text-sub); }

    .indeterminate { width: 40% !important; animation: slide 1.5s infinite ease-in-out; background: var(--gradient-primary) !important; }
    @keyframes slide { 0% { transform: translateX(-200%); } 100% { transform: translateX(300%); } }

    .error { font-size: 12px; color: #ff3355; margin-top: 4px; font-weight: 600; }
  `]
})
export class DownloadsComponent implements OnInit, OnDestroy {
  dls: Download[] = [];
  sub!: Subscription;

  constructor(private api: ApiService, private ws: WebsocketService, private toast: ToastService) {}

  ngOnInit() {
    this.api.getDownloads().subscribe(d => this.dls = d);
    this.sub = this.ws.messages$.subscribe(m => {
      if (m.event === 'download_progress') {
        const p = m.payload;
        const i = this.dls.findIndex(d => d.id === p.id);
        if (i >= 0) {
          this.dls[i] = { ...this.dls[i], ...p };
        } else {
          this.api.getDownloads().subscribe(d => this.dls = d);
        }
      }
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  remove(d: Download) {
    this.api.deleteDownload(d.id).subscribe({
      next: () => this.dls = this.dls.filter(x => x.id !== d.id),
      error: () => this.toast.show('Erro ao remover', 'error')
    });
  }

  status(s: string) {
    const map: any = { pending: 'Na fila', downloading: 'Baixando', converting: 'Comprimindo ZIP', completed: 'Concluído', failed: 'Falhou' };
    return map[s] || s;
  }
}
