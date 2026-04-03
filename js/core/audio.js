/* ============================================================
   core/audio.js - Playlist-basiertes BGM-System
   Keine harten Kontextwechsel, ein Track laeuft immer zu Ende.
   ============================================================ */

const MUSIC_PLAYLISTS = {
  menu: 'menu',
  campaign: 'campaign',
  story: 'story',
};

const BGM_STATE = {
  cache: new Map(),
  currentPlaylist: null,
  currentTrack: null,
  currentAudio: null,
  currentQueue: [],
  playedTracks: {},
  pendingPlaylist: null,
  started: false,
};

function _musicStrictError(message, details) {
  if (typeof strictDataError === 'function') {
    strictDataError(message, details);
  } else {
    const fullMessage = details ? `${message}\n${details}` : message;
    console.error(`[Music] ${fullMessage}`);
    alert(fullMessage);
  }
  return false;
}

function _normalizeTrackPath(track) {
  return typeof track === 'string' && track.trim() ? track.trim() : '';
}

function _getConfiguredPlaylist(playlistName) {
  const cfg = window.DD_CUSTOM?.config || {};
  const key = `cfg-music-${playlistName}`;
  const raw = cfg[key];
  if (!Array.isArray(raw)) return [];
  return raw.map(_normalizeTrackPath).filter(Boolean);
}

function _shuffleTracks(tracks) {
  const pool = [...tracks];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function _ensurePlaylistQueue(playlistName) {
  const tracks = _getConfiguredPlaylist(playlistName);
  if (tracks.length === 0) {
    _musicStrictError('Musik-Playlist leer oder nicht konfiguriert.', `Playlist: ${playlistName}`);
    return [];
  }

  if (!Array.isArray(BGM_STATE.currentQueue) || BGM_STATE.currentQueue.length === 0 || BGM_STATE.currentPlaylist !== playlistName) {
    BGM_STATE.currentQueue = _shuffleTracks(tracks);
  }

  return BGM_STATE.currentQueue;
}

function _getCachedAudio(trackPath) {
  const normalized = _normalizeTrackPath(trackPath);
  if (!normalized) return null;
  if (!BGM_STATE.cache.has(normalized)) {
    const audio = new Audio(normalized);
    audio.preload = 'auto';
    audio.loop = false;
    audio.addEventListener('ended', _handleTrackEnded);
    BGM_STATE.cache.set(normalized, audio);
  }
  return BGM_STATE.cache.get(normalized);
}

function _preloadPlaylistTracks(playlistName) {
  _getConfiguredPlaylist(playlistName).forEach(track => {
    const audio = _getCachedAudio(track);
    if (!audio) return;
    try { audio.load(); } catch (err) { console.warn('[Music] preload failed:', track, err); }
  });
}

function _playTrack(trackPath) {
  const audio = _getCachedAudio(trackPath);
  if (!audio) return false;

  if (BGM_STATE.currentAudio && BGM_STATE.currentAudio !== audio) {
    try {
      BGM_STATE.currentAudio.pause();
      BGM_STATE.currentAudio.currentTime = 0;
    } catch (err) {
      console.warn('[Music] stop previous track failed:', err);
    }
  }

  BGM_STATE.currentAudio = audio;
  BGM_STATE.currentTrack = trackPath;
  audio.currentTime = 0;
  audio.volume = 1;

  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(err => console.warn('[Music] autoplay blocked:', trackPath, err));
  }
  return true;
}

function playNextTrack() {
  if (!BGM_STATE.currentPlaylist) return false;
  const queue = _ensurePlaylistQueue(BGM_STATE.currentPlaylist);
  if (queue.length === 0) return false;

  const nextTrack = queue.shift();
  if (!nextTrack) return false;

  if (!BGM_STATE.playedTracks[BGM_STATE.currentPlaylist]) {
    BGM_STATE.playedTracks[BGM_STATE.currentPlaylist] = [];
  }
  BGM_STATE.playedTracks[BGM_STATE.currentPlaylist].push(nextTrack);

  return _playTrack(nextTrack);
}

function _switchPlaylistNow(playlistName) {
  const normalized = String(playlistName || '').trim();
  if (!normalized) return false;

  const tracks = _getConfiguredPlaylist(normalized);
  if (tracks.length === 0) {
    return _musicStrictError('Musik-Playlist leer oder nicht konfiguriert.', `Playlist: ${normalized}`);
  }

  BGM_STATE.currentPlaylist = normalized;
  BGM_STATE.pendingPlaylist = null;
  BGM_STATE.currentQueue = _shuffleTracks(tracks);
  _preloadPlaylistTracks(normalized);
  return playNextTrack();
}

function _handleTrackEnded() {
  if (BGM_STATE.pendingPlaylist && BGM_STATE.pendingPlaylist !== BGM_STATE.currentPlaylist) {
    _switchPlaylistNow(BGM_STATE.pendingPlaylist);
    return;
  }
  playNextTrack();
}

function setMusicPlaylist(playlistName) {
  const normalized = String(playlistName || '').trim();
  if (!normalized) return false;

  if (BGM_STATE.currentPlaylist === normalized) {
    BGM_STATE.pendingPlaylist = null;
    return true;
  }
  if (BGM_STATE.pendingPlaylist === normalized) return true;

  _preloadPlaylistTracks(normalized);

  if (!BGM_STATE.currentAudio || BGM_STATE.currentAudio.paused || !BGM_STATE.started) {
    BGM_STATE.started = true;
    return _switchPlaylistNow(normalized);
  }

  BGM_STATE.pendingPlaylist = normalized;
  return true;
}

function stopMusicPlayback() {
  BGM_STATE.pendingPlaylist = null;
  BGM_STATE.currentPlaylist = null;
  BGM_STATE.currentTrack = null;
  BGM_STATE.currentQueue = [];
  BGM_STATE.started = false;
  if (!BGM_STATE.currentAudio) return;
  try {
    BGM_STATE.currentAudio.pause();
    BGM_STATE.currentAudio.currentTime = 0;
  } catch (err) {
    console.warn('[Music] stop failed:', err);
  }
  BGM_STATE.currentAudio = null;
}
