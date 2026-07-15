<script setup>
import { computed, onMounted, ref } from 'vue'
import { getFestivals } from '../api/festivals'

const today = new Date()
const viewDate = ref(new Date(today.getFullYear(), today.getMonth(), 1))
const selectedDate = ref(formatDate(today))
const festivals = ref([])
const loading = ref(false)
const error = ref('')
const loadedYear = ref(null)
const loadedMonth = ref(null)
let latestRequestId = 0

const weekDays = ['일', '월', '화', '수', '목', '금', '토']
const detailLabels = {
  eventplace: '장소',
  playtime: '공연·운영 시간',
  program: '프로그램',
  subevent: '부대 행사',
  sponsor1: '주최',
  sponsor1tel: '주최 문의',
  sponsor2: '주관',
  sponsor2tel: '주관 문의',
  eventhomepage: '웹사이트',
  bookingplace: '예매처',
  agelimit: '관람 연령',
  festivalgrade: '축제 등급',
  placeinfo: '행사장 위치 안내',
  spendtimefestival: '관람 소요 시간',
  discountinfofestival: '할인 정보',
  usetimefestival: '이용 요금'
}

const year = computed(() => viewDate.value.getFullYear())
const month = computed(() => viewDate.value.getMonth() + 1)
const monthLabel = computed(() => `${year.value}년 ${month.value}월`)
const selectedEvents = computed(() => eventsForDate(selectedDate.value))
const selectedLabel = computed(() => formatDisplayDate(selectedDate.value))

const calendarDays = computed(() => {
  const firstDay = new Date(year.value, month.value - 1, 1).getDay()
  const lastDate = new Date(year.value, month.value, 0).getDate()
  const previousLastDate = new Date(year.value, month.value - 1, 0).getDate()
  const totalCells = firstDay + lastDate > 35 ? 42 : 35

  return Array.from({ length: totalCells }, (_, index) => {
    const dayOffset = index - firstDay + 1
    const date = dayOffset <= 0
      ? new Date(year.value, month.value - 2, previousLastDate + dayOffset)
      : new Date(year.value, month.value - 1, dayOffset)
    const key = formatDate(date)
    return {
      key,
      day: date.getDate(),
      currentMonth: date.getMonth() === month.value - 1,
      events: eventsForDate(key)
    }
  })
})

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isValidDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [yearValue, monthValue, dayValue] = value.split('-').map(Number)
  const date = new Date(yearValue, monthValue - 1, dayValue)
  return date.getFullYear() === yearValue && date.getMonth() === monthValue - 1 && date.getDate() === dayValue
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function formatDisplayDate(dateKey) {
  if (!isValidDateKey(dateKey)) return ''
  const [yearValue, monthValue, dayValue] = dateKey.split('-').map(Number)
  return `${yearValue}. ${monthValue}. ${dayValue}.`
}

function formatPeriod(festival) {
  if (!isValidDateKey(festival.startDate)) return ''
  const start = formatDisplayDate(festival.startDate)
  return festival.endDate && festival.endDate !== festival.startDate && isValidDateKey(festival.endDate)
    ? `${start} ~ ${formatDisplayDate(festival.endDate)}`
    : start
}

function eventsForDate(dateKey) {
  if (loadedYear.value !== year.value || loadedMonth.value !== month.value) return []
  return festivals.value.filter((festival) =>
    isValidDateKey(festival.startDate) &&
    isValidDateKey(festival.endDate) &&
    festival.startDate <= dateKey && dateKey <= festival.endDate
  )
}

function detailFields(festival) {
  return Object.entries(detailLabels)
    .filter(([key]) => hasValue(festival[key]))
    .map(([key, label]) => ({ key, label, value: festival[key] }))
}

function isSafeUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim())
}

async function loadFestivals() {
  const requestId = ++latestRequestId
  loading.value = true
  error.value = ''

  try {
    const result = await getFestivals(year.value, month.value)
    if (requestId !== latestRequestId) return
    festivals.value = Array.isArray(result?.items) ? result.items : []
    loadedYear.value = year.value
    loadedMonth.value = month.value
  } catch (err) {
    if (requestId !== latestRequestId) return
    error.value = err instanceof Error ? err.message : '축제 일정을 불러오지 못했습니다.'
  } finally {
    if (requestId === latestRequestId) loading.value = false
  }
}

function moveMonth(amount) {
  viewDate.value = new Date(year.value, month.value - 1 + amount, 1)
  selectedDate.value = formatDate(viewDate.value)
  loadFestivals()
}

function selectDay(day) {
  selectedDate.value = day.key
  if (!day.currentMonth) {
    const [yearValue, monthValue] = day.key.split('-').map(Number)
    viewDate.value = new Date(yearValue, monthValue - 1, 1)
    loadFestivals()
  }
}

onMounted(loadFestivals)
</script>

<template>
  <section class="schedule-shell">
    <div class="schedule-topline">
      <div>
        <span>MONTHLY SCHEDULE</span>
        <h2>부산의 이번 달 즐길 거리</h2>
      </div>
      <div class="month-control" aria-label="달력 월 이동">
        <button type="button" aria-label="이전 달" @click="moveMonth(-1)">‹</button>
        <strong>{{ monthLabel }}</strong>
        <button type="button" aria-label="다음 달" @click="moveMonth(1)">›</button>
      </div>
    </div>

    <div class="schedule-layout">
      <div class="calendar-wrap" :aria-busy="loading">
        <div class="week-row"><span v-for="day in weekDays" :key="day">{{ day }}</span></div>
        <div class="month-grid">
          <button v-for="day in calendarDays" :key="day.key" type="button" class="calendar-day" :class="{ muted: !day.currentMonth, selected: selectedDate === day.key }" @click="selectDay(day)">
            <span class="day-number">{{ day.day }}</span>
            <span v-for="event in day.events.slice(0, 2)" :key="`${event.title}-${event.startDate}`" class="event-chip">{{ event.title }}</span>
            <small v-if="day.events.length > 2">+{{ day.events.length - 2 }}</small>
          </button>
        </div>
      </div>

      <aside class="day-panel">
        <p>SELECTED DAY</p>
        <h3>{{ selectedLabel }}</h3>
        <div v-if="loading && !festivals.length" class="schedule-state">축제 일정을 불러오는 중입니다.</div>
        <div v-else-if="error" class="schedule-state error"><span>{{ error }}</span><button type="button" @click="loadFestivals">다시 시도</button></div>
        <div v-else-if="!festivals.length" class="schedule-state">이번 달에 등록된 축제 일정이 없습니다.</div>
        <div v-else-if="selectedEvents.length" class="day-events">
          <article v-for="event in selectedEvents" :key="`${event.title}-${event.startDate}-${event.endDate}`">
            <div>
              <strong>{{ event.title }}</strong>
              <p v-if="hasValue(event.addr1)">{{ event.addr1 }}</p>
              <small>{{ formatPeriod(event) }}</small>
              <p v-if="hasValue(event.eventplace)">장소: {{ event.eventplace }}</p>
              <p v-if="hasValue(event.playtime)">공연·운영 시간: {{ event.playtime }}</p>
              <details v-if="detailFields(event).length">
                <summary>상세 정보</summary>
                <dl>
                  <template v-for="field in detailFields(event)" :key="field.key">
                    <dt>{{ field.label }}</dt>
                    <dd v-if="field.key === 'eventhomepage' && isSafeUrl(field.value)"><a :href="field.value" target="_blank" rel="noopener noreferrer">{{ field.value }}</a></dd>
                    <dd v-else :class="{ program: field.key === 'program' }">{{ field.value }}</dd>
                  </template>
                </dl>
              </details>
            </div>
          </article>
        </div>
        <div v-else class="no-event">등록된 일정이 없어요.<br />다른 날짜를 선택해 보세요.</div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.schedule-shell { border: 1px solid #c8e6fa; border-radius: 30px; background: #fff; overflow: hidden; box-shadow: 0 24px 70px rgba(45, 114, 159, .13); }
.schedule-topline { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; padding: 30px 34px; background: linear-gradient(120deg, #eaf7ff, #b9e0fd); }
.schedule-topline span, .day-panel > p { color: #168ac7; font-size: 12px; font-weight: 950; letter-spacing: .12em; }
.schedule-topline h2 { margin: 5px 0 0; color: #073b66; font-size: clamp(24px, 3vw, 34px); letter-spacing: -.04em; }
.month-control { display: flex; align-items: center; gap: 12px; border-radius: 999px; background: rgba(255,255,255,.78); padding: 6px; color: #073b66; }
.month-control button { width: 38px; height: 38px; border: 0; border-radius: 50%; background: #fff; color: #126fa7; cursor: pointer; }
.month-control strong { min-width: 104px; text-align: center; }
.schedule-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; }
.calendar-wrap { min-width: 0; padding: 24px; }
.week-row, .month-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.week-row { color: #6990aa; text-align: center; font-size: 12px; font-weight: 850; }
.week-row span { padding: 0 0 12px; }.week-row span:first-child { color: #eb6d79; }.week-row span:last-child { color: #287fca; }
.month-grid { border-top: 1px solid #cae5f7; border-left: 1px solid #cae5f7; }
.calendar-day { min-width: 0; min-height: 116px; border: 0; border-right: 1px solid #cae5f7; border-bottom: 1px solid #cae5f7; background: #fff; padding: 9px 7px; text-align: left; cursor: pointer; overflow: hidden; }
.calendar-day:hover { background: #f3faff; }.calendar-day.selected { background: #e7f5ff; box-shadow: inset 0 0 0 2px #49a9df; }.calendar-day.muted { background: #f8fbfd; color: #afc0ca; }
.day-number { display: block; margin-bottom: 7px; font-size: 12px; font-weight: 850; }.event-chip { display: block; overflow: hidden; margin-top: 4px; border-radius: 5px; background: #b9e0fd; padding: 5px 6px; color: #07476e; font-size: 10px; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }.calendar-day small { color: #168ac7; font-weight: 800; }
.day-panel { border-left: 1px solid #cae5f7; background: #f5fbff; padding: 30px 24px; }.day-panel > p { margin: 0; }.day-panel > h3 { margin: 7px 0 25px; color: #073b66; font-size: 22px; }
.day-events { display: grid; gap: 10px; }.day-events article { border: 1px solid #d5eaf8; border-radius: 14px; background: #fff; padding: 14px; }.day-events strong { display: block; color: #073b66; font-size: 14px; }.day-events p { margin: 5px 0; color: #607d91; font-size: 12px; }.day-events small { color: #168ac7; font-weight: 750; }
.day-events details { margin-top: 12px; border-top: 1px solid #e2eef6; padding-top: 10px; }.day-events summary { color: #126fa7; cursor: pointer; font-size: 12px; font-weight: 850; }.day-events dl { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 7px 10px; margin: 12px 0 0; font-size: 12px; }.day-events dt { color: #607d91; }.day-events dd { min-width: 0; margin: 0; color: #315c76; overflow-wrap: anywhere; }.day-events dd.program { white-space: pre-line; }.day-events a { color: #126fa7; overflow-wrap: anywhere; }
.schedule-state, .no-event { border: 1px dashed #b8d9ed; border-radius: 14px; padding: 20px 12px; color: #7793a6; text-align: center; font-size: 13px; line-height: 1.6; }.schedule-state.error { color: #a34848; }.schedule-state button { margin-top: 8px; border: 1px solid #c5deed; border-radius: 8px; background: #fff; color: #126fa7; padding: 7px 10px; cursor: pointer; }
@media (max-width: 900px) { .schedule-layout { grid-template-columns: 1fr; }.day-panel { border-top: 1px solid #cae5f7; border-left: 0; } }
@media (max-width: 650px) { .schedule-topline { align-items: stretch; flex-direction: column; padding: 24px 20px; }.month-control { justify-content: space-between; }.calendar-wrap { padding: 12px; overflow-x: auto; }.week-row, .month-grid { min-width: 680px; }.calendar-day { min-height: 104px; }.day-events dl { grid-template-columns: 1fr; gap: 3px; }.day-events dt { margin-top: 7px; } }
</style>
