const API = '/api';
let allEvents = [];

// ── NAVIGATION ──
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.textContent.toLowerCase().includes(page)) n.classList.add('active');
  });
  const titles = {
    dashboard: 'Dashboard',
    events: 'Events',
    attendees: 'Attendees',
    budget: 'Budget Tracking',
    feedback: 'Feedback',
    analytics: 'Performance Analytics'
  };
  document.getElementById('page-title').textContent = titles[page] || page;
  if (page === 'dashboard') loadDashboard();
  if (page === 'events') loadEvents();
  if (page === 'attendees') loadAttendeeEvents();
  if (page === 'budget') loadBudgetEvents();
  if (page === 'feedback') loadFeedbackEvents();
  if (page === 'analytics') loadAnalytics();
}

// ── MODAL ──
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── TOAST ──
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span> ${msg}`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── API HELPER ──
async function api(method, path, body) {
  try {
    const res = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
  } catch (err) {
    toast(err.message, 'error');
    throw err;
  }
}

// ── FORMAT ──
function fmt(n) { return Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0 }); }
function fmtDate(d) { return new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }); }
function typeBadge(t) {
  const map = { External: 'badge-external', Internal: 'badge-internal', Marketing: 'badge-marketing', Technical: 'badge-pending' };
  return `<span class="badge ${map[t] || 'badge-pending'}">${t || '—'}</span>`;
}

// ── DASHBOARD ──
async function loadDashboard() {
  try {
    const data = await api('GET', '/events');
    allEvents = data.events || [];
    document.getElementById('stat-events').textContent = data.count || 0;

    let totalAttendees = 0, totalCheckedIn = 0;
    const tbody = document.getElementById('dashboard-events-list');
    tbody.innerHTML = '';

    if (!allEvents.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty"><div class="empty-icon">📅</div><p>No events yet. Create your first event!</p></div></td></tr>`;
    } else {
      for (const ev of allEvents.slice(0, 5)) {
        tbody.innerHTML += `
          <tr>
            <td><strong>${ev.name}</strong></td>
            <td>${typeBadge(ev.type)}</td>
            <td>${fmtDate(ev.date)}</td>
            <td>${ev.location || '—'}</td>
            <td>KES ${fmt(ev.planned_budget || 0)}</td>
          </tr>`;
      }
      for (const ev of allEvents) {
        try {
          const att = await api('GET', `/attendees/event/${ev.id}`);
          totalAttendees += att.totalRegistered || 0;
          totalCheckedIn += att.totalCheckedIn || 0;
        } catch(e) {}
      }
    }

    document.getElementById('stat-attendees').textContent = totalAttendees;
    document.getElementById('stat-checkedin').textContent = totalCheckedIn;
  } catch(e) {}
}

// ── EVENTS ──
async function loadEvents() {
  try {
    const data = await api('GET', '/events');
    allEvents = data.events || [];
    const tbody = document.getElementById('events-list');
    tbody.innerHTML = '';

    if (!allEvents.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-icon">📅</div><p>No events yet</p></div></td></tr>`;
      return;
    }

    for (const ev of allEvents) {
      tbody.innerHTML += `
        <tr>
          <td><strong>${ev.name}</strong></td>
          <td>${typeBadge(ev.type)}</td>
          <td>${fmtDate(ev.date)}</td>
          <td>${ev.location || '—'}</td>
          <td>KES ${fmt(ev.planned_budget || 0)}</td>
          <td>
            <div class="actions">
              <button class="btn btn-ghost" onclick="openEditModal(${ev.id}, '${ev.name}', '${ev.type}', '${ev.date.split('T')[0]}', '${ev.location || ''}', ${ev.planned_budget || 0})">Edit</button>
              <button class="btn btn-danger" onclick="deleteEvent(${ev.id})">Delete</button>
              <button class="btn btn-ghost" onclick="copyRegLink('${ev.registration_token}')">🔗 Copy Link</button>
            </div>
          </td>
        </tr>`;
    }
  } catch(e) {}
}

async function submitNewEvent() {
  const name = document.getElementById('ev-name').value.trim();
  const date = document.getElementById('ev-date').value;
  if (!name || !date) { toast('Name and date are required', 'error'); return; }

  try {
    await api('POST', '/events', {
      name,
      type: document.getElementById('ev-type').value,
      date,
      location: document.getElementById('ev-location').value,
      planned_budget: document.getElementById('ev-budget').value || 0
    });
    toast('Event created successfully!');
    closeModal('modal-create-event');
    document.getElementById('ev-name').value = '';
    document.getElementById('ev-date').value = '';
    document.getElementById('ev-location').value = '';
    document.getElementById('ev-budget').value = '';
    loadEvents();
  } catch(e) {}
}

// Open edit modal with current event values pre-filled
function openEditModal(id, name, type, date, location, budget) {
  document.getElementById('edit-ev-id').value = id;
  document.getElementById('edit-ev-name').value = name;
  document.getElementById('edit-ev-type').value = type;
  document.getElementById('edit-ev-date').value = date;
  document.getElementById('edit-ev-location').value = location;
  document.getElementById('edit-ev-budget').value = budget;
  openModal('modal-edit-event');
}

// Submit the update
async function submitUpdateEvent() {
  const id = document.getElementById('edit-ev-id').value;
  const name = document.getElementById('edit-ev-name').value.trim();
  const date = document.getElementById('edit-ev-date').value;
  if (!name || !date) { toast('Name and date are required', 'error'); return; }

  try {
    await api('PATCH', `/events/${id}`, {
      name,
      type: document.getElementById('edit-ev-type').value,
      date,
      location: document.getElementById('edit-ev-location').value,
      planned_budget: document.getElementById('edit-ev-budget').value || 0
    });
    toast('Event updated successfully!');
    closeModal('modal-edit-event');
    loadEvents();
  } catch(e) {}
}

async function deleteEvent(id) {
  if (!confirm('Are you sure you want to delete this event?')) return;
  try {
    await api('DELETE', `/events/${id}`);
    toast('Event deleted!');
    loadEvents();
  } catch(e) {}
}

// ── ATTENDEES ──
async function loadAttendeeEvents() {
  try {
    const data = await api('GET', '/events');
    allEvents = data.events || [];
    const sel = document.getElementById('attendee-event-select');
    sel.innerHTML = '<option value="">Select an event...</option>';
    allEvents.forEach(ev => {
      sel.innerHTML += `<option value="${ev.id}">${ev.name}</option>`;
    });
  } catch(e) {}
}

async function loadAttendees() {
  const eventId = document.getElementById('attendee-event-select').value;
  if (!eventId) return;
  try {
    const data = await api('GET', `/attendees/event/${eventId}`);
    document.getElementById('att-registered').textContent = data.totalRegistered || 0;
    document.getElementById('att-checkedin').textContent = data.totalCheckedIn || 0;
    const tbody = document.getElementById('attendees-list');
    tbody.innerHTML = '';

    if (!data.attendees || !data.attendees.length) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty"><div class="empty-icon">👥</div><p>No attendees yet</p></div></td></tr>`;
      return;
    }

    for (const att of data.attendees) {
      const checked = att.checked_in;
      tbody.innerHTML += `
        <tr>
          <td><strong>${att.name}</strong></td>
          <td>${att.email}</td>
          <td><span class="badge ${checked ? 'badge-checked' : 'badge-pending'}">${checked ? 'Checked In' : 'Registered'}</span></td>
          <td>
            ${!checked
              ? `<button class="btn btn-success" onclick="checkIn(${att.id})">Check In</button>`
              : '<span style="color:var(--muted);font-size:13px">✓ Done</span>'
            }
          </td>
        </tr>`;
    }
  } catch(e) {}
}

function openRegisterModal() {
  const sel = document.getElementById('reg-event-id');
  sel.innerHTML = '';
  allEvents.forEach(ev => {
    sel.innerHTML += `<option value="${ev.id}">${ev.name}</option>`;
  });
  const preselect = document.getElementById('attendee-event-select').value;
  if (preselect) sel.value = preselect;
  openModal('modal-register-attendee');
}

async function registerAttendee() {
  const event_id = document.getElementById('reg-event-id').value;
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  if (!name || !email) { toast('Name and email required', 'error'); return; }

  try {
    await api('POST', '/attendees', { event_id, name, email });
    toast('Attendee registered!');
    closeModal('modal-register-attendee');
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-email').value = '';
    loadAttendees();
  } catch(e) {}
}

async function checkIn(id) {
  try {
    await api('PATCH', `/attendees/${id}/checkin`);
    toast('Attendee checked in!');
    loadAttendees();
  } catch(e) {}
}

// ── BUDGET ──
async function loadBudgetEvents() {
  try {
    const data = await api('GET', '/events');
    allEvents = data.events || [];
    const sel = document.getElementById('budget-event-select');
    sel.innerHTML = '<option value="">Select an event...</option>';
    allEvents.forEach(ev => {
      sel.innerHTML += `<option value="${ev.id}">${ev.name}</option>`;
    });
  } catch(e) {}
}

async function loadBudget() {
  const eventId = document.getElementById('budget-event-select').value;
  if (!eventId) return;
  try {
    const data = await api('GET', `/budget/event/${eventId}`);
    document.getElementById('budget-summary').style.display = 'grid';

    // show over budget warning
    const difference = parseFloat(data.difference) || 0;
    const diffEl = document.getElementById('b-diff');
    if (difference < 0) {
      diffEl.textContent = 'KES ' + fmt(Math.abs(difference));
      diffEl.style.color = 'var(--accent2)';
      diffEl.closest('.stat-card').querySelector('.stat-label').textContent = '⚠️ Over Budget By';
    } else {
      diffEl.textContent = 'KES ' + fmt(difference);
      diffEl.style.color = 'var(--accent3)';
      diffEl.closest('.stat-card').querySelector('.stat-label').textContent = 'Remaining Budget';
    }

    document.getElementById('b-planned').textContent = 'KES ' + fmt(data.totalPlanned || 0);
    document.getElementById('b-actual').textContent = 'KES ' + fmt(data.totalActual || 0);

    const tbody = document.getElementById('budget-list');
    tbody.innerHTML = '';

    if (!data.items || !data.items.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-icon">💰</div><p>No budget items yet</p></div></td></tr>`;
      return;
    }

    for (const item of data.items) {
      const planned = parseFloat(item.planned_amount);
      const actual = parseFloat(item.actual_amount);
      const pct = planned > 0 ? Math.min((actual / planned) * 100, 100) : 0;
      const over = actual > planned;

      tbody.innerHTML += `
        <tr>
          <td><strong>${item.category}</strong></td>
          <td style="color:var(--muted);font-size:13px">${item.description || '—'}</td>
          <td>KES ${fmt(planned)}</td>
          <td>KES ${fmt(actual)}</td>
          <td style="min-width:120px">
            <div style="font-size:11px;color:${over ? 'var(--accent2)' : 'var(--muted)'};margin-bottom:4px">${pct.toFixed(0)}%${over ? ' ⚠️ Over' : ''}</div>
            <div class="budget-bar"><div class="budget-fill ${over ? 'over' : ''}" style="width:${pct}%"></div></div>
          </td>
          <td>
            <div class="actions">
              <button class="btn btn-ghost" onclick="openUpdateActual(${item.id}, ${actual})">Update</button>
              <button class="btn btn-danger" onclick="deleteBudgetItem(${item.id})">Delete</button>
            </div>
          </td>
        </tr>`;
    }
  } catch(e) {}
}

function openAddBudgetModal() {
  const eventId = document.getElementById('budget-event-select').value;
  if (!eventId) { toast('Please select an event first', 'error'); return; }
  openModal('modal-add-budget');
}

async function addBudgetItem() {
  const eventId = document.getElementById('budget-event-select').value;
  const category = document.getElementById('bud-category').value.trim();
  const planned_amount = parseFloat(document.getElementById('bud-planned').value);
  if (!category) { toast('Category is required', 'error'); return; }
  if (!planned_amount || planned_amount <= 0) { toast('Planned amount must be greater than 0', 'error'); return; }

  try {
    await api('POST', '/budget', {
      event_id: eventId,
      category,
      planned_amount,
      description: document.getElementById('bud-desc').value
    });
    toast('Budget item added!');
    closeModal('modal-add-budget');
    document.getElementById('bud-category').value = '';
    document.getElementById('bud-planned').value = '';
    document.getElementById('bud-desc').value = '';
    loadBudget();
  } catch(e) {}
}

function openUpdateActual(id, current) {
  document.getElementById('actual-budget-id').value = id;
  document.getElementById('actual-amount').value = current;
  openModal('modal-update-actual');
}

async function updateActualAmount() {
  const id = document.getElementById('actual-budget-id').value;
  const actual_amount = parseFloat(document.getElementById('actual-amount').value);
  if (actual_amount < 0) { toast('Actual amount cannot be negative', 'error'); return; }

  try {
    await api('PATCH', `/budget/${id}`, { actual_amount });
    toast('Amount updated!');
    closeModal('modal-update-actual');
    loadBudget();
  } catch(e) {}
}

async function deleteBudgetItem(id) {
  if (!confirm('Delete this budget item?')) return;
  try {
    await api('DELETE', `/budget/${id}`);
    toast('Budget item deleted!');
    loadBudget();
  } catch(e) {}
}

// ── FEEDBACK ──
async function loadFeedbackEvents() {
  try {
    const data = await api('GET', '/events');
    allEvents = data.events || [];
    const sel = document.getElementById('feedback-event-select');
    sel.innerHTML = '<option value="">Select an event...</option>';
    allEvents.forEach(ev => {
      sel.innerHTML += `<option value="${ev.id}">${ev.name}</option>`;
    });
  } catch(e) {}
}

async function loadFeedback() {
  const eventId = document.getElementById('feedback-event-select').value;
  if (!eventId) return;

  try {
    const data = await api('GET', `/feedback/event/${eventId}`);
    document.getElementById('feedback-summary').style.display = 'grid';
    document.getElementById('fb-total').textContent = data.totalFeedback || 0;
    document.getElementById('fb-avg').textContent = data.averageRating || '0.0';
    renderStarSummary(data.averageRating || 0);

    const tbody = document.getElementById('feedback-list');
    tbody.innerHTML = '';

    if (!data.feedbacks || !data.feedbacks.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty">
              <div class="empty-icon">⭐</div>
              <p>No feedback yet for this event</p>
            </div>
          </td>
        </tr>`;
      return;
    }

    for (const fb of data.feedbacks) {
      tbody.innerHTML += `
        <tr>
          <td><strong>${fb.attendee_name}</strong></td>
          <td>${fb.title || '—'}</td>
          <td style="color:var(--muted); font-size:13px; max-width:300px">${fb.body}</td>
          <td>${renderStars(fb.rating)}</td>
          <td style="color:var(--muted); font-size:13px">${fmtDate(fb.created_at)}</td>
        </tr>`;
    }
  } catch(e) {}
}

function openFeedbackModal() {
  const eventId = document.getElementById('feedback-event-select').value;
  if (!eventId) { toast('Please select an event first', 'error'); return; }
  document.getElementById('fb-event-id').value = eventId;
  document.getElementById('fb-name').value = '';
  document.getElementById('fb-title').value = '';
  document.getElementById('fb-body').value = '';
  document.getElementById('fb-rating').value = '';
  document.querySelectorAll('.star-btn').forEach(s => {
    s.style.opacity = '0.3';
    s.style.color = '';
  });
  openModal('modal-submit-feedback');
}

function selectRating(val) {
  document.getElementById('fb-rating').value = val;
  document.querySelectorAll('.star-btn').forEach(s => {
    const starVal = parseInt(s.getAttribute('data-val'));
    if (starVal <= val) {
      s.style.opacity = '1';
      s.style.color = '#f5a623';
    } else {
      s.style.opacity = '0.3';
      s.style.color = '';
    }
  });
}

async function submitFeedbackForm() {
  const event_id = document.getElementById('fb-event-id').value;
  const attendee_name = document.getElementById('fb-name').value.trim();
  const title = document.getElementById('fb-title').value.trim();
  const body = document.getElementById('fb-body').value.trim();
  const rating = document.getElementById('fb-rating').value;

  if (!attendee_name) { toast('Your name is required', 'error'); return; }
  if (!body) { toast('Feedback comment is required', 'error'); return; }
  if (!rating) { toast('Please select a rating', 'error'); return; }

  try {
    await api('POST', '/feedback', {
      event_id, attendee_name, title, body,
      rating: parseInt(rating)
    });
    toast('Feedback submitted! Thank you ⭐');
    closeModal('modal-submit-feedback');
    loadFeedback();
  } catch(e) {}
}

function renderStars(rating) {
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    stars += `<span style="color:${i <= rating ? '#f5a623' : 'var(--border)'}; font-size:16px">★</span>`;
  }
  return stars;
}

function renderStarSummary(avg) {
  const container = document.getElementById('fb-stars');
  container.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const filled = i <= Math.round(avg);
    container.innerHTML += `<span style="color:${filled ? '#f5a623' : 'var(--border)'}; font-size:22px">★</span>`;
  }
  container.innerHTML += `<span style="color:var(--muted); font-size:13px; margin-left:6px">${avg}/5</span>`;
}

// ── ANALYTICS ──
async function loadAnalytics() {
  try {
    const data = await api('GET', '/analytics/dashboard');

    // overall totals
    const t = data.totals;
    document.getElementById('an-events').textContent = t.total_events || 0;
    document.getElementById('an-attendees').textContent = t.total_attendees || 0;
    document.getElementById('an-rating').textContent = t.overall_avg_rating
      ? `${t.overall_avg_rating} ★`
      : 'N/A';

    // best event banner
    if (data.bestEvent) {
      document.getElementById('best-event-banner').style.display = 'block';
      document.getElementById('best-name').textContent = data.bestEvent.name;
      document.getElementById('best-score').textContent = `${data.bestEvent.performance_score}/100`;
      document.getElementById('best-attendance').textContent = `${data.bestEvent.attendance_rate}%`;
      document.getElementById('best-rating').textContent = data.bestEvent.avg_rating
        ? `${data.bestEvent.avg_rating} ★`
        : 'No ratings';
    }

    // performance table
    const tbody = document.getElementById('analytics-list');
    tbody.innerHTML = '';

    if (!data.events || !data.events.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty">
              <div class="empty-icon">📊</div>
              <p>No events yet to analyze</p>
            </div>
          </td>
        </tr>`;
      return;
    }

    for (const ev of data.events) {
      const attendancePct = ev.attendance_rate;
      const budgetPct = ev.budget_utilization;
      const overBudget = ev.is_over_budget;
      const score = ev.performance_score;
      const scoreColor = score >= 70 ? 'var(--accent3)' : score >= 40 ? 'orange' : 'var(--accent2)';

      tbody.innerHTML += `
        <tr>
          <td>
            <strong>${ev.name}</strong>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">
              ${fmtDate(ev.date)} · ${ev.location || 'No location'}
            </div>
          </td>
          <td>${typeBadge(ev.type)}</td>
          <td>
            <div style="font-size:13px;margin-bottom:4px">
              <strong>${ev.total_checked_in}</strong>
              <span style="color:var(--muted)"> / ${ev.total_registered} (${attendancePct}%)</span>
            </div>
            <div class="budget-bar">
              <div class="budget-fill" style="width:${attendancePct}%; background:var(--accent)"></div>
            </div>
          </td>
          <td>
            <div style="font-size:13px;margin-bottom:4px;color:${overBudget ? 'var(--accent2)' : 'var(--text)'}">
              ${budgetPct}% ${overBudget ? '⚠️' : ''}
            </div>
            <div class="budget-bar">
              <div class="budget-fill ${overBudget ? 'over' : ''}" style="width:${Math.min(budgetPct,100)}%"></div>
            </div>
          </td>
          <td>
            ${ev.avg_rating
              ? `<span style="color:#f5a623">${'★'.repeat(Math.round(ev.avg_rating))}</span>
                 <span style="color:var(--muted)">${'★'.repeat(5 - Math.round(ev.avg_rating))}</span>
                 <span style="font-size:12px;color:var(--muted);margin-left:4px">${ev.avg_rating}/5</span>`
              : `<span style="color:var(--muted);font-size:13px">No feedback</span>`
            }
          </td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="
                width:44px;height:44px;border-radius:50%;
                background:conic-gradient(${scoreColor} ${score * 3.6}deg, var(--border) 0deg);
                display:flex;align-items:center;justify-content:center;
                font-size:11px;font-weight:700;color:${scoreColor}
              ">${score}</div>
              <span style="font-size:12px;color:var(--muted)">
                ${score >= 70 ? 'Great' : score >= 40 ? 'Average' : 'Needs work'}
              </span>
            </div>
          </td>
        </tr>`;
    }

    renderDetailCards(data.events);
  } catch(e) {}
}

function renderDetailCards(events) {
  const container = document.getElementById('event-detail-cards');
  container.innerHTML = '';
  if (!events.length) return;

  container.innerHTML = `
    <div style="font-family:var(--font-display);font-size:18px;font-weight:700;margin-bottom:16px">
      Detailed Event Breakdown
    </div>`;

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px';

  for (const ev of events) {
    const card = document.createElement('div');
    card.className = 'section';
    card.style.margin = '0';
    const attendancePct = ev.attendance_rate;
    const budgetPct = Math.min(ev.budget_utilization, 100);
    const score = ev.performance_score;
    const scoreColor = score >= 70 ? 'var(--accent3)' : score >= 40 ? 'orange' : 'var(--accent2)';

    card.innerHTML = `
      <div class="section-header" style="padding:16px 20px">
        <div>
          <div class="section-title" style="font-size:14px">${ev.name}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${fmtDate(ev.date)}</div>
        </div>
        <div style="
          width:48px;height:48px;border-radius:50%;
          background:conic-gradient(${scoreColor} ${score * 3.6}deg, var(--border) 0deg);
          display:flex;align-items:center;justify-content:center;
          font-size:13px;font-weight:800;color:${scoreColor};
          font-family:var(--font-display)
        ">${score}</div>
      </div>
      <div style="padding:0 20px 20px;display:flex;flex-direction:column;gap:14px">
        <div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
            <span style="color:var(--muted)">👥 Attendance Rate</span>
            <span style="font-weight:600">${ev.total_checked_in}/${ev.total_registered} · ${attendancePct}%</span>
          </div>
          <div class="budget-bar" style="height:8px">
            <div class="budget-fill" style="width:${attendancePct}%;background:var(--accent);height:8px"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
            <span style="color:var(--muted)">💰 Budget Used</span>
            <span style="font-weight:600;color:${ev.is_over_budget ? 'var(--accent2)' : 'var(--text)'}">
              ${ev.budget_utilization}% ${ev.is_over_budget ? '⚠️ Over' : ''}
            </span>
          </div>
          <div class="budget-bar" style="height:8px">
            <div class="budget-fill ${ev.is_over_budget ? 'over' : ''}" style="width:${budgetPct}%;height:8px"></div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px">
          <span style="color:var(--muted)">⭐ Avg Feedback</span>
          <span>
            ${ev.avg_rating
              ? `<span style="color:#f5a623;font-size:14px">${'★'.repeat(Math.round(ev.avg_rating))}</span>
                 <span style="color:var(--border);font-size:14px">${'★'.repeat(5 - Math.round(ev.avg_rating))}</span>
                 <span style="color:var(--muted);margin-left:4px">${ev.avg_rating}/5 (${ev.total_feedback} responses)</span>`
              : `<span style="color:var(--muted)">No feedback yet</span>`
            }
          </span>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:12px">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted)">
            <span>Performance Score</span>
            <span style="color:${scoreColor};font-weight:700">
              ${score >= 70 ? '🟢 Great' : score >= 40 ? '🟡 Average' : '🔴 Needs work'} · ${score}/100
            </span>
          </div>
        </div>
      </div>`;

    grid.appendChild(card);
  }

  container.appendChild(grid);
}

function copyRegLink(token) {
  const link = `${window.location.origin}/register/${token}`;
  navigator.clipboard.writeText(link);
  toast('Registration link copied! 🔗');
}

// ── INIT ──
loadDashboard();