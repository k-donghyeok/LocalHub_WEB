<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  routeData: { type: Object, default: null }
})
const emit = defineEmits(['error'])
const mapElement = ref(null)
let map = null
let infoWindow = null
let overlays = []
let sdkPromise = null

function loadTmapSdk() {
  if (window.Tmapv2) return Promise.resolve(window.Tmapv2)
  if (sdkPromise) return sdkPromise

  const appKey = import.meta.env.VITE_TMAP_APP_KEY
  if (!appKey) return Promise.reject(new Error('Tmap 앱 키가 설정되지 않았습니다.'))

  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${encodeURIComponent(appKey)}`
    script.async = true
    script.onload = () => window.Tmapv2 ? resolve(window.Tmapv2) : reject(new Error('Tmap SDK를 초기화하지 못했습니다.'))
    script.onerror = () => reject(new Error('Tmap SDK를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.'))
    document.head.appendChild(script)
  })
  return sdkPromise
}

function clearOverlays() {
  overlays.forEach((overlay) => overlay.setMap?.(null))
  overlays = []
}

function markerColor(pointType) {
  if (pointType === 'S') return '#21a366'
  if (pointType === 'E') return '#e74c3c'
  return '#168ac7'
}

function pointTypeOf(feature, index, total) {
  const value = String(feature.properties?.pointType || feature.properties?.type || '').toUpperCase()
  if (['S', 'B', 'E'].includes(value)) return value
  if (index === 0) return 'S'
  if (index === total - 1) return 'E'
  return 'B'
}

function renderRoute(Tmapv2, routeData) {
  const features = routeData?.routeGeoJson?.features
  if (!Array.isArray(features) || !features.length) throw new Error('경로 데이터(routeGeoJson)가 없습니다.')

  clearOverlays()
  const pointFeatures = features.filter((feature) => feature.geometry?.type === 'Point')
  const lineFeatures = features.filter((feature) => feature.geometry?.type === 'LineString')
  if (!pointFeatures.length) throw new Error('지도에 표시할 경유지가 없습니다.')

  const first = pointFeatures[0].geometry.coordinates
  map ??= new Tmapv2.Map(mapElement.value, {
    center: new Tmapv2.LatLng(first[1], first[0]),
    width: '100%',
    height: '600px'
  })
  infoWindow ??= new Tmapv2.InfoWindow({ position: map.getCenter(), content: '', type: 2, map: null })
  const bounds = new Tmapv2.LatLngBounds()

  pointFeatures.forEach((feature, index) => {
    const [longitude, latitude] = feature.geometry.coordinates
    const position = new Tmapv2.LatLng(latitude, longitude)
    const pointType = pointTypeOf(feature, index, pointFeatures.length)
    const name = feature.properties?.name || feature.properties?.title || `${index + 1}번째 방문 장소`
    const marker = new Tmapv2.Marker({
      position,
      map,
      label: `${pointType} ${index + 1}`,
      icon: 'https://tmapapi.sktelecom.com/upload/tmap/marker/pin-r-m-' + (pointType === 'S' ? 'g' : pointType === 'E' ? 'r' : 'b') + '.png',
      iconSize: new Tmapv2.Size(24, 38)
    })
    // SDK 기본 마커 이미지가 로드되지 않는 경우에도 구분 가능한 라벨을 함께 제공합니다.
    marker.addListener?.('click', () => {
      infoWindow.setPosition(position)
      infoWindow.setContent(`<div style="padding:7px 10px;font-weight:700;color:${markerColor(pointType)}">${name}</div>`)
      infoWindow.setMap(map)
    })
    overlays.push(marker)
    bounds.extend(position)
  })

  lineFeatures.forEach((feature) => {
    const path = feature.geometry.coordinates.map(([longitude, latitude]) => new Tmapv2.LatLng(latitude, longitude))
    if (path.length < 2) return
    const polyline = new Tmapv2.Polyline({ path, strokeColor: '#168ac7', strokeWeight: 6, map })
    overlays.push(polyline)
  })
  map.fitBounds(bounds)
}

async function drawRoute(routeData) {
  if (!routeData || !mapElement.value) return
  try {
    const Tmapv2 = await loadTmapSdk()
    renderRoute(Tmapv2, routeData)
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '지도를 표시하지 못했습니다.')
  }
}

watch(() => props.routeData, drawRoute, { immediate: true, flush: 'post' })
onBeforeUnmount(clearOverlays)
</script>

<template>
  <div ref="mapElement" class="tmap-route-map" aria-label="추천 여행 경로 지도"></div>
</template>

<style scoped>
.tmap-route-map { min-height: 600px; border-radius: 24px; overflow: hidden; background: #edf8ff; }
</style>
