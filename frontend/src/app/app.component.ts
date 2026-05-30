import { Component, OnInit } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { WebsocketService } from './core/services/websocket.service';
import { ToastService } from './core/services/toast.service';
import { SidebarComponent } from './shared/sidebar/sidebar.component';
import { PlayerBarComponent } from './shared/player-bar/player-bar.component';
import { ToastComponent } from './shared/toast/toast.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, PlayerBarComponent, ToastComponent],
  template: `
    <div class="shell">
      <!-- Backdrop for mobile sidebar -->
      <div class="shell__backdrop" *ngIf="sidebarOpen" (click)="sidebarOpen = false"></div>
      
      <!-- Mobile Top Bar -->
      <div class="shell__mobile-bar">
        <button class="btn-icon" (click)="sidebarOpen = !sidebarOpen" title="Menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div class="shell__mobile-logo">
          <img src="/logo.png" alt="Mars Logo">
          <span>Mars</span>
        </div>
        <div style="width: 40px"></div>
      </div>

      <app-sidebar class="shell__sidebar" [class.open]="sidebarOpen" />
      <main class="shell__main">
        <router-outlet />
      </main>
    </div>
    <app-player-bar class="shell__player" />
    <app-toast />
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

    .shell {
      display: flex;
      flex: 1;
      overflow: hidden;
      padding-bottom: var(--player-h);
      position: relative;

      &__backdrop {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: 998;
        animation: fadeIn 0.25s ease;
      }

      &__mobile-bar {
        display: none;
      }

      &__sidebar {
        width: var(--sidebar-w);
        flex-shrink: 0;
        overflow-y: auto;
        border-right: 1px solid var(--border);
        box-shadow: 4px 0 24px rgba(0, 0, 0, 0.4);
        z-index: 10;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      &__main {
        flex: 1;
        overflow-y: auto;
        background: radial-gradient(circle at 50% 0%, #15192e 0%, var(--bg-black) 80%);
      }
    }

    .shell__player {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      height: var(--player-h);
      z-index: 100;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Responsive styles */
    @media (max-width: 767px) {
      .shell {
        flex-direction: column;
      }

      .shell__mobile-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 56px;
        background: var(--bg-sidebar);
        border-bottom: 1.5px solid var(--border);
        padding: 0 12px;
        z-index: 50;
        
        .btn-icon {
          color: var(--text-sub);
          &:hover { background: none; }
        }
      }

      .shell__mobile-logo {
        display: flex;
        align-items: center;
        gap: 8px;
        
        img {
          height: 24px;
          width: auto;
          object-fit: contain;
          flex-shrink: 0;
          border-radius: 6px;
          filter: drop-shadow(0 0 4px rgba(255, 18, 124, 0.4));
        }
        
        span {
          font-size: 18px;
          font-weight: 900;
          background: var(--gradient-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -0.5px;
        }
      }

      .shell__sidebar {
        position: fixed;
        top: 0; bottom: 0; left: 0;
        width: 270px;
        height: 100%;
        transform: translateX(-100%);
        z-index: 999;
        box-shadow: 10px 0 30px rgba(0,0,0,0.6);
        border-right: 1.5px solid var(--border);
        
        &.open {
          transform: translateX(0);
        }
      }
    }
  `]
})
export class AppComponent implements OnInit {
  sidebarOpen = false;
  constructor(private ws: WebsocketService, private toast: ToastService, private router: Router) {}

  ngOnInit() {
    this.ws.connect();
    this.ws.messages$.subscribe(msg => {
      if (msg.event === 'download_progress' && msg.payload?.status === 'completed') {
        this.toast.show(`✓ "${msg.payload.title}" baixado com sucesso!`, 'success');
      }
      if (msg.event === 'download_progress' && msg.payload?.status === 'failed') {
        this.toast.show(`✗ Falha: ${msg.payload.error || msg.payload.title}`, 'error');
      }
    });

    // Fechar a sidebar ao trocar de rota no mobile
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.sidebarOpen = false;
    });
  }
}
