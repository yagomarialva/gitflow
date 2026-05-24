import { Routes } from '@angular/router';
import { SearchComponent } from './pages/search/search.component';
import { DownloadsComponent } from './pages/downloads/downloads.component';
import { LibraryComponent } from './pages/library/library.component';
import { PlaylistComponent } from './pages/playlist/playlist.component';

export const routes: Routes = [
  { path: 'search', component: SearchComponent },
  { path: 'downloads', component: DownloadsComponent },
  { path: 'library', component: LibraryComponent },
  { path: 'playlist/:id', component: PlaylistComponent },
  { path: '', redirectTo: '/search', pathMatch: 'full' }
];
