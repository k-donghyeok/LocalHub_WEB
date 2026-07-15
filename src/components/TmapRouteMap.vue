<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  routeData: { type: Object, default: null }
})

const emit = defineEmits(['error'])
const mapElement = ref(null)

let map = null
let infoWindow = null
let overlays = []
let renderVersion = 0

function loadTmapSdk() {
  if (window.Tmapv2) return Promise.resolve(window.Tmapv2)
  return Promise.reject(
    new Error('Tmap SDK가 로드되지 않았습니다. index.html의 VITE_TMAP_APP_KEY 설정을 확인해 주세요.')
  )
}

function clearOverlays() {
  // Tmap can throw internally while detaching an already-disposed layer
  // ("mapInfoLayer" is undefined). One stale layer must not prevent the
  // newly received route from rendering.
  overlays.forEach((overlay) => {
    try {
      overlay.setMap?.(null)
    } catch (error) {
      console.warn('[TmapRouteMap] Failed to detach a stale overlay.', error)
    }
  })
  overlays = []
  try {
    infoWindow?.setMap?.(null)
  } catch (error) {
    console.warn('[TmapRouteMap] Failed to detach the previous info window.', error)
  }
  infoWindow = null
}

function markerColor(pointType) {
  if (pointType === 'S') return '#21a366'
  if (pointType === 'E') return '#e74c3c'
  return '#168ac7'
}

function markerIcon(order, pointType) {
  const color = markerColor(pointType)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46"><path fill="${color}" stroke="#fff" stroke-width="2" d="M18 1C9.2 1 2 8.1 2 16.9 2 29 18 44 18 44s16-15 16-27.1C34 8.1 26.8 1 18 1Z"/><text x="18" y="22" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-size="15" font-weight="700">${order}</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function pointTypeOf(feature, index, total) {
  const type = String(feature.properties?.pointType || feature.properties?.type || '').toUpperCase()
  if (['S', 'B', 'E'].includes(type)) return type
  if (index === 0) return 'S'
  if (index === total - 1) return 'E'
  return 'B'
}

function toCoordinate(value) {
  if (!Array.isArray(value) || value.length < 2) return null
  const [longitude, latitude] = value.map(Number)
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null
}

function placeCoordinate(place) {
  const longitude = Number(place.longitude ?? place.lon ?? place.lng ?? place.mapx ?? place.mapX ?? place.x)
  const latitude = Number(place.latitude ?? place.lat ?? place.mapy ?? place.mapY ?? place.y)
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null
}

function routeLineCoordinates(features) {
  return features.flatMap((feature) => {
    const { type, coordinates } = feature.geometry || {}
    if (type === 'LineString') return [coordinates]
    if (type === 'MultiLineString') return coordinates
    return []
  }).map((line) => line.map(toCoordinate).filter(Boolean)).filter((line) => line.length >= 2)
}

function addMarkerClickListener(Tmapv2, marker, handler) {
  if (typeof marker.addListener === 'function') {
    marker.addListener('click', handler)
  } else {
    Tmapv2.event?.addListener?.(marker, 'click', handler)
  }
}

function renderRoute(Tmapv2, routeData) {
  const features = routeData?.routeGeoJson?.features
  if (!Array.isArray(features) || !features.length) {
    throw new Error('경로 데이터(routeGeoJson)가 없습니다.')
  }

  let pointFeatures = features.filter((feature) => feature.geometry?.type === 'Point')
  const lineFeatures = features.filter((feature) => feature.geometry?.type === 'LineString')
  // The API can return route lines as GeoJSON while stop coordinates live in places.
  // Normalize those places into Point features so markers are still drawn.
  if (!pointFeatures.length) {
    const places = [...(routeData?.places || [])].sort((a, b) => (a.order || 0) - (b.order || 0))
    pointFeatures = places.map((place) => {
      const coordinate = placeCoordinate(place)
      return coordinate ? {
        geometry: { type: 'Point', coordinates: coordinate },
        properties: { pointType: place.pointType, name: place.name || place.title }
      } : null
    }).filter(Boolean)
  }
  if (!pointFeatures.length) {
    throw new Error('지도에 표시할 경유지가 없습니다.')
  }

  clearOverlays()

  const [longitude, latitude] = pointFeatures[0].geometry.coordinates
  if (!map) {
    map = new Tmapv2.Map(mapElement.value, {
      center: new Tmapv2.LatLng(latitude, longitude),
      width: '100%',
      height: '600px'
    })
  }

  infoWindow ??= new Tmapv2.InfoWindow({ content: '', type: 2, map: null })
  const bounds = new Tmapv2.LatLngBounds()

  pointFeatures.forEach((feature, index) => {
    const [pointLongitude, pointLatitude] = feature.geometry.coordinates
    const position = new Tmapv2.LatLng(pointLatitude, pointLongitude)
    const pointType = pointTypeOf(feature, index, pointFeatures.length)
    const name = feature.properties?.name || feature.properties?.title || `${index + 1}번째 방문 장소`
    const marker = new Tmapv2.Marker({
      position,
      map,
      icon: markerIcon(index + 1, pointType),
      iconSize: new Tmapv2.Size(36, 46)
    })

    addMarkerClickListener(Tmapv2, marker, () => {
      infoWindow.setPosition(position)
      infoWindow.setContent(`<div style="padding:7px 10px;font-weight:700;color:${markerColor(pointType)}">${name}</div>`)
      infoWindow.setMap(map)
    })
    overlays.push(marker)
    bounds.extend(position)
  })

  lineFeatures.forEach((feature) => {
    const path = feature.geometry.coordinates
      .map(([lineLongitude, lineLatitude]) => new Tmapv2.LatLng(lineLatitude, lineLongitude))
    if (path.length < 2) return

    const polyline = new Tmapv2.Polyline({
      path,
      strokeColor: '#168ac7',
      strokeWeight: 6,
      map
    })
    overlays.push(polyline)
  })

  map.fitBounds(bounds)
}

async function drawRoute() {
  const version = ++renderVersion
  const routeData = props.routeData

  if (!routeData) {
    clearOverlays()
    return
  }

  // A template ref is assigned only after the component has rendered.
  await nextTick()
  if (version !== renderVersion || !mapElement.value) return

  try {
    const Tmapv2 = await loadTmapSdk()
    // Ignore an older async SDK request when newer route data has arrived.
    if (version !== renderVersion || !mapElement.value) return
    renderRoute(Tmapv2, routeData)
  } catch (error) {
    if (version !== renderVersion) return
    console.error('[TmapRouteMap] Failed to render map.', error)
    emit('error', error instanceof Error ? error.message : '지도를 표시하지 못했습니다.')
  }
}

// Watches both prerequisites: route data and the DOM template ref.
watch([() => props.routeData, mapElement], drawRoute, { flush: 'post' })

// Covers the case where routeData already exists during the first mount.
onMounted(drawRoute)

onBeforeUnmount(() => {
  renderVersion += 1
  clearOverlays()
  map = null
  infoWindow = null
})
</script>

<template>
  <div ref="mapElement" class="tmap-route-map" aria-label="추천 여행 경로 지도"></div>
</template>

<style scoped>
.tmap-route-map {
  min-height: 600px;
  border-radius: 24px;
  overflow: hidden;
  background: #edf8ff;
}
</style>
