import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts = new BehaviorSubject<Toast[]>([]);
  readonly toasts$ = this._toasts.asObservable();

  show(message: string, type: Toast['type'] = 'info') {
    const id = Math.random().toString(36).slice(2);
    this._toasts.next([...this._toasts.value, { id, message, type }]);
    setTimeout(() => this.dismiss(id), 4000);
  }

  dismiss(id: string) {
    this._toasts.next(this._toasts.value.filter(t => t.id !== id));
  }
}
