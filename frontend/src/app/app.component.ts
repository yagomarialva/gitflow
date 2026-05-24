import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
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
      <app-sidebar class="shell__sidebar" />
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

      &__sidebar {
        width: var(--sidebar-w);
        flex-shrink: 0;
        overflow-y: auto;
      }

      &__main {
        flex: 1;
        overflow-y: auto;
        background: linear-gradient(to bottom, #1a1a2e 0%, var(--bg-base) 300px);
      }
    }

    .shell__player {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      height: var(--player-h);
      z-index: 100;
    }
  `]
})
export class AppComponent implements OnInit {
  constructor(private ws: WebsocketService, private toast: ToastService) {}

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
  }
}
