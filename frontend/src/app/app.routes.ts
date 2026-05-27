import { Routes } from '@angular/router';
import { SearchComponent } from './pages/search/search.component';
import { DownloadsComponent } from './pages/downloads/downloads.component';
import { LibraryComponent } from './pages/library/library.component';
import { PlaylistComponent } from './pages/playlist/playlist.component';
import { AudiobooksComponent } from './pages/audiobooks/audiobooks.component';

export const routes: Routes = [
  { path: 'search', component: SearchComponent },
  { path: 'downloads', component: DownloadsComponent },
  { path: 'library', component: LibraryComponent },
  { path: 'playlist/:id', component: PlaylistComponent },
  { path: 'audiobooks', component: AudiobooksComponent },
  { path: '', redirectTo: '/search', pathMatch: 'full' }
];
