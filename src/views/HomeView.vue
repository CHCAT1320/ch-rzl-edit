<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { hasImportedChart, loadChart, loadMusic, newChart } from "../fileManager";

const router = useRouter();
const chartImported = ref(hasImportedChart());

function handleChartLoaded(): void {
  chartImported.value = true;
}

function enterEditor(): void {
  void router.push("/editor");
}

async function importChartAndMusic(): Promise<void> {
  await loadChart();
  if (!hasImportedChart()) return;
  await loadMusic();
}

onMounted(() => {
  chartImported.value = hasImportedChart();
  window.addEventListener("chartloaded", handleChartLoaded);
});

onBeforeUnmount(() => {
  window.removeEventListener("chartloaded", handleChartLoaded);
});
</script>

<template>
  <main class="startPage">
    <section class="startCard">
      <h1>CH-RZL-EDIT</h1>
      <p class="startDescription">
        导入谱面与音乐，或新建谱面开始编辑
      </p>

      <div class="startActions">
        <button
          class="simpleButton startButton"
          type="button"
          @click="importChartAndMusic"
        >
          导入谱面与音乐
        </button>
        <button
          class="simpleButton startButton"
          type="button"
          @click="newChart"
        >
          新建谱面
        </button>
      </div>

      <button
        class="simpleButton startButton startButtonPrimary"
        type="button"
        :disabled="!chartImported"
        @click="enterEditor"
      >
        进入编辑器
      </button>

      <p class="startHint">
        {{ chartImported ? "谱面已就绪，可以进入编辑器" : "请先导入或新建谱面" }}
      </p>
    </section>
  </main>
</template>

<style scoped>
.startPage {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 32px;
  box-sizing: border-box;
}

.startCard {
  width: min(640px, 100%);
  padding: 36px;
  border: 1px solid #555;
  border-radius: 10px;
  background: #2b2b2b;
  box-sizing: border-box;
  color: #f2f2f2;
}

h1 {
  margin: 0 0 12px;
  font-size: 30px;
  font-weight: 500;
  text-align: center;
}

.startDescription {
  margin: 0 0 28px;
  color: #cfcfcf;
  line-height: 1.6;
  text-align: center;
}

.startActions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.startButton {
  width: 100%;
  min-width: 0;
  height: 52px;
  font-size: 16px;
}

.startButtonPrimary {
  margin-top: 16px;
  border-color: #c8c8c8;
  background: #4a4a4a;
}

.startHint {
  margin: 18px 0 0;
  color: #9a9a9a;
  font-size: 14px;
  text-align: center;
}
</style>
