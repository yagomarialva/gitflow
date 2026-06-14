import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalService, ModalConfig } from '../../core/services/modal.service';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" *ngIf="modal$ | async as m" (click)="cancel(m)">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>{{ m.title }}</h3>
          <button class="btn-icon" (click)="cancel(m)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <p class="modal-message" *ngIf="m.message">{{ m.message }}</p>
          
          <input 
            *ngIf="m.type === 'prompt'" 
            type="text" 
            class="input prompt-input" 
            [(ngModel)]="inputValue" 
            [placeholder]="m.placeholder || ''"
            (keyup.enter)="submit(m)"
            #promptInput
            autofocus
          >
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" (click)="cancel(m)">Cancelar</button>
          <button class="btn btn-accent" (click)="submit(m)">
            {{ m.type === 'confirm' ? 'Confirmar' : 'Salvar' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(5, 5, 8, 0.85); display: flex; align-items: center; justify-content: center;
      z-index: 2000; padding: 20px;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      animation: fadeIn 0.2s ease;
    }

    .modal {
      background: var(--bg-elevated); width: 100%; max-width: 460px; border-radius: var(--radius-lg);
      border: 1.5px solid var(--border);
      box-shadow: 0 20px 50px rgba(0,0,0,0.6), var(--shadow-neon); display: flex; flex-direction: column;
      animation: modalSlide 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes modalSlide {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .modal-header {
      padding: 20px 24px 16px; border-bottom: 1px solid var(--border-subtle); display: flex;
      justify-content: space-between; align-items: center;
      h3 { margin: 0; font-size: 18px; font-weight: 800; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    }

    .modal-body { 
      padding: 20px 24px; 
      color: var(--text-sub);
      font-size: 14px;
      line-height: 1.5;
    }

    .modal-message {
      margin-bottom: 16px;
      white-space: pre-wrap;
    }

    .prompt-input {
      width: 100%;
      margin-top: 8px;
    }

    .modal-footer {
      padding: 16px 24px 20px;
      border-top: 1px solid var(--border-subtle);
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      .btn {
        padding: 10px 24px;
        font-size: 13px;
      }
    }
  `]
})
export class ModalComponent implements OnInit {
  private modalService = inject(ModalService);
  modal$ = this.modalService.modal$;
  inputValue = '';

  constructor() {}

  ngOnInit() {
    this.modal$.subscribe(config => {
      if (config) {
        this.inputValue = config.defaultValue || '';
        setTimeout(() => {
          const inputEl = document.querySelector('.prompt-input') as HTMLInputElement;
          if (inputEl) {
            inputEl.focus();
            inputEl.select();
          }
        }, 50);
      }
    });
  }

  cancel(m: ModalConfig) {
    if (m.type === 'confirm') {
      this.modalService.close(false);
    } else {
      this.modalService.close(null);
    }
  }

  submit(m: ModalConfig) {
    if (m.type === 'confirm') {
      this.modalService.close(true);
    } else {
      this.modalService.close(this.inputValue);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    const active = (this.modalService as any)._modal.value;
    if (active) {
      this.cancel(active);
    }
  }
}
