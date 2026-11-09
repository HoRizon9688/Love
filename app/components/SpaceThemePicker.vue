<script setup lang="ts">
import { Check } from '@lucide/vue'
import { spaceThemes } from '~/composables/useSpaceTheme'

const { theme, setTheme } = useSpaceTheme()
</script>

<template>
  <div class="theme-picker">
    <h3 id="space-theme-heading">外观主题</h3>
    <p>主题仅应用于当前设备。</p>
    <div class="theme-options" role="radiogroup" aria-labelledby="space-theme-heading">
      <label v-for="option in spaceThemes" :key="option.id" class="theme-option" :class="{ selected: theme === option.id }">
        <input
          type="radio"
          name="space-theme"
          :value="option.id"
          :checked="theme === option.id"
          @change="setTheme(option.id)"
        >
        <span class="theme-swatches" aria-hidden="true">
          <span v-for="color in option.swatches" :key="color" :style="{ backgroundColor: color }" />
        </span>
        <strong>{{ option.name }}</strong>
        <small>{{ option.description }}</small>
        <Check v-if="theme === option.id" class="theme-check" :size="15" aria-hidden="true" />
      </label>
    </div>
  </div>
</template>

<style scoped>
.theme-picker > p { margin: 6px 0 12px; color: var(--muted); }
.theme-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 115px), 1fr)); gap: 8px; }
.theme-option {
  position: relative;
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 11px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-solid);
  color: var(--ink);
  cursor: pointer;
}
.theme-option.selected { border-color: var(--theme-accent); background: var(--theme-soft); }
.theme-option:focus-within { outline: 2px solid var(--theme-accent); outline-offset: 2px; }
.theme-option input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.theme-option strong { font-size: 13px; }
.theme-option small { color: var(--muted); font-size: 11px; }
.theme-swatches { display: flex; gap: 4px; }
.theme-swatches span { width: 16px; height: 16px; border: 1px solid var(--line); border-radius: 50%; }
.theme-check { position: absolute; top: 10px; right: 10px; color: var(--theme-accent); pointer-events: none; }
</style>
