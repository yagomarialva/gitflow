import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerService } from '../../core/services/player.service';

@Component({
  selector: 'app-player',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="player-layout">
      <div class="player-panel panel-retro">
        <h3>Media Player</h3>
        
        <div class="visualizer-container">
          <canvas #visualizer width="600" height="200"></canvas>
        </div>

        <div class="controls">
          <button class="btn-retro" (click)="togglePlay()">{{ isPlaying ? 'Pause' : 'Play' }}</button>
          <button class="btn-retro" (click)="stop()">Stop</button>
          <div class="now-playing">
            Now Playing: {{ currentTrackTitle }}
          </div>
        </div>

        <!-- Hidden audio element for Web Audio API source -->
        <audio #audioElement crossorigin="anonymous" src="/demo.mp3" (ended)="stop()"></audio>
      </div>
    </div>
  `,
  styles: [`
    .player-layout {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
      background-color: #1a1a1a;
      padding: 20px;
    }
    .player-panel {
      width: 100%;
      max-width: 800px;
      padding: 20px;
      border: 2px solid #555;
      background: linear-gradient(to bottom, #444, #222);
      color: #00d2ff;
      
      h3 { margin-top: 0; color: #fff; text-shadow: 1px 1px 0 #000; }
    }
    .visualizer-container {
      background-color: #000;
      border: 2px inset #555;
      margin-bottom: 20px;
      height: 204px;
      display: flex;
      justify-content: center;
    }
    .controls {
      display: flex;
      gap: 10px;
      align-items: center;

      .now-playing {
        margin-left: auto;
        color: #00d2ff;
        font-family: monospace;
        font-size: 14px;
        background: #000;
        padding: 5px 15px;
        border: 1px inset #555;
        border-radius: 3px;
      }
    }
  `]
})
export class PlayerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('audioElement') audioRef!: ElementRef<HTMLAudioElement>;
  @ViewChild('visualizer') canvasRef!: ElementRef<HTMLCanvasElement>;

  isPlaying = false;
  currentTrackTitle = 'Synthwave Demo Track';
  
  private audioContext!: AudioContext;
  private analyser!: AnalyserNode;
  private source!: MediaElementAudioSourceNode;
  private animationId: number = 0;
  private playerService = inject(PlayerService);

  ngAfterViewInit() {
    this.playerService.currentTrack$.subscribe(track => {
      if (track) {
        this.currentTrackTitle = track.title;
        const audio = this.audioRef.nativeElement;
        
        // Extract the filename from the absolute path
        const filename = track.file_path.split('/').pop();
        audio.src = `/api/files/${filename}`;
        
        audio.load();
        // Delay init audio as user needs to interact with the DOM first
        setTimeout(() => {
           this.initWebAudio();
           if (this.audioContext && this.audioContext.state === 'suspended') {
             this.audioContext.resume();
           }
           audio.play().then(() => {
             this.isPlaying = true;
           }).catch(e => console.error("Autoplay prevented. Please click play.", e));
        }, 100);
      }
    });
  }

  private initWebAudio() {
    if (this.audioContext) return;
    
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    
    this.source = this.audioContext.createMediaElementSource(this.audioRef.nativeElement);
    this.source.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);

    this.draw();
  }

  togglePlay() {
    this.initWebAudio();
    const audio = this.audioRef.nativeElement;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    if (this.isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    this.isPlaying = !this.isPlaying;
  }

  stop() {
    const audio = this.audioRef.nativeElement;
    audio.pause();
    audio.currentTime = 0;
    this.isPlaying = false;
  }

  private draw() {
    this.animationId = requestAnimationFrame(() => this.draw());

    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    this.analyser.getByteFrequencyData(dataArray);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      barHeight = dataArray[i];

      ctx.fillStyle = `rgb(${barHeight + 100}, 50, 255)`;
      ctx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight / 2);

      x += barWidth + 1;
    }
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.animationId);
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
