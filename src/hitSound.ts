let audioContext: AudioContext | null = null;
let tapBuffer: AudioBuffer | null = null;
let dragBuffer: AudioBuffer | null = null;
let loadingPromise: Promise<void> | null = null;

function getAudioContext(): AudioContext {
  audioContext ??= new AudioContext({
    latencyHint: "interactive",
    sampleRate: 44100,
  });
  return audioContext;
}

async function loadBuffer(url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load hit sound: ${url}`);
  return getAudioContext().decodeAudioData(await response.arrayBuffer());
}

export function preloadHitSounds(): Promise<void> {
  loadingPromise ??= Promise.all([
    loadBuffer("/audio/hit.wav"),
    loadBuffer("/audio/drag.wav"),
  ]).then(([tap, drag]) => {
    tapBuffer = tap;
    dragBuffer = drag;
  });
  return loadingPromise;
}

export async function resumeHitSounds(): Promise<void> {
  const context = getAudioContext();
  if (context.state === "suspended") await context.resume();
  await preloadHitSounds();
}

export function playHitSound(noteType: number): void {
  const context = getAudioContext();
  const buffer = noteType === 1 ? dragBuffer : tapBuffer;
  if (!buffer || context.state !== "running") return;

  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  gain.gain.value = 1;
  source.connect(gain);
  gain.connect(context.destination);
  source.start(context.currentTime);
  source.addEventListener("ended", () => {
    source.disconnect();
    gain.disconnect();
  }, { once: true });
}
