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

async function runTest() {
  console.log('Testing Audiobooks API...');
  
  // 1. Get Audiobooks
  let res = await request('GET', '/api/audiobooks');
  console.log('GET /api/audiobooks:', res.status, res.body);

  // Note: we can't easily insert via API since it's populated by the download worker.
  // But we can test updating progress if there's any.
  if (res.body && res.body.length > 0) {
      let id = res.body[0].id;
      let updateRes = await request('PUT', `/api/audiobooks/${id}/progress`, { resume_time: 120 });
      console.log(`PUT /api/audiobooks/${id}/progress:`, updateRes.status, updateRes.body);

      // Verify update
      let verifyRes = await request('GET', '/api/audiobooks');
      let updated = verifyRes.body.find(a => a.id === id);
      console.log(`Verify resume_time (should be 120):`, updated.resume_time);
  } else {
      console.log('No audiobooks in DB to test PUT/DELETE.');
  }

  // 2. Playlists e2e
  console.log('\nTesting Playlists Add Track (Issue #6)...');
  // Create playlist
  let plRes = await request('POST', '/api/playlists', { name: "Bug Test Playlist" });
  let plId = plRes.body.id;
  
  // Get Library
  let libRes = await request('GET', '/api/library');
  if (libRes.body && libRes.body.length > 0) {
      let trackId = libRes.body[0].id;
      // Add track
      let addRes = await request('POST', `/api/playlists/${plId}/tracks`, { track_id: trackId });
      console.log(`POST /api/playlists/${plId}/tracks (track: ${trackId}):`, addRes.status, addRes.body);
  }
}
runTest();
