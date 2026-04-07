import * as tf from '@tensorflow/tfjs'
import '@tensorflow/tfjs-backend-webgl'
import * as faceapi from 'face-api.js'

type DetectionCounts = {
  faceCount: number
  personCount: number
  phoneCount: number
  boxes: DetectionBox[]
}

export type DetectionBox = {
  label: 'face' | 'person' | 'cell phone'
  score: number
  bbox: [number, number, number, number]
}

type CocoPrediction = {
  class: string
  score: number
  bbox?: [number, number, number, number]
}

type DetectableElement = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement

type FaceMeshLike = {
  onResults: (cb: (res: any) => void) => void
  send: (input: { image: DetectableElement }) => Promise<void>
  setOptions: (opts: Record<string, any>) => void
}

let modelPromise: Promise<any> | null = null
let tfReadyPromise: Promise<void> | null = null
let faceModelPromise: Promise<void> | null = null
let faceMeshPromise: Promise<FaceMeshLike> | null = null
let cocoRetryAfterTs = 0
let faceApiRetryAfterTs = 0
let faceMeshRetryAfterTs = 0

const RETRY_AFTER_MS = 8000
const FACEAPI_LOAD_TIMEOUT_MS = 3000
const FACEAPI_DETECT_TIMEOUT_MS = 1800
const COCO_DETECT_TIMEOUT_MS = 1800

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function ensureTfReady() {
  if (!tfReadyPromise) {
    tfReadyPromise = (async () => {
      try {
        await tf.setBackend('webgl')
      } catch {
        // fallback to default backend
      }
      await tf.ready()
    })()
  }
  return tfReadyPromise
}

async function getModel() {
  const now = Date.now()
  if (now < cocoRetryAfterTs) {
    return null
  }

  if (!modelPromise) {
    modelPromise = (async () => {
      await ensureTfReady()
      const m: any = await import('@tensorflow-models/coco-ssd')
      // Use the faster base model to reduce detection latency.
      return m.load({ base: 'lite_mobilenet_v2' })
    })()
  }

  try {
    return await modelPromise
  } catch {
    modelPromise = null
    cocoRetryAfterTs = Date.now() + RETRY_AFTER_MS
    return null
  }
}

async function getFaceModel() {
  const now = Date.now()
  if (now < faceApiRetryAfterTs) {
    return
  }

  if (!faceModelPromise) {
    faceModelPromise = (async () => {
      const baseUrl = 'https://justadudewhohacks.github.io/face-api.js/models'
      await faceapi.nets.tinyFaceDetector.loadFromUri(baseUrl)
    })()
  }

  try {
    const loaded = await Promise.race<boolean>([
      faceModelPromise.then(() => true).catch(() => false),
      wait(FACEAPI_LOAD_TIMEOUT_MS).then(() => false),
    ])

    if (!loaded) {
      faceModelPromise = null
      faceApiRetryAfterTs = Date.now() + RETRY_AFTER_MS
      return
    }

    return
  } catch {
    // If model assets cannot be fetched (offline/CSP/network), keep proctoring alive
    // and retry later instead of disabling forever.
    faceModelPromise = null
    faceApiRetryAfterTs = Date.now() + RETRY_AFTER_MS
    return
  }
}

async function getFaceMeshModel(): Promise<FaceMeshLike | null> {
  const now = Date.now()
  if (now < faceMeshRetryAfterTs) {
    return null
  }

  if (!faceMeshPromise) {
    faceMeshPromise = (async () => {
      const mod: any = await import('@mediapipe/face_mesh')

      const fm: FaceMeshLike = new mod.FaceMesh({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      })

      fm.setOptions({
        maxNumFaces: 3,
        refineLandmarks: false,
        minDetectionConfidence: 0.55,
        minTrackingConfidence: 0.55,
      })

      return fm
    })()
  }

  try {
    return await faceMeshPromise
  } catch {
    faceMeshPromise = null
    faceMeshRetryAfterTs = Date.now() + RETRY_AFTER_MS
    return null
  }
}

async function detectFaceBoxesWithNativeApi(el: DetectableElement): Promise<DetectionBox[]> {
  const FaceDetectorCtor = (window as any)?.FaceDetector
  if (!FaceDetectorCtor) {
    return []
  }

  try {
    const detector = new FaceDetectorCtor({ maxDetectedFaces: 3, fastMode: true })
    const size = getElementSize(el)
    const faces = await detector.detect(el as any)

    return (faces || []).map((f: any) => {
      const box = f?.boundingBox || { x: 0, y: 0, width: 0, height: 0 }
      return {
        label: 'face' as const,
        score: 0.8,
        bbox: [
          Number(box.x || 0),
          Number(box.y || 0),
          Number(Math.min(size.width, box.width || 0)),
          Number(Math.min(size.height, box.height || 0)),
        ],
      }
    })
  } catch {
    return []
  }
}

function getElementSize(el: DetectableElement): { width: number; height: number } {
  if (el instanceof HTMLVideoElement) {
    return {
      width: Math.max(1, el.videoWidth || el.clientWidth || el.width || 1),
      height: Math.max(1, el.videoHeight || el.clientHeight || el.height || 1),
    }
  }

  if (el instanceof HTMLCanvasElement) {
    return {
      width: Math.max(1, el.width || el.clientWidth || 1),
      height: Math.max(1, el.height || el.clientHeight || 1),
    }
  }

  return {
    width: Math.max(1, el.naturalWidth || el.width || 1),
    height: Math.max(1, el.naturalHeight || el.height || 1),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function faceMeshLandmarksToBoxes(landmarks: any[][], width: number, height: number): DetectionBox[] {
  return landmarks
    .map((faceLandmarks) => {
      if (!Array.isArray(faceLandmarks) || faceLandmarks.length === 0) {
        return null
      }

      const xs = faceLandmarks.map((point) => Number(point?.x ?? NaN)).filter(Number.isFinite)
      const ys = faceLandmarks.map((point) => Number(point?.y ?? NaN)).filter(Number.isFinite)
      if (!xs.length || !ys.length) {
        return null
      }

      const minX = clamp(Math.min(...xs), 0, 1) * width
      const maxX = clamp(Math.max(...xs), 0, 1) * width
      const minY = clamp(Math.min(...ys), 0, 1) * height
      const maxY = clamp(Math.max(...ys), 0, 1) * height
      const boxWidth = Math.max(1, maxX - minX)
      const boxHeight = Math.max(1, maxY - minY)

      return {
        label: 'face' as const,
        score: 0.82,
        bbox: [minX, minY, boxWidth, boxHeight] as [number, number, number, number],
      }
    })
    .filter(Boolean) as DetectionBox[]
}

async function detectFaceBoxes(el: DetectableElement): Promise<DetectionBox[]> {
  const size = getElementSize(el)

  const nativeApiFaces = await detectFaceBoxesWithNativeApi(el)
  if (nativeApiFaces.length > 0) {
    return nativeApiFaces
  }

  await getFaceModel()
  try {
    const detections = await Promise.race<any[]>([
      faceapi.detectAllFaces(
        el,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: FACE_SCORE_THRESHOLD,
        })
      ),
      wait(FACEAPI_DETECT_TIMEOUT_MS).then(() => []),
    ])

    if (detections.length > 0) {
      return detections.map((f: any) => {
        const d = f?.detection
        const b = d?.box || { x: 0, y: 0, width: 0, height: 0 }
        return {
          label: 'face' as const,
          score: Number(d?.score || 0),
          bbox: [Number(b.x || 0), Number(b.y || 0), Number(b.width || 0), Number(b.height || 0)] as [
            number,
            number,
            number,
            number,
          ],
        }
      })
    }
  } catch {
    faceModelPromise = null
    faceApiRetryAfterTs = Date.now() + RETRY_AFTER_MS
  }

  const faceMesh = await getFaceMeshModel()
  if (!faceMesh) {
    return []
  }

  return await new Promise<DetectionBox[]>((resolve) => {
    let finished = false
    const finish = (boxes: DetectionBox[]) => {
      if (finished) return
      finished = true
      resolve(boxes)
    }

    const timeout = window.setTimeout(() => finish([]), 3500)

    faceMesh.onResults((results: any) => {
      window.clearTimeout(timeout)
      const faces = results?.multiFaceLandmarks
      if (!Array.isArray(faces) || faces.length === 0) {
        finish([])
        return
      }

      finish(faceMeshLandmarksToBoxes(faces, size.width, size.height))
    })

    void faceMesh.send({ image: el }).catch(() => {
      window.clearTimeout(timeout)
      faceMeshPromise = null
      faceMeshRetryAfterTs = Date.now() + RETRY_AFTER_MS
      finish([])
    })
  })
}

const FACE_SCORE_THRESHOLD = 0.4
const PERSON_SCORE_THRESHOLD = 0.15
const PHONE_SCORE_THRESHOLD = 0.08

async function detectCocoPredictions(el: DetectableElement): Promise<CocoPrediction[]> {
  const model = await getModel()
  if (!model) return []

  try {
    return await Promise.race([
      model.detect(el, 30, 0.03),
      wait(COCO_DETECT_TIMEOUT_MS).then(() => []),
    ]) as CocoPrediction[]
  } catch {
    modelPromise = null
    cocoRetryAfterTs = Date.now() + RETRY_AFTER_MS
    return []
  }
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    img.src = dataUrl
  })
}

export async function detectPeopleAndPhones(dataUrl: string): Promise<DetectionCounts> {
  const img = await loadImage(dataUrl)

  const faces = await detectFaceBoxes(img)
  const predictions: CocoPrediction[] = await detectCocoPredictions(img)

  const faceCount = faces.length
  const personPredictions = predictions.filter((p) => p.class === 'person' && (p?.score ?? 0) >= PERSON_SCORE_THRESHOLD)
  const phonePredictions = predictions.filter((p) => p.class === 'cell phone' && (p?.score ?? 0) >= PHONE_SCORE_THRESHOLD)
  const personCount = Math.max(personPredictions.length, faceCount > 0 ? 1 : 0)
  const phoneCount = phonePredictions.length

  const faceBoxes: DetectionBox[] = faces

  const personBoxes: DetectionBox[] = personPredictions
    .filter((p) => Array.isArray(p.bbox) && p.bbox.length === 4)
    .map((p) => ({
      label: 'person',
      score: Number(p.score || 0),
      bbox: [Number(p.bbox![0]), Number(p.bbox![1]), Number(p.bbox![2]), Number(p.bbox![3])],
    }))

  const phoneBoxes: DetectionBox[] = phonePredictions
    .filter((p) => Array.isArray(p.bbox) && p.bbox.length === 4)
    .map((p) => ({
      label: 'cell phone',
      score: Number(p.score || 0),
      bbox: [Number(p.bbox![0]), Number(p.bbox![1]), Number(p.bbox![2]), Number(p.bbox![3])],
    }))

  const boxes = [...faceBoxes, ...personBoxes, ...phoneBoxes]

  return { faceCount, personCount, phoneCount, boxes }
}

export async function detectPeopleAndPhonesFromElement(el: DetectableElement): Promise<DetectionCounts> {
  const faces = await detectFaceBoxes(el)
  const predictions: CocoPrediction[] = await detectCocoPredictions(el)

  const faceCount = faces.length
  const personPredictions = predictions.filter((p) => p.class === 'person' && (p?.score ?? 0) >= PERSON_SCORE_THRESHOLD)
  const phonePredictions = predictions.filter((p) => p.class === 'cell phone' && (p?.score ?? 0) >= PHONE_SCORE_THRESHOLD)
  const personCount = Math.max(personPredictions.length, faceCount > 0 ? 1 : 0)
  const phoneCount = phonePredictions.length

  const faceBoxes: DetectionBox[] = faces

  const personBoxes: DetectionBox[] = personPredictions
    .filter((p) => Array.isArray(p.bbox) && p.bbox.length === 4)
    .map((p) => ({
      label: 'person',
      score: Number(p.score || 0),
      bbox: [Number(p.bbox![0]), Number(p.bbox![1]), Number(p.bbox![2]), Number(p.bbox![3])],
    }))

  const phoneBoxes: DetectionBox[] = phonePredictions
    .filter((p) => Array.isArray(p.bbox) && p.bbox.length === 4)
    .map((p) => ({
      label: 'cell phone',
      score: Number(p.score || 0),
      bbox: [Number(p.bbox![0]), Number(p.bbox![1]), Number(p.bbox![2]), Number(p.bbox![3])],
    }))

  const boxes = [...faceBoxes, ...personBoxes, ...phoneBoxes]

  return { faceCount, personCount, phoneCount, boxes }
}
