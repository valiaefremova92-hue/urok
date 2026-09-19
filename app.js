/* KATERINA SUGAR BOOKING MINI APP
   Frontend: GitHub Pages / any static hosting
   Backend: Google Apps Script Web App
   Database: Google Sheets

   Synced with the current Katerina HTML and sheets:
   Settings, Services, Schedule, Blocks, Bookings, Clients.
*/

const API_URL = 'https://script.google.com/macros/s/AKfycbxAP4DlzhDYLTHccNSpD6jduYZ3UH-tddvPoo7uH7s0R8-cwgnh50ai5KChp77m08Xz/exec';

const DEFAULT_SETTINGS = {
  salonName: 'Sugar Katerina',
  logoUrl: '',
  slotStep: 30,
  buffer: 15,
  cancelBefore: 90,
  colors: {}
};

const state = {
  tg: window.Telegram?.WebApp || null,
  initData: '',
  user: null,
  isMaster: false,
  services: [],
  settings: DEFAULT_SETTINGS,
  schedule: [],
  selectedService: null,
  selectedDate: null,
  selectedTime: null,
  currentMonth: new Date(),
  bookings: []
};

const $ = id => document.getElementById(id);

const els = {
  salonName: $('salonName'),
  heroText: $('heroText'),
  logo: $('logo'),
  services: $('services'),
  calendar: $('calendar'),
  monthTitle: $('monthTitle'),
  prevMonth: $('prevMonth'),
  nextMonth: $('nextMonth'),
  slots: $('slots'),
  timeHint: $('timeHint'),
  form: $('bookingForm'),
  name: $('clientName'),
  phone: $('clientPhone'),
  comment: $('clientComment'),
  summary: $('summary'),
  submit: $('submitBtn'),
  successCard: $('successCard'),
  successTitle: $('successTitle'),
  successDetails: $('successDetails'),
  newBooking: $('newBooking'),
  mineBtn: $('mineBtn'),
  myBookingsCard: $('myBookingsCard'),
  myBookings: $('myBookings'),
  closeMine: $('closeMine'),
  errorBox: $('errorBox'),
  clientView: $('clientView'),
  adminView: $('adminView'),
  adminDate: $('adminDate'),
  adminCalendar: $('adminCalendar'),
  refreshAdmin: $('refreshAdmin'),
  blockStart: $('blockStart'),
  blockEnd: $('blockEnd'),
  blockReason: $('blockReason'),
  addBlock: $('addBlock'),
  manualName: $('manualName'),
  manualPhone: $('manualPhone'),
  manualService: $('manualService'),
  manualStart: $('manualStart'),
  manualComment: $('manualComment'),
  addManual: $('addManual'),
  toast: $('toast')
};

async function init() {
  try {
    if (!state.tg) throw new Error('Mini App потрібно відкривати через Telegram.');

    state.tg.ready();
    state.tg.expand();
    state.initData = state.tg.initData || '';
    state.user = state.tg.initDataUnsafe?.user || null;

    if (!state.initData) throw new Error('Telegram initData не переданий. Відкрийте Mini App саме через Telegram.');

    bindEvents();

    const data = await apiPost('bootstrap', { initData: state.initData });
    if (!data || data.ok === false) throw new Error(data?.error || 'Backend не повернув дані.');

    applyBootstrap(data);
    console.log('KATERINA SERVICES:', state.services);
    console.log('KATERINA SCHEDULE:', state.schedule);
    renderServices();
    renderCalendar();

    if (state.isMaster) showAdmin();
  } catch (err) {
    console.error('INIT ERROR:', err);
    showError(err.message || 'Не вдалося завантажити систему.');
  }
}

function applyBootstrap(data) {
  state.user = data.user || state.user;
  state.isMaster = Boolean(data.user?.isMaster);
  const rawServices = Array.isArray(data.services) ? data.services : [];
  state.services = rawServices.map((service, index) => ({
    ...service,
    id: String(service.id ?? service.serviceId ?? service.service_id ?? index + 1),
    name: String(
      service.name ??
      service.service_name ??
      service.serviceName ??
      service.title ??
      service.label ??
      'Послуга'
    ),
    price: Number(service.price ?? service.cost ?? 0),
    duration: Number(service.duration ?? service.minutes ?? 0),
    active: service.active === undefined ? true : yes(service.active)
  }));

  state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };

  const rawSchedule = Array.isArray(data.schedule)
    ? data.schedule
    : Array.isArray(data.workingDays)
      ? data.workingDays
      : [];

  state.schedule = rawSchedule.map(item => ({
    ...item,
    date: normalizeDate(item.date ?? item.day ?? item.workDate),
    start: normalizeTime(item.start ?? item.startTime ?? item.from),
    end: normalizeTime(item.end ?? item.endTime ?? item.to),
    active: item.active === undefined ? true : yes(item.active)
  })).filter(item => item.date);

  els.salonName.textContent = state.settings.salonName || 'Booking';
  els.heroText.textContent = 'Запишіться у зручний для Вас час';

  if (state.settings.logoUrl) {
    els.logo.src = state.settings.logoUrl;
    els.logo.classList.remove('hidden');
  }

  const colors = state.settings.colors || {};
  const root = document.documentElement;
  Object.entries({
    primary: 'primary',
    primaryDark: 'primary-dark',
    primaryLight: 'primary-light',
    bg: 'bg',
    bgSoft: 'bg-soft',
    card: 'card',
    text: 'text',
    muted: 'muted',
    accent: 'accent',
    border: 'border'
  }).forEach(([key, css]) => {
    if (colors[key]) root.style.setProperty(`--${css}`, colors[key]);
  });
}

function bindEvents() {
  els.prevMonth.addEventListener('click', () => changeMonth(-1));
  els.nextMonth.addEventListener('click', () => changeMonth(1));
  els.form.addEventListener('submit', submitBooking);
  els.mineBtn.addEventListener('click', loadMyBookings);
  els.closeMine.addEventListener('click', () => els.myBookingsCard.classList.add('hidden'));
  els.newBooking.addEventListener('click', resetBooking);
  els.refreshAdmin.addEventListener('click', loadAdminCalendar);
  els.adminDate.addEventListener('change', loadAdminCalendar);
  els.addBlock.addEventListener('click', addBlock);
  els.addManual.addEventListener('click', addManualBooking);
}

function renderServices() {
  els.services.innerHTML = '';

  if (!state.services.length) {
    els.services.innerHTML = '<div class="hint">Наразі немає доступних послуг.</div>';
    els.manualService.innerHTML = '';
    return;
  }

  state.services.forEach(service => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'service-btn';

    const name = service.name || service.service_name || service.serviceName || service.title || service.label || 'Послуга';
    const duration = Number(service.duration || 0);
    const price = Number(service.price || 0);

    btn.innerHTML = `
      <strong>${escapeHtml(name)}</strong>
      <span>${duration} хв · ${price ? `${price} грн` : 'ціну уточнить майстер'}</span>
    `;

    if (state.selectedService && String(state.selectedService.id) === String(service.id)) {
      btn.classList.add('selected');
    }

    btn.addEventListener('click', () => selectService(service, btn));
    els.services.appendChild(btn);
  });

  els.manualService.innerHTML = state.services
    .map(s => `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name || s.service_name || 'Послуга')} — ${Number(s.duration || 0)} хв</option>`)
    .join('');
}

function selectService(service, btn) {
  state.selectedService = service;
  state.selectedDate = null;
  state.selectedTime = null;

  document.querySelectorAll('.service-btn').forEach(b => b.classList.remove('selected'));
  if (btn) btn.classList.add('selected');

  openStep('date');
  renderCalendar();
  els.slots.innerHTML = '';
  els.timeHint.textContent = 'Оберіть дату.';
  updateSummary();
}

function renderCalendar() {
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();

  els.monthTitle.textContent = state.currentMonth.toLocaleDateString('uk-UA', {
    month: 'long',
    year: 'numeric'
  });
  els.calendar.innerHTML = '';

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const mondayIndex = (firstDay.getDay() + 6) % 7;

  for (let i = 0; i < mondayIndex; i++) {
    const empty = document.createElement('button');
    empty.type = 'button';
    empty.className = 'day-btn day-empty';
    empty.disabled = true;
    els.calendar.appendChild(empty);
  }

  const availableDates = new Set(
    state.schedule
      .filter(x => yes(x.active))
      .map(x => normalizeDate(x.date))
      .filter(Boolean)
  );

  const today = startOfDay(new Date());

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day);
    const iso = toIsoDate(date);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day-btn';
    btn.textContent = day;

    const disabled =
      startOfDay(date) < today ||
      !availableDates.has(iso) ||
      !state.selectedService;

    btn.disabled = disabled;

    if (availableDates.has(iso) && !disabled) btn.classList.add('available');
    if (state.selectedDate === iso) btn.classList.add('selected');

    btn.addEventListener('click', () => selectDate(iso));
    els.calendar.appendChild(btn);
  }
}

function changeMonth(delta) {
  const next = new Date(state.currentMonth);
  next.setMonth(next.getMonth() + delta);
  state.currentMonth = next;
  renderCalendar();
}

async function selectDate(date) {
  state.selectedDate = date;
  state.selectedTime = null;
  hideError();
  renderCalendar();
  openStep('time');

  els.slots.innerHTML = '<div class="empty">Завантажую вільний час…</div>';
  els.timeHint.textContent = 'Перевіряємо графік та записи.';

  try {
    const data = await apiPost('getSlots', {
      initData: state.initData,
      date,
      serviceId: state.selectedService.id
    });

    if (!data || data.ok === false) throw new Error(data?.error || 'Не вдалося отримати час.');
    renderSlots(data.slots || []);
  } catch (err) {
    els.slots.innerHTML = '';
    showError(err.message || 'Не вдалося отримати час.');
  }
}

function renderSlots(slots) {
  els.slots.innerHTML = '';

  if (!Array.isArray(slots) || !slots.length) {
    els.timeHint.textContent = 'На цей день вільного часу немає.';
    els.slots.innerHTML = '<div class="empty">Спробуйте іншу дату.</div>';
    return;
  }

  els.timeHint.textContent = 'Оберіть зручний час:';

  slots.forEach(time => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot-btn';
    btn.textContent = time;
    btn.addEventListener('click', () => selectTime(time));
    els.slots.appendChild(btn);
  });
}

function selectTime(time) {
  state.selectedTime = time;
  document.querySelectorAll('.slot-btn').forEach(btn => btn.classList.remove('selected'));
  [...els.slots.children].find(btn => btn.textContent === time)?.classList.add('selected');
  openStep('form');
  updateSummary();
}

function updateSummary() {
  if (!state.selectedService || !state.selectedDate || !state.selectedTime) {
    els.summary.classList.remove('visible');
    return;
  }

  const serviceName = state.selectedService.name || state.selectedService.service_name || state.selectedService.serviceName || state.selectedService.title || 'Послуга';
  const end = addMinutesToTime(state.selectedTime, state.selectedService.duration);

  els.summary.classList.add('visible');
  els.summary.innerHTML = `
    <strong>Ваш запис:</strong><br>
    ${escapeHtml(serviceName)}<br>
    ${formatDate(state.selectedDate)} · ${state.selectedTime}–${end}<br>
    ${state.selectedService.price ? `${state.selectedService.price} грн` : 'Ціну уточнить майстер'}
  `;
}

async function submitBooking(event) {
  event.preventDefault();
  hideError();

  if (!state.selectedService || !state.selectedDate || !state.selectedTime) {
    return showError('Оберіть послугу, дату і час.');
  }

  const name = els.name.value.trim();
  const phone = els.phone.value.trim();
  const comment = els.comment.value.trim();

  if (!name || !phone) return showError('Вкажіть ім’я та телефон.');

  els.submit.disabled = true;
  els.submit.textContent = 'Записую…';

  try {
    const data = await apiPost('createBooking', {
      initData: state.initData,
      clientName: name,
      phone,
      serviceId: state.selectedService.id,
      date: state.selectedDate,
      start: state.selectedTime,
      comment
    });

    if (!data || data.ok === false) throw new Error(data?.error || 'Не вдалося створити запис.');

    showSuccess(data.booking);

    if (state.tg && data.booking?.id) {
      state.tg.sendData(JSON.stringify({
        action: 'booking_created',
        bookingId: data.booking.id
      }));
    }
  } catch (err) {
    showError(err.message || 'Помилка запису.');
  } finally {
    els.submit.disabled = false;
    els.submit.textContent = 'Підтвердити запис';
  }
}

function showSuccess(b) {
  const serviceName = b?.serviceName || b?.service_name || state.selectedService?.name || state.selectedService?.service_name || state.selectedService?.serviceName || 'Послуга';
  const date = b?.date || state.selectedDate;
  const start = b?.start || state.selectedTime;
  const end = b?.end || (start ? addMinutesToTime(start, state.selectedService?.duration || 0) : '');
  const price = b?.price ?? state.selectedService?.price ?? 0;

  els.successCard.classList.remove('hidden');
  els.successTitle.textContent = 'Запис підтверджено 💗';
  els.successDetails.innerHTML = `
    <strong>Послуга:</strong> ${escapeHtml(serviceName)}<br>
    <strong>Дата:</strong> ${formatDate(date)}<br>
    <strong>Час:</strong> ${start}–${end}<br>
    <strong>Вартість:</strong> ${price ? `${price} грн` : 'уточнить майстер'}
  `;
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function resetBooking() {
  state.selectedService = null;
  state.selectedDate = null;
  state.selectedTime = null;
  els.form.reset();
  els.summary.classList.remove('visible');
  els.successCard.classList.add('hidden');
  els.slots.innerHTML = '';
  els.timeHint.textContent = 'Спочатку оберіть послугу і дату.';
  document.querySelectorAll('.service-btn').forEach(b => b.classList.remove('selected'));
  openStep('service');
  renderCalendar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadMyBookings() {
  hideError();
  els.myBookingsCard.classList.remove('hidden');
  els.myBookings.innerHTML = '<div class="empty">Завантажую…</div>';

  try {
    const data = await apiPost('myBookings', { initData: state.initData });
    if (!data || data.ok === false) throw new Error(data?.error || 'Не вдалося завантажити записи.');
    renderMyBookings(data.bookings || []);
  } catch (err) {
    showError(err.message || 'Не вдалося завантажити записи.');
  }
}

function renderMyBookings(bookings) {
  els.myBookings.innerHTML = '';

  if (!bookings.length) {
    els.myBookings.innerHTML = '<div class="empty">Активних записів поки немає.</div>';
    return;
  }

  bookings.forEach(b => {
    const serviceName = b.serviceName || b.service_name || 'Послуга';
    const item = document.createElement('div');
    item.className = 'booking-item';
    item.innerHTML = `
      <strong>${escapeHtml(serviceName)}</strong>
      <div class="booking-meta">
        ${formatDate(b.date)} · ${b.start}–${b.end}<br>
        ${b.price ? `${b.price} грн` : ''} ${b.comment ? `<br>${escapeHtml(b.comment)}` : ''}
      </div>
      <div class="booking-actions">
        <button class="secondary-btn" type="button" data-cancel="${escapeAttr(b.id)}">Скасувати</button>
      </div>
    `;
    item.querySelector('[data-cancel]')?.addEventListener('click', () => cancelBooking(b.id));
    els.myBookings.appendChild(item);
  });
}

async function cancelBooking(id) {
  if (!confirm('Скасувати цей запис?')) return;

  try {
    const data = await apiPost('cancelBooking', {
      initData: state.initData,
      bookingId: id
    });

    if (!data || data.ok === false) throw new Error(data?.error || 'Не вдалося скасувати запис.');

    toast('Запис скасовано');
    loadMyBookings();
  } catch (err) {
    showError(err.message || 'Не вдалося скасувати запис.');
  }
}

function showAdmin() {
  els.adminView.classList.remove('hidden');

  const today = toIsoDate(new Date());
  els.adminDate.value = today;

  // Не завантажуємо адмінський календар автоматично.
  // Його можна буде завантажити кнопкою "↻".
}

async function loadAdminCalendar() {
  if (!state.isMaster) return;

  try {
    const data = await apiPost('adminCalendar', {
      initData: state.initData,
      date: els.adminDate.value
    });

    if (!data || data.ok === false) throw new Error(data?.error || 'Не вдалося завантажити календар.');
    renderAdminCalendar(data);
  } catch (err) {
    showError(err.message || 'Не вдалося завантажити календар.');
  }
}

function renderAdminCalendar(data) {
  const items = [];

  (data.schedule || []).forEach(x => items.push({
    time: `${normalizeTime(x.start)}–${normalizeTime(x.end)}`,
    text: 'Робочий час',
    className: 'timeline-item'
  }));

  (data.blocks || []).forEach(x => items.push({
    time: `${normalizeTime(x.start)}–${normalizeTime(x.end)}`,
    text: `🔒 ${x.reason || 'Заблоковано'}`,
    className: 'timeline-item block-item'
  }));

  (data.bookings || []).forEach(x => {
    const serviceName = x.serviceName || x.service_name || 'Послуга';
    items.push({
      time: `${normalizeTime(x.start)}–${normalizeTime(x.end)}`,
      text: `👤 ${escapeHtml(x.clientName || '')} · ${escapeHtml(serviceName)}<br><span class="small">${escapeHtml(x.phone || '')}${x.comment ? `<br>${escapeHtml(x.comment) }` : ''}</span>`,
      className: 'timeline-item'
    });
  });

  items.sort((a, b) => a.time.localeCompare(b.time));

  els.adminCalendar.innerHTML = items.length
    ? items.map(x => `<div class="${x.className}"><div class="time">${x.time}</div><div>${x.text}</div></div>`).join('')
    : '<div class="empty">На цю дату поки нічого немає.</div>';
}

async function addBlock() {
  const payload = {
    initData: state.initData,
    date: els.adminDate.value,
    start: els.blockStart.value,
    end: els.blockEnd.value,
    reason: els.blockReason.value.trim()
  };

  try {
    const data = await apiPost('adminAddBlock', payload);
    if (!data || data.ok === false) throw new Error(data?.error || 'Не вдалося заблокувати час.');
    els.blockStart.value = '';
    els.blockEnd.value = '';
    els.blockReason.value = '';
    toast('Час заблоковано');
    loadAdminCalendar();
  } catch (err) {
    showError(err.message || 'Не вдалося заблокувати час.');
  }
}

async function addManualBooking() {
  const payload = {
    initData: state.initData,
    date: els.adminDate.value,
    start: els.manualStart.value,
    serviceId: els.manualService.value,
    clientName: els.manualName.value.trim(),
    phone: els.manualPhone.value.trim(),
    comment: els.manualComment.value.trim()
  };

  try {
    const data = await apiPost('adminManualBooking', payload);
    if (!data || data.ok === false) throw new Error(data?.error || 'Не вдалося додати запис.');
    els.manualName.value = '';
    els.manualPhone.value = '';
    els.manualStart.value = '';
    els.manualComment.value = '';
    toast('Ручний запис додано');
    loadAdminCalendar();
  } catch (err) {
    showError(err.message || 'Не вдалося додати запис.');
  }
}

function openStep(name) {
  const order = ['service', 'date', 'time', 'form'];
  const index = order.indexOf(name);
  if (index < 0) return;

  order.forEach((step, i) => {
    const el = $(`step-${step}`);
    if (el) el.classList.toggle('active', i <= index);
  });

  setTimeout(() => $(`step-${name}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

async function apiPost(action, payload = {}) {
  if (!API_URL || API_URL.includes('PASTE_APPS_SCRIPT')) {
    throw new Error(
      'У app.js не вказано URL Apps Script Web App.'
    );
  }

  const requestBody = {
    action,
    ...payload
  };

  console.log('API REQUEST:', requestBody);

  let response;

  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(requestBody)
    });
  } catch (networkError) {
    throw new Error(
      'Помилка запиту до Apps Script: ' +
      (networkError.message || networkError)
    );
  }

  const text = await response.text();

  console.log('API STATUS:', response.status);
  console.log(
    'API CONTENT TYPE:',
    response.headers.get('content-type')
  );
  console.log('API RAW RESPONSE:', text);

  if (!text || !text.trim()) {
    throw new Error(
      'Apps Script повернув порожню відповідь. HTTP ' +
      response.status
    );
  }

  try {
    return JSON.parse(text);
  } catch (parseError) {
    throw new Error(
      'Apps Script повернув не JSON.\n\n' +
      'HTTP: ' + response.status +
      '\nВідповідь:\n' +
      text.substring(0, 500)
    );
  }
}

function yes(value) {
  return value === true || String(value).toLowerCase() === 'true' || String(value) === '1';
}

function normalizeDate(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return toIsoDate(value);
  }

  const text = String(value).trim();

  let match = text.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})/);
  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`;
  }

  match = text.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (match) {
    return `${match[3]}-${String(match[2]).padStart(2,'0')}-${String(match[1]).padStart(2,'0')}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return toIsoDate(parsed);

  return text.slice(0,10);
}

function normalizeTime(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return `${String(value.getHours()).padStart(2,'0')}:${String(value.getMinutes()).padStart(2,'0')}`;
  }

  const text = String(value).trim();

  // HHmm → HH:mm
  if (/^\d{4}$/.test(text)) {
    return `${text.slice(0,2)}:${text.slice(2,4)}`;
  }

  const match = text.match(/^(\d{1,2}):(\d{2})/);

  return match
    ? `${String(match[1]).padStart(2,'0')}:${match[2]}`
    : text;
}
function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function timeToMinutes(time) {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + m;
}

function addMinutesToTime(time, minutes) {
  const total = timeToMinutes(time) + Number(minutes || 0);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function showError(message) {
  els.errorBox.textContent = message;
  els.errorBox.classList.remove('hidden');
  els.errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideError() {
  els.errorBox.classList.add('hidden');
  els.errorBox.textContent = '';
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 2400);
}

init();
