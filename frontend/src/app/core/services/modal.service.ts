import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ModalConfig {
  type: 'confirm' | 'prompt';
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  resolve: (value: any) => void;
}

@Injectable({ providedIn: 'root' })
export class ModalService {
  private _modal = new BehaviorSubject<ModalConfig | null>(null);
  readonly modal$ = this._modal.asObservable();

  confirm(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      this._modal.next({
        type: 'confirm',
        title,
        message,
        resolve: (val) => {
          this._modal.next(null);
          resolve(!!val);
        }
      });
    });
  }

  prompt(title: string, message: string, defaultValue = '', placeholder = ''): Promise<string | null> {
    return new Promise((resolve) => {
      this._modal.next({
        type: 'prompt',
        title,
        message,
        defaultValue,
        placeholder,
        resolve: (val) => {
          this._modal.next(null);
          resolve(val);
        }
      });
    });
  }

  close(value: any = null) {
    const active = this._modal.value;
    if (active) {
      active.resolve(value);
    }
  }
}
