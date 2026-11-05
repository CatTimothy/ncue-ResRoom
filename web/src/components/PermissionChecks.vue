<script setup>
import { PERMISSIONS } from '../permissions.js';

const model = defineModel({ type: Array, required: true });
</script>

<template>
  <fieldset class="permission-checks">
    <legend>權限</legend>
    <label v-for="(label, permission) in PERMISSIONS" :key="permission">
      <input v-model="model" type="checkbox" :value="permission" />
      {{ label }}
    </label>
  </fieldset>
</template>
