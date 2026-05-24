import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Download, Playlist, SearchResult, Track } from '../../models/interfaces';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = '/api';
  constructor(private http: HttpClient) {}

  search(q: string): Observable<SearchResult[]> {
    return this.http.get<SearchResult[]>(`${this.base}/search`, { params: { q } });
  }

  startDownload(r: SearchResult): Observable<Download> {
    return this.http.post<Download>(`${this.base}/downloads`, {
      source_url: r.source_url,
      title: `${r.artist} - ${r.title}`.trim().replace(/^- /, ''),
    });
  }

  getDownloads(): Observable<Download[]> {
    return this.http.get<Download[]>(`${this.base}/downloads`);
  }

  deleteDownload(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/downloads/${id}`);
  }

  getLibrary(): Observable<Track[]> {
    return this.http.get<Track[]>(`${this.base}/library`);
  }

  deleteTrack(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/library/${id}`);
  }

  getPlaylists(): Observable<Playlist[]> {
    return this.http.get<Playlist[]>(`${this.base}/playlists`);
  }

  getPlaylistTracks(id: string): Observable<Track[]> {
    return this.http.get<Track[]>(`${this.base}/playlists/${id}/tracks`);
  }

  createPlaylist(name: string): Observable<Playlist> {
    return this.http.post<Playlist>(`${this.base}/playlists`, { name });
  }

  updatePlaylist(id: string, name: string): Observable<any> {
    return this.http.put<any>(`${this.base}/playlists/${id}`, { name });
  }

  deletePlaylist(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/playlists/${id}`);
  }

  addToPlaylist(playlistId: string, trackId: string): Observable<any> {
    return this.http.post<any>(`${this.base}/playlists/${playlistId}/tracks`, { track_id: trackId });
  }

  removeFromPlaylist(playlistId: string, trackId: string): Observable<any> {
    return this.http.delete<any>(`${this.base}/playlists/${playlistId}/tracks/${trackId}`);
  }

  downloadPlaylistUrl(id: string): string {
    return `${this.base}/playlists/${id}/download`;
  }

  streamUrl(id: string): string {
    return `${this.base}/stream/${id}`;
  }
}
