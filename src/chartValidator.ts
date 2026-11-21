export type ChartIssueSeverity = "error" | "warn" | "info";

export interface ChartValidationIssue {
  severity: ChartIssueSeverity;
  path: string;
  message: string;
}

type JsonRecord = Record<string, unknown>;

interface NumberRule {
  required?: boolean;
  integer?: boolean;
  min?: number;
  max?: number;
  exclusiveMin?: number;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pathOf(base: string, key: string): string {
  return base ? `${base}.${key}` : key;
}

function addError(
  errors: ChartValidationIssue[],
  path: string,
  message: string,
  severity: ChartIssueSeverity = "error",
): void {
  errors.push({ severity, path: path || "根对象", message });
}

function checkNumber(
  value: unknown,
  path: string,
  errors: ChartValidationIssue[],
  rule: NumberRule = {},
): boolean {
  if (value === undefined) {
    if (rule.required) addError(errors, path, "缺少必填字段");
    return false;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addError(errors, path, "必须是有效数字");
    return false;
  }
  if (rule.integer && !Number.isInteger(value)) {
    addError(errors, path, "必须是整数");
    return false;
  }
  if (rule.min !== undefined && value < rule.min) {
    addError(errors, path, `不能小于 ${rule.min}`);
    return false;
  }
  if (rule.max !== undefined && value > rule.max) {
    addError(errors, path, `不能大于 ${rule.max}`);
    return false;
  }
  if (rule.exclusiveMin !== undefined && value <= rule.exclusiveMin) {
    addError(errors, path, `必须大于 ${rule.exclusiveMin}`);
    return false;
  }
  return true;
}

function checkString(value: unknown, path: string, errors: ChartValidationIssue[]): void {
  if (value !== undefined && typeof value !== "string") {
    addError(errors, path, "必须是字符串");
  }
}

function arrayField(
  object: JsonRecord,
  key: string,
  base: string,
  errors: ChartValidationIssue[],
  required: boolean,
): unknown[] | null {
  const path = pathOf(base, key);
  const value = object[key];
  if (value === undefined) {
    if (required) addError(errors, path, "缺少必填字段");
    return null;
  }
  if (!Array.isArray(value)) {
    addError(errors, path, "必须是数组");
    return null;
  }
  return value;
}

function validateColor(value: unknown, path: string, errors: ChartValidationIssue[]): void {
  if (!isRecord(value)) {
    addError(errors, path, "必须是颜色对象");
    return;
  }
  for (const channel of ["r", "g", "b", "a"] as const) {
    checkNumber(value[channel], `${path}.${channel}`, errors, {
      integer: true,
      min: 0,
      max: 255,
    });
  }
}

function checkEaseType(value: unknown, path: string, errors: ChartValidationIssue[]): void {
  if (value === undefined) {
    addError(errors, path, "缺少缓动类型，将按 1 处理", "warn");
    return;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    addError(errors, path, "缓动类型必须是 0–18 的整数，将按 1 处理", "warn");
    return;
  }
  if (value < 0 || value > 18) {
    addError(errors, path, `不支持的缓动类型：${value}，将按 1 处理`, "warn");
  }
}

function validateKeyPointArray(
  value: unknown,
  path: string,
  errors: ChartValidationIssue[],
  required: boolean,
  valueRule: NumberRule = {},
): void {
  if (value === undefined) {
    if (required) addError(errors, path, "缺少必填字段");
    return;
  }
  if (!Array.isArray(value)) {
    addError(errors, path, "必须是数组");
    return;
  }
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      addError(errors, itemPath, "必须是对象");
      return;
    }
    checkNumber(item.time, `${itemPath}.time`, errors, { required: true, min: 0 });
    checkNumber(item.value, `${itemPath}.value`, errors, { required: true, ...valueRule });
    checkEaseType(item.easeType, `${itemPath}.easeType`, errors);
    checkNumber(item.floorPosition, `${itemPath}.floorPosition`, errors);
  });
}

function validateColorPointArray(
  value: unknown,
  path: string,
  errors: ChartValidationIssue[],
): void {
  if (value === undefined) {
    addError(errors, path, "缺少必填字段");
    return;
  }
  if (!Array.isArray(value)) {
    addError(errors, path, "必须是数组");
    return;
  }
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      addError(errors, itemPath, "必须是对象");
      return;
    }
    checkNumber(item.time, `${itemPath}.time`, errors, { required: true, min: 0 });
    if (item.startColor === undefined) addError(errors, `${itemPath}.startColor`, "缺少必填字段");
    else validateColor(item.startColor, `${itemPath}.startColor`, errors);
    if (item.endColor !== undefined) validateColor(item.endColor, `${itemPath}.endColor`, errors);
  });
}

function validateCanvasMove(
  value: unknown,
  base: string,
  errors: ChartValidationIssue[],
): void {
  if (!isRecord(value)) {
    addError(errors, base, "必须是对象");
    return;
  }
  checkNumber(value.index, `${base}.index`, errors, { integer: true, min: 0 });
  validateKeyPointArray(value.xPositionKeyPoints, `${base}.xPositionKeyPoints`, errors, true);
  validateKeyPointArray(value.yPositionKeyPoints, `${base}.yPositionKeyPoints`, errors, false);
  validateKeyPointArray(value.speedKeyPoints, `${base}.speedKeyPoints`, errors, true);
  validateKeyPointArray(value.rotationKeyPoints, `${base}.rotationKeyPoints`, errors, false);
}

function validateLinePoint(
  value: unknown,
  base: string,
  canvasCount: number,
  errors: ChartValidationIssue[],
): void {
  if (!isRecord(value)) {
    addError(errors, base, "必须是对象");
    return;
  }
  checkNumber(value.time, `${base}.time`, errors, { required: true, min: 0 });
  checkNumber(value.xPosition, `${base}.xPosition`, errors, { required: true });
  checkEaseType(value.easeType, `${base}.easeType`, errors);
  checkNumber(value.floorPosition, `${base}.floorPosition`, errors);

  const canvasIndex = value.canvasIndex;
  if (canvasIndex === undefined) {
    addError(errors, `${base}.canvasIndex`, "缺少必填字段");
  } else if (typeof canvasIndex !== "number" || !Number.isInteger(canvasIndex)) {
    addError(errors, `${base}.canvasIndex`, "必须是整数");
  } else if (canvasIndex < 0 || (canvasCount > 0 && canvasIndex >= canvasCount)) {
    addError(
      errors,
      `${base}.canvasIndex`,
      `必须引用 0–${Math.max(0, canvasCount - 1)} 之间的 Canvas`,
    );
  }

  if (value.color === undefined) addError(errors, `${base}.color`, "缺少必填字段");
  else validateColor(value.color, `${base}.color`, errors);
}

function checkNoteType(value: unknown, path: string, errors: ChartValidationIssue[]): boolean {
  if (value === undefined) {
    addError(errors, path, "缺少音符类型，将按 0（Tap）处理", "warn");
    return false;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    addError(errors, path, "音符类型必须是整数，将按 0（Tap）处理", "warn");
    return false;
  }
  if (value !== 0 && value !== 1 && value !== 2) {
    addError(errors, path, `不支持的类型：${value}，将按 0（Tap）处理`, "warn");
    return false;
  }
  return true;
}

function validateNote(
  value: unknown,
  base: string,
  canvasCount: number,
  errors: ChartValidationIssue[],
): void {
  if (!isRecord(value)) {
    addError(errors, base, "必须是对象");
    return;
  }
  const typeValid = checkNoteType(value.type, `${base}.type`, errors);
  checkNumber(value.time, `${base}.time`, errors, { required: true, min: 0 });
  checkNumber(value.floorPosition, `${base}.floorPosition`, errors);
  if (value.isHited !== undefined && typeof value.isHited !== "boolean") {
    addError(errors, `${base}.isHited`, "必须是布尔值");
  }

  const infos = value.otherInformations;
  if (infos === undefined) {
    if (typeValid && value.type === 2) {
      addError(errors, `${base}.otherInformations`, "Hold 缺少其他信息数组（结束 tick、结束 Canvas）");
    }
    return;
  }
  if (!Array.isArray(infos)) {
    addError(errors, `${base}.otherInformations`, "必须是数组");
    return;
  }
  infos.forEach((info, index) => {
    checkNumber(info, `${base}.otherInformations[${index}]`, errors);
  });
  if (!typeValid || value.type !== 2) return;
  if (infos.length < 2) {
    addError(errors, `${base}.otherInformations`, "Hold 至少需要结束 tick 与结束 Canvas");
    return;
  }
  const endTick = infos[0];
  const endCanvas = infos[1];
  if (typeof endTick === "number" && typeof value.time === "number" && endTick < value.time) {
    addError(errors, `${base}.otherInformations[0]`, "结束 tick 不能早于开始 tick");
  }
  if (
    typeof endCanvas === "number" &&
    (!Number.isInteger(endCanvas) || endCanvas < 0 || (canvasCount > 0 && endCanvas >= canvasCount))
  ) {
    addError(
      errors,
      `${base}.otherInformations[1]`,
      `结束 Canvas 必须引用 0–${Math.max(0, canvasCount - 1)} 之间的 Canvas`,
    );
  }
}

function validateLine(
  value: unknown,
  base: string,
  canvasCount: number,
  errors: ChartValidationIssue[],
): void {
  if (!isRecord(value)) {
    addError(errors, base, "必须是对象");
    return;
  }
  const linePoints = arrayField(value, "linePoints", base, errors, true);
  const notes = arrayField(value, "notes", base, errors, true);
  validateColorPointArray(value.lineColor, `${base}.lineColor`, errors);
  validateColorPointArray(value.judgeRingColor, `${base}.judgeRingColor`, errors);

  linePoints?.forEach((point, index) => {
    validateLinePoint(point, `${base}.linePoints[${index}]`, canvasCount, errors);
  });
  notes?.forEach((note, index) => {
    validateNote(note, `${base}.notes[${index}]`, canvasCount, errors);
  });
}

export function validateChartData(value: unknown): ChartValidationIssue[] {
  const errors: ChartValidationIssue[] = [];

  if (!isRecord(value)) {
    addError(errors, "", "文件顶层必须是 JSON 对象");
    return errors;
  }

  if (value.bPM === undefined && value.bpm === undefined) {
    addError(errors, "bPM", "缺少基础 BPM（bPM），将按 120 处理", "warn");
  } else {
    const bpm = value.bPM ?? value.bpm;
    if (typeof bpm !== "number" || !Number.isFinite(bpm) || bpm <= 0) {
      addError(errors, "bPM", "基础 BPM 无效，将按 120 处理", "warn");
    }
  }
  if (value.fileVersion === undefined) {
    addError(errors, "fileVersion", "未知谱面格式，缺少 fileVersion");
  } else if (value.fileVersion !== 0 && value.fileVersion !== 1) {
    const version = JSON.stringify(value.fileVersion) ?? String(value.fileVersion);
    addError(errors, "fileVersion", `当前值为 ${version}，仅支持 0 或 1，将按 1 处理`, "warn");
  }
  checkNumber(value.offset, "offset", errors);
  checkString(value.songsName, "songsName", errors);

  if (
    value.bpmShifts === undefined ||
    (Array.isArray(value.bpmShifts) && value.bpmShifts.length === 0)
  ) {
    addError(errors, "bpmShifts", "缺少 BPM 变化数据，将视为空列表（按基础 BPM 计算）", "warn");
  } else {
    validateKeyPointArray(value.bpmShifts, "bpmShifts", errors, false, { exclusiveMin: 0 });
  }

  const themesValue = value.themes;
  if (themesValue === undefined) {
    addError(errors, "themes", "缺少主题数据，将使用默认主题（背景 #141414、Note 白色、特效白色）", "warn");
  }
  const themes = arrayField(value, "themes", "", errors, false);
  if (themes && themes.length === 0) {
    addError(errors, "themes", "主题列表为空，将使用默认主题（背景 #141414、Note 白色、特效白色）", "warn");
  }
  themes?.forEach((theme, index) => {
    const base = `themes[${index}]`;
    if (!isRecord(theme)) {
      addError(errors, base, "必须是对象");
      return;
    }
    const colors = arrayField(theme, "colorsList", base, errors, true);
    if (colors && colors.length !== 3) {
      addError(errors, `${base}.colorsList`, `必须是 3 个颜色，当前 ${colors.length} 个`);
    }
    colors?.forEach((color, colorIndex) => {
      validateColor(color, `${base}.colorsList[${colorIndex}]`, errors);
    });
  });

  const challenges = arrayField(value, "challengeTimes", "", errors, false);
  challenges?.forEach((challenge, index) => {
    const base = `challengeTimes[${index}]`;
    if (!isRecord(challenge)) {
      addError(errors, base, "必须是对象");
      return;
    }
    checkNumber(challenge.start, `${base}.start`, errors, { required: true, min: 0 });
    checkNumber(challenge.end, `${base}.end`, errors, { required: true, min: 0 });
    checkNumber(challenge.transTime, `${base}.transTime`, errors, { required: true, min: 0 });
    checkNumber(challenge.checkPoint, `${base}.checkPoint`, errors, { min: 0 });
    if (
      typeof challenge.start === "number" &&
      typeof challenge.end === "number" &&
      challenge.end < challenge.start
    ) {
      addError(errors, `${base}.end`, "不能早于 start");
    }
  });

  if (value.canvasMoves === undefined) {
    addError(errors, "canvasMoves", "缺少 Canvas 数据，将创建默认 Canvas（X=0、Y=0、流速=1、旋转=0）", "warn");
  }
  const canvasMoves = arrayField(value, "canvasMoves", "", errors, false);
  if (canvasMoves && canvasMoves.length === 0) {
    addError(errors, "canvasMoves", "Canvas 列表为空，将创建默认 Canvas（X=0、Y=0、流速=1、旋转=0）", "warn");
  }
  canvasMoves?.forEach((move, index) => {
    validateCanvasMove(move, `canvasMoves[${index}]`, errors);
  });
  const canvasCount = canvasMoves?.length ?? 0;

  const cameraMoveValue = value.cameraMove;
  if (cameraMoveValue === undefined) {
    addError(errors, "cameraMove", "缺少 Camera 关键帧数据，将使用默认值（X=0、Y=0、缩放=1、旋转=0）", "warn");
  } else if (!isRecord(cameraMoveValue)) {
    addError(errors, "cameraMove", "必须是对象");
  } else {
    for (const key of ["xPositionKeyPoints", "scaleKeyPoints"] as const) {
      const points = cameraMoveValue[key];
      const fallback = key === "scaleKeyPoints" ? "1（100%）" : "0";
      if (points === undefined || (Array.isArray(points) && points.length === 0)) {
        addError(errors, `cameraMove.${key}`, `缺少 Camera 关键帧数据，将视为 ${fallback}`, "warn");
      } else {
        validateKeyPointArray(points, `cameraMove.${key}`, errors, true);
      }
    }
    validateKeyPointArray(
      cameraMoveValue.yPositionKeyPoints,
      "cameraMove.yPositionKeyPoints",
      errors,
      false,
    );
    validateKeyPointArray(
      cameraMoveValue.rotationKeyPoints,
      "cameraMove.rotationKeyPoints",
      errors,
      false,
    );
  }

  if (value.lines === undefined) {
    addError(errors, "lines", "缺少 lines 数据，将使用空列表", "warn");
  }
  const lines = arrayField(value, "lines", "", errors, false);
  lines?.forEach((line, index) => {
    validateLine(line, `lines[${index}]`, canvasCount, errors);
  });

  return errors;
}

export function describeJsonSyntaxError(error: unknown, text: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const positionMatch = /position\s+(\d+)/i.exec(message);
  if (!positionMatch) return `JSON 语法错误：${message}`;

  const position = Math.min(Math.max(0, Number(positionMatch[1])), text.length);
  const before = text.slice(0, position);
  const line = before.split("\n").length;
  const column = position - before.lastIndexOf("\n");
  const lineText = text.split("\n")[line - 1]?.trim() ?? "";
  const snippet = lineText ? `\n该行内容：${lineText.slice(0, 120)}` : "";
  return `JSON 语法错误：${message}\n位置：第 ${line} 行，第 ${column} 列（字符 ${position}）${snippet}`;
}
