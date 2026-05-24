import { Injectable, NgZone, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';

export interface WsMessage {
  event: string;
  payload: any;
}

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private socket: WebSocket | null = null;
  private messageSubject = new Subject<WsMessage>();
  private ngZone = inject(NgZone);
  private platformId = inject(PLATFORM_ID);

  public messages$ = this.messageSubject.asObservable();

  connect() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (this.socket) {
      return;
    }
    
    this.ngZone.runOutsideAngular(() => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host; 
      const wsUrl = `${protocol}//${host}/ws/events`;
      
      this.socket = new WebSocket(wsUrl);

      this.socket.onmessage = (event) => {
        this.ngZone.run(() => {
          try {
            const data = JSON.parse(event.data);
            this.messageSubject.next(data);
          } catch (e) {
            console.error('Error parsing WS message', e);
          }
        });
      };

      this.socket.onclose = () => {
        console.log('WS connection closed, reconnecting in 5s...');
        this.socket = null;
        setTimeout(() => this.connect(), 5000);
      };
    });
  }
}
