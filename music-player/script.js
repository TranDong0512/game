class MusicPlayer {
    constructor() {
        this.audio = new Audio();
        this.playlist = [];
        this.currentIndex = -1;
        this.lyrics = [];
        this.currentLyricIndex = -1;
        this.isPlaying = false;
        this.isShuffle = false;
        this.repeatMode = 0; // 0: off, 1: all, 2: one

        this.initElements();
        this.initEventListeners();
        this.loadSavedPlaylist();
    }

    initElements() {
        // Player elements
        this.playBtn = document.getElementById('playBtn');
        this.playIcon = document.getElementById('playIcon');
        this.pauseIcon = document.getElementById('pauseIcon');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.shuffleBtn = document.getElementById('shuffleBtn');
        this.repeatBtn = document.getElementById('repeatBtn');

        // Progress elements
        this.progressContainer = document.getElementById('progressContainer');
        this.progress = document.getElementById('progress');
        this.progressThumb = document.getElementById('progressThumb');
        this.currentTimeEl = document.getElementById('currentTime');
        this.durationEl = document.getElementById('duration');

        // Volume elements
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeIcon = document.getElementById('volumeIcon');

        // Song info
        this.songTitle = document.getElementById('songTitle');
        this.artistName = document.getElementById('artistName');
        this.albumArt = document.getElementById('albumArt');

        // File inputs
        this.audioFile = document.getElementById('audioFile');
        this.lrcFile = document.getElementById('lrcFile');

        // Playlist
        this.playlistEl = document.getElementById('playlist');

        // Lyrics
        this.lyricsContainer = document.getElementById('lyricsContainer');
        this.closeLyrics = document.getElementById('closeLyrics');

        // Album art container
        this.albumArtContainer = document.querySelector('.album-art');
    }

    initEventListeners() {
        // Play/Pause
        this.playBtn.addEventListener('click', () => this.togglePlay());

        // Previous/Next
        this.prevBtn.addEventListener('click', () => this.playPrev());
        this.nextBtn.addEventListener('click', () => this.playNext());

        // Shuffle/Repeat
        this.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
        this.repeatBtn.addEventListener('click', () => this.toggleRepeat());

        // Progress bar
        this.progressContainer.addEventListener('click', (e) => this.seekTo(e));

        // Volume
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));

        // File inputs
        this.audioFile.addEventListener('change', (e) => this.handleAudioFiles(e));
        this.lrcFile.addEventListener('change', (e) => this.handleLrcFile(e));

        // Audio events
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audio.addEventListener('ended', () => this.handleSongEnd());
        this.audio.addEventListener('play', () => this.onPlay());
        this.audio.addEventListener('pause', () => this.onPause());

        // Close lyrics
        this.closeLyrics.addEventListener('click', () => this.toggleLyricsPanel());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    handleAudioFiles(e) {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const track = {
                id: Date.now() + Math.random(),
                file: file,
                name: file.name.replace(/\.[^/.]+$/, ''),
                artist: 'Unknown Artist',
                url: URL.createObjectURL(file)
            };
            this.playlist.push(track);
        });

        this.renderPlaylist();
        this.savePlaylist();

        if (this.currentIndex === -1 && this.playlist.length > 0) {
            this.playTrack(0);
        }

        e.target.value = '';
    }

    handleLrcFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            this.parseLrc(event.target.result);
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    parseLrc(lrcContent) {
        this.lyrics = [];
        const lines = lrcContent.split('\n');

        lines.forEach(line => {
            const timeMatch = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\]/);
            if (timeMatch) {
                const minutes = parseInt(timeMatch[1]);
                const seconds = parseInt(timeMatch[2]);
                const milliseconds = parseInt(timeMatch[3]);
                const time = minutes * 60 + seconds + milliseconds / 1000;
                const text = line.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();

                if (text) {
                    this.lyrics.push({ time, text });
                }
            }
        });

        this.lyrics.sort((a, b) => a.time - b.time);
        this.renderLyrics();
    }

    renderLyrics() {
        this.lyricsContainer.innerHTML = '';

        if (this.lyrics.length === 0) {
            this.lyricsContainer.innerHTML = '<p class="lyrics-placeholder">No lyrics loaded</p>';
            return;
        }

        this.lyrics.forEach((lyric, index) => {
            const line = document.createElement('div');
            line.className = 'lyric-line';
            line.textContent = lyric.text;
            line.dataset.index = index;
            this.lyricsContainer.appendChild(line);
        });
    }

    updateLyricsHighlight() {
        if (this.lyrics.length === 0) return;

        const currentTime = this.audio.currentTime;
        let activeIndex = -1;

        for (let i = this.lyrics.length - 1; i >= 0; i--) {
            if (currentTime >= this.lyrics[i].time) {
                activeIndex = i;
                break;
            }
        }

        if (activeIndex !== this.currentLyricIndex) {
            this.currentLyricIndex = activeIndex;

            const lines = this.lyricsContainer.querySelectorAll('.lyric-line');
            lines.forEach((line, index) => {
                line.classList.remove('active', 'past');
                if (index === activeIndex) {
                    line.classList.add('active');
                    line.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else if (index < activeIndex) {
                    line.classList.add('past');
                }
            });
        }
    }

    renderPlaylist() {
        this.playlistEl.innerHTML = '';

        this.playlist.forEach((track, index) => {
            const item = document.createElement('div');
            item.className = `playlist-item ${index === this.currentIndex ? 'active' : ''}`;
            item.innerHTML = `
                <div class="playlist-item-icon">♪</div>
                <div class="playlist-item-info">
                    <div class="playlist-item-title">${track.name}</div>
                    <div class="playlist-item-artist">${track.artist}</div>
                </div>
                <button class="playlist-item-remove" data-index="${index}">×</button>
            `;

            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('playlist-item-remove')) {
                    this.playTrack(index);
                }
            });

            const removeBtn = item.querySelector('.playlist-item-remove');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeTrack(index);
            });

            this.playlistEl.appendChild(item);
        });
    }

    playTrack(index) {
        if (index < 0 || index >= this.playlist.length) return;

        this.currentIndex = index;
        const track = this.playlist[index];

        this.audio.src = track.url;
        this.songTitle.textContent = track.name;
        this.artistName.textContent = track.artist;

        this.renderPlaylist();
        this.audio.play();
    }

    removeTrack(index) {
        if (this.currentIndex === index) {
            this.audio.pause();
            this.audio.src = '';
            this.currentIndex = -1;
            this.songTitle.textContent = 'Select a song';
            this.artistName.textContent = 'Unknown Artist';
        } else if (this.currentIndex > index) {
            this.currentIndex--;
        }

        URL.revokeObjectURL(this.playlist[index].url);
        this.playlist.splice(index, 1);
        this.renderPlaylist();
        this.savePlaylist();
    }

    togglePlay() {
        if (this.playlist.length === 0) return;

        if (this.currentIndex === -1) {
            this.playTrack(0);
            return;
        }

        if (this.isPlaying) {
            this.audio.pause();
        } else {
            this.audio.play();
        }
    }

    playPrev() {
        if (this.playlist.length === 0) return;

        let newIndex = this.currentIndex - 1;
        if (newIndex < 0) {
            newIndex = this.playlist.length - 1;
        }
        this.playTrack(newIndex);
    }

    playNext() {
        if (this.playlist.length === 0) return;

        let newIndex;
        if (this.isShuffle) {
            newIndex = Math.floor(Math.random() * this.playlist.length);
        } else {
            newIndex = this.currentIndex + 1;
            if (newIndex >= this.playlist.length) {
                newIndex = 0;
            }
        }
        this.playTrack(newIndex);
    }

    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        this.shuffleBtn.classList.toggle('active', this.isShuffle);
    }

    toggleRepeat() {
        this.repeatMode = (this.repeatMode + 1) % 3;
        this.repeatBtn.classList.toggle('active', this.repeatMode > 0);

        if (this.repeatMode === 2) {
            this.repeatBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                    <text x="12" y="15" font-size="8" text-anchor="middle" fill="currentColor">1</text>
                </svg>
            `;
        } else {
            this.repeatBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                </svg>
            `;
        }
    }

    handleSongEnd() {
        if (this.repeatMode === 2) {
            this.audio.currentTime = 0;
            this.audio.play();
        } else if (this.repeatMode === 1 || this.currentIndex < this.playlist.length - 1) {
            this.playNext();
        } else {
            this.isPlaying = false;
            this.updatePlayButton();
        }
    }

    onPlay() {
        this.isPlaying = true;
        this.updatePlayButton();
        this.albumArtContainer.classList.add('playing');
    }

    onPause() {
        this.isPlaying = false;
        this.updatePlayButton();
        this.albumArtContainer.classList.remove('playing');
    }

    updatePlayButton() {
        this.playIcon.classList.toggle('hidden', this.isPlaying);
        this.pauseIcon.classList.toggle('hidden', !this.isPlaying);
    }

    seekTo(e) {
        const rect = this.progressContainer.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        this.audio.currentTime = percent * this.audio.duration;
    }

    setVolume(value) {
        this.audio.volume = value / 100;
        this.updateVolumeIcon(value);
    }

    updateVolumeIcon(value) {
        if (value == 0) {
            this.volumeIcon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
        } else if (value < 50) {
            this.volumeIcon.innerHTML = '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
        } else {
            this.volumeIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
        }
    }

    updateProgress() {
        const { currentTime, duration } = this.audio;
        if (duration) {
            const percent = (currentTime / duration) * 100;
            this.progress.style.width = `${percent}%`;
            this.progressThumb.style.left = `${percent}%`;
            this.currentTimeEl.textContent = this.formatTime(currentTime);
            this.updateLyricsHighlight();
        }
    }

    updateDuration() {
        this.durationEl.textContent = this.formatTime(this.audio.duration);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    toggleLyricsPanel() {
        const panel = document.querySelector('.lyrics-panel');
        panel.classList.toggle('hidden');
    }

    handleKeyboard(e) {
        if (e.code === 'Space') {
            e.preventDefault();
            this.togglePlay();
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            this.audio.currentTime -= 5;
        } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            this.audio.currentTime += 5;
        } else if (e.code === 'ArrowUp') {
            e.preventDefault();
            const newVolume = Math.min(100, parseInt(this.volumeSlider.value) + 10);
            this.volumeSlider.value = newVolume;
            this.setVolume(newVolume);
        } else if (e.code === 'ArrowDown') {
            e.preventDefault();
            const newVolume = Math.max(0, parseInt(this.volumeSlider.value) - 10);
            this.volumeSlider.value = newVolume;
            this.setVolume(newVolume);
        }
    }

    savePlaylist() {
        const playlistData = this.playlist.map(track => ({
            name: track.name,
            artist: track.artist
        }));
        localStorage.setItem('musicPlayerPlaylist', JSON.stringify(playlistData));
    }

    loadSavedPlaylist() {
        // Initialize volume
        this.setVolume(80);
    }
}

// Initialize player
const player = new MusicPlayer();
