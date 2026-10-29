<template>
  <div class="forbidden">
    <el-result icon="warning" title="403" sub-title="无权限访问管理端，请使用管理员账号登录">
      <template #extra>
        <el-button type="primary" @click="$router.replace('/login')">返回登录</el-button>
      </template>
    </el-result>
  </div>
</template>

<style scoped>
.forbidden { height: 100%; display: flex; align-items: center; justify-content: center; }
</style>
