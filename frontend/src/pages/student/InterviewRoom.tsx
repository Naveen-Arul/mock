import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  Mic, 
  MicOff, 
  MessageSquare, 
  Send, 
  Camera,
  CameraOff,
  AlertTriangle,
  Clock,
  GitBranch
} from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Webcam from 'react-webcam'
import { useAudioRecorder } from 'react-audio-voice-recorder'
import { studentApi, interviewApi, ttsApi, getApiErrorMessage } from '../../utils/api'
import { detectPeopleAndPhonesFromElement } from '../../utils/proctorDetector'
import type { DetectionBox } from '../../utils/proctorDetector'
import { detectLookAwayFromElement } from '../../utils/lookAwayDetector'

type ProctorEvent = {
  type: string
  timestamp: Date
  metadata?: Record<string, any>
}

const InterviewRoom = () => {
  const { interviewId } = useParams<{ interviewId: string }>()
  const navigate = useNavigate()
  const webcamRef = useRef<Webcam>(null)

  const parsedInterviewId = Number(interviewId)
  const hasValidInterviewId = Number.isFinite(parsedInterviewId) && parsedInterviewId > 0
  
  // Interview state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [textAnswer, setTextAnswer] = useState('')
  const [responseMode, setResponseMode] = useState<'voice' | 'text'>('text')
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [responseStartTime, setResponseStartTime] = useState<number>(0)
  const [isProctoringActive, setIsProctoringActive] = useState(false)
  const [isFullscreenActive, setIsFullscreenActive] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [micReady, setMicReady] = useState(false)
  const [modelWarmedUp, setModelWarmedUp] = useState(false)
  const [isPreflightChecking, setIsPreflightChecking] = useState(false)
  const [preflightError, setPreflightError] = useState<string | null>(null)
  const [preflightAttempt, setPreflightAttempt] = useState(0)

  // FollowUpAgent: show a "thinking" indicator while the agent generates the next question
  const [isAgentThinking, setIsAgentThinking] = useState(false)

  // Confirmation dialogs
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)

  // Voice answer review (replay + transcript before moving on)
  const [isReviewingVoiceAnswer, setIsReviewingVoiceAnswer] = useState(false)
  // Lock the current question during the voice flow so live-status polling / TTS
  // cannot switch the UI to the next question until the student clicks Next.
  const [isVoiceQuestionLocked, setIsVoiceQuestionLocked] = useState(false)
  const [reviewAudioUrl, setReviewAudioUrl] = useState<string | null>(null)
  const [reviewTranscript, setReviewTranscript] = useState<string>('')
  const [pendingNextQuestionId, setPendingNextQuestionId] = useState<number | null>(null)
  const lastVoiceBlobKeyRef = useRef<string>('')

  // Question voice playback
  const [questionAudioUrl, setQuestionAudioUrl] = useState<string | null>(null)
  const [isQuestionAudioLoading, setIsQuestionAudioLoading] = useState(false)
  const questionAudioRef = useRef<HTMLAudioElement | null>(null)
  const ttsErrorShownRef = useRef(false)
  const lastQuestionTtsKeyRef = useRef<string>('')
  
  // Proctoring state
  const [proctorWarnings, setProctorWarnings] = useState<string[]>([])
  const [tabSwitchCount, setTabSwitchCount] = useState(0)
  const [lookAwayCount, setLookAwayCount] = useState(0)
  const [multiplePeopleCount, setMultiplePeopleCount] = useState(0)
  const [mobilePhoneCount, setMobilePhoneCount] = useState(0)
  const [liveDetectionBoxes, setLiveDetectionBoxes] = useState<DetectionBox[]>([])
  const [liveFrameSize, setLiveFrameSize] = useState<{ width: number; height: number }>({ width: 480, height: 270 })
  const [liveDetectionCounts, setLiveDetectionCounts] = useState<{ faces: number; people: number; phones: number }>({
    faces: 0,
    people: 0,
    phones: 0,
  })
  const proctorEventsRef = useRef<ProctorEvent[]>([])
  const lastFullscreenStateRef = useRef<boolean>(false)
  const fullscreenRetryRef = useRef<number>(0)
  const proctoringAutoStartRef = useRef<boolean>(false)
  const fullscreenNudgeShownRef = useRef<boolean>(false)
  const detectionInFlightRef = useRef<boolean>(false)
  const lookAwayStateRef = useRef<'forward' | 'left' | 'right' | 'up' | 'down' | 'no_face'>('forward')
  const lookAwaySinceRef = useRef<number>(0)
  const lastLookAwayEventAtRef = useRef<number>(0)
  const lastMultiplePeopleEventAtRef = useRef<number>(0)
  const lastPhoneEventAtRef = useRef<number>(0)
  const clientTickInFlightRef = useRef<boolean>(false)
  const tabHiddenSinceRef = useRef<number>(0)
  const windowBlurSinceRef = useRef<number>(0)
  const lastTabSwitchEventAtRef = useRef<number>(0)
  const lastWindowBlurEventAtRef = useRef<number>(0)
  const lastExtensionEventAtRef = useRef<number>(0)

  // Prohibited keys / devtools detection throttling
  const lastProhibitedKeyAtRef = useRef<number>(0)

  const shouldEnforceProctoring = () => Boolean(isProctoringActive)

  // Background audio level monitoring (best-effort)
  const audioLevelRef = useRef<number | null>(null)
  const audioMonitorRef = useRef<{ stop: () => void } | null>(null)
  const micReadyRef = useRef(false)

  const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
  
  // Audio recording
  const {
    startRecording,
    stopRecording,
    recordingBlob,
    isRecording,
    recordingTime
  } = useAudioRecorder()

  // Fetch interview data
  const { data: interviewData, isLoading, refetch: refetchLiveStatus } = useQuery({
    queryKey: ['interview', parsedInterviewId],
    queryFn: () => interviewApi.getLiveStatus(parsedInterviewId),
    // Pause live-status updates while a voice answer is in review/re-record flow.
    refetchInterval: isVoiceQuestionLocked ? false : 5000,
    refetchOnWindowFocus: !isVoiceQuestionLocked,
    refetchOnReconnect: !isVoiceQuestionLocked,
    enabled: hasValidInterviewId,
  })

  // Submit answer mutation
  const submitAnswerMutation = useMutation({
    mutationFn: ({ answerData, audioFile }: { answerData: any, audioFile?: File }) => {
      setIsAgentThinking(true)
      return studentApi.submitAnswer(parsedInterviewId, answerData, audioFile)
    },
    onSuccess: (response) => {
      setIsAgentThinking(false)
      const nextQuestionId = response.data.next_question_id
      const followUpGenerated = response.data.follow_up_generated
      // For voice answers, enter review mode so the student can replay & confirm
      // before moving to the next question.
      if (responseMode === 'voice') {
        setIsVoiceQuestionLocked(true)
        setReviewTranscript(String(response.data.transcript || ''))
        setPendingNextQuestionId(nextQuestionId)
        setIsReviewingVoiceAnswer(true)
        setTextAnswer('')
        // IMPORTANT: don't refetch live status here.
        // The backend live-status calculates `current_question` from answers count,
        // which would switch the UI to the next question before the student confirms.
        return
      }

      if (nextQuestionId !== null && nextQuestionId !== undefined) {
        if (followUpGenerated) {
          toast.success('Follow-up question generated', { icon: '🔍' })
        }
        setCurrentQuestionIndex(nextQuestionId)
        setTextAnswer('')
        setResponseStartTime(Date.now())
        // Force a fresh live-status fetch so the question text updates immediately.
        refetchLiveStatus()
      } else {
        // Interview completed
        completeInterviewMutation.mutate()
      }
    },
    onError: (error: any) => {
      setIsAgentThinking(false)
      if (responseMode === 'voice') {
        setIsVoiceQuestionLocked(false)
        setIsReviewingVoiceAnswer(false)
      }
      toast.error(getApiErrorMessage(error, 'Failed to submit answer'))
    }
  })

  useEffect(() => {
    if (!interviewId) return
    if (!hasValidInterviewId) {
      toast.error('Invalid interview link. Please start the interview again.')
      navigate('/student', { replace: true })
    }
  }, [interviewId, hasValidInterviewId, navigate])

  // Complete interview mutation
  const completeInterviewMutation = useMutation({
    mutationFn: () => studentApi.completeInterview(parsedInterviewId),
    onSuccess: (response) => {
      toast.success('Interview completed successfully!')
      navigate('/student/performance', { 
        state: { completedInterview: response.data } 
      })
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error, 'Failed to complete interview'))
    }
  })

  // Initialize interview
  useEffect(() => {
    if (interviewData?.data) {
      setResponseStartTime(Date.now())
    }
  }, [interviewData])

  // Focus tracking with grace period to reduce accidental false positives.
  useEffect(() => {
    if (!interviewData?.data?.is_proctored) return

    const TAB_SWITCH_GRACE_MS = 1200
    const TAB_SWITCH_COOLDOWN_MS = 4000

    const handleVisibilityChange = () => {
      if (document.hidden) {
        tabHiddenSinceRef.current = Date.now()
        return
      }

      const hiddenSince = tabHiddenSinceRef.current
      tabHiddenSinceRef.current = 0
      if (!hiddenSince) return

      const now = Date.now()
      const hiddenMs = now - hiddenSince
      if (hiddenMs < TAB_SWITCH_GRACE_MS) return
      if (now - lastTabSwitchEventAtRef.current < TAB_SWITCH_COOLDOWN_MS) return

      lastTabSwitchEventAtRef.current = now
      setTabSwitchCount(prev => prev + 1)
      proctorEventsRef.current = [
        ...proctorEventsRef.current,
        {
          type: 'tab_switch',
          timestamp: new Date(),
          metadata: { hidden_ms: hiddenMs },
        },
      ].slice(-50)
      toast.error('Tab switching detected - stay focused on the interview')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [interviewData?.data?.is_proctored])

  // Fullscreen enforcement + anti-copy / anti-right-click (proctored only)
  useEffect(() => {
    if (!interviewData?.data?.is_proctored) return

    setIsFullscreenActive(Boolean(document.fullscreenElement))

    const onFullscreenChange = () => {
      const isFs = Boolean(document.fullscreenElement)
      setIsFullscreenActive(isFs)
      const wasFs = lastFullscreenStateRef.current
      lastFullscreenStateRef.current = isFs

      // If user exited fullscreen after being in it, log an incident.
      if (wasFs && !isFs) {
        proctorEventsRef.current = [
          ...proctorEventsRef.current,
          { type: 'fullscreen_exit', timestamp: new Date() },
        ].slice(-50)
        toast.error('Fullscreen exited - return to fullscreen mode')

        // Best-effort re-entry (may be blocked by browser without user gesture)
        document.documentElement.requestFullscreen().then(
          () => {
            lastFullscreenStateRef.current = true
            fullscreenRetryRef.current = 0
          },
          () => {
            // ignore
          }
        )
      }
    }

    const isEditableTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      if (!el) return false
      return Boolean(el.closest('input, textarea, [contenteditable="true"]'))
    }

    const onContextMenu = (e: Event) => {
      if (!shouldEnforceProctoring()) return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      proctorEventsRef.current = [
        ...proctorEventsRef.current,
        { type: 'right_click', timestamp: new Date() },
      ].slice(-50)
      toast.error('Right click disabled during interview')
    }

    const onClipboard = (e: Event) => {
      if (!shouldEnforceProctoring()) return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      const evtType = (e as any)?.type || 'copy_paste'
      proctorEventsRef.current = [
        ...proctorEventsRef.current,
        { type: evtType, timestamp: new Date() },
      ].slice(-50)
      toast.error('Copy/paste disabled during interview')
    }

    const onSelectStart = (e: Event) => {
      if (!shouldEnforceProctoring()) return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
    }

    const onDragStart = (e: Event) => {
      if (!shouldEnforceProctoring()) return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('copy', onClipboard)
    document.addEventListener('cut', onClipboard)
    document.addEventListener('paste', onClipboard)
    document.addEventListener('selectstart', onSelectStart)
    document.addEventListener('dragstart', onDragStart)

    const WINDOW_BLUR_GRACE_MS = 1200
    const WINDOW_BLUR_COOLDOWN_MS = 4000

    const onWindowBlur = () => {
      windowBlurSinceRef.current = Date.now()
    }

    const onWindowFocus = () => {
      const blurSince = windowBlurSinceRef.current
      windowBlurSinceRef.current = 0
      if (!blurSince) return

      const now = Date.now()
      const blurMs = now - blurSince
      if (blurMs < WINDOW_BLUR_GRACE_MS) return
      if (now - lastWindowBlurEventAtRef.current < WINDOW_BLUR_COOLDOWN_MS) return

      lastWindowBlurEventAtRef.current = now
      proctorEventsRef.current = [
        ...proctorEventsRef.current,
        {
          type: 'window_blur',
          timestamp: new Date(),
          metadata: { blur_ms: blurMs },
        },
      ].slice(-50)
      toast.error('Focus lost - stay on the interview')
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!shouldEnforceProctoring()) return

      const key = (e.key || '').toLowerCase()
      const code = (e.code || '').toLowerCase()

      // Catch common cheating/devtools shortcuts that are possible to intercept in browser.
      // Note: OS-level shortcuts like Alt+Tab cannot be blocked.
      const ctrl = e.ctrlKey || e.metaKey
      const shift = e.shiftKey
      const alt = e.altKey

      const isDevtools =
        (key === 'f12') ||
        (ctrl && shift && (key === 'i' || key === 'j' || key === 'c')) ||
        (ctrl && (key === 'u' || key === 's' || key === 'p'))

      const isClipboard = ctrl && (key === 'c' || key === 'v' || key === 'x')
      const isPrintScreen = key === 'printscreen' || code === 'printscreen'

      const blocked = isDevtools || isClipboard || isPrintScreen
      if (!blocked) return

      const now = Date.now()
      if (now - lastProhibitedKeyAtRef.current < 750) {
        e.preventDefault()
        return
      }
      lastProhibitedKeyAtRef.current = now

      e.preventDefault()

      const comboParts = [
        ctrl ? 'Ctrl/Cmd' : null,
        alt ? 'Alt' : null,
        shift ? 'Shift' : null,
        (e.key || '').length ? e.key : e.code,
      ].filter(Boolean)

      proctorEventsRef.current = [
        ...proctorEventsRef.current,
        {
          type: 'prohibited_keys',
          timestamp: new Date(),
          metadata: {
            combo: comboParts.join('+'),
            key: e.key,
            code: e.code,
            ctrl,
            alt,
            shift,
          },
        },
      ].slice(-50)

      toast.error('Prohibited keys detected')
    }

    const extensionWatchdog = window.setInterval(() => {
      if (!isProctoringActive) return

      // Browser extensions cannot be reliably disabled from a web app.
      // This is a best-effort signal-based detection for suspicious automation/tooling.
      const hasWebDriver = Boolean((navigator as any).webdriver)
      const hasKnownAutomationFlag = Boolean((window as any).__nightmare || (window as any).domAutomation)

      if (!hasWebDriver && !hasKnownAutomationFlag) return

      const now = Date.now()
      if (now - lastExtensionEventAtRef.current < 15000) return
      lastExtensionEventAtRef.current = now

      proctorEventsRef.current = [
        ...proctorEventsRef.current,
        {
          type: 'extension_detected',
          timestamp: new Date(),
          metadata: {
            webdriver: hasWebDriver,
            automation_flag: hasKnownAutomationFlag,
          },
        },
      ].slice(-50)

      toast.error('Suspicious browser tooling detected during fullscreen test mode')
    }, 3000)

    window.addEventListener('blur', onWindowBlur)
    window.addEventListener('focus', onWindowFocus)
    window.addEventListener('keydown', onKeyDown, { capture: true })

    const fullscreenWatchdog = window.setInterval(() => {
      if (!isProctoringActive) return
      if (document.fullscreenElement) return

      fullscreenRetryRef.current += 1

      void document.documentElement.requestFullscreen().catch(() => {
        // ignore; browser may require a user gesture
      })
    }, 2500)

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('copy', onClipboard)
      document.removeEventListener('cut', onClipboard)
      document.removeEventListener('paste', onClipboard)
      document.removeEventListener('selectstart', onSelectStart)
      document.removeEventListener('dragstart', onDragStart)
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener('focus', onWindowFocus)
      window.removeEventListener('keydown', onKeyDown, { capture: true } as any)
      window.clearInterval(fullscreenWatchdog)
      window.clearInterval(extensionWatchdog)
    }
  }, [interviewData?.data?.is_proctored, isProctoringActive])

  // Background noise monitoring (best-effort, proctored only)
  useEffect(() => {
    if (!isProctoringActive) return

    // Don't double-start.
    if (audioMonitorRef.current) return

    let cancelled = false
    let stream: MediaStream | null = null
    let rafId: number | null = null
    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let data: Uint8Array<ArrayBuffer> | null = null

    const stop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      if (stream) {
        for (const t of stream.getTracks()) {
          try { t.stop() } catch { /* ignore */ }
        }
        stream = null
      }
      if (audioCtx) {
        try { void audioCtx.close() } catch { /* ignore */ }
        audioCtx = null
      }
      analyser = null
      data = null
      audioLevelRef.current = null
      audioMonitorRef.current = null
    }

    audioMonitorRef.current = { stop }

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) return
        setMicReady(true)

        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const source = audioCtx.createMediaStreamSource(stream)
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 2048
        data = new Uint8Array(new ArrayBuffer(analyser.fftSize))
        source.connect(analyser)

        const loop = () => {
          if (!analyser || !data) return

          analyser.getByteTimeDomainData(data)
          let sumSq = 0
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128
            sumSq += v * v
          }
          const rms = Math.sqrt(sumSq / data.length)
          const dbfs = 20 * Math.log10(Math.max(rms, 1e-8)) // [-inf..0]
          // Convert to a 0..100-ish scale (0 very quiet, 100 very loud)
          const level = Math.max(0, Math.min(100, 100 + dbfs))
          audioLevelRef.current = level

          rafId = requestAnimationFrame(loop)
        }

        rafId = requestAnimationFrame(loop)
      } catch (err: any) {
        // Mic permission denied or not available; keep null and inform the user.
        setMicReady(false)
        audioLevelRef.current = null
        const isDenied =
          err?.name === 'NotAllowedError' ||
          err?.name === 'PermissionDeniedError'
        if (isDenied) {
          toast.error(
            'Microphone access denied. Please allow mic permissions for proctoring to work correctly.',
            { duration: 6000 }
          )
        }
      }
    })()

    return () => {
      cancelled = true
      setMicReady(false)
      stop()
    }
  }, [isProctoringActive])

  useEffect(() => {
    micReadyRef.current = micReady
  }, [micReady])

  useEffect(() => {
    if (!interviewData?.data?.is_proctored || !isProctoringActive) return

    let cancelled = false

    const getVideo = () => {
      const wc: any = webcamRef.current
      const video = wc?.video as HTMLVideoElement | undefined
      if (!video) return null
      if ((video.readyState ?? 0) < 2) return null
      return video
    }

    const runPreflight = async () => {
      setIsPreflightChecking(true)
      setPreflightError(null)
      setCameraReady(false)
      setModelWarmedUp(false)

      setCameraEnabled(true)
      await requestFullscreenIfPossible()

      const cameraStart = Date.now()
      let video: HTMLVideoElement | null = null
      while (!cancelled && Date.now() - cameraStart < 15000) {
        video = getVideo()
        if (video) break
        await sleep(250)
      }

      if (cancelled) return
      if (!video) {
        setPreflightError('Camera is not ready. Please allow camera access and keep camera on.')
        setIsPreflightChecking(false)
        return
      }
      setCameraReady(true)

      const micStart = Date.now()
      while (!cancelled && Date.now() - micStart < 15000) {
        if (micReadyRef.current) break
        await sleep(250)
      }

      if (cancelled) return
      if (!micReadyRef.current) {
        setPreflightError('Microphone is not ready. Please allow microphone access to continue.')
        setIsPreflightChecking(false)
        return
      }

      let warmupSucceeded = false
      const warmupStart = Date.now()
      while (!cancelled && Date.now() - warmupStart < 9000) {
        try {
          const warmVideo = getVideo()
          if (!warmVideo) {
            await sleep(250)
            continue
          }
          const warmupResult = await Promise.race([
            detectPeopleAndPhonesFromElement(warmVideo),
            sleep(2000).then(() => null),
          ])

          if (warmupResult === null) {
            await sleep(250)
            continue
          }

          warmupSucceeded = true
          break
        } catch {
          await sleep(400)
        }
      }

      if (cancelled) return
      if (!warmupSucceeded) {
        setPreflightError('Detector warm-up timed out. Click Retry to re-initialize proctoring quickly.')
        setIsPreflightChecking(false)
        return
      }

      setModelWarmedUp(true)
      setPreflightError(null)
      setIsPreflightChecking(false)
    }

    void runPreflight()

    return () => {
      cancelled = true
    }
  }, [interviewData?.data?.is_proctored, isProctoringActive, preflightAttempt])

  // Proctoring updates
  useEffect(() => {
    if (!isProctoringActive || !cameraEnabled) return

    const getVideo = () => {
      const wc: any = webcamRef.current
      const video = wc?.video as HTMLVideoElement | undefined
      if (!video) return null
      // HAVE_CURRENT_DATA = 2
      if ((video.readyState ?? 0) < 2) return null
      return video
    }

    // Fast client-side detection loop (instant UI incidents)
    let clientCancelled = false
    const clientTick = async () => {
      if (clientCancelled) return
      if (clientTickInFlightRef.current) return
      clientTickInFlightRef.current = true

      const video = getVideo()
      if (!video) {
        clientTickInFlightRef.current = false
        return
      }

      try {
        // Phone/person detection (best-effort)
        if (!detectionInFlightRef.current) {
          detectionInFlightRef.current = true
          try {
            const { faceCount, personCount, phoneCount, boxes } = await detectPeopleAndPhonesFromElement(video)
            setLiveDetectionBoxes(boxes)
            setLiveFrameSize({
              width: Math.max(1, video.videoWidth || 480),
              height: Math.max(1, video.videoHeight || 270),
            })
            setLiveDetectionCounts({
              faces: faceCount,
              people: personCount,
              phones: phoneCount,
            })

            const personBoxes = boxes.filter((b) => b.label === 'person')
            const phoneBoxes = boxes.filter((b) => b.label === 'cell phone')
            const maxPersonConfidence = personBoxes.reduce((m, b) => Math.max(m, b.score || 0), 0)
            const maxPhoneConfidence = phoneBoxes.reduce((m, b) => Math.max(m, b.score || 0), 0)
            const effectivePeopleCount = Math.max(faceCount, personCount)

            if (phoneCount > 0) {
              // Make the UI feel immediate by showing a local warning instantly.
              setProctorWarnings((prev) => Array.from(new Set([...(prev || []), 'Mobile phone detected'])))

              const now = Date.now()
              // Count + toast at most once per cooldown window so it reflects incidents, not frames.
              if (now - lastPhoneEventAtRef.current > 8000) {
                lastPhoneEventAtRef.current = now
                setMobilePhoneCount((prev) => prev + 1)
                toast.error('Mobile phone detected')
              }

              proctorEventsRef.current = [
                ...proctorEventsRef.current,
                {
                  type: 'phone_detected',
                  timestamp: new Date(),
                  metadata: {
                    phone_count: phoneCount,
                    confidence: Number(maxPhoneConfidence.toFixed(3)),
                  },
                },
              ].slice(-50)
            }

            if (faceCount === 0) {
              const now = Date.now()
              if (now - lastLookAwayEventAtRef.current > 8000) {
                lastLookAwayEventAtRef.current = now
                setLookAwayCount((prev) => prev + 1)
              }
              proctorEventsRef.current = [
                ...proctorEventsRef.current,
                { type: 'no_face_detected', timestamp: new Date(), metadata: { face_count: faceCount } },
              ].slice(-50)
            } else if (effectivePeopleCount > 1) {
              const now = Date.now()
              if (now - lastMultiplePeopleEventAtRef.current > 8000) {
                lastMultiplePeopleEventAtRef.current = now
                setMultiplePeopleCount((prev) => prev + 1)
              }
              proctorEventsRef.current = [
                ...proctorEventsRef.current,
                {
                  type: 'multiple_faces',
                  timestamp: new Date(),
                  metadata: {
                    face_count: faceCount,
                    person_count: personCount,
                    confidence: Number(maxPersonConfidence.toFixed(3)),
                  },
                },
              ].slice(-50)
            }
          } catch {
            // Ignore detection failures
            setLiveDetectionBoxes([])
            setLiveDetectionCounts({ faces: 0, people: 0, phones: 0 })
          } finally {
            detectionInFlightRef.current = false
          }
        }

        // Look-away detection (MediaPipe FaceMesh, best-effort)
        try {
          const look = await detectLookAwayFromElement(video)
          const dir = look.direction

          const now = Date.now()
          const prev = lookAwayStateRef.current

          if (dir !== prev) {
            lookAwayStateRef.current = dir
            lookAwaySinceRef.current = now
          }

          // Log only if sustained look-away for >= 2s, with a cooldown.
          const sustainedMs = now - (lookAwaySinceRef.current || now)
          const cooldownOk = now - lastLookAwayEventAtRef.current > 8000

          if (cooldownOk && dir !== 'forward' && dir !== 'no_face' && sustainedMs >= 2000) {
            lastLookAwayEventAtRef.current = now
            setLookAwayCount((prev) => prev + 1)
            proctorEventsRef.current = [
              ...proctorEventsRef.current,
              {
                type: 'look_away',
                timestamp: new Date(),
                metadata: { direction: dir, yaw: look.yaw, pitch: look.pitch },
              },
            ].slice(-50)
          }
        } catch {
          // ignore
        }
      } finally {
        clientTickInFlightRef.current = false
      }
    }

    const clientInterval = setInterval(() => {
      void clientTick()
    }, 500)

    // Slower server upload loop (persist incidents + server-side checks)
    const serverTick = async () => {
      if (!webcamRef.current) return

      const screenshot = webcamRef.current.getScreenshot()
      const eventsToSend = proctorEventsRef.current

      try {
        const response = await interviewApi.updateProctoring({
          interview_id: parseInt(interviewId!, 10),
          frame_data: screenshot ?? undefined,
          audio_level: audioLevelRef.current ?? undefined,
          tab_switches: tabSwitchCount,
          events: eventsToSend,
          timestamp: new Date(),
        })

        if (response.data.detected_issues.length > 0) {
          const issues = response.data.detected_issues.map((issue: any) => issue.description)
          setProctorWarnings(issues)
        }

        // Clear only if the send succeeded.
        if (eventsToSend.length > 0) {
          proctorEventsRef.current = proctorEventsRef.current.slice(eventsToSend.length)
        }
      } catch (e) {
        // Proctoring upload failed silently — non-fatal
      }
    }

    const serverInterval = setInterval(() => {
      void serverTick()
    }, 5000)

    return () => {
      clientCancelled = true
      clearInterval(clientInterval)
      clearInterval(serverInterval)
    }
  }, [interviewId, cameraEnabled, tabSwitchCount, isProctoringActive])

  useEffect(() => {
    if (!cameraEnabled) {
      setLiveDetectionBoxes([])
      setCameraReady(false)
      setModelWarmedUp(false)
    }
  }, [cameraEnabled])

  const requestFullscreenIfPossible = async () => {
    if (!isProctoringActive) return
    if (document.fullscreenElement) return
    try {
      await document.documentElement.requestFullscreen()
      lastFullscreenStateRef.current = true
    } catch {
      // Browser may block without user gesture; ignore.
    }
  }

  // Handle audio recording
  useEffect(() => {
    if (recordingBlob && responseMode === 'voice') {
      setIsVoiceQuestionLocked(true)

      // Prevent duplicate submissions if the recorder re-emits the same blob.
      const blobKey = `${recordingBlob.size}:${recordingBlob.type}`
      if (lastVoiceBlobKeyRef.current === blobKey) return
      lastVoiceBlobKeyRef.current = blobKey

      // Prepare local replay URL immediately.
      const url = URL.createObjectURL(recordingBlob)
      setReviewAudioUrl((prev) => {
        if (prev) {
          try {
            URL.revokeObjectURL(prev)
          } catch {
            // ignore
          }
        }
        return url
      })
      setReviewTranscript('')

      const blobType = recordingBlob.type || 'audio/webm'
      const ext = blobType.includes('wav')
        ? 'wav'
        : blobType.includes('mpeg')
          ? 'mp3'
          : blobType.includes('ogg')
            ? 'ogg'
            : 'webm'

      const audioFile = new File([recordingBlob], `response.${ext}`, { type: blobType })
      handleSubmitAnswer(audioFile)
    }
  }, [recordingBlob])

  useEffect(() => {
    return () => {
      if (reviewAudioUrl) {
        try {
          URL.revokeObjectURL(reviewAudioUrl)
        } catch {
          // ignore
        }
      }
    }
  }, [reviewAudioUrl])

  const handleSubmitAnswer = (audioFile?: File) => {
    if (!isStrictProctorReady) {
      toast.error('Proctoring setup is not ready. Wait for fullscreen, camera, microphone, and model warm-up.')
      void requestFullscreenIfPossible()
      return
    }

    if (isProctored && !document.fullscreenElement) {
      toast.error('Enter fullscreen mode to continue this proctored interview')
      void requestFullscreenIfPossible()
      return
    }

    if (!textAnswer.trim() && !audioFile) {
      toast.error('Please provide an answer')
      return
    }

    const responseTime = Math.floor((Date.now() - responseStartTime) / 1000)
    
    const answerData = {
      question_id: currentQuestionIndex,
      answer_text: textAnswer,
      response_time: responseTime
    }

    submitAnswerMutation.mutate({ answerData, audioFile })
  }

  const handleVoiceResponse = () => {
    if (!isStrictProctorReady) {
      toast.error('Wait until proctoring setup is complete before recording')
      return
    }

    if (isReviewingVoiceAnswer) return
    if (isRecording) {
      stopRecording()
    } else {
      setResponseMode('voice')
      startRecording()
    }
  }

  const handleReRecordVoiceAnswer = () => {
    if (submitAnswerMutation.isPending) return

    setIsReviewingVoiceAnswer(false)
    // Keep pendingNextQuestionId and keep the question locked.
    setReviewTranscript('')
    setReviewAudioUrl((prev) => {
      if (prev) {
        try {
          URL.revokeObjectURL(prev)
        } catch {
          // ignore
        }
      }
      return null
    })

    // Allow the recorder to submit again.
    lastVoiceBlobKeyRef.current = ''

    setResponseMode('voice')
    startRecording()
  }

  const handleNextQuestionAfterReview = () => {
    const nextId = pendingNextQuestionId
    setIsReviewingVoiceAnswer(false)
    setIsVoiceQuestionLocked(false)
    setPendingNextQuestionId(null)
    setReviewTranscript('')
    // Keep the audio URL around only while reviewing.
    setReviewAudioUrl((prev) => {
      if (prev) {
        try {
          URL.revokeObjectURL(prev)
        } catch {
          // ignore
        }
      }
      return null
    })

    // Stop any currently playing question audio so it doesn't overlap
    // with the next question's audio.
    if (questionAudioRef.current) {
      try {
        questionAudioRef.current.pause()
        questionAudioRef.current.currentTime = 0
      } catch {
        // ignore
      }
    }
    setQuestionAudioUrl((prev) => {
      if (prev) {
        try {
          URL.revokeObjectURL(prev)
        } catch {
          // ignore
        }
      }
      return null
    })

    if (nextId !== null && nextId !== undefined) {
      setCurrentQuestionIndex(nextId)
      setTextAnswer('')
      setResponseStartTime(Date.now())
      refetchLiveStatus()
    } else {
      completeInterviewMutation.mutate()
    }
  }

  const getCurrentQuestion = () => {
    if (!interviewData?.data?.current_question) return null
    return interviewData.data.current_question
  }

  const getProgressPercentage = () => {
    if (!interviewData?.data) return 0
    return interviewData.data.progress_percentage
  }

  const currentQuestion = getCurrentQuestion()
  const progress = getProgressPercentage()
  const isProctored = interviewData?.data?.is_proctored
  const isStrictProctorReady = !isProctored || (isFullscreenActive && cameraReady && micReady && modelWarmedUp)
  const questionsAnswered = interviewData?.data?.questions_answered ?? 0
  const totalQuestions = interviewData?.data?.total_questions ?? 0

  // Auto-enable proctoring + fullscreen when the interview starts.
  // Fullscreen requests can be blocked without a user gesture, so we:
  // 1) Try immediately (best-effort)
  // 2) Also retry on the first user interaction inside the page.
  useEffect(() => {
    if (interviewData?.data?.is_proctored && !isProctoringActive) {
      setIsProctoringActive(true)
      // Turn camera on by default for proctored interviews.
      setCameraEnabled(true)
    }
  }, [interviewData?.data?.is_proctored, isProctoringActive])

  useEffect(() => {
    if (!isProctoringActive) return
    if (proctoringAutoStartRef.current) return
    proctoringAutoStartRef.current = true

    // Best-effort initial attempt (may be blocked by the browser)
    void requestFullscreenIfPossible()

    // Camera enabled logic moved to activation effect above

    const onFirstUserGesture = async () => {
      await requestFullscreenIfPossible()
      if (!document.fullscreenElement && !fullscreenNudgeShownRef.current) {
        fullscreenNudgeShownRef.current = true
        toast.error('Please allow fullscreen to continue the proctored interview')
      }
    }

    // Any of these should count as a user gesture in most browsers.
    window.addEventListener('pointerdown', onFirstUserGesture, { once: true, capture: true })
    window.addEventListener('keydown', onFirstUserGesture, { once: true, capture: true })

    return () => {
      window.removeEventListener('pointerdown', onFirstUserGesture, { capture: true } as any)
      window.removeEventListener('keydown', onFirstUserGesture, { capture: true } as any)
    }
  }, [isProctoringActive])

  const playQuestionAudio = async () => {
    if (questionAudioRef.current) {
      try {
        questionAudioRef.current.currentTime = 0
        await questionAudioRef.current.play()
      } catch {
        // Autoplay may be blocked; ignore.
      }
    }
  }

  useEffect(() => {
    if (isVoiceQuestionLocked) return
    const text = (currentQuestion?.question || '').trim()
    if (!text) return

    // Generate audio only when the *actual question* changes.
    // Live-status refetches can recreate objects / whitespace without meaningfully changing the question.
    const questionIdPart = (currentQuestion as any)?.id ?? ''
    const questionKey = `${questionIdPart}:${text}`
    if (lastQuestionTtsKeyRef.current === questionKey) return
    lastQuestionTtsKeyRef.current = questionKey

    let cancelled = false
    setIsQuestionAudioLoading(true)

    ttsApi
      .speak(text)
      .then((res) => {
        if (cancelled) return

        const blob = new Blob([res.data], { type: 'audio/mpeg' })
        const url = URL.createObjectURL(blob)

        setQuestionAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })

        // Replace the audio element to ensure it plays the latest question.
        if (questionAudioRef.current) {
          try {
            questionAudioRef.current.pause()
          } catch {
            // ignore
          }
        }

        const audio = new Audio(url)
        questionAudioRef.current = audio

        // Best-effort autoplay.
        audio.play().catch(() => {
          // Browser might block autoplay. User can click the question text to replay.
        })
      })
      .catch((err) => {
        // Don't spam toasts; show once per session.
        if (!ttsErrorShownRef.current) {
          ttsErrorShownRef.current = true
          toast.error(getApiErrorMessage(err, 'Unable to generate voice for the question'))
        }
      })
      .finally(() => {
        if (!cancelled) setIsQuestionAudioLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isVoiceQuestionLocked, currentQuestion?.question])

  useEffect(() => {
    return () => {
      if (questionAudioRef.current) {
        try {
          questionAudioRef.current.pause()
        } catch {
          // ignore
        }
      }
      setQuestionAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading interview room...</p>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-lg font-semibold">Interview Room</h1>
              {isProctoringActive && (
                <span className="bg-red-600 px-2 py-1 rounded text-xs font-medium">
                  PROCTORED
                </span>
              )}
            </div>
            
            <div className="flex items-center space-x-6">
              <div className="text-sm text-gray-300">
                Progress: {Number(progress).toFixed(1)}%
              </div>
              <div className="flex items-center text-sm text-gray-300">
                <Clock className="h-4 w-4 mr-1" />
                {Math.floor(interviewData?.data?.elapsed_minutes || 0)}min
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Interview Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Progress Bar */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">Question {currentQuestionIndex + 1}</span>
                <span className="text-sm text-gray-300">
                  {interviewData?.data?.questions_answered || 0} of {interviewData?.data?.total_questions || 0}
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>

            {/* Question Display */}
            {!currentQuestion ? (
              <div className="bg-gray-800 rounded-lg p-6 flex items-center justify-center min-h-[180px]">
                <div className="text-center text-gray-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-3"></div>
                  <p className="text-sm">Loading question…</p>
                </div>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-medium">Question</h2>
                    {(currentQuestion as any).is_followup && (
                      <span className="flex items-center gap-1 bg-indigo-600 text-white px-2 py-0.5 rounded-full text-xs font-medium">
                        <GitBranch className="h-3 w-3" />
                        Follow-up
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {isQuestionAudioLoading && (
                      <span className="text-xs text-gray-400">Generating voice…</span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      currentQuestion.difficulty === 'easy' ? 'bg-green-600' :
                      currentQuestion.difficulty === 'medium' ? 'bg-yellow-600' : 'bg-red-600'
                    }`}>
                      {currentQuestion.difficulty}
                    </span>
                  </div>
                </div>
                <p
                  className="text-lg leading-relaxed mb-6 cursor-pointer"
                  onClick={playQuestionAudio}
                  title={questionAudioUrl ? 'Click to replay question audio' : undefined}
                >
                  {currentQuestion.question}
                </p>
                
                {/* Response Mode Toggle */}
                <div className="flex items-center space-x-4 mb-6">
                  <button
                    onClick={() => !isReviewingVoiceAnswer && setResponseMode('text')}
                    className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                      responseMode === 'text' 
                        ? 'bg-primary-600 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Text Response
                  </button>
                  <button
                    onClick={() => !isReviewingVoiceAnswer && setResponseMode('voice')}
                    className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                      responseMode === 'voice' 
                        ? 'bg-primary-600 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <Mic className="h-4 w-4 mr-2" />
                    Voice Response
                  </button>
                </div>

                {/* Response Input */}
                {responseMode === 'text' ? (
                  <div className="space-y-4">
                    <textarea
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      disabled={!isStrictProctorReady}
                      placeholder="Type your answer here..."
                      className="w-full h-32 bg-gray-700 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    {!isStrictProctorReady && isProctored && (
                      <div className="rounded-lg border border-yellow-600/40 bg-yellow-900/30 px-3 py-2 text-sm text-yellow-200">
                        {isPreflightChecking
                          ? 'Preparing secure exam environment. Please wait for fullscreen, camera, microphone, and model warm-up.'
                          : 'Exam is locked until fullscreen, camera, microphone, and model warm-up are ready.'}
                        {preflightError && (
                          <div className="mt-2">
                            <button
                              onClick={() => setPreflightAttempt((v) => v + 1)}
                              className="rounded bg-yellow-700 hover:bg-yellow-600 px-2 py-1 text-xs text-yellow-100"
                            >
                              Retry setup
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {isAgentThinking ? (
                      <div className="flex items-center gap-3 bg-indigo-900 border border-indigo-700 rounded-lg px-4 py-3">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-300 flex-shrink-0"></div>
                        <span className="text-sm text-indigo-200 font-medium">
                          AI is analyzing your answer and generating the next question…
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSubmitAnswer()}
                        disabled={!isStrictProctorReady || !textAnswer.trim() || submitAnswerMutation.isPending}
                        className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        {submitAnswerMutation.isPending ? 'Submitting...' : 'Submit Answer'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {isReviewingVoiceAnswer ? (
                      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                        <p className="text-sm text-gray-200 font-medium mb-2">Review your voice answer</p>
                        {reviewAudioUrl ? (
                          <audio controls src={reviewAudioUrl} className="w-full" />
                        ) : (
                          <p className="text-sm text-gray-400">Preparing audio…</p>
                        )}

                        <div className="mt-3">
                          <p className="text-xs font-medium text-gray-400 mb-1">Transcript</p>
                          <p className="text-sm text-gray-200 whitespace-pre-wrap">
                            {submitAnswerMutation.isPending
                              ? 'Transcribing…'
                              : (reviewTranscript || '—')}
                          </p>
                        </div>

                        <div className="mt-4 flex items-center justify-end">
                          <button
                            onClick={handleReRecordVoiceAnswer}
                            disabled={submitAnswerMutation.isPending}
                            className="btn-secondary mr-3 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Re-record
                          </button>
                          <button
                            onClick={handleNextQuestionAfterReview}
                            disabled={submitAnswerMutation.isPending}
                            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Next Question
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-center">
                          <button
                            onClick={handleVoiceResponse}
                            disabled={!isStrictProctorReady}
                            className={`flex items-center px-6 py-3 rounded-full text-lg font-medium transition-colors ${
                              isRecording
                                ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                                : 'bg-primary-600 hover:bg-primary-700'
                            }`}
                          >
                            {isRecording ? (
                              <>
                                <MicOff className="h-5 w-5 mr-2" />
                                Stop Recording ({recordingTime}s)
                              </>
                            ) : (
                              <>
                                <Mic className="h-5 w-5 mr-2" />
                                Start Recording
                              </>
                            )}
                          </button>
                        </div>
                        {isRecording && (
                          <p className="text-center text-gray-300 text-sm">
                            Speak clearly and press "Stop Recording" when finished
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Camera Preview */}
            {isProctoringActive && (
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">Camera Preview</h3>
                  <button
                    onClick={async () => {
                      if (!cameraEnabled) {
                        await requestFullscreenIfPossible()
                        // Pre-check camera permission before enabling
                        try {
                          const testStream = await navigator.mediaDevices.getUserMedia({ video: true })
                          testStream.getTracks().forEach((t) => t.stop())
                          setCameraEnabled(true)
                        } catch (err: any) {
                          const isDenied =
                            err?.name === 'NotAllowedError' ||
                            err?.name === 'PermissionDeniedError'
                          toast.error(
                            isDenied
                              ? 'Camera access denied. Please allow camera permissions in your browser settings.'
                              : 'Could not access camera. Make sure no other application is using it.',
                            { duration: 6000 }
                          )
                        }
                      } else {
                        if (isProctored) {
                          toast.error('Camera cannot be turned off during a proctored interview')
                          return
                        }
                        setCameraEnabled(false)
                      }
                    }}
                    disabled={isProctored && cameraEnabled}
                    className={`p-2 rounded-lg ${
                      cameraEnabled ? 'bg-green-600' : 'bg-gray-600'
                    }`}
                  >
                    {cameraEnabled ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
                  </button>
                </div>
                {cameraEnabled ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
                    <Webcam
                      ref={webcamRef}
                      audio={false}
                      screenshotFormat="image/jpeg"
                      screenshotQuality={0.7}
                      videoConstraints={{
                        width: 480,
                        height: 270,
                        facingMode: 'user',
                      }}
                      className="absolute inset-0 h-full w-full object-cover"
                    />

                    {isProctored && (
                      <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden rounded-lg">
                        <div className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
                          Live detections: {liveDetectionBoxes.length}
                        </div>
                        {liveDetectionBoxes.map((box, index) => {
                          const [x, y, w, h] = box.bbox
                          const frameW = Math.max(1, liveFrameSize.width)
                          const frameH = Math.max(1, liveFrameSize.height)
                          const left = `${(x / frameW) * 100}%`
                          const top = `${(y / frameH) * 100}%`
                          const width = `${(w / frameW) * 100}%`
                          const height = `${(h / frameH) * 100}%`
                          const color = box.label === 'cell phone' ? 'rgb(248 113 113)' : box.label === 'person' ? 'rgb(251 191 36)' : 'rgb(74 222 128)'
                          const confidencePct = Math.max(0, Math.min(100, Math.round((box.score || 0) * 100)))

                          return (
                            <div
                              key={`${box.label}-${index}-${x}-${y}`}
                              className={`absolute border-2 ${box.label === 'face' ? 'border-dashed' : 'border-solid'}`}
                              style={{ left, top, width, height, borderColor: color }}
                            >
                              <div
                                className="absolute -top-6 left-0 text-[10px] px-1.5 py-0.5 rounded text-white font-semibold whitespace-nowrap"
                                style={{ backgroundColor: color }}
                              >
                                {box.label} {confidencePct}%
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-700 h-32 rounded-lg flex items-center justify-center">
                    <p className="text-sm text-gray-400">Camera disabled</p>
                  </div>
                )}

                {isProctored && cameraEnabled && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[11px] text-gray-400">
                      Live detection boxes show class + confidence percentage for person and mobile phone.
                    </p>
                    <p className="text-[11px] text-gray-300">
                      Faces: <span className="font-semibold">{liveDetectionCounts.faces}</span> | People: <span className="font-semibold">{liveDetectionCounts.people}</span> | Phones: <span className="font-semibold">{liveDetectionCounts.phones}</span>
                    </p>
                  </div>
                )}

                {isProctored && (
                  <div className="mt-2 rounded-lg border border-gray-700 bg-gray-900/60 p-2 text-[11px]">
                    <p className="font-medium text-gray-200 mb-1">Proctoring readiness</p>
                    <p className={isFullscreenActive ? 'text-green-300' : 'text-yellow-300'}>Fullscreen: {isFullscreenActive ? 'Ready' : 'Required'}</p>
                    <p className={cameraReady ? 'text-green-300' : 'text-yellow-300'}>Camera: {cameraReady ? 'Ready' : 'Initializing'}</p>
                    <p className={micReady ? 'text-green-300' : 'text-yellow-300'}>Microphone: {micReady ? 'Ready' : 'Required'}</p>
                    <p className={modelWarmedUp ? 'text-green-300' : 'text-yellow-300'}>Model warm-up: {modelWarmedUp ? 'Ready' : 'Warming up'}</p>
                    {preflightError && <p className="text-red-300 mt-1">{preflightError}</p>}
                    {preflightError && (
                      <button
                        onClick={() => setPreflightAttempt((v) => v + 1)}
                        className="mt-2 rounded bg-yellow-700 hover:bg-yellow-600 px-2 py-1 text-[11px] text-yellow-100"
                      >
                        Retry warm-up
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Proctoring Warnings */}
            {proctorWarnings.length > 0 && (
              <div className="bg-red-900 border border-red-700 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <AlertTriangle className="h-4 w-4 text-red-400 mr-2" />
                  <h3 className="font-medium text-red-200">Proctoring Alerts</h3>
                </div>
                <ul className="text-sm text-red-300 space-y-1">
                  {proctorWarnings.map((warning, index) => (
                    <li key={index}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Interview Stats */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="font-medium mb-3">Interview Stats</h3>
              <div className="space-y-2 text-sm text-gray-300">
                <div className="flex justify-between">
                  <span>Questions Answered:</span>
                  <span>{interviewData?.data?.questions_answered || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Time Elapsed:</span>
                  <span>{Math.floor(interviewData?.data?.elapsed_minutes || 0)} min</span>
                </div>
                {isProctored && (
                  <div className="flex justify-between">
                    <span>Tab Switches:</span>
                    <span className={tabSwitchCount > 3 ? 'text-red-400' : ''}>
                      {tabSwitchCount}
                    </span>
                  </div>
                )}
                {isProctored && (
                  <div className="flex justify-between">
                    <span>Look Away:</span>
                    <span className={lookAwayCount > 0 ? 'text-red-400' : ''}>{lookAwayCount}</span>
                  </div>
                )}
                {isProctored && (
                  <div className="flex justify-between">
                    <span>Multiple People:</span>
                    <span className={multiplePeopleCount > 0 ? 'text-red-400' : ''}>{multiplePeopleCount}</span>
                  </div>
                )}
                {isProctored && (
                  <div className="flex justify-between">
                    <span>Mobile Phones:</span>
                    <span className={mobilePhoneCount > 0 ? 'text-red-400' : ''}>{mobilePhoneCount}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Emergency Actions */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="font-medium mb-3">Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setShowCompleteConfirm(true)}
                  disabled={questionsAnswered === 0 || completeInterviewMutation.isPending}
                  title={questionsAnswered === 0 ? 'Answer at least one question before completing' : ''}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Complete Interview
                </button>
                <button
                  onClick={() => setShowExitConfirm(true)}
                  className="w-full bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Exit Interview
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Exit Interview Confirmation Dialog */}
    {showExitConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Exit interview?</h3>
          <p className="text-sm text-gray-600 mb-6">
            Your progress so far will be saved, but the interview will remain incomplete. You can continue later from Scheduled Interviews.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowExitConfirm(false)}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
            >
              Stay
            </button>
            <button
              onClick={() =>
                navigate('/student/performance', {
                  state: { interviewId: parsedInterviewId, exitedInterview: true },
                })
              }
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
            >
              Exit anyway
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Complete Interview Confirmation Dialog */}
    {showCompleteConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Complete interview?</h3>
          <p className="text-sm text-gray-600 mb-2">
            You have answered <span className="font-semibold">{questionsAnswered}</span> of <span className="font-semibold">{totalQuestions}</span> questions.
          </p>
          {questionsAnswered < totalQuestions && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              Completing now will skip the remaining questions. Your score will be calculated based on answers submitted so far.
            </p>
          )}
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={() => setShowCompleteConfirm(false)}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
            >
              Continue answering
            </button>
            <button
              onClick={() => { setShowCompleteConfirm(false); completeInterviewMutation.mutate() }}
              disabled={completeInterviewMutation.isPending}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium"
            >
              {completeInterviewMutation.isPending ? 'Completing…' : 'Complete'}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  )
}

export default InterviewRoom