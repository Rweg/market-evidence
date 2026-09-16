const DATA_FILES = {
  money: 'data/Rwego_Market_Evidence_Public_Comparison_Aug_2026_RWF.csv',
  audit: 'data/Rwego_Public_Market_Source_Audit_Aug_2026.csv',
  coverage: 'data/Rwego_Employer_Coverage_Public_Comparison_Aug_2026_RWF.csv',
  signals: 'data/employer-signals.csv',
};

const state = { view: 'manager', money: [], audit: [], coverage: [], signals: [], filtered: [] };
const $ = (selector) => document.querySelector(selector);

const MANAGER_BENCHMARKS = [
  { id: 'E01', family: 'Data labeling / perception specialist', signal: 'Direct-title IC floor; salary expectations field; no people management.', roleScope: 'IC / quality' },
  { id: 'E13', family: 'Annotation / operations lead', signal: '152-salary operations-management sample; regional comparator.', roleScope: 'People + throughput' },
  { id: 'E05', family: 'Technical data operations', signal: '39-salary data-engineer sample; strongest technical-data comparator.', roleScope: 'Python / SQL / pipelines' },
  { id: 'E15', family: 'Technical project / programme delivery', signal: '353-salary project-management sample; delivery comparator.', roleScope: 'Delivery + stakeholders' },
  { id: 'E06', family: 'Engineer I / technical engineering', signal: 'Kigali total-compensation database; not base salary.', roleScope: 'Engineering baseline' },
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  if (cell || row.length) { row.push(cell); if (row.some((value) => value !== '')) rows.push(row); }
  const [headers, ...data] = rows;
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function sourceCurrency(row) {
  const basis = row['Conversion basis'] || '';
  if (/RWF native/i.test(basis)) return { code: 'RWF', rate: 1 };
  const match = basis.match(/^(USD|KES|ZAR|GBP|CAD|INR)\s*->\s*RWF\s*@\s*([\d.]+)/i);
  if (match) return { code: match[1].toUpperCase(), rate: Number(match[2]) };
  return { code: 'RWF', rate: 1 };
}

function compactAmount(value, code, period) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return '—';
  const prefix = code === 'USD' ? 'USD ' : `${code} `;
  const suffix = period === 'hour' ? '/hour' : period === 'year' ? '/year' : '/month';
  if (number >= 1000000) return `${prefix}${(number / 1000000).toFixed(number % 1000000 ? 2 : 0)}M${suffix}`;
  if (number >= 1000) return `${prefix}${Math.round(number / 1000)}K${suffix}`;
  return `${prefix}${number.toLocaleString()}${suffix}`;
}

function tierCell(row, key) {
  const raw = Number(row[key]);
  if (!Number.isFinite(raw) || raw === 0) return '<span class="not-stated">Not stated</span>';
  const { code, rate } = sourceCurrency(row);
  const source = compactAmount(raw / rate, code, row.Period);
  const rwf = compactAmount(raw, 'RWF', row.Period);
  if (row.Period === 'year') {
    const monthly = compactAmount(raw / 12, 'RWF', 'month');
    return `<div class="tier-money"><strong>${escapeHtml(source)}</strong><small>${escapeHtml(monthly)} reference</small></div>`;
  }
  const note = code === 'RWF' ? 'RWF native' : `${rwf} reference`;
  return `<div class="tier-money"><strong>${escapeHtml(source)}</strong><small>${escapeHtml(note)}</small></div>`;
}

function sourceAmount(row) {
  const { code, rate } = sourceCurrency(row);
  const low = Number(row['Low RWF']) / rate;
  const high = Number(row['High RWF']) / rate;
  const unit = row.Period === 'hour' ? '/hour' : row.Period === 'year' ? '/year' : '/month';
  const label = (value) => compactAmount(value, code, row.Period).replace(unit, '');
  return `${code} ${label(low).replace(`${code} `, '')}–${label(high).replace(`${code} `, '')}${unit}`;
}

function rwfAmount(row) {
  const low = Number(row['Low RWF']);
  const high = Number(row['High RWF']);
  const unit = row.Period === 'hour' ? '/hour' : row.Period === 'year' ? '/year' : '/month';
  const compact = (number) => number >= 1000000 ? `${(number / 1000000).toFixed(number % 1000000 ? 2 : 0)}M` : number >= 1000 ? `${Math.round(number / 1000)}K` : number.toLocaleString();
  const main = `RWF ${compact(low)}–${compact(high)}${unit}`;
  const normalizedLow = Number(row['Normalized low RWF/month']);
  const normalizedHigh = Number(row['Normalized high RWF/month']);
  if (row.Period === 'year' && normalizedLow && normalizedHigh) return `${main}<small>RWF ${compact(normalizedLow)}–${compact(normalizedHigh)}/month calculated</small>`;
  return main;
}

function classificationClass(value) {
  if (/official/i.test(value)) return 'official';
  if (/secondary|employee|aggregation|survey|database/i.test(value)) return 'secondary';
  return 'direct';
}

function gradeClass(grade) {
  return `grade-${String(grade || 'D').toLowerCase()}`;
}

function sourceLink(row, label = 'Open money source') {
  const url = row['Money source URL'] || row['Source URL'];
  return `<a class="open-source" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${label} ↗</a>`;
}

function warningText(row) {
  return row['Source warning'] ? `<div class="source-warning"><span aria-hidden="true">!</span>${escapeHtml(row['Source warning'])}</div>` : '';
}

function managerRows() {
  return MANAGER_BENCHMARKS.map((benchmark) => {
    const row = state.money.find((item) => item['Evidence ID'] === benchmark.id);
    return row ? { ...row, ...benchmark } : null;
  }).filter(Boolean);
}

function renderManagerView(rows = managerRows()) {
  $('#benchmark-table tbody').innerHTML = rows.map((row) => `<tr>
    <td><div class="role-title">${escapeHtml(row.family)}</div><div class="role-location">${escapeHtml(row.roleScope)} · ${escapeHtml(row.Location)}</div></td>
    <td><div class="status-text">${escapeHtml(row.signal)}</div>${warningText(row)}</td>
    <td>${tierCell(row, 'Low RWF')}</td>
    <td>${tierCell(row, 'Midpoint RWF')}</td>
    <td>${tierCell(row, 'High RWF')}</td>
    <td><span class="grade-badge ${gradeClass(row['Evidence grade'])}">${escapeHtml(row['Evidence grade'])}</span><small class="grade-basis">${escapeHtml(row['Evidence grade basis'])}</small></td>
    <td>${sourceLink(row, 'Open direct source')}</td>
  </tr>`).join('');
  $('#result-count').textContent = `${rows.length} benchmark rows`;
}

function renderMoneyTable(rows) {
  $('#table-title').textContent = 'Compensation observations';
  $('#evidence-table').querySelector('thead').innerHTML = '<tr><th>ID</th><th>Comparator</th><th>Modest published</th><th>Middle published</th><th>High published</th><th>Source type</th><th>Grade</th><th>Verification</th><th>Link</th></tr>';
  $('#evidence-table').querySelector('tbody').innerHTML = rows.map((row) => `<tr>
    <td><span class="id-label">${escapeHtml(row['Evidence ID'])}</span><br /><span class="role-location">${escapeHtml(row.Period)}</span></td>
    <td><div class="role-title">${escapeHtml(row['Comparator title'])}</div><div class="role-location">${escapeHtml(row.Location)} · ${escapeHtml(row.Seniority)}</div></td>
    <td>${tierCell(row, 'Low RWF')}</td>
    <td>${tierCell(row, 'Midpoint RWF')}</td>
    <td>${tierCell(row, 'High RWF')}</td>
    <td><span class="badge ${classificationClass(row['Money source classification'])}">${escapeHtml(row['Money source classification'])}</span></td>
    <td><span class="grade-badge ${gradeClass(row['Evidence grade'])}">${escapeHtml(row['Evidence grade'])}</span><small class="grade-basis">${escapeHtml(row['Evidence grade basis'])}</small></td>
    <td><div class="status-text">${escapeHtml(row['Money source status'])}</div>${warningText(row)}</td>
    <td>${sourceLink(row)}</td>
  </tr>`).join('');
}

function renderAuditTable(rows) {
  $('#table-title').textContent = 'Money-source audit';
  $('#evidence-table').querySelector('thead').innerHTML = '<tr><th>ID</th><th>Comparator</th><th>Location</th><th>RWF range</th><th>Classification</th><th>Grade</th><th>Status</th><th>Link</th></tr>';
  $('#evidence-table').querySelector('tbody').innerHTML = rows.map((row) => `<tr>
    <td><span class="id-label">${escapeHtml(row['Evidence ID'])}</span></td>
    <td><div class="role-title">${escapeHtml(row['Comparator title'])}</div><div class="role-location">${escapeHtml(row.Period)}</div></td>
    <td>${escapeHtml(row.Location)}</td>
    <td><div class="money-rwf"><strong>RWF ${escapeHtml(row['RWF low'])}–${escapeHtml(row['RWF high'])}</strong></div></td>
    <td><span class="badge ${classificationClass(row['Money source classification'])}">${escapeHtml(row['Money source classification'])}</span></td>
    <td><span class="grade-badge ${gradeClass(row['Evidence grade'])}">${escapeHtml(row['Evidence grade'])}</span><small class="grade-basis">${escapeHtml(row['Evidence grade basis'])}</small></td>
    <td><div class="status-text">${escapeHtml(row['Money source status'])}</div><small>${escapeHtml(row['Verification label'])}</small>${warningText(row)}</td>
    <td><a class="open-source" href="${escapeHtml(row['Money source URL'])}" target="_blank" rel="noreferrer">Open source ↗</a></td>
  </tr>`).join('');
}

function renderCoverageTable(rows) {
  $('#table-title').textContent = 'Employer and programme coverage';
  $('#evidence-table').querySelector('thead').innerHTML = '<tr><th>Employer / programme</th><th>Category</th><th>Geography</th><th>Classification</th><th>Salary result</th><th>Discovery source</th><th>Link</th></tr>';
  $('#evidence-table').querySelector('tbody').innerHTML = rows.map((row) => `<tr>
    <td><div class="role-title">${escapeHtml(row['Employer / programme'])}</div><div class="role-location">${escapeHtml(row.Origin)}</div></td>
    <td>${escapeHtml(row.Category)}</td>
    <td>${escapeHtml(row.Geography)}</td>
    <td><span class="badge ${/salary evidence/i.test(row.Classification) ? 'direct' : /unavailable|expired|excluded/i.test(row.Classification) ? 'secondary' : 'official'}">${escapeHtml(row.Classification)}</span></td>
    <td><div class="status-text">${escapeHtml(row['Salary evidence result'])}</div></td>
    <td>${escapeHtml(row['Discovery / verification source'])}</td>
    <td><a class="open-source" href="${escapeHtml(row['Source URL'])}" target="_blank" rel="noreferrer">Open source ↗</a></td>
  </tr>`).join('');
}

function renderSignals(rows) {
  const target = $('#signals-table');
  if (!target) return;
  target.querySelector('tbody').innerHTML = rows.map((row) => `<tr>
    <td><div class="role-title">${escapeHtml(row.Employer)}</div><div class="role-location">${escapeHtml(row.Sector)}</div></td>
    <td>${escapeHtml(row.Signal)}</td>
    <td>${escapeHtml(row['What it supports'])}</td>
    <td>${escapeHtml(row.Period)}</td>
    <td><span class="grade-badge ${gradeClass(row['Evidence grade'])}">${escapeHtml(row['Evidence grade'])}</span><div class="status-text">${escapeHtml(row.Warning)}</div></td>
    <td><a class="open-source" href="${escapeHtml(row['Source URL'])}" target="_blank" rel="noreferrer">Open source ↗</a></td>
  </tr>`).join('');
}

function currentRows() { return state[state.view]; }

function filterRows() {
  const query = $('#search-input').value.trim().toLowerCase();
  const period = $('#period-filter').value;
  const quality = $('#quality-filter').value;
  let rows = state.view === 'manager' ? state.money : currentRows();
  if (query) rows = rows.filter((row) => Object.values(row).join(' ').toLowerCase().includes(query));
  if (state.view === 'money') {
    if (period !== 'all') rows = rows.filter((row) => row.Period === period);
    if (quality !== 'all') rows = rows.filter((row) => row['Evidence quality'] === quality);
  }
  state.filtered = rows;
  renderTable();
}

function renderTable() {
  const rows = state.filtered;
  $('#manager-view').hidden = state.view !== 'manager';
  document.querySelector('.controls').hidden = false;
  document.querySelector('.table-section').hidden = false;
  if (state.view === 'manager') {
    renderManagerView(managerRows());
    renderMoneyTable(rows);
  }
  if (state.view === 'money') renderMoneyTable(rows);
  if (state.view === 'audit') renderAuditTable(rows);
  if (state.view === 'coverage') renderCoverageTable(rows);
  if (state.view === 'manager') $('#result-count').textContent = `${rows.length} compensation ${rows.length === 1 ? 'row' : 'rows'}`;
  if (state.view !== 'manager') $('#result-count').textContent = `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`;
  $('#empty-state').hidden = rows.length > 0;
}

function updateView(view) {
  state.view = view;
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  const names = { manager: 'Manager view', money: 'Research evidence', audit: 'Source audit', coverage: 'Employer coverage' };
  const descriptions = {
    manager: 'A concise, source-linked comparison of the five work families represented in the role.',
    money: 'Each observation preserves the source-page currency, the RWF reference display, the evidence classification, and the direct source link.',
    audit: 'A row-by-row source register showing whether each figure comes from an official, employee-reported, historical, platform, or secondary source.',
    coverage: 'Employer and programme coverage across Rwanda, Africa, and international remote channels, with current, expired, unavailable, and non-comparable findings kept distinct.',
  };
  $('#view-breadcrumb').textContent = names[view];
  $('#page-title').textContent = view === 'manager' ? 'Role families and source-backed comparisons' : view === 'money' ? 'Compensation evidence by comparator' : names[view];
  $('#page-description').textContent = descriptions[view];
  $('#period-filter').disabled = !['manager', 'money'].includes(view);
  $('#quality-filter').disabled = !['manager', 'money'].includes(view);
  $('#search-input').value = '';
  filterRows();
}

function csvEscape(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function downloadRows(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers, ...rows.map((row) => headers.map((header) => row[header]))].map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

function createPrompt() {
  const rows = state.filtered.slice(0, 12);
  const context = rows.map((row) => `${row['Evidence ID']}: ${row['Comparator title']} | ${row.Location} | ${row['Low RWF']}-${row['High RWF']} RWF | ${row['Money source URL'] || row['Source URL']}`).join('\n');
  return `Use only the linked public evidence below. Do not invent salary figures, combine rows into a median, or treat secondary evidence as official payroll. Keep original currencies visible, label all RWF conversions as cross-currency displays, and preserve evidence grades and source warnings.\n\n${context}`;
}

function answerQuestion(question) {
  const terms = question.toLowerCase().split(/\s+/).filter((term) => term.length > 2);
  const matches = state.money.filter((row) => terms.some((term) => Object.values(row).join(' ').toLowerCase().includes(term))).slice(0, 4);
  if (!matches.length) return 'No linked money rows matched that question. Try a role, country, employer type, or source class.';
  const first = matches[0];
  return `Found <strong>${matches.length} linked row${matches.length === 1 ? '' : 's'}</strong>. For example, <strong>${escapeHtml(first['Comparator title'])}</strong> publishes <strong>${escapeHtml(sourceAmount(first))}</strong>, shown here as <strong>${rwfAmount(first).split('<small>')[0]}</strong>. ${sourceLink(first, 'Open the supporting source')}`;
}

async function loadData() {
  const entries = await Promise.all(Object.entries(DATA_FILES).map(async ([key, path]) => [key, parseCsv(await (await fetch(path)).text())]));
  entries.forEach(([key, rows]) => { state[key] = rows; });
  const official = state.money.filter((row) => /official/i.test(row['Money source classification'])).length;
  const hourly = state.money.filter((row) => row.Period === 'hour').length;
  $('#metric-money').textContent = state.money.length;
  $('#metric-official').textContent = official;
  $('#metric-hourly').textContent = hourly;
  $('#metric-employers').textContent = state.coverage.length;
  $('#sidebar-money-count').textContent = state.money.length;
  $('#sidebar-coverage-count').textContent = state.coverage.length;
  state.filtered = state.money;
  renderTable();
  renderSignals(state.signals);
}

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => updateView(button.dataset.view)));
$('#search-input').addEventListener('input', filterRows);
$('#period-filter').addEventListener('change', filterRows);
$('#quality-filter').addEventListener('change', filterRows);
$('#clear-filters').addEventListener('click', () => { $('#search-input').value = ''; $('#period-filter').value = 'all'; $('#quality-filter').value = 'all'; filterRows(); });
$('#download-current').addEventListener('click', () => downloadRows(state.filtered, `${state.view}-evidence-filtered.csv`));
$('#copy-prompt').addEventListener('click', async () => { await navigator.clipboard.writeText(createPrompt()); $('#copy-prompt').innerHTML = '<span aria-hidden="true">✓</span> Prompt copied'; setTimeout(() => { $('#copy-prompt').innerHTML = '<span aria-hidden="true">▣</span> Copy GPT prompt'; }, 1800); });
$('#assistant-form').addEventListener('submit', (event) => { event.preventDefault(); $('#assistant-answer').innerHTML = answerQuestion($('#assistant-input').value || ''); });
loadData().catch((error) => { $('#assistant-answer').textContent = `The evidence files could not load: ${error.message}`; });
