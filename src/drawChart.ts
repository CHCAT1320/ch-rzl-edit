import { calculateCenterSize } from "./canvas";
import { editorCanvasTransform, getEditorVisualState } from "./chartEditor";
import { drawEditOverlay, getEditTimeY, getEditorXOffset, isEditMode } from "./editMode";
import { playHitSound } from "./hitSound";

interface ChartColor {
  r?: number;
  g?: number;
  b?: number;
  a?: number;
}

interface KeyPoint {
  time: number;
  value: number;
  easeType?: number;
  floorPosition?: number;
}

interface LinePoint {
  time: number;
  xPosition: number;
  color: ChartColor;
  easeType?: number;
  canvasIndex: number;
  floorPosition?: number;
}

interface Note {
  type: number;
  time: number;
  floorPosition?: number;
  otherInformations?: number[];
}

interface ColorPoint {
  startColor: ChartColor;
  endColor: ChartColor;
  time: number;
}

interface Line {
  linePoints: LinePoint[];
  notes: Note[];
  judgeRingColor: ColorPoint[];
  lineColor: ColorPoint[];
}

interface CanvasMove {
  xPositionKeyPoints: KeyPoint[];
  yPositionKeyPoints?: KeyPoint[];
  speedKeyPoints: KeyPoint[];
  rotationKeyPoints?: KeyPoint[];
}

interface Theme {
  colorsList: ChartColor[];
}

interface ChallengeTime {
  checkPoint?: number;
  start: number;
  end: number;
  transTime: number;
}

interface Chart {
  bPM?: number;
  bpm?: number;
  bpmShifts?: KeyPoint[];
  themes?: Theme[];
  challengeTimes?: ChallengeTime[];
  lines: Line[];
  canvasMoves: CanvasMove[];
  cameraMove: {
    scaleKeyPoints: KeyPoint[];
    xPositionKeyPoints: KeyPoint[];
    yPositionKeyPoints?: KeyPoint[];
    rotationKeyPoints?: KeyPoint[];
  };
}

interface Point {
  x: number;
  y: number;
}

const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1280;
const AUDIO_ID = "audio";

const easeFunctions: Array<(value: number) => number> = [
  (x) => x,
  (x) => x * x,
  (x) => 1 - (1 - x) ** 2,
  (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2),
  (x) => x ** 3,
  (x) => 1 - (1 - x) ** 3,
  (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
  (x) => x ** 4,
  (x) => 1 - (1 - x) ** 4,
  (x) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2),
  (x) => x ** 5,
  (x) => 1 - (1 - x) ** 5,
  (x) => (x < 0.5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2),
  () => 0,
  () => 1,
  (x) => 1 - Math.sqrt(Math.max(0, 1 - x * x)),
  (x) => Math.sqrt(Math.max(0, 1 - (x - 1) ** 2)),
  (x) => Math.sin((x * Math.PI) / 2),
  (x) => 1 - Math.cos((x * Math.PI) / 2),
];

let chart: Chart | null = null;
let animationFrame = 0;
let lastAudioTime = 0;
let hitEffects: HitEffect[] = [];
const playedNotes = new Set<string>();
let lastFrameTime = performance.now();
let displayedFps = 0;
const tickSecondsCache = new Map<number, number>();
let renderCacheSecond = Number.NaN;
const canvasPositionCache = new Map<number, Point>();
let renderSurfaceWidth = DESIGN_WIDTH;
let renderSurfaceHeight = DESIGN_HEIGHT;

interface HitEffect {
  x: number;
  y: number;
  timer: number;
  angles: number[];
  sizes: number[];
  challengeOffsets: number[];
  challengeSizes: number[];
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function color(value: ChartColor | undefined, fallback: ChartColor = { r: 255, g: 255, b: 255, a: 255 }): string {
  const r = number(value?.r, number(fallback.r, 255));
  const g = number(value?.g, number(fallback.g, 255));
  const b = number(value?.b, number(fallback.b, 255));
  const a = number(value?.a, number(fallback.a, 255)) / 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function mixColor(base: ChartColor, overlay: ChartColor | undefined): ChartColor {
  const alpha = number(base.a, 255);
  if (!overlay) return { ...base, a: alpha };
  const overlayAlpha = number(overlay.a, 255);
  if (overlayAlpha <= 0) return { ...base, a: alpha };
  if (overlayAlpha >= 255) return { r: number(overlay.r), g: number(overlay.g), b: number(overlay.b), a: alpha };
  const ratio = overlayAlpha / 255;
  return {
    r: number(base.r) + (number(overlay.r) - number(base.r)) * ratio,
    g: number(base.g) + (number(overlay.g) - number(base.g)) * ratio,
    b: number(base.b) + (number(overlay.b) - number(base.b)) * ratio,
    a: alpha,
  };
}

function currentColor(seconds: number, points: ColorPoint[]): ChartColor | undefined {
  if (points.length === 0) return undefined;
  let current = points[0].startColor;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const start = tickToSeconds(point.time);
    const end = index + 1 < points.length ? tickToSeconds(points[index + 1].time) : Number.POSITIVE_INFINITY;
    if (seconds > end) continue;
    if (seconds < start) break;
    const ratio = Number.isFinite(end) ? (seconds - start) / (end - start || 1) : 0;
    current = {
      r: number(point.startColor.r) + (number(point.endColor.r) - number(point.startColor.r)) * ratio,
      g: number(point.startColor.g) + (number(point.endColor.g) - number(point.startColor.g)) * ratio,
      b: number(point.startColor.b) + (number(point.endColor.b) - number(point.startColor.b)) * ratio,
      a: number(point.startColor.a, 255) + (number(point.endColor.a, 255) - number(point.startColor.a, 255)) * ratio,
    };
    break;
  }
  return current;
}

function themeState(seconds: number): { active: number; transition: ChallengeTime | null; progress: number; entering: boolean } {
  if (!chart?.challengeTimes?.length) return { active: 0, transition: null, progress: 0, entering: false };
  let active = 0;
  let transition: ChallengeTime | null = null;
  let progress = 0;
  let entering = false;
  chart.challengeTimes.forEach((challenge, index) => {
    const start = tickToSeconds(challenge.start);
    const end = tickToSeconds(challenge.end);
    if (seconds > start + challenge.transTime && seconds <= end) active = index + 1;
    if (challenge.transTime > 0 && seconds > start && seconds <= start + challenge.transTime) {
      transition = challenge;
      progress = (seconds - start) / challenge.transTime;
      entering = true;
      active = index + 1;
    } else if (challenge.transTime > 0 && seconds > end && seconds <= end + challenge.transTime) {
      transition = challenge;
      progress = 1 - (seconds - end) / challenge.transTime;
      entering = false;
      active = index + 1;
    }
  });
  return { active, transition, progress: Math.max(0, Math.min(1, progress)), entering };
}

function challengeBaseTheme(challengeIndex: number): number {
  if (!chart?.challengeTimes || challengeIndex <= 0) return 0;
  const previous = chart.challengeTimes[challengeIndex - 1];
  const current = chart.challengeTimes[challengeIndex];
  if (!previous || !current) return 0;
  return tickToSeconds(previous.end) + previous.transTime >= tickToSeconds(current.start)
    ? challengeIndex
    : 0;
}

function themeColor(themeIndex: number, colorIndex: number, fallback: ChartColor): ChartColor {
  return chart?.themes?.[themeIndex]?.colorsList?.[colorIndex] ?? chart?.themes?.[0]?.colorsList?.[colorIndex] ?? fallback;
}

function ease(type: number | undefined, value: number): number {
  const fn = easeFunctions[Math.max(0, Math.min(easeFunctions.length - 1, Math.trunc(number(type))))];
  return fn(Math.max(0, Math.min(1, value)));
}

function baseBpm(): number {
  return number(chart?.bPM, number(chart?.bpm));
}

function tickToSeconds(tick: number): number {
  const cached = tickSecondsCache.get(tick);
  if (cached !== undefined) return cached;
  const bpm = baseBpm();
  if (!chart || !bpm) return 0;
  const shifts = chart.bpmShifts ?? [];
  if (shifts.length === 0) {
    const result = tick * (60 / bpm);
    tickSecondsCache.set(tick, result);
    return result;
  }
  const first = shifts[0];
  if (tick <= first.time) {
    const result = tick * (60 / (bpm * number(first.value, 1)));
    tickSecondsCache.set(tick, result);
    return result;
  }
  for (let index = 1; index < shifts.length; index += 1) {
    const current = shifts[index];
    if (tick <= current.time) {
      const previous = shifts[index - 1];
      const ratio = (tick - previous.time) / (current.time - previous.time || 1);
      const result = number(previous.floorPosition) + ratio * (number(current.floorPosition) - number(previous.floorPosition));
      tickSecondsCache.set(tick, result);
      return result;
    }
  }
  const last = shifts[shifts.length - 1];
  const result = number(last.floorPosition) + (tick - last.time) * (60 / (bpm * number(last.value, 1)));
  tickSecondsCache.set(tick, result);
  return result;
}

function keyPointValue(seconds: number, points: KeyPoint[], defaultValue: number): number {
  if (!chart || points.length === 0) return defaultValue;
  const tick = secondsToTick(seconds);
  if (points.length === 1 || tick <= points[0].time) return tick < points[0].time ? defaultValue : points[0].value;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (tick <= end.time) {
      const ratio = (tick - start.time) / (end.time - start.time || 1);
      return start.value + (end.value - start.value) * ease(start.easeType, ratio);
    }
  }
  return points[points.length - 1].value;
}

function secondsToTick(seconds: number): number {
  const bpm = baseBpm();
  if (!chart || !bpm) return 0;
  const shifts = chart.bpmShifts ?? [];
  if (shifts.length === 0) return seconds / (60 / bpm);
  const first = shifts[0];
  if (seconds <= number(first.floorPosition)) return seconds / (60 / (bpm * number(first.value, 1)));
  for (let index = 1; index < shifts.length; index += 1) {
    const current = shifts[index];
    if (seconds <= number(current.floorPosition)) {
      const previous = shifts[index - 1];
      const ratio = (seconds - number(previous.floorPosition)) / (number(current.floorPosition) - number(previous.floorPosition) || 1);
      return previous.time + ratio * (current.time - previous.time);
    }
  }
  const last = shifts[shifts.length - 1];
  return last.time + (seconds - number(last.floorPosition)) / (60 / (bpm * number(last.value, 1)));
}

function speedFloor(seconds: number, points: KeyPoint[]): number {
  if (!chart || points.length === 0) return 0;
  let left = 0;
  let right = points.length - 1;
  let target = right;
  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    if (tickToSeconds(points[middle].time) <= seconds) {
      target = middle;
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }
  const current = points[target];
  const currentSeconds = tickToSeconds(current.time);
  return number(current.floorPosition) + (seconds - currentSeconds) * number(current.value);
}

function currentCanvasY(seconds: number, index: number): number {
  const move = chart?.canvasMoves[index];
  if (!move || move.speedKeyPoints.length === 0) return 0;
  const point = move.speedKeyPoints.reduce<KeyPoint | null>((selected, candidate) => {
    const start = tickToSeconds(candidate.time);
    return start <= seconds ? candidate : selected;
  }, null) ?? move.speedKeyPoints[0];
  return number(point.floorPosition) + (seconds - tickToSeconds(point.time)) * number(point.value);
}

function findLinePointCanvasIndex(linePoints: LinePoint[], tick: number): number {
  if (linePoints.length === 0) return 0;

  let left = 0;
  let right = linePoints.length - 1;
  let index = right;
  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    if (linePoints[middle].time <= tick) {
      index = middle;
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }
  return linePoints[index].canvasIndex;
}

function recalculateFloorPositions(): void {
  if (!chart) return;

  // Rust first derives each speed event's FP, then derives all chart elements
  // from those events. Imported floorPosition values are only cache data.
  recalculateBpmShiftPositions();

  for (const move of chart.canvasMoves) {
    let floor = 0;
    let previousSeconds = 0;
    for (let index = 0; index < move.speedKeyPoints.length; index += 1) {
      const point = move.speedKeyPoints[index];
      const pointSeconds = tickToSeconds(point.time);
      point.floorPosition = floor;
      // The interval ending at this event uses the previous event's speed.
      // This is the same accumulation as Rust's recalculate_all_fp().
      if (index > 0) {
        const previous = move.speedKeyPoints[index - 1];
        floor = number(previous.floorPosition) + (pointSeconds - previousSeconds) * number(previous.value);
        point.floorPosition = floor;
      }
      previousSeconds = pointSeconds;
    }
  }

  for (const line of chart.lines) {
    for (const point of line.linePoints) {
      const move = chart.canvasMoves[point.canvasIndex];
      if (move) point.floorPosition = speedFloor(tickToSeconds(point.time), move.speedKeyPoints);
    }

    for (const note of line.notes) {
      const canvasIndex = findLinePointCanvasIndex(line.linePoints, note.time);
      const move = chart.canvasMoves[canvasIndex];
      if (move) note.floorPosition = speedFloor(tickToSeconds(note.time), move.speedKeyPoints);

      if (note.type === 2 && note.otherInformations && note.otherInformations.length >= 3) {
        const tailMove = chart.canvasMoves[Math.trunc(note.otherInformations[1])];
        if (tailMove) {
          note.otherInformations[2] = speedFloor(
            tickToSeconds(note.otherInformations[0]),
            tailMove.speedKeyPoints,
          );
        }
      }
    }
  }
}

function recalculateBpmShiftPositions(): void {
  if (!chart) return;
  const shifts = chart.bpmShifts ?? [];
  if (shifts.length === 0) return;

  const bpm = baseBpm();
  let previousTick = shifts[0].time;
  let previousSeconds = shifts[0].time * (60 / (bpm * number(shifts[0].value, 1)));
  shifts[0].floorPosition = previousSeconds;

  for (let index = 1; index < shifts.length; index += 1) {
    const previous = shifts[index - 1];
    const current = shifts[index];
    previousSeconds += (current.time - previousTick) * (60 / (bpm * number(previous.value, 1)));
    current.floorPosition = previousSeconds;
    previousTick = current.time;
  }
}

function sortChartData(): void {
  if (!chart) return;
  const byTime = (left: { time: number }, right: { time: number }) => left.time - right.time;
  if (!chart.bpmShifts) chart.bpmShifts = [];
  chart.bpmShifts.sort(byTime);
  chart.cameraMove.scaleKeyPoints.sort(byTime);
  chart.cameraMove.xPositionKeyPoints.sort(byTime);
  chart.cameraMove.yPositionKeyPoints?.sort(byTime);
  chart.cameraMove.rotationKeyPoints?.sort(byTime);
  for (const move of chart.canvasMoves) {
    move.xPositionKeyPoints.sort(byTime);
    move.yPositionKeyPoints?.sort(byTime);
    move.speedKeyPoints.sort(byTime);
    move.rotationKeyPoints?.sort(byTime);
  }
  for (const line of chart.lines) {
    line.linePoints.sort(byTime);
    line.notes.sort(byTime);
  }
  chart.lines.sort((left, right) =>
    number(left.linePoints[0]?.time, Number.POSITIVE_INFINITY) -
    number(right.linePoints[0]?.time, Number.POSITIVE_INFINITY),
  );
}

function canvasPosition(seconds: number, index: number): Point {
  if (seconds === renderCacheSecond) {
    const cached = canvasPositionCache.get(index);
    if (cached) return cached;
  }
  const move = chart?.canvasMoves[index];
  if (!move) return { x: 0, y: 0 };
  const position = {
    x: keyPointValue(seconds, move.xPositionKeyPoints, 0),
    y: currentCanvasY(seconds, index),
  };
  if (seconds === renderCacheSecond) canvasPositionCache.set(index, position);
  return position;
}

function lineSegment(points: LinePoint[], seconds: number): [LinePoint, LinePoint] | null {
  if (points.length === 0) return null;
  let start = points[0];
  for (const point of points) {
    if (tickToSeconds(point.time) <= seconds) start = point;
    else return [start, point];
  }
  return [start, start];
}

function rawPositionOnCurrentLine(line: Line, seconds: number, viewportScale: number, cameraScale: number, cameraX: number): Point {
  const segment = lineSegment(line.linePoints, seconds);
  if (!segment) return { x: 0, y: 0 };
  const [start, end] = segment;
  const startTime = tickToSeconds(start.time);
  const endTime = tickToSeconds(end.time);
  const ratio = (seconds - startTime) / (endTime - startTime || 1);
  const startPosition = rawPointPosition(start, seconds, viewportScale, cameraScale, cameraX);
  const endPosition = rawPointPosition(end, seconds, viewportScale, cameraScale, cameraX);
  return {
    x: startPosition.x + (endPosition.x - startPosition.x) * ease(start.easeType, ratio),
    y: startPosition.y + (endPosition.y - startPosition.y) * ratio,
  };
}

function renderMetrics(viewportScale: number): { width: number; height: number; ringY: number; noteScale: number; hhl: number } {
  const height = DESIGN_HEIGHT * viewportScale;
  const width = DESIGN_WIDTH * viewportScale;
  return {
    width,
    height,
    ringY: height * 0.74,
    noteScale: height / 1920,
    hhl: height * 0.0777,
  };
}

function rawPointPosition(point: LinePoint, seconds: number, viewportScale: number, cameraScale: number, cameraX: number): Point {
  const canvas = canvasPosition(seconds, point.canvasIndex);
  const metrics = renderMetrics(viewportScale);
  return {
    x: (point.xPosition + canvas.x + cameraX) * cameraScale * metrics.width,
    y: metrics.ringY - (number(point.floorPosition) - canvas.y) * cameraScale * speedRatio() * DESIGN_HEIGHT * viewportScale,
  };
}

function canvasYOffset(seconds: number, index: number): number {
  const move = chart?.canvasMoves[index];
  return keyPointValue(seconds, move?.yPositionKeyPoints ?? [], 0);
}

function canvasRotation(seconds: number, index: number): number {
  const move = chart?.canvasMoves[index];
  return keyPointValue(seconds, move?.rotationKeyPoints ?? [], 0) * Math.PI / 180;
}

function canvasTransformPoint(position: Point, seconds: number, index: number, viewportScale: number, cameraScale: number, cameraX: number): Point {
  const canvas = canvasPosition(seconds, index);
  const metrics = renderMetrics(viewportScale);
  const rotation = canvasRotation(seconds, index);
  const offsetY = canvasYOffset(seconds, index) * metrics.width * cameraScale;
  if (rotation === 0 && offsetY === 0) return position;
  const pivotX = (canvas.x + cameraX) * cameraScale * metrics.width;
  const pivotY = metrics.ringY;
  const dx = position.x - pivotX;
  const dy = position.y - pivotY;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: pivotX + dx * cos - dy * sin,
    y: pivotY + dx * sin + dy * cos + offsetY,
  };
}

function pointPosition(point: LinePoint, seconds: number, viewportScale: number, cameraScale: number, cameraX: number): Point {
  return canvasTransformPoint(
    rawPointPosition(point, seconds, viewportScale, cameraScale, cameraX),
    seconds,
    point.canvasIndex,
    viewportScale,
    cameraScale,
    cameraX,
  );
}

function cameraYOffset(seconds: number, viewportScale: number): number {
  return keyPointValue(seconds, chart?.cameraMove.yPositionKeyPoints ?? [], 0) * renderMetrics(viewportScale).width;
}

function cameraRotationRadians(seconds: number): number {
  return keyPointValue(seconds, chart?.cameraMove.rotationKeyPoints ?? [], 0) * Math.PI / 180;
}

function applyCameraTransform(context: CanvasRenderingContext2D, seconds: number, viewportScale: number, _cameraScale: number): void {
  const metrics = renderMetrics(viewportScale);
  const offsetY = cameraYOffset(seconds, viewportScale);
  const rotation = cameraRotationRadians(seconds);
  if (offsetY === 0 && rotation === 0) return;
  context.translate(0, offsetY);
  context.translate(0, metrics.ringY);
  context.rotate(rotation);
  context.translate(0, -metrics.ringY);
}

function cameraTransformPoint(position: Point, seconds: number, viewportScale: number, _cameraScale: number): Point {
  const metrics = renderMetrics(viewportScale);
  const offsetY = cameraYOffset(seconds, viewportScale);
  const rotation = cameraRotationRadians(seconds);
  if (offsetY === 0 && rotation === 0) return position;
  const dy = position.y - metrics.ringY;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: position.x * cos - dy * sin,
    y: metrics.ringY + position.x * sin + dy * cos + offsetY,
  };
}

function getChartSpeed(): number {
  const input = document.querySelector<HTMLInputElement>("#chartSpeed");
  return Math.max(0, number(Number(input?.value), 7));
}

function speedRatio(): number {
  return (215 / 32 + getChartSpeed()) * (10 / 129);
}

function noteRawGeometry(line: Line, note: Note, seconds: number, viewportScale: number, cameraScale: number, cameraX: number): { raw: Point; canvasIndex: number } | null {
  const segment = lineSegment(line.linePoints, tickToSeconds(note.time));
  if (!segment) return null;
  const [start, end] = segment;
  const startTime = tickToSeconds(start.time);
  const endTime = tickToSeconds(end.time);
  const ratio = (tickToSeconds(note.time) - startTime) / (endTime - startTime || 1);
  const rawStart = rawPointPosition(start, seconds, viewportScale, cameraScale, cameraX);
  const rawEnd = rawPointPosition(end, seconds, viewportScale, cameraScale, cameraX);
  return {
    raw: {
      x: rawStart.x + (rawEnd.x - rawStart.x) * ease(start.easeType, ratio),
      y: rawStart.y - (number(note.floorPosition, number(start.floorPosition)) - number(start.floorPosition)) * cameraScale * speedRatio() * DESIGN_HEIGHT * viewportScale,
    },
    canvasIndex: start.canvasIndex,
  };
}

function noteScreenPosition(line: Line, note: Note, seconds: number, viewportScale: number, cameraScale: number, cameraX: number): Point | null {
  const geometry = noteRawGeometry(line, note, seconds, viewportScale, cameraScale, cameraX);
  if (!geometry) return null;
  return cameraTransformPoint(
    canvasTransformPoint(geometry.raw, seconds, geometry.canvasIndex, viewportScale, cameraScale, cameraX),
    seconds,
    viewportScale,
    cameraScale,
  );
}

function spawnHitEffects(currentSeconds: number, previousSeconds: number, viewportScale: number, cameraScale: number, cameraX: number): void {
  if (!chart) return;
  if (currentSeconds < previousSeconds) {
    hitEffects = [];
    playedNotes.clear();
    return;
  }
  chart.lines.forEach((line, lineIndex) => {
    line.notes.forEach((note, noteIndex) => {
      const noteId = `${lineIndex}:${noteIndex}`;
      const hitTime = tickToSeconds(note.time);
      if (playedNotes.has(noteId) || hitTime < previousSeconds || hitTime > currentSeconds) return;
      playedNotes.add(noteId);
      const position = noteScreenPosition(line, note, hitTime, viewportScale, cameraScale, cameraX);
      if (!position) return;
      const count = 3 + Math.floor(Math.random() * 3);
      hitEffects.push({
        x: position.x,
        y: position.y,
        timer: currentSeconds,
        angles: Array.from({ length: count }, () => Math.random() * Math.PI * 2),
        sizes: Array.from({ length: count }, () => 10 + Math.random() * 20),
        challengeOffsets: Array.from({ length: count }, () => Math.random() * 440),
        challengeSizes: Array.from({ length: count }, () => 10 + Math.random() * 10),
      });
      playHitSound(note.type);
    });
  });
  hitEffects = hitEffects.filter((effect) => currentSeconds - effect.timer <= 0.5);
}

function drawHitEffects(context: CanvasRenderingContext2D, currentSeconds: number, viewportScale: number, cameraScale: number, effectColor: ChartColor, challenge: boolean): void {
  const scale = cameraScale * viewportScale;
  for (const effect of hitEffects) {
    const progress = Math.max(0, Math.min(1, (currentSeconds - effect.timer) / 0.5));
    const easeValue = ease(11, progress);
    const radius = (30 + 70 * easeValue) * scale;
    context.strokeStyle = color(effectColor, { r: 255, g: 255, b: 255, a: 255 });
    context.lineWidth = Math.max(0.1, (30 - 30 * easeValue) * scale * 2);
    context.beginPath();
    context.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    context.stroke();
    effect.angles.forEach((angle, index) => {
      const size = effect.sizes[index] * scale * 2;
      const distance = ease(11, progress) * 100 * scale * 2;
      const x = effect.x + Math.cos(angle) * distance;
      const y = effect.y + Math.sin(angle) * distance;
      const particleRadius = size * (1 - ease(10, progress)) * 0.5;
      if (particleRadius <= 0) return;
      context.fillStyle = color({ ...effectColor, a: 255 * (1 - ease(10, progress)) });
      context.beginPath();
      context.arc(x, y, particleRadius, 0, Math.PI * 2);
      context.fill();
      if (challenge) {
        const challengeY = effect.y - ease(11, progress) * effect.challengeOffsets[index] * scale * 2;
        const challengeRadius = effect.challengeSizes[index] * scale * 2 * (1 - ease(10, progress)) * 0.5;
        context.beginPath();
        context.arc(effect.x, challengeY, challengeRadius, 0, Math.PI * 2);
        context.fill();
      }
    });
  }
}

function drawScene(
  context: CanvasRenderingContext2D,
  currentSeconds: number,
  viewportScale: number,
  cameraScale: number,
  cameraX: number,
  themeIndex: number,
): void {
  const noteColor = color(themeColor(themeIndex, 1, { r: 255, g: 255, b: 255, a: 255 }));
  context.save();
  applyCameraTransform(context, currentSeconds, viewportScale, cameraScale);
  for (const line of chart?.lines ?? []) {
    drawLine(context, line, currentSeconds, viewportScale, cameraScale, cameraX);
  }
  for (const line of chart?.lines ?? []) {
    for (const note of line.notes) {
      drawNote(context, line, note, currentSeconds, viewportScale, cameraScale, cameraX, noteColor);
    }
  }
  context.restore();
}

function drawCanvasIndexes(
  context: CanvasRenderingContext2D,
  seconds: number,
  viewportScale: number,
  cameraScale: number,
  cameraX: number,
): void {
  if (!chart) return;
  if (!document.querySelector<HTMLInputElement>("#showCanvasIndex")?.checked) return;
  const metrics = renderMetrics(viewportScale);
  const fontSize = Math.max(12, 70 * Math.max(cameraScale, 0.25) * viewportScale);
  const count = chart.canvasMoves.length;
  const minY = fontSize * 0.6;
  const maxY = metrics.height - fontSize * 0.6;
  const rowGap = count > 1 ? Math.min(fontSize * 1.15, Math.max(0, maxY - minY) / (count - 1)) : 0;
  context.save();
  context.font = `${fontSize}px Arial`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "rgba(0, 0, 0, 0.9)";
  context.strokeStyle = "rgba(255, 255, 255, 0.85)";
  context.lineWidth = Math.max(1, 2 * viewportScale);
  chart.canvasMoves.forEach((_, index) => {
    const canvas = canvasPosition(seconds, index);
    const x = (canvas.x + cameraX) * DESIGN_WIDTH * cameraScale * viewportScale;
    const baseY = Math.max(minY, Math.min(maxY, maxY - index * rowGap));
    const y = baseY + canvasYOffset(seconds, index) * metrics.width * cameraScale;
    context.save();
    context.translate(x, y);
    context.rotate(canvasRotation(seconds, index));
    context.strokeText(String(index), 0, 0);
    context.fillText(String(index), 0, 0);
    context.restore();
  });
  context.restore();
}

function drawEditorObjects(
  context: CanvasRenderingContext2D,
  seconds: number,
  viewportScale: number,
): void {
  const state = getEditorVisualState();
  if (!isEditMode() || state.mode !== "lineNote" || !state.chart) return;
  const themeIndex = themeState(seconds).active;
  const noteColor = color(themeColor(themeIndex, 1, { r: 255, g: 255, b: 255, a: 255 }));
  const selectedPoints = new Set(state.selectedItems.flatMap((item) => item.point ? [item.point] : []));
  const selectedNotes = new Set(state.selectedItems.flatMap((item) => item.note ? [item.note] : []));
  context.save();
  const editorPosition = (point: LinePoint): Point => editorCanvasTransform(
    {
      x: (point.xPosition + getEditorXOffset()) * DESIGN_WIDTH * viewportScale,
      y: getEditTimeY(tickToSeconds(point.time), seconds, DESIGN_HEIGHT * viewportScale),
    },
    point.canvasIndex,
    seconds,
    viewportScale,
  );
  for (const line of state.chart.lines) {
    const points = line.linePoints;
    if (!points.some((point) => point.canvasIndex === state.canvasIndex)) continue;

    const selectedLine = state.selected?.line === line;
    const visiblePoints = points.map(editorPosition);
    const lineColor = currentColor(seconds, line.lineColor);
    const pointColors = points.map((point) => mixColor(point.color, lineColor));
    context.lineWidth = Math.max(1, 6 * viewportScale);
    context.lineCap = "round";
    context.lineJoin = "round";
    for (let index = 0; index < visiblePoints.length - 1; index += 1) {
      const source = points[index];
      const next = points[index + 1];
      if (source.canvasIndex !== state.canvasIndex && next.canvasIndex !== state.canvasIndex) continue;
      const start = visiblePoints[index];
      const end = visiblePoints[index + 1];
      const startColor = pointColors[index];
      const endColor = pointColors[index + 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      if (dx * dx + dy * dy <= 1e-12) continue;
      const gradient = context.createLinearGradient(start.x, start.y, end.x, end.y);
      gradient.addColorStop(0, color(startColor));
      gradient.addColorStop(1, color(endColor));
      context.strokeStyle = gradient;
      context.beginPath();
      for (let part = 0; part <= 16; part += 1) {
        const ratio = part / 16;
        const x = start.x + dx * ease(source.easeType, ratio);
        const y = start.y + dy * ratio;
        if (part === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }

    if (selectedLine) {
      context.strokeStyle = "rgba(255, 230, 80, 0.95)";
      context.lineWidth = Math.max(2, 3 * viewportScale);
      context.lineJoin = "round";
      for (let index = 0; index < visiblePoints.length - 1; index += 1) {
        const source = points[index];
        const next = points[index + 1];
        if (source.canvasIndex !== state.canvasIndex && next.canvasIndex !== state.canvasIndex) continue;
        const start = visiblePoints[index];
        const end = visiblePoints[index + 1];
        context.beginPath();
        for (let part = 0; part <= 16; part += 1) {
          const ratio = part / 16;
          const eased = ease(source.easeType, ratio);
          const x = start.x + (end.x - start.x) * eased;
          const y = start.y + (end.y - start.y) * ratio;
          if (part === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }
    }

    for (const point of points) {
      if (point.canvasIndex !== state.canvasIndex) continue;
      const position = editorPosition(point);
      const selectedPoint = selectedPoints.has(point);
      context.fillStyle = selectedPoint ? "#ffeb3b" : "#ffffff";
      context.strokeStyle = "#000000";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(position.x, position.y, selectedPoint ? 7 : 5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }

    for (const note of line.notes) {
      const noteCanvas = findLinePointCanvasIndex(line.linePoints, note.time);
      const holdCanvas = note.type === 2 ? Math.trunc(note.otherInformations?.[1] ?? noteCanvas) : noteCanvas;
      if (noteCanvas !== state.canvasIndex && holdCanvas !== state.canvasIndex) continue;
      const noteX = lineXAtEditorTime(line, note.time);
      if (noteX === null) continue;
      const noteY = getEditTimeY(tickToSeconds(note.time), seconds, DESIGN_HEIGHT * viewportScale);
      const headRaw = { x: (noteX + getEditorXOffset()) * DESIGN_WIDTH * viewportScale, y: noteY };
      const head = editorCanvasTransform(headRaw, noteCanvas, seconds, viewportScale);
      const selectedNote = selectedNotes.has(note);
      // Keep the same base geometry as preview mode. Selection only adds a
      // highlight ring; it must not change the note's actual size.
      const noteSize = 2 * viewportScale;
      const radius = note.type === 1 ? 9 * noteSize : 10 * noteSize;
      const fill = selectedNote ? "#ffeb3b" : note.type === 0 ? noteColor : note.type === 1 ? "#ffffff" : noteColor;
      context.fillStyle = fill;
      context.strokeStyle = "#000000";
      context.lineWidth = Math.max(1, 6 * viewportScale);
      const holdInfo = note.otherInformations;
      if (note.type === 2 && holdInfo && holdInfo.length >= 1) {
        const tailY = getEditTimeY(tickToSeconds(holdInfo[0]), seconds, DESIGN_HEIGHT * viewportScale);
        const tail = editorCanvasTransform({ x: headRaw.x, y: tailY }, noteCanvas, seconds, viewportScale);
        const dx = tail.x - head.x;
        const dy = tail.y - head.y;
        const holdLength = Math.hypot(dx, dy);
        if (holdLength > 0.0001) {
          context.save();
          context.translate(head.x, head.y);
          context.rotate(Math.atan2(-dx, dy));
          for (let segment = 0; segment < 24; segment += 1) {
            const startRatio = segment / 24;
            const fade = Math.max(0, (startRatio - 36 / 63) / (27 / 63));
            context.fillStyle = fade === 0 ? fill : `rgba(255, 255, 255, ${1 - fade})`;
            context.fillRect(-10 * noteSize, holdLength * startRatio, 20 * noteSize, holdLength / 24);
          }
          context.strokeStyle = "#000000";
          context.lineWidth = Math.max(1, 5 * noteSize);
          context.beginPath();
          context.moveTo(-10 * noteSize, 0);
          context.lineTo(-10 * noteSize, holdLength);
          context.moveTo(10 * noteSize, 0);
          context.lineTo(10 * noteSize, holdLength);
          context.stroke();
          context.fillStyle = "#ffffff";
          context.beginPath();
          context.arc(0, 0, 10 * noteSize, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = "#000000";
          context.lineWidth = Math.max(1, 8 * noteSize);
          context.stroke();
          context.restore();
        }
        continue;
      }
      context.beginPath();
      context.arc(head.x, head.y, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      if (selectedNote) {
        context.strokeStyle = "#ffeb3b";
        context.lineWidth = Math.max(2, 2 * viewportScale);
        context.beginPath();
        context.arc(head.x, head.y, radius + 5 * viewportScale, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }
  context.restore();
}

function lineXAtEditorTime(line: { linePoints: LinePoint[] }, time: number): number | null {
  const points = line.linePoints;
  if (points.length === 0 || time < points[0].time || time > points[points.length - 1].time) return null;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (time <= end.time) {
      const ratio = (time - start.time) / (end.time - start.time || 1);
      return start.xPosition + (end.xPosition - start.xPosition) * ease(start.easeType, ratio);
    }
  }
  return points[points.length - 1].xPosition;
}

function drawEditorKeyFrames(
  context: CanvasRenderingContext2D,
  seconds: number,
  viewportScale: number,
): void {
  const state = getEditorVisualState();
  if (!isEditMode() || state.mode === "lineNote" || !state.chart) return;
  const selectedKeys = new Set(state.selectedItems.flatMap((item) => item.item ? [item.item] : []));
  const isRotationMode = state.mode === "canvasRotation" || state.mode === "cameraRotation";
  const isScaledMode = state.mode === "canvasSpeed" || state.mode === "cameraScale";
  const keyframeX = (item: { value: number }): number => {
    const xValue = isRotationMode ? item.value / 360 : isScaledMode ? item.value / 20 : item.value;
    return (xValue + getEditorXOffset()) * DESIGN_WIDTH * viewportScale;
  };
  const renderPoint = (item: { time: number; value: number }, selected: boolean): void => {
    const x = keyframeX(item);
    const y = getEditTimeY(tickToSeconds(item.time), seconds, DESIGN_HEIGHT * viewportScale);
    context.fillStyle = selected ? "#ffeb3b" : "#4dc3ff";
    context.strokeStyle = "#000000";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, selected ? 9 : 7, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  };
  const canvasMove = state.chart.canvasMoves[state.canvasIndex];
  const points = state.mode === "canvasX" ? canvasMove?.xPositionKeyPoints ?? [] :
    state.mode === "canvasY" ? canvasMove?.yPositionKeyPoints ?? [] :
    state.mode === "canvasSpeed" ? canvasMove?.speedKeyPoints ?? [] :
    state.mode === "canvasRotation" ? canvasMove?.rotationKeyPoints ?? [] :
    state.mode === "cameraX" ? state.chart.cameraMove.xPositionKeyPoints :
    state.mode === "cameraY" ? state.chart.cameraMove.yPositionKeyPoints ?? [] :
    state.mode === "cameraScale" ? state.chart.cameraMove.scaleKeyPoints :
    state.mode === "cameraRotation" ? state.chart.cameraMove.rotationKeyPoints ?? [] : [];
  const pointPosition = (item: { time: number; value: number }): Point => ({
    x: keyframeX(item),
    y: getEditTimeY(tickToSeconds(item.time), seconds, DESIGN_HEIGHT * viewportScale),
  });

  context.strokeStyle = "rgba(77, 195, 255, 0.9)";
  context.lineWidth = Math.max(2, 6 * viewportScale);
  context.lineCap = "round";
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const startPosition = pointPosition(start);
    const endPosition = pointPosition(end);
    context.beginPath();
    for (let part = 0; part <= 24; part += 1) {
      const ratio = part / 24;
      const easedRatio = ease(start.easeType, ratio);
      const x = startPosition.x + (endPosition.x - startPosition.x) * easedRatio;
      const y = startPosition.y + (endPosition.y - startPosition.y) * ratio;
      if (part === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }

  for (const item of points) {
    const position = pointPosition(item);
    if (position.y < -20 || position.y > renderSurfaceHeight + 20) continue;
    renderPoint(item, selectedKeys.has(item));
  }
}

function drawThemeBackground(context: CanvasRenderingContext2D, themeIndex: number, width: number, height: number): void {
  const background = themeColor(themeIndex, 0, { r: 0, g: 0, b: 0, a: 255 });
  context.fillStyle = color({ ...background, a: 255 });
  // The renderer origin is the playfield center on X, not its left edge.
  context.fillRect(-width / 2, 0, width, height);
}

function drawLine(context: CanvasRenderingContext2D, line: Line, seconds: number, viewportScale: number, cameraScale: number, cameraX: number): void {
  if (line.linePoints.length === 0) return;
  const lineColor = currentColor(seconds, line.lineColor);
  const pointColors = line.linePoints.map((point) => mixColor(point.color, lineColor));
  context.lineWidth = Math.max(1, 6 * viewportScale);
  context.lineCap = "round";
  const fillCircle = (x: number, y: number, radius: number, fill: ChartColor): void => {
    context.fillStyle = color(fill);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  };

  for (let index = 0; index < line.linePoints.length - 1; index += 1) {
    const start = line.linePoints[index];
    const end = line.linePoints[index + 1];
    const p0 = pointPosition(start, seconds, viewportScale, cameraScale, cameraX);
    const p1 = pointPosition(end, seconds, viewportScale, cameraScale, cameraX);
    if (!segmentIntersectsScreen(
      cameraTransformPoint(p0, seconds, viewportScale, cameraScale),
      cameraTransformPoint(p1, seconds, viewportScale, cameraScale),
      renderSurfaceWidth,
      renderSurfaceHeight,
    )) continue;
    const startColor = pointColors[index];
    const endColor = pointColors[index + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq <= 1e-12) {
      fillCircle(p0.x, p0.y, Math.max(1, 3 * viewportScale), startColor);
      continue;
    }
    const gradient = context.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    gradient.addColorStop(0, color(startColor));
    gradient.addColorStop(1, color(endColor));
    context.strokeStyle = gradient;
    context.lineJoin = "round";
    context.beginPath();
    for (let part = 0; part <= 16; part += 1) {
      const ratio = part / 16;
      const x = p0.x + dx * ease(start.easeType, ratio);
      const y = p0.y + dy * ratio;
      if (part === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }

  if (line.linePoints.length === 1) {
    const point = line.linePoints[0];
    const position = pointPosition(point, seconds, viewportScale, cameraScale, cameraX);
    fillCircle(position.x, position.y, Math.max(1, 10 * viewportScale), pointColors[0]);
  }
}

function drawJudgeRings(context: CanvasRenderingContext2D, line: Line, currentSeconds: number, viewportScale: number, cameraScale: number, cameraX: number): void {
  if (line.judgeRingColor.length === 0 || line.linePoints.length === 0) return;
  const segment = lineSegment(line.linePoints, currentSeconds);
  if (!segment) return;
  const [start, end] = segment;
  const startTime = tickToSeconds(start.time);
  const endTime = tickToSeconds(end.time);
  if (currentSeconds < startTime || currentSeconds > endTime) return;
  const ratio = (currentSeconds - startTime) / (endTime - startTime || 1);
  const startPosition = pointPosition(start, currentSeconds, viewportScale, cameraScale, cameraX);
  const endPosition = pointPosition(end, currentSeconds, viewportScale, cameraScale, cameraX);
  const position = cameraTransformPoint(
    {
      x: startPosition.x + (endPosition.x - startPosition.x) * ease(start.easeType, ratio),
      y: startPosition.y + (endPosition.y - startPosition.y) * ratio,
    },
    currentSeconds,
    viewportScale,
    cameraScale,
  );
  const x = position.x;
  const judgeY = position.y;
  const ringRadius = Math.max(1, 30 * cameraScale * viewportScale);
  if (
    x + ringRadius < -renderSurfaceWidth / 2 ||
    x - ringRadius > renderSurfaceWidth / 2 ||
    judgeY + ringRadius < 0 ||
    judgeY - ringRadius > renderSurfaceHeight
  ) return;
  const ringColor = currentColor(currentSeconds, line.judgeRingColor);
  if (!ringColor) return;
  context.strokeStyle = color(ringColor);
  context.lineWidth = Math.max(1, 6 * cameraScale * viewportScale);
  context.beginPath();
  context.arc(x, judgeY, ringRadius, 0, Math.PI * 2);
  context.stroke();
}

function drawNote(context: CanvasRenderingContext2D, line: Line, note: Note, seconds: number, viewportScale: number, cameraScale: number, cameraX: number, noteColor: string): void {
  if (note.type !== 2 && seconds > tickToSeconds(note.time)) return;
  const geometry = noteRawGeometry(line, note, seconds, viewportScale, cameraScale, cameraX);
  if (!geometry) return;
  const rawPosition = geometry.raw;
  const noteCanvas = geometry.canvasIndex;
  const position = canvasTransformPoint(rawPosition, seconds, noteCanvas, viewportScale, cameraScale, cameraX);
  const cullPosition = cameraTransformPoint(position, seconds, viewportScale, cameraScale);
  if (note.type !== 2 && (cullPosition.x < -renderSurfaceWidth / 2 - 60 || cullPosition.x > renderSurfaceWidth / 2 + 60 || cullPosition.y < -60 || cullPosition.y > renderSurfaceHeight + 60)) return;
  const noteSize = cameraScale * viewportScale * 2;
  if (note.type === 2 && note.otherInformations && note.otherInformations.length >= 3) {
    const holdEndSeconds = tickToSeconds(note.otherInformations[0]);
    if (seconds - holdEndSeconds > 0.2) return;
    const tailCanvasIndex = Math.trunc(note.otherInformations[1]);
    const tailCanvas = canvasPosition(seconds, tailCanvasIndex);
    const ringY = renderMetrics(viewportScale).ringY;
    const headRaw = seconds > tickToSeconds(note.time)
      ? { x: rawPositionOnCurrentLine(line, seconds, viewportScale, cameraScale, cameraX).x, y: ringY }
      : rawPosition;
    const head = canvasTransformPoint(headRaw, seconds, noteCanvas, viewportScale, cameraScale, cameraX);
    const tail = canvasTransformPoint(
      {
        x: headRaw.x,
        y: ringY - (note.otherInformations[2] - tailCanvas.y) * cameraScale * speedRatio() * DESIGN_HEIGHT * viewportScale,
      },
      seconds,
      noteCanvas,
      viewportScale,
      cameraScale,
      cameraX,
    );
    const cullHead = cameraTransformPoint(head, seconds, viewportScale, cameraScale);
    const cullTail = cameraTransformPoint(tail, seconds, viewportScale, cameraScale);
    if (
      Math.max(cullHead.y, cullTail.y) + noteSize < -60 ||
      Math.min(cullHead.y, cullTail.y) - noteSize > renderSurfaceHeight + 60 ||
      Math.min(cullHead.x, cullTail.x) - noteSize > renderSurfaceWidth / 2 + 60 ||
      Math.max(cullHead.x, cullTail.x) + noteSize < -renderSurfaceWidth / 2 - 60
    ) return;
    if (seconds > holdEndSeconds) {
      const progress = Math.max(0, 1 - ((seconds - holdEndSeconds) / 0.2) ** 3);
      context.beginPath();
      context.arc(head.x, head.y, 10 * noteSize * progress, 0, Math.PI * 2);
      context.strokeStyle = "#000000";
      context.lineWidth = Math.max(1, 3 * noteSize);
      context.stroke();
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(head.x, head.y, 8 * noteSize * progress, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#000000";
      context.lineWidth = Math.max(1, 3 * noteSize);
      context.stroke();
      return;
    }
    const dx = tail.x - head.x;
    const dy = tail.y - head.y;
    const holdLength = Math.hypot(dx, dy);
    if (holdLength <= 0.0001) return;
    const angle = Math.atan2(-dx, dy);
    const noteRgb = noteColor.match(/rgba?\(([^)]+)\)/)?.[1].split(",").map(Number) ?? [255, 255, 255, 1];
    context.save();
    context.translate(head.x, head.y);
    context.rotate(angle);
    const segments = 24;
    for (let index = 0; index < segments; index += 1) {
      const startRatio = index / segments;
      const endRatio = (index + 1) / segments;
      const midRatio = (startRatio + endRatio) / 2;
      const fade = midRatio <= 36 / 63 ? 0 : Math.min(1, (midRatio - 36 / 63) / (27 / 63));
      const red = noteRgb[0] + (255 - noteRgb[0]) * fade;
      const green = noteRgb[1] + (255 - noteRgb[1]) * fade;
      const blue = noteRgb[2] + (255 - noteRgb[2]) * fade;
      context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${(noteRgb[3] ?? 1) * (1 - fade)})`;
      context.fillRect(-10 * noteSize, holdLength * startRatio, 20 * noteSize, holdLength * (endRatio - startRatio));
    }
    context.strokeStyle = "#000000";
    context.lineWidth = Math.max(1, 5 * noteSize);
    const holdSize = 10 * noteSize;
    context.beginPath();
    context.moveTo(-holdSize, 0);
    context.lineTo(-holdSize, holdLength);
    context.moveTo(holdSize, 0);
    context.lineTo(holdSize, holdLength);
    context.stroke();
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(0, 0, 10 * noteSize, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#000000";
    context.lineWidth = Math.max(1, 8 * noteSize);
    context.stroke();
    context.restore();
    return;
  }

  context.fillStyle = note.type === 1 ? "#ffffff" : noteColor;
  context.beginPath();
  context.arc(position.x, position.y, (note.type === 1 ? 9 : 10) * noteSize, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#000000";
  context.lineWidth = Math.max(1, (note.type === 1 ? 6 : 6) * noteSize);
  context.stroke();
}

function comboValue(): number {
  if (!chart) return 0;
  let hits = 0;
  for (const line of chart.lines) {
    for (const note of line.notes) {
      if (seconds() >= tickToSeconds(note.time)) hits += note.type === 2 ? 2 : 1;
    }
  }
  if (hits === 0) return 0;
  if (hits <= 5) return hits;
  if (hits <= 8) return 2 * hits - 5;
  if (hits <= 11) return 3 * hits - 13;
  return 4 * hits - 24;
}

function drawCombo(context: CanvasRenderingContext2D, viewportScale: number): void {
  const combo = comboValue();
  if (combo === 0) return;
  const comboText = String(combo);
  const comboFont = 60 * viewportScale;
  const labelFont = 40 * viewportScale;
  context.textAlign = "right";
  context.textBaseline = "alphabetic";
  context.font = `${comboFont}px sans-serif`;
  context.lineWidth = Math.max(1, 2 * viewportScale);
  context.strokeStyle = "#ffffff";
  context.fillStyle = "#000000";
  // The context origin is the center of the 9:16 playfield. Rust uses x=670
  // in a 720-wide design canvas, which is 310px to the right of that origin.
  const rightEdge = 310 * viewportScale;
  const comboY = 130 * viewportScale;
  context.strokeText(comboText, rightEdge, comboY);
  context.fillText(comboText, rightEdge, comboY);
  const comboWidth = context.measureText(comboText).width;
  context.font = `${labelFont}px sans-serif`;
  const labelRight = rightEdge - comboWidth - 8 * viewportScale;
  context.strokeText("CATPLAY", labelRight, comboY);
  context.fillText("CATPLAY", labelRight, comboY);
  context.textAlign = "start";
}

function segmentIntersectsScreen(start: Point, end: Point, width: number, height: number): boolean {
  const left = -width / 2;
  const right = width / 2;
  const top = 0;
  const bottom = height;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let tMin = 0;
  let tMax = 1;
  for (const [p, q] of [[-dx, start.x - left], [dx, right - start.x], [-dy, start.y - top], [dy, bottom - start.y]]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > tMax) return false;
      if (t > tMin) tMin = t;
    } else {
      if (t < tMin) return false;
      if (t < tMax) tMax = t;
    }
  }
  return true;
}

function drawFps(context: CanvasRenderingContext2D, viewportScale: number): void {
  context.save();
  context.font = `${Math.max(12, 24 * viewportScale)}px Arial`;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#000000";
  context.lineWidth = Math.max(1, 2 * viewportScale);
  const text = `FPS: ${displayedFps}`;
  const x = -renderMetrics(viewportScale).width / 2 + 12 * viewportScale;
  const y = 12 * viewportScale;
  context.strokeText(text, x, y);
  context.fillText(text, x, y);
  context.restore();
}

function drawSideMasks(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  centerWidth: number,
): void {
  const sideWidth = Math.max(0, (canvasWidth - centerWidth) / 2);
  if (sideWidth === 0) return;
  context.fillStyle = "rgba(0, 0, 0, 0.35)";
  context.fillRect(-canvasWidth / 2, 0, sideWidth, canvasHeight);
  context.fillRect(centerWidth / 2, 0, sideWidth, canvasHeight);
}

function seconds(): number {
  const audio = document.querySelector<HTMLAudioElement>(`#${AUDIO_ID}`);
  return audio?.src ? audio.currentTime : 0;
}

export function setChart(value: unknown): void {
  chart = value as Chart;
  tickSecondsCache.clear();
  canvasPositionCache.clear();
  renderCacheSecond = Number.NaN;
  sortChartData();
  recalculateFloorPositions();
  resetPlaybackState();
}

export function refreshChart(): void {
  if (!chart) return;
  tickSecondsCache.clear();
  canvasPositionCache.clear();
  renderCacheSecond = Number.NaN;
  sortChartData();
  recalculateFloorPositions();
  resetPlaybackState();
}

export function resetPlaybackState(): void {
  const audio = document.querySelector<HTMLAudioElement>(`#${AUDIO_ID}`);
  lastAudioTime = audio?.src ? audio.currentTime : 0;
  hitEffects = [];
  playedNotes.clear();
}

export function suppressHitEffects(): void {
  const audio = document.querySelector<HTMLAudioElement>("#audio");
  const current = audio?.src ? audio.currentTime : 0;
  lastAudioTime = current;
  hitEffects = [];
  playedNotes.clear();
  chart?.lines.forEach((line, lineIndex) => line.notes.forEach((note, noteIndex) => {
    if (tickToSeconds(note.time) <= current) playedNotes.add(`${lineIndex}:${noteIndex}`);
  }));
}

export function setSpeed(value: number): void {
  const input = document.querySelector<HTMLInputElement>("#chartSpeed");
  if (input) input.value = String(value);
}

export function drawChart(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#cvs");
  if (!canvas || !chart) return;
  const audio = document.querySelector<HTMLAudioElement>(`#${AUDIO_ID}`);
  if (!audio?.src) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const bounds = canvas.getBoundingClientRect();
  const center = calculateCenterSize(bounds.width, bounds.height);
  const scaleX = center.width / DESIGN_WIDTH;
  const scaleY = center.height / DESIGN_HEIGHT;
  const scale = Math.min(scaleX, scaleY);
  renderSurfaceWidth = bounds.width;
  renderSurfaceHeight = bounds.height - center.y;
  const currentSeconds = seconds();
  if (currentSeconds !== renderCacheSecond) {
    renderCacheSecond = currentSeconds;
    canvasPositionCache.clear();
  }
  const now = performance.now();
  const frameDelta = now - lastFrameTime;
  if (frameDelta > 0) {
    const instantFps = 1000 / frameDelta;
    displayedFps = Math.round(displayedFps === 0 ? instantFps : displayedFps * 0.9 + instantFps * 0.1);
  }
  lastFrameTime = now;
  const cameraX = -keyPointValue(currentSeconds, chart.cameraMove.xPositionKeyPoints, 0);
  const cameraScale = keyPointValue(currentSeconds, chart.cameraMove.scaleKeyPoints, 0);
  const centerX = center.x + center.width / 2;
  const state = themeState(currentSeconds);
  if (!isEditMode()) {
    spawnHitEffects(currentSeconds, lastAudioTime, scale, cameraScale, cameraX);
    lastAudioTime = currentSeconds;
  } else {
    // Editing and seeking must never synthesize gameplay hits.
    lastAudioTime = currentSeconds;
    hitEffects = [];
  }
  context.save();
  context.clearRect(0, 0, bounds.width, bounds.height);
  context.translate(centerX, center.y);
  const activeTheme = state.active > 0 ? state.active : 0;
  if (!state.transition) {
    drawThemeBackground(context, activeTheme, center.width, center.height);
    drawScene(context, currentSeconds, scale, cameraScale, cameraX, activeTheme);
  }

  if (state.transition && chart.challengeTimes) {
    const transitionIndex = chart.challengeTimes.findIndex((challenge) => challenge === state.transition);
    const challengeIndex = transitionIndex + 1;
    const baseThemeIndex = challengeBaseTheme(transitionIndex);
    // Draw the scene that remains visible outside the transition circle.
    context.save();
    context.beginPath();
    context.rect(-center.width, 0, center.width * 2, center.height);
    context.clip();
    drawThemeBackground(context, baseThemeIndex, center.width, center.height);
    drawScene(context, currentSeconds, scale, cameraScale, cameraX, baseThemeIndex);
    context.restore();
    context.save();
    context.beginPath();
    const transitionY = state.entering ? center.height : 0;
    context.arc(0, transitionY, 15 * state.progress * center.height, 0, Math.PI * 2);
    context.clip();
    drawThemeBackground(context, challengeIndex, center.width, center.height);
    drawScene(context, currentSeconds, scale, cameraScale, cameraX, challengeIndex);
    context.restore();
  }
  for (const line of chart.lines) {
    drawJudgeRings(context, line, currentSeconds, scale, cameraScale, cameraX);
  }
  drawHitEffects(
    context,
    currentSeconds,
    scale,
    cameraScale,
    themeColor(activeTheme, 2, { r: 255, g: 255, b: 255, a: 255 }),
    activeTheme > 0,
  );
  drawCanvasIndexes(context, currentSeconds, scale, cameraScale, cameraX);
  drawCombo(context, scale);
  drawFps(context, scale);
  drawSideMasks(context, bounds.width, bounds.height - center.y, center.width);
  drawEditOverlay(context, bounds.width, bounds.height - center.y, center.width);
  drawEditorObjects(context, currentSeconds, scale);
  drawEditorKeyFrames(context, currentSeconds, scale);
  drawEditorInteraction(context, currentSeconds, scale);
  context.restore();
}

function drawEditorInteraction(
  context: CanvasRenderingContext2D,
  seconds: number,
  viewportScale: number,
): void {
  const state = getEditorVisualState();
  if (!isEditMode()) return;
  if (state.marquee) {
    const x0 = (state.marquee.x0 + getEditorXOffset()) * DESIGN_WIDTH * viewportScale;
    const x1 = (state.marquee.x1 + getEditorXOffset()) * DESIGN_WIDTH * viewportScale;
    const y0 = getEditTimeY(tickToSeconds(state.marquee.time0), seconds, DESIGN_HEIGHT * viewportScale);
    const y1 = getEditTimeY(tickToSeconds(state.marquee.time1), seconds, DESIGN_HEIGHT * viewportScale);
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    context.strokeStyle = "rgba(80, 180, 255, 0.95)";
    context.fillStyle = "rgba(80, 180, 255, 0.18)";
    context.lineWidth = 1;
    context.fillRect(x, y, Math.abs(x1 - x0), Math.abs(y1 - y0));
    context.strokeRect(x, y, Math.abs(x1 - x0), Math.abs(y1 - y0));
  }
  const preview = state.pastePreview;
  if (!preview) return;
  context.save();
  context.globalAlpha = 0.45;
  context.fillStyle = "#9fd7ff";
  context.strokeStyle = "#9fd7ff";
  context.lineWidth = Math.max(1, 3 * viewportScale);
  const drawX = (x: number) => (x + getEditorXOffset()) * DESIGN_WIDTH * viewportScale;
  const drawY = (time: number) => getEditTimeY(tickToSeconds(time), seconds, DESIGN_HEIGHT * viewportScale);
  for (const line of preview.lines) {
    for (let index = 1; index < line.points.length; index += 1) {
      const start = line.points[index - 1];
      const end = line.points[index];
      context.beginPath();
      context.moveTo(drawX(start.xPosition), drawY(start.time));
      context.lineTo(drawX(end.xPosition), drawY(end.time));
      context.stroke();
    }
    for (const point of line.points) {
      context.beginPath();
      context.arc(drawX(point.xPosition), drawY(point.time), 6, 0, Math.PI * 2);
      context.fill();
    }
    for (const note of line.notes) {
      const noteX = note.previewX;
      const noteY = drawY(note.time);
      context.beginPath();
      context.arc(drawX(noteX), noteY, 8, 0, Math.PI * 2);
      context.stroke();
      if (note.type === 2 && note.otherInformations?.length) {
        const tailY = drawY(note.otherInformations[0]);
        context.strokeRect(drawX(noteX) - 8, Math.min(noteY, tailY), 16, Math.abs(tailY - noteY));
      }
    }
  }
  for (let index = 1; index < preview.keys.length; index += 1) {
    const start = preview.keys[index - 1];
    const end = preview.keys[index];
    const startX = (preview.kind === "canvasSpeed" || preview.kind === "cameraScale") ? start.value / 20 : start.value;
    const endX = (preview.kind === "canvasSpeed" || preview.kind === "cameraScale") ? end.value / 20 : end.value;
    context.beginPath();
    context.moveTo(drawX(startX), drawY(start.time));
    context.lineTo(drawX(endX), drawY(end.time));
    context.stroke();
  }
  for (const item of preview.keys) {
    const xValue = (preview.kind === "canvasSpeed" || preview.kind === "cameraScale") ? item.value / 20 : item.value;
    context.beginPath();
    context.arc(drawX(xValue), drawY(item.time), 7, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

export function startChartRenderer(): void {
  const render = () => {
    drawChart();
    animationFrame = requestAnimationFrame(render);
  };
  if (!animationFrame) render();
}
