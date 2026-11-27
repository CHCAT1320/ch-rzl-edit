export const MONO_FONT_STACK = "'JetBrains Mono', 'Cascadia Mono', Consolas, monospace";

export interface CanvasCenterSize {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function calculateCenterSize(width: number, height: number): CanvasCenterSize {
  const aspectRatio = 9 / 16;
  let centerWidth = width;
  let centerHeight = centerWidth / aspectRatio;

  if (centerHeight > height) {
    centerHeight = height;
    centerWidth = centerHeight * aspectRatio;
  }

  return {
    x: (width - centerWidth) / 2,
    y: (height - centerHeight) / 2,
    width: centerWidth,
    height: centerHeight,
  };
}

export function drawCanvas(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#cvs");
  if (!canvas) return;

  const bounds = canvas.getBoundingClientRect();
  const devicePixelRatio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  const context = canvas.getContext("2d");
  if (!context) return;

  canvas.width = Math.round(width * devicePixelRatio);
  canvas.height = Math.round(height * devicePixelRatio);
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

  // Plain fallback before a chart is loaded; drawChart repaints this with the
  // chart's own background colour as soon as data exists.
  context.fillStyle = "#101216";
  context.fillRect(0, 0, width, height);
}
