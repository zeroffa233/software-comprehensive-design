<template>
  <el-config-provider>
    <router-view />
  </el-config-provider>
</template>

<script setup>
import { ElConfigProvider } from 'element-plus'
</script>

<style>
* { box-sizing: border-box; }
html, body, #app { height: 100%; margin: 0; }
body {
  font-family: -apple-system, 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
  background: #f5f7fa;
}
</style>
