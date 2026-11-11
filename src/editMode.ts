let previewMode = false;
let editModeEnabled = true;
let beatChart: BeatChart | null = null;

interface BeatShift {
  time: number;
  value: number;
  floorPosition?: number;
}

interface BeatChart {
  bPM?: number;
  bpm?: number;
  offset?: number;
  bpmShifts?: BeatShift[];
}

export function getBeatDensity(): number {
  const input = document.querySelector<HTMLInputElement>("#beatDensity");
  return Math.max(1, Math.min(256, Math.trunc(Number(input?.value) || 1)));
}

export function getVerticalDensity(): number {
  const input = document.querySelector<HTMLInputElement>("#verticalDensity");
  return Math.max(2, Math.min(128, Math.trunc(Number(input?.value) || 32)));
}

export function getEditorXOffset(): number {
  const input = document.querySelector<HTMLInputElement>("#editorXOffset");
  return Math.max(-2, Math.min(2, Number(input?.value) || 0));
}

export function setBeatChart(value: unknown): void {
  beatChart = value as BeatChart;
}

function beatBpm(): number {
  return beatChart?.bPM ?? beatChart?.bpm ?? 120;
}

function preparedBpmShifts(): BeatShift[] {
  const bpm = beatBpm();
  const shifts = [...(beatChart?.bpmShifts ?? [])].sort((left, right) => left.time - right.time);
  if (shifts.length === 0) return [];

  let previousTick = shifts[0].time;
  let seconds = shifts[0].time * (60 / (bpm * (shifts[0].value || 1)));
  shifts[0].floorPosition = seconds;
  for (let index = 1; index < shifts.length; index += 1) {
    seconds += (shifts[index].time - previousTick) * (60 / (bpm * (shifts[index - 1].value || 1)));
    shifts[index].floorPosition = seconds;
    previousTick = shifts[index].time;
  }
  return shifts;
}

export function beatTickToSeconds(tick: number): number {
  const bpm = beatBpm();
  const shifts = preparedBpmShifts();
  if (shifts.length === 0) return tick * 60 / bpm;

  const first = shifts[0];
  if (tick <= first.time) return tick * 60 / (bpm * (first.value || 1));
  for (let index = 1; index < shifts.length; index += 1) {
    const previous = shifts[index - 1];
    const current = shifts[index];
    if (tick <= current.time) {
      const ratio = (tick - previous.time) / (current.time - previous.time || 1);
      return (previous.floorPosition ?? 0) + ratio * ((current.floorPosition ?? 0) - (previous.floorPosition ?? 0));
    }
  }

  const last = shifts[shifts.length - 1];
  return (last.floorPosition ?? 0) + (tick - last.time) * 60 / (bpm * (last.value || 1));
}

function beatSecondsToTick(seconds: number): number {
  const bpm = beatBpm();
  const shifts = preparedBpmShifts();
  if (shifts.length === 0) return seconds * bpm / 60;

  const first = shifts[0];
  if (seconds <= (first.floorPosition ?? 0)) return seconds / (60 / (bpm * (first.value || 1)));
  for (let index = 1; index < shifts.length; index += 1) {
    const previous = shifts[index - 1];
    const current = shifts[index];
    if (seconds <= (current.floorPosition ?? 0)) {
      const ratio = (seconds - (previous.floorPosition ?? 0)) / ((current.floorPosition ?? 0) - (previous.floorPosition ?? 0) || 1);
      return previous.time + ratio * (current.time - previous.time);
    }
  }

  const last = shifts[shifts.length - 1];
  return last.time + (seconds - (last.floorPosition ?? 0)) / (60 / (bpm * (last.value || 1)));
}

function beatSpeedRatio(): number {
  const input = document.querySelector<HTMLInputElement>("#chartSpeed");
  const speed = Math.max(0, Number(input?.value) || 7);
  return (215 / 32 + speed) * (10 / 129);
}

export function getEditTimeY(targetSeconds: number, currentSeconds: number, height: number): number {
  const viewportScale = height / 1280;
  const ringY = height * 0.74;
  return ringY - (targetSeconds - currentSeconds) * beatSpeedRatio() * 1280 * viewportScale;
}

function drawBeatLines(
  context: CanvasRenderingContext2D,
  surfaceWidth: number,
  playfieldWidth: number,
  height: number,
): void {
  const audio = document.querySelector<HTMLAudioElement>("#audio");
  const currentTime = audio?.src ? audio.currentTime : 0;
  const density = getBeatDensity();
  const viewportScale = Math.min(playfieldWidth / 720, height / 1280);
  const ringY = height * 0.74;
  const speed = beatSpeedRatio() * 1280 * viewportScale;

  context.save();
  if (beatChart) {
    const offset = beatChart.offset ?? 0;
    const chartTime = currentTime + offset;
    const minSeconds = chartTime + (ringY - height) / speed;
    const maxSeconds = chartTime + ringY / speed;
    const firstTick = Math.floor(beatSecondsToTick(Math.max(0, minSeconds)) * density) / density;
    const lastTick = Math.ceil(beatSecondsToTick(Math.max(0, maxSeconds)) * density) / density;
    context.lineWidth = Math.max(1, viewportScale);
    for (let tick = firstTick; tick <= lastTick + 1e-9; tick += 1 / density) {
      const seconds = beatTickToSeconds(tick);
      const y = ringY - (seconds - chartTime) * speed;
      if (y < -2 || y > height + 2) continue;
      const isBeat = Math.abs(tick - Math.round(tick)) < 0.0001;
      context.strokeStyle = isBeat ? "rgba(255, 70, 70, 0.9)" : "rgba(70, 220, 110, 0.78)";
      context.beginPath();
      context.moveTo(-surfaceWidth / 2, y);
      context.lineTo(surfaceWidth / 2, y);
      context.stroke();
      context.fillStyle = context.strokeStyle;
      context.font = `${Math.max(10, 12 * viewportScale)}px Arial`;
      context.textAlign = "left";
      context.textBaseline = "bottom";
      context.fillText(`${tick.toFixed(density > 1 ? 2 : 0)} | ${seconds.toFixed(3)}s`, -surfaceWidth / 2 + 4, y - 2);
    }
  }

  context.font = `${Math.max(10, 12 * viewportScale)}px Arial`;
  context.textAlign = "center";
  context.textBaseline = "top";
  const verticalDensity = getVerticalDensity();
  const visibleHalfRange = surfaceWidth / playfieldWidth / 2;
  const firstVerticalIndex = Math.ceil(-visibleHalfRange * verticalDensity);
  const lastVerticalIndex = Math.floor(visibleHalfRange * verticalDensity);
  for (let index = firstVerticalIndex; index <= lastVerticalIndex; index += 1) {
    const value = index / verticalDensity;
    const x = (value + getEditorXOffset()) * playfieldWidth;
    const isCenter = Math.abs(value) < 0.0001;
    context.strokeStyle = isCenter ? "rgba(255,255,255,0.8)" : "rgba(90,180,255,0.55)";
    context.lineWidth = isCenter ? Math.max(2, 2 * viewportScale) : Math.max(1, viewportScale);
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.fillStyle = context.strokeStyle;
    context.fillText(value.toFixed(3), x, 4);
  }

  // Fixed playhead for the current audio time.
  context.strokeStyle = "rgba(255, 255, 255, 0.95)";
  context.lineWidth = Math.max(2, 2 * viewportScale);
  context.beginPath();
  context.moveTo(-surfaceWidth / 2, ringY);
  context.lineTo(surfaceWidth / 2, ringY);
  context.stroke();
  context.restore();
}

export function isPreviewMode(): boolean {
  return previewMode;
}

export function isEditMode(): boolean {
  return editModeEnabled && !previewMode;
}

export function setPreviewMode(value: boolean): boolean {
  previewMode = value;
  return previewMode;
}

export function toggleEditMode(): boolean {
  editModeEnabled = !editModeEnabled;
  return editModeEnabled;
}

export function getEditingCanvasIndex(): number {
  const input = document.querySelector<HTMLInputElement>("#editingCanvasIndex");
  return Math.max(0, Math.trunc(Number(input?.value) || 0));
}

export function drawEditOverlay(
  context: CanvasRenderingContext2D,
  surfaceWidth: number,
  height: number,
  playfieldWidth: number,
): void {
  if (!isEditMode()) return;
  context.fillStyle = "rgba(0, 0, 0, 0.68)";
  context.fillRect(-surfaceWidth / 2, 0, surfaceWidth, height);
  drawBeatLines(context, surfaceWidth, playfieldWidth, height);
}
