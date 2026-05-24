const http = require('http');

async function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 8080,
      path: path,
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {}
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch(e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runE2E() {
  console.log('Starting E2E API Validation for AresFlow...');
  let passed = 0;
  let failed = 0;

  try {
    // 1. Get Library
    const lib = await request('GET', '/api/library');
    if (lib.status === 200 && Array.isArray(lib.body)) {
      console.log('✅ GET /api/library - OK (' + lib.body.length + ' tracks)');
      passed++;
    } else {
      console.log('❌ GET /api/library - FAILED', lib);
      failed++;
    }

    // 2. Create Playlist
    const plName = 'Test Playlist ' + Date.now();
    const pl = await request('POST', '/api/playlists', { name: plName });
    if (pl.status === 200 && pl.body.id) {
      console.log('✅ POST /api/playlists - OK (ID: ' + pl.body.id + ')');
      passed++;
    } else {
      console.log('❌ POST /api/playlists - FAILED', pl);
      failed++;
    }

    // 3. Add to Playlist (if library has tracks)
    if (lib.body.length > 0 && pl.body.id) {
      const trackId = lib.body[0].id;
      const add = await request('POST', `/api/playlists/${pl.body.id}/tracks`, { track_id: trackId });
      if (add.status === 200) {
        console.log('✅ POST /api/playlists/:id/tracks - OK (Added track ' + trackId + ')');
        passed++;
      } else {
        console.log('❌ POST /api/playlists/:id/tracks - FAILED', add);
        failed++;
      }

      // 4. Get Playlist Tracks
      const plTracks = await request('GET', `/api/playlists/${pl.body.id}/tracks`);
      if (plTracks.status === 200 && plTracks.body.length === 1 && plTracks.body[0].id === trackId) {
        console.log('✅ GET /api/playlists/:id/tracks - OK (Contains correct track)');
        passed++;
      } else {
        console.log('❌ GET /api/playlists/:id/tracks - FAILED', plTracks);
        failed++;
      }
    } else {
      console.log('⚠️ Skipping track addition tests (Library is empty)');
    }

  } catch (err) {
    console.log('❌ E2E Execution Error:', err.message);
  }

  console.log(`\nE2E API Validation Complete: ${passed} Passed, ${failed} Failed.`);
}

runE2E();
