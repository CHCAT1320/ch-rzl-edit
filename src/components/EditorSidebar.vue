<template>
  <div id="editBoard">
    <h2 class="editBoardTitle">编辑栏</h2>
    <div class="audioWrap">
      <audio id="audio" class="audioDisabled" controls controlslist="nodownload" aria-disabled="true"></audio>
    </div>
    <label class="chartSpeedControl" for="chartSpeed">
      <span>流速</span>
      <input id="chartSpeed" type="number" min="0" max="30" step="0.1" value="3.5" />
    </label>
    <label class="chartSpeedControl" for="beatDensity">
      <span>横线密度</span>
      <input id="beatDensity" type="number" min="4" max="256" step="1" value="4" />
    </label>
    <label class="chartSpeedControl" for="verticalDensity">
      <span>竖线密度</span>
      <input id="verticalDensity" type="number" min="2" max="128" step="1" value="4" />
    </label>
    <label class="chartSpeedControl" for="editorXOffset">
      <span>编辑 X 偏移</span>
      <input id="editorXOffset" type="number" min="-2" max="2" step="0.01" value="0" />
    </label>
    <label class="chartSpeedControl" for="showCanvasIndex">
      <span>显示 Canvas Index</span>
      <input id="showCanvasIndex" type="checkbox" checked />
    </label>
    <section id="propertyEditor" class="propertyEditor" aria-label="谱面设置">
      <div class="propertyTabs" role="tablist">
        <button class="propertyTab active" data-panel="bpmPanel" type="button">BPM</button>
        <button class="propertyTab" data-panel="themePanel" type="button">主题</button>
        <button class="propertyTab" data-panel="riztimePanel" type="button">Riztime</button>
        <button class="propertyTab" data-panel="linePanel" type="button">线条</button>
        <button class="propertyTab" data-panel="objectPanel" type="button">对象</button>
      </div>
      <section id="bpmPanel" class="propertyPanel active">
        <label class="chartSpeedControl" for="baseBpm">
          <span>基础 BPM</span>
          <input id="baseBpm" type="number" min="1" max="999" step="0.01" />
        </label>
        <div class="listEditorHeader">
          <span>BPM 变化</span>
          <button id="addBpmShift" class="miniButton" type="button">添加</button>
        </div>
        <div id="bpmShiftList" class="listEditor"></div>
      </section>
      <section id="themePanel" class="propertyPanel">
        <div class="listEditorHeader">
          <span>主题</span>
          <button id="addTheme" class="miniButton" type="button">添加</button>
        </div>
        <div id="themeList" class="listEditor"></div>
      </section>
      <section id="riztimePanel" class="propertyPanel">
        <div class="listEditorHeader">
          <span>Riztime 设置</span>
          <button id="addChallenge" class="miniButton" type="button">添加</button>
        </div>
        <div id="challengeList" class="listEditor"></div>
      </section>
      <section id="linePanel" class="propertyPanel">
        <div id="lineColorEditor" class="lineColorEditor">
          <div class="propertyEditorTitle">请先选中一条线</div>
          <div class="listEditorHeader">
            <span>线颜色关键帧</span>
            <button id="addLineColor" class="miniButton" type="button">添加</button>
          </div>
          <div id="lineColorList" class="listEditor"></div>
          <div class="listEditorHeader">
            <span>判定圈关键帧</span>
            <button id="addJudgeColor" class="miniButton" type="button">添加</button>
          </div>
          <div id="judgeColorList" class="listEditor"></div>
        </div>
      </section>
      <section id="objectPanel" class="propertyPanel">
        <div class="propertyEditorTitle">已选对象</div>
        <div id="selectedObjectForm" class="selectedObjectForm"></div>
      </section>
    </section>
  </div>
</template>
