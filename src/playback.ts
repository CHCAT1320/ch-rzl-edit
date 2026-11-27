const AUDIO_ID = "audio";

// The editor must stay usable before (or without) a music file: when no audio
// source is bound we drive a virtual clock instead of freezing the whole canvas.
let virtualSeconds = 0;
let virtualPlaying = false;
let virtualStamp = performance.now();
let cachedAudio: HTMLAudioElement | null = null;

function audioElement(): HTMLAudioElement | null {
  if (cachedAudio?.isConnected) return cachedAudio;
  cachedAudio = document.querySelector<HTMLAudioElement>(`#${AUDIO_ID}`);
  return cachedAudio;
}

export function hasAudioSource(): boolean {
  const audio = audioElement();
  return !!audio && !!audio.getAttribute("src");
}

function advanceVirtualClock(): number {
  if (virtualPlaying) {
    const now = performance.now();
    virtualSeconds += Math.max(0, now - virtualStamp) / 1000;
    virtualStamp = now;
  }
  return virtualSeconds;
}

export function getPlaybackSeconds(): number {
  const audio = audioElement();
  if (hasAudioSource()) return audio?.currentTime ?? 0;
  return advanceVirtualClock();
}

export function isPlaying(): boolean {
  if (!hasAudioSource()) {
    advanceVirtualClock();
    return virtualPlaying;
  }
  const audio = audioElement();
  return !!audio && !audio.paused && !audio.ended && !audio.seeking;
}

export function seekPlaybackSeconds(seconds: number): void {
  const target = Math.max(0, seconds);
  virtualSeconds = target;
  virtualStamp = performance.now();
  if (!hasAudioSource()) return;
  const audio = audioElement();
  if (!audio) return;
  const duration = Number.isFinite(audio.duration) ? audio.duration : target;
  audio.currentTime = Math.min(target, duration);
}

export function startPlayback(): void {
  if (!hasAudioSource()) {
    virtualPlaying = true;
    virtualStamp = performance.now();
    return;
  }
  const audio = audioElement();
  if (!audio) return;
  if (audio.ended) audio.currentTime = 0;
  void audio.play().catch(() => {
    // Ignore autoplay rejections; the audio element keeps its own state.
  });
}

export function pausePlayback(): void {
  if (!hasAudioSource()) {
    advanceVirtualClock();
    virtualPlaying = false;
    return;
  }
  audioElement()?.pause();
}

export function togglePlayback(): void {
  if (isPlaying()) pausePlayback();
  else startPlayback();
}

export function resetPlaybackClock(): void {
  virtualSeconds = 0;
  virtualPlaying = false;
  virtualStamp = performance.now();
  cachedAudio = null;
}
