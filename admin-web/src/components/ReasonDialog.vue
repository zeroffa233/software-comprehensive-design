<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="480px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
    @open="onOpen"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-form-item :label="label" prop="reason">
        <el-input
          v-model.trim="form.reason"
          type="textarea"
          :rows="4"
          maxlength="200"
          show-word-limit
          :placeholder="placeholder"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="onConfirm">{{ confirmText }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, required: true },
  label: { type: String, default: '原因' },
  placeholder: { type: String, default: '' },
  confirmText: { type: String, default: '提交' },
  minLength: { type: Number, default: 10 },
  maxLength: { type: Number, default: 200 },
  // 由父组件在打开时设置的目标摘要（如商品标题）
  target: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'confirm'])

const formRef = ref()
const loading = ref(false)
const form = reactive({ reason: '' })
const rules = {
  reason: [
    { required: true, message: '请填写原因', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (!value || value.length < props.minLength) {
          callback(new Error(`原因不少于 ${props.minLength} 字`))
        } else if (value.length > props.maxLength) {
          callback(new Error(`原因不超过 ${props.maxLength} 字`))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.reason = ''
      loading.value = false
    }
  }
)

function onOpen() {
  formRef.value && formRef.value.clearValidate()
}

async function onConfirm() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  loading.value = true
  try {
    await new Promise((resolve) => emit('confirm', form.reason, resolve))
  } finally {
    loading.value = false
  }
}

defineExpose({
  close() {
    emit('update:modelValue', false)
  },
  alert(msg) {
    ElMessage.error(msg)
  }
})
</script>
