import { defineStore } from 'pinia'

const TOKEN_KEY = 'admin_token'
const ROLE_KEY = 'admin_role'
const NAME_KEY = 'admin_name'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    role: localStorage.getItem(ROLE_KEY) || '',
    name: localStorage.getItem(NAME_KEY) || ''
  }),
  getters: {
    isAdmin: (state) => state.role === 'ADMIN'
  },
  actions: {
    setCredentials({ token, role, name }) {
      this.token = token || ''
      this.role = role || ''
      this.name = name || ''
      localStorage.setItem(TOKEN_KEY, this.token)
      localStorage.setItem(ROLE_KEY, this.role)
      localStorage.setItem(NAME_KEY, this.name)
    },
    clearCredentials() {
      this.token = ''
      this.role = ''
      this.name = ''
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(ROLE_KEY)
      localStorage.removeItem(NAME_KEY)
    }
  }
})
