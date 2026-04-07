type RealtimeMessage = {
  type?: string
  payload?: any
}

function getStoredToken(): string | null {
  try {
    const raw = localStorage.getItem('mockmentorbiz-auth')
    const parsed = raw ? JSON.parse(raw) : null
    return parsed?.state?.token || null
  } catch {
    return null
  }
}

function getWsBaseUrl(): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

  if (!apiBase) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}`
  }

  if (apiBase.startsWith('http://')) {
    return `ws://${apiBase.slice('http://'.length)}`
  }

  if (apiBase.startsWith('https://')) {
    return `wss://${apiBase.slice('https://'.length)}`
  }

  if (apiBase.startsWith('ws://') || apiBase.startsWith('wss://')) {
    return apiBase
  }

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}`
}

export function subscribeMalpracticeUpdates(onUpdate: (message: RealtimeMessage) => void): () => void {
  const token = getStoredToken()
  if (!token) {
    return () => {}
  }

  let ws: WebSocket | null = null
  let reconnectTimer: number | null = null
  let stopped = false

  const connect = () => {
    const base = getWsBaseUrl().replace(/\/$/, '')
    const url = `${base}/api/ws/realtime?token=${encodeURIComponent(token)}`
    ws = new WebSocket(url)

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(String(evt.data || '{}'))
        if (msg?.type === 'malpractice_update') {
          onUpdate(msg)
        }
      } catch {
        // ignore malformed payloads
      }
    }

    ws.onclose = () => {
      if (stopped) return
      reconnectTimer = window.setTimeout(connect, 2500)
    }

    ws.onerror = () => {
      // Let onclose handle retries
    }
  }

  connect()

  return () => {
    stopped = true
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close()
    }
    ws = null
  }
}
