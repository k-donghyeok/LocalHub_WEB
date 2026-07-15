const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://localhub-server.onrender.com'

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export async function getPlacesByCategory(contentTypeId, page, pageSize = 4) {
  const params = new URLSearchParams({
    contentTypeId: String(contentTypeId),
    page: String(page),
    page_size: String(pageSize)
  })
  const response = await fetch(joinUrl(API_BASE_URL, `/places/category?${params}`))

  if (!response.ok) {
    throw new Error('장소 목록을 불러오지 못했습니다.')
  }

  return response.json()
}
