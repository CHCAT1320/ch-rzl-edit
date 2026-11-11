# 谱面 JSON 格式

编辑器使用 Rizline 谱面 JSON。导入时读取原始字段，导出时会做统一清洗与补全。以下字段以编辑器导出结构为准。

## 顶层结构

```json
{
  "fileVersion": 1,
  "songsName": "Example",
  "bPM": 120,
  "offset": 0,
  "bpmShifts": [],
  "themes": [],
  "challengeTimes": [],
  "lines": [],
  "canvasMoves": [],
  "cameraMove": {
    "xPositionKeyPoints": [],
    "scaleKeyPoints": []
  }
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `fileVersion` | number | 文件版本，当前为 `1`。 |
| `songsName` | string | 曲名，仅作标识。 |
| `bPM` | number | 基础 BPM，必须大于 0。 |
| `offset` | number | 偏移（秒），参与编辑网格的时间换算，导出时保留。 |
| `bpmShifts` | KeyPoint[] | BPM 变化关键帧。 |
| `themes` | Theme[] | 主题列表，至少一个。 |
| `challengeTimes` | ChallengeTime[] | Riztime 时间段。 |
| `lines` | Line[] | 线对象。 |
| `canvasMoves` | CanvasMove[] | Canvas 列表，至少一个。 |
| `cameraMove` | CameraMove | Camera 关键帧。 |

## 通用类型

### Color

```json
{ "r": 255, "g": 147, "b": 147, "a": 255 }
```

- 各通道取值 `0–255`。
- 导出时缺失的通道会被补为 `255`。

### KeyPoint

```json
{ "time": 0, "value": 1, "easeType": 0, "floorPosition": 0 }
```

| 字段 | 说明 |
| --- | --- |
| `time` | tick。 |
| `value` | 关键帧值；BPM 变化中表示倍率 `实际 BPM / 基础 BPM`。 |
| `easeType` | 缓动类型（0–18）。 |
| `floorPosition` | 位置缓存，由 BPM 与流速推导；导入后会被重新计算。 |

`floorPosition` 由编辑器根据 BPM、流速等重新计算，手工编辑时可留 0，导入后会被覆盖。

### Theme

```json
{
  "colorsList": [
    { "r": 20, "g": 20, "b": 20, "a": 255 },
    { "r": 255, "g": 255, "b": 255, "a": 255 },
    { "r": 255, "g": 255, "b": 255, "a": 255 }
  ]
}
```

`colorsList` 固定为 3 项：

| 索引 | 用途 |
| --- | --- |
| 0 | 背景色 |
| 1 | Note 颜色 |
| 2 | 特效颜色 |

### ChallengeTime（Riztime）

```json
{ "checkPoint": 0, "start": 0, "end": 0, "transTime": 0 }
```

| 字段 | 说明 |
| --- | --- |
| `start` / `end` | 区间开始 / 结束 tick。 |
| `transTime` | 进入与离开的圆形过渡时长（秒）。 |
| `checkPoint` | 兼容字段；导出时保留，缺省为 `start`。 |

`challengeTimes[i]` 与 `themes[i + 1]` 配对。

### CanvasMove

```json
{
  "index": 0,
  "xPositionKeyPoints": [
    { "time": 0, "value": 0, "easeType": 0, "floorPosition": 0 }
  ],
  "speedKeyPoints": [
    { "time": 0, "value": 1, "easeType": 0, "floorPosition": 0 }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `index` | Canvas 序号；导出时按数组顺序重写。 |
| `xPositionKeyPoints` | Canvas 水平位移。 |
| `speedKeyPoints` | Canvas 流速；`1` 为基准速度，可为负值。 |

导出时每个 Canvas 至少保留两个关键帧。

### CameraMove

```json
{
  "xPositionKeyPoints": [],
  "scaleKeyPoints": []
}
```

- `xPositionKeyPoints`：Camera 水平位移。
- `scaleKeyPoints`：Camera 缩放，`1` 为 100%。

## 线对象

```json
{
  "linePoints": [],
  "notes": [],
  "lineColor": [],
  "judgeRingColor": []
}
```

### LinePoint

```json
{
  "time": 3,
  "xPosition": 0,
  "color": { "r": 255, "g": 147, "b": 147, "a": 255 },
  "easeType": 0,
  "canvasIndex": 1,
  "floorPosition": 1.7142857142857142
}
```

| 字段 | 说明 |
| --- | --- |
| `time` | tick。 |
| `xPosition` | 水平位置，以画面宽度为单位。 |
| `color` | 节点颜色；决定该点最终 alpha。 |
| `easeType` | 到下一个节点之间的 X 缓动。 |
| `canvasIndex` | 该节点所属 Canvas。 |
| `floorPosition` | 位置缓存，由 BPM 与 Canvas 流速推导；导入后会被重新计算。 |

### Note

```json
{ "type": 0, "time": 3, "floorPosition": 0, "otherInformations": [], "isHited": false }
```

| 字段 | 说明 |
| --- | --- |
| `type` | `0` Tap，`1` Drag，`2` Hold。 |
| `time` | 开始 tick。 |
| `floorPosition` | 开始位置的位置缓存。 |
| `otherInformations` | Hold 为 `[结束 tick, 结束 Canvas, 结束 floorPosition]`。其它类型该键可选：原始谱面可能完全没有该键，也可能带一个数组；编辑器新建和导出时会统一写为 `[]`。 |
| `isHited` | 导出时补为 `false`，供播放器运行时使用。 |

### 颜色关键帧

```json
{ "time": 0, "startColor": { "r": 255, "g": 255, "b": 255, "a": 255 }, "endColor": { "r": 255, "g": 255, "b": 255, "a": 255 } }
```

- `lineColor`：线颜色覆盖层，与节点颜色混合。
- `judgeRingColor`：判定圈颜色。
- 两个字段结构相同；`endColor` 缺省时导出为 `startColor`。

## 完整示例

```json
{
  "fileVersion": 1,
  "songsName": "Example",
  "bPM": 120,
  "offset": 0,
  "bpmShifts": [],
  "themes": [
    {
      "colorsList": [
        { "r": 20, "g": 20, "b": 20, "a": 255 },
        { "r": 255, "g": 255, "b": 255, "a": 255 },
        { "r": 255, "g": 255, "b": 255, "a": 255 }
      ]
    }
  ],
  "challengeTimes": [],
  "lines": [
    {
      "linePoints": [
        {
          "time": 0,
          "xPosition": 0,
          "color": { "r": 255, "g": 255, "b": 255, "a": 255 },
          "easeType": 0,
          "canvasIndex": 0,
          "floorPosition": 0
        },
        {
          "time": 4,
          "xPosition": 0.25,
          "color": { "r": 255, "g": 255, "b": 255, "a": 255 },
          "easeType": 0,
          "canvasIndex": 0,
          "floorPosition": 2
        }
      ],
      "notes": [
        { "type": 0, "time": 2, "floorPosition": 1, "otherInformations": [], "isHited": false }
      ],
      "lineColor": [],
      "judgeRingColor": []
    }
  ],
  "canvasMoves": [
    {
      "index": 0,
      "xPositionKeyPoints": [
        { "time": 0, "value": 0, "easeType": 0, "floorPosition": 0 }
      ],
      "speedKeyPoints": [
        { "time": 0, "value": 1, "easeType": 0, "floorPosition": 0 }
      ]
    }
  ],
  "cameraMove": {
    "xPositionKeyPoints": [
      { "time": 0, "value": 0, "easeType": 0, "floorPosition": 0 }
    ],
    "scaleKeyPoints": [
      { "time": 0, "value": 1, "easeType": 0, "floorPosition": 0 }
    ]
  }
}
```

## 导出清洗规则

- 所有颜色通道取整并限制在 `0–255`。
- `bPM` 最小为 1，`bpmShifts` 缺失时导出为空数组。
- `themes` 为空时至少导出一个包含 3 个颜色的主题；每个主题固定输出 3 个颜色。
- `challengeTimes` 保证 `end >= start`，`transTime >= 0`。
- `canvasMoves` / `cameraMove` 至少保留两个关键帧；只有一个时自动补一个结束关键帧。
- 音符坐标、类型、时间取整或钳制到合法范围；Hold 的结束 tick 不早于开始 tick。
- `otherInformations` 统一输出为数组：Hold 至少包含结束 tick、结束 Canvas、结束 `floorPosition`；非 Hold 输出 `[]`。
- 没有线节点的线会被移除。
