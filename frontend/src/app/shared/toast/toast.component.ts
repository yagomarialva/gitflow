import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-wrap">
      <div *ngFor="let t of toasts" class="toast toast--{{ t.type }}">
        <span>{{ t.message }}</span>
        <button class="toast__close" (click)="ts.dismiss(t.id)">✕</button>
      </div>
    </div>
  `,
  styles: [`
    .toast-wrap {
      position: fixed;
      bottom: calc(var(--player-h) + 16px);
      right: 20px;
      z-index: 200;
      display: flex; flex-direction: column; gap: 8px;
    }

    .toast {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 16px; border-radius: var(--radius);
      min-width: 280px; max-width: 380px;
      font-size: 13px; font-weight: 500;
      box-shadow: var(--shadow);
      animation: slideIn .3s ease;

      &--success { background: #1a3328; color: #1db954; border-left: 3px solid #1db954; }
      &--error   { background: #2c1717; color: #f15555; border-left: 3px solid #f15555; }
      &--info    { background: var(--bg-elevated); color: var(--text); border-left: 3px solid var(--accent); }

      &__close {
        background: none; border: none; color: inherit; opacity: .6;
        cursor: pointer; font-size: 14px; flex-shrink: 0;
        &:hover { opacity: 1; }
      }
    }

    @keyframes slideIn {
      from { transform: translateX(110%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }

    /* Responsive styles for toasts */
    @media (max-width: 480px) {
      .toast-wrap {
        left: 16px;
        right: 16px;
      }
      .toast {
        min-width: 0;
        max-width: none;
      }
    }
  `]
})
export class ToastComponent implements OnInit {
  toasts: any[] = [];
  constructor(public ts: ToastService) {}
  ngOnInit() { this.ts.toasts$.subscribe(t => this.toasts = t); }
}
