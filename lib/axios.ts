import axios from 'axios'

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    // Get token from localStorage or sessionStorage
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      const url = String(error.config?.url || '')
      // Wrong password on login (and other credential auth) returns 401 —
      // do not treat as expired session / force redirect (matches mobile).
      const isAuthCredentialRoute =
        url.includes('/api/auth/login') ||
        url.includes('/api/auth/register') ||
        url.includes('/api/auth/forgot-password') ||
        url.includes('/api/auth/reset-password') ||
        url.includes('/api/auth/verify-otp') ||
        url.includes('/api/auth/send-otp')
      if (!isAuthCredentialRoute && typeof window !== 'undefined') {
        localStorage.removeItem('authToken')
        localStorage.removeItem('userData')
        sessionStorage.removeItem('authToken')
        sessionStorage.removeItem('userData')
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient






