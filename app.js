const CFG = window.DUHOK_ADMIN_CONFIG;

const API =
  `https://${CFG.projectRef}.supabase.co/functions/v1/${CFG.functionName}`;

const PUBLIC_STORAGE =
  `https://${CFG.projectRef}.supabase.co/storage/v1/object/public/${CFG.storageBucket}`;

let secret =
  localStorage.getItem('duhok_admin_secret') || '';

let data = {
  places: [],
  governorates: [],
  districts: [],
  subdistricts: [],
  categories: [],
  images: []
};

let selected = new Set();
let currentFiltered = [];
let currentPlaceImages = [];

let formDirty = false;
let suppressDirty = false;

const $ = id =>
  document.getElementById(id);

const nullable = v =>
  v === '' || v == null
    ? null
    : v;

const numOrNull = v =>
  v === '' || v == null
    ? null
    : Number(v);

const CATEGORY_LABELS = {
  nature: 'طبيعة',
  park: 'متنزه',
  religious: 'ديني',
  resort: 'مصيف',
  historical: 'تاريخي',
  cave: 'كهف',
  entertainment: 'ترفيه',
  landmark: 'معلم',
  museum: 'متحف',
  shopping: 'تسوق',
  town: 'بلدة/مدينة',
  viewpoint: 'إطلالة',
  waterfall: 'شلال'
};

const CANONICAL_CATEGORIES =
  Object.keys(CATEGORY_LABELS);


async function api(
  action,
  options = {}
) {

  const headers = {
    'X-Admin-Secret': secret
  };

  if (
    !(options.body instanceof FormData)
  ) {
    headers['Content-Type'] =
      'application/json';
  }

  const res =
    await fetch(
      `${API}?action=${encodeURIComponent(action)}`,
      {
        method:
          options.method || 'GET',

        headers,

        body:
          options.body instanceof FormData
            ? options.body
            : options.body
              ? JSON.stringify(options.body)
              : undefined
      }
    );

  const json =
    await res
      .json()
      .catch(() => ({}));

  if (!res.ok) {

    if (res.status === 401) {
      localStorage.removeItem(
        'duhok_admin_secret'
      );

      secret = '';
    }

    throw new Error(
      json.error ||
      `HTTP ${res.status}`
    );
  }

  return json;
}


function message(
  text,
  ok = true,
  ms = 5000
) {

  const e = $('status');

  e.hidden = false;

  e.className =
    `status ${ok ? 'ok' : 'err'}`;

  e.textContent = text;

  clearTimeout(message._t);

  message._t =
    setTimeout(
      () => {
        e.hidden = true;
      },
      ms
    );
}


function escapeHtml(s = '') {

  return String(s).replace(
    /[&<>'"]/g,
    c =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[c])
  );
}


function escapeAttr(s = '') {
  return escapeHtml(s);
}


function fmtDate(v) {

  if (!v) {
    return '—';
  }

  try {

    return new Intl.DateTimeFormat(
      'ar-IQ',
      {
        dateStyle: 'medium',
        timeStyle: 'short'
      }
    ).format(
      new Date(v)
    );

  } catch {

    return v;
  }
}


function districtName(id) {

  return (
    data.districts.find(
      x => x.id === id
    )?.name_ar || '—'
  );
}


function subdistrictName(id) {

  return (
    data.subdistricts.find(
      x => x.id === id
    )?.name_ar || '—'
  );
}


function governorateName(id) {

  return (
    data.governorates.find(
      x => x.id === id
    )?.name_ar || '—'
  );
}


function storageUrl(path) {

  if (!path) {
    return '';
  }

  if (
    /^https?:\/\//i.test(path)
  ) {
    return path;
  }

  return (
    `${PUBLIC_STORAGE}/` +
    String(path)
      .split('/')
      .map(encodeURIComponent)
      .join('/')
  );
}


function categoryLabel(v) {

  return CATEGORY_LABELS[v]
    ? `${CATEGORY_LABELS[v]} (${v})`
    : v || '—';
}


function thumbHtml(p) {

  const src =
    p.image_path
      ? storageUrl(
          p.image_path
        )
      : '';

  if (!src) {

    return `
      <div class="thumb thumb-placeholder">
        ◫
      </div>
    `;
  }

  return `
    <img
      class="thumb"
      src="${escapeAttr(src)}"
      alt=""
      loading="lazy"
      onerror="
        this.replaceWith(
          Object.assign(
            document.createElement('div'),
            {
              className:'thumb thumb-placeholder',
              textContent:'◫'
            }
          )
        )
      "
    >
  `;
}


async function loadAll(
  showMsg = false
) {

  try {

    $('refreshBtn').disabled = true;

    document.body.classList.add(
      'loading'
    );

    data =
      await api(
        'bootstrap'
      );

    data.images ||= [];

    fillStaticLists();

    render();

    renderGeo();

    if (showMsg) {

      message(
        'تم تحديث البيانات من Supabase.'
      );
    }

  } catch (e) {

    message(
      `تعذر تحميل البيانات: ${e.message}`,
      false,
      8000
    );

    if (!secret) {
      $('secretDialog').showModal();
    }

  } finally {

    $('refreshBtn').disabled = false;

    document.body.classList.remove(
      'loading'
    );
  }
}


function fillStaticLists() {

  const did =
    $('districtFilter').value;

  const cat =
    $('categoryFilter').value;

  $('districtFilter').innerHTML =
    '<option value="">كل الأقضية</option>' +
    data.districts
      .map(
        d =>
          `<option value="${d.id}">
            ${escapeHtml(d.name_ar)}
          </option>`
      )
      .join('');

  $('districtFilter').value = did;

  const cats =
    [
      ...new Set([
        ...CANONICAL_CATEGORIES,
        ...(data.categories || [])
      ])
    ].filter(Boolean);

  $('categoryFilter').innerHTML =
    '<option value="">كل التصنيفات</option>' +
    cats
      .map(
        c =>
          `<option value="${escapeAttr(c)}">
            ${escapeHtml(categoryLabel(c))}
          </option>`
      )
      .join('');

  $('categoryFilter').value = cat;

  $('category').innerHTML =
    '<option value="">— اختر التصنيف —</option>' +
    cats
      .map(
        c =>
          `<option value="${escapeAttr(c)}">
            ${escapeHtml(categoryLabel(c))}
          </option>`
      )
      .join('');

  $('governorate_id').innerHTML =
    '<option value="">— بدون محافظة —</option>' +
    data.governorates
      .map(
        g =>
          `<option value="${g.id}">
            ${escapeHtml(g.name_ar)}
          </option>`
      )
      .join('');

  $('geoGovFilter').innerHTML =
    data.governorates
      .map(
        g =>
          `<option value="${g.id}">
            ${escapeHtml(g.name_ar)}
          </option>`
      )
      .join('');

  if (
    !$('geoGovFilter').value &&
    data.governorates[0]
  ) {

    $('geoGovFilter').value =
      data.governorates[0].id;
  }

  fillGeoDistrictFilter();
}


function getFiltered() {

  const q =
    $('searchInput')
      .value
      .trim()
      .toLowerCase();

  const did =
    $('districtFilter').value;

  const active =
    $('activeFilter').value;

  const cat =
    $('categoryFilter').value;

  let rows =
    data.places.filter(
      p => {

        const text =
          `
            ${p.name_ar || ''}
            ${p.name_ku || ''}
            ${p.name_en || ''}
            ${p.category || ''}
          `.toLowerCase();

        return (
          (!q || text.includes(q)) &&
          (!did || p.district_id === did) &&
          (!active || String(p.is_active) === active) &&
          (!cat || p.category === cat)
        );
      }
    );

  const sort =
    $('sortFilter').value;

  rows =
    [...rows].sort(
      (a, b) => {

        if (
          sort === 'priority_asc'
        ) {

          return (
            (a.priority_score ?? 0) -
            (b.priority_score ?? 0)
          );
        }

        if (
          sort === 'name_ar'
        ) {

          return String(
            a.name_ar || ''
          ).localeCompare(
            String(
              b.name_ar || ''
            ),
            'ar'
          );
        }

        if (
          sort === 'updated_desc'
        ) {

          return (
            new Date(
              b.updated_at || 0
            ) -
            new Date(
              a.updated_at || 0
            )
          );
        }

        return (
          (b.priority_score ?? 0) -
            (a.priority_score ?? 0) ||
          String(
            a.name_ar || ''
          ).localeCompare(
            String(
              b.name_ar || ''
            ),
            'ar'
          )
        );
      }
    );

  return rows;
}


function render() {

  currentFiltered =
    getFiltered();

  const rows =
    currentFiltered;

  $('totalCount').textContent =
    data.places.length;

  $('activeCount').textContent =
    data.places.filter(
      p => p.is_active
    ).length;

  $('inactiveCount').textContent =
    data.places.filter(
      p => !p.is_active
    ).length;

  $('verifiedCount').textContent =
    data.places.filter(
      p =>
        p.coordinates_verified
    ).length;

  $('shownCount').textContent =
    rows.length;

  $('placesBody').innerHTML =
    rows
      .map(
        (p, index) => `
          <tr>

            <td class="select-col">

              <input
                type="checkbox"
                data-select="${p.id}"
                ${
                  selected.has(p.id)
                    ? 'checked'
                    : ''
                }
              >

            </td>

            <td class="serial-col">
              ${index + 1}
            </td>

            <td>

              <div class="place-cell">

                ${thumbHtml(p)}

                <div>

                  <b>
                    ${escapeHtml(p.name_ar)}
                  </b>

                  <small>
                    ${escapeHtml(p.name_en || '')}
                  </small>

                </div>

              </div>

            </td>

            <td>
              ${escapeHtml(categoryLabel(p.category))}
            </td>

            <td>
              ${escapeHtml(districtName(p.district_id))}
            </td>

            <td>
              ${escapeHtml(subdistrictName(p.subdistrict_id))}
            </td>

            <td>

              <span
                class="pill ${
                  p.is_active
                    ? 'on'
                    : 'off'
                }"
              >

                ${
                  p.is_active
                    ? 'نشط'
                    : 'مخفي'
                }

              </span>

            </td>

            <td>

              <span
                class="pill ${
                  p.coordinates_verified
                    ? 'verified'
                    : 'unverified'
                }"
              >

                ${
                  p.coordinates_verified
                    ? 'مؤكدة'
                    : 'غير مؤكدة'
                }

              </span>

            </td>

            <td>
              ${p.priority_score ?? 0}
            </td>

            <td class="muted">
              ${escapeHtml(fmtDate(p.updated_at))}
            </td>

            <td>

              <div class="actions">

                <button
                  data-edit="${p.id}"
                >
                  تعديل
                </button>

                <button
                  data-duplicate="${p.id}"
                >
                  نسخ
                </button>

                <button
                  class="danger"
                  data-delete="${p.id}"
                >
                  حذف
                </button>

              </div>

            </td>

          </tr>
        `
      )
      .join('');

  $('emptyState').hidden =
    rows.length !== 0;

  updateBulkBar();

  $('selectAll').checked =
    rows.length > 0 &&
    rows.every(
      p => selected.has(p.id)
    );

  $('selectAll').indeterminate =
    rows.some(
      p => selected.has(p.id)
    ) &&
    !$('selectAll').checked;
}


function updateBulkBar() {

  $('selectedCount').textContent =
    selected.size;

  $('bulkBar').hidden =
    selected.size === 0;
}


function clearFilters() {

  $('searchInput').value = '';

  $('districtFilter').value = '';

  $('categoryFilter').value = '';

  $('activeFilter').value = '';

  $('sortFilter').value =
    'priority_desc';

  render();
}


function fillDistricts(
  govId,
  selectedId = ''
) {

  const opts =
    data.districts.filter(
      d =>
        d.governorate_id === govId
    );

  $('district_id').innerHTML =
    '<option value="">— بدون قضاء —</option>' +
    opts
      .map(
        d =>
          `<option value="${d.id}">
            ${escapeHtml(d.name_ar)}
          </option>`
      )
      .join('');

  $('district_id').value =
    selectedId || '';
}


function fillSubdistricts(
  distId,
  selectedId = ''
) {

  const opts =
    data.subdistricts.filter(
      s =>
        s.district_id === distId
    );

  $('subdistrict_id').innerHTML =
    '<option value="">— بدون ناحية —</option>' +
    opts
      .map(
        s =>
          `<option value="${s.id}">
            ${escapeHtml(s.name_ar)}
          </option>`
      )
      .join('');

  $('subdistrict_id').value =
    selectedId || '';
}


function setDirty(
  v = true
) {

  if (suppressDirty) {
    return;
  }

  formDirty = v;

  $('dirtyNote').hidden =
    !v;
}


function updateCounters() {

  document
    .querySelectorAll(
      '.counter[data-for]'
    )
    .forEach(
      c => {

        const el =
          $(c.dataset.for);

        c.textContent =
          `${el.value.length}/${el.maxLength || '∞'}`;
      }
    );
}


/*
  ===========================
  الإحداثيات من Google Maps
  ===========================
*/


function normalizeCoordinateInput(
  value
) {

  return String(
    value || ''
  )
    .trim()

    .replace(
      /[\u0660-\u0669]/g,
      d =>
        '٠١٢٣٤٥٦٧٨٩'.indexOf(d)
    )

    .replace(
      /[\u06F0-\u06F9]/g,
      d =>
        '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)
    )

    .replace(
      /،/g,
      ','
    );
}


function parseCoordinates(
  value
) {

  const text =
    normalizeCoordinateInput(
      value
    );

  if (!text) {
    return null;
  }

  const match =
    text.match(
      /^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*[,\s]\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*$/
    );

  if (!match) {
    return null;
  }

  const lat =
    Number(match[1]);

  const lon =
    Number(match[2]);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }

  return {
    lat,
    lon
  };
}


function applyCoordinates(
  lat,
  lon,
  {
    markDirty = true,
    showMessage = false
  } = {}
) {

  if (
    !Number.isFinite(Number(lat)) ||
    !Number.isFinite(Number(lon))
  ) {
    return false;
  }

  const a =
    Number(lat);

  const b =
    Number(lon);

  if (
    a < -90 ||
    a > 90 ||
    b < -180 ||
    b > 180
  ) {
    return false;
  }

  $('latitude').value =
    String(a);

  $('longitude').value =
    String(b);

  $('coordinatesPaste').value =
    `${a}, ${b}`;

  if (markDirty) {
    setDirty();
  }

  if (showMessage) {

    message(
      'تم فصل الإحداثيات ووضعها في الحقلين بنجاح.'
    );
  }

  return true;
}


function clearCoordinates() {

  $('coordinatesPaste').value = '';

  $('latitude').value = '';

  $('longitude').value = '';

  $('coordinates_verified').checked =
    false;

  setDirty();
}


function parsePastedCoordinates(
  {
    silent = false
  } = {}
) {

  const parsed =
    parseCoordinates(
      $('coordinatesPaste').value
    );

  if (!parsed) {

    if (
      !silent &&
      $('coordinatesPaste')
        .value
        .trim()
    ) {

      message(
        'صيغة الإحداثيات غير صحيحة. استخدم مثلًا: 36.79106398684363, 42.91140710412968',
        false,
        7000
      );
    }

    return false;
  }

  applyCoordinates(
    parsed.lat,
    parsed.lon,
    {
      markDirty: true,
      showMessage: !silent
    }
  );

  return true;
}


async function copyCoordinates() {

  const lat =
    numOrNull(
      $('latitude').value
    );

  const lon =
    numOrNull(
      $('longitude').value
    );

  if (
    lat == null ||
    lon == null
  ) {

    message(
      'لا توجد إحداثيات لنسخها.',
      false
    );

    return;
  }

  const text =
    `${lat}, ${lon}`;

  try {

    await navigator.clipboard.writeText(
      text
    );

    message(
      'تم نسخ الإحداثيات.'
    );

  } catch {

    window.prompt(
      'انسخ الإحداثيات:',
      text
    );
  }
}


async function openEditor(
  p = null,
  duplicate = false
) {

  suppressDirty = true;

  $('placeForm').reset();

  $('placeId').value =
    duplicate
      ? ''
      : p?.id || '';

  $('dialogTitle').textContent =
    duplicate
      ? 'نسخ مكان'
      : p
        ? 'تعديل المكان'
        : 'إضافة مكان';

  $('editorSubtitle').textContent =
    p && !duplicate
      ? `ID: ${p.id}`
      : '';

  const fields = [
    'name_ar',
    'name_ku',
    'name_en',

    'short_description_ar',
    'short_description_ku',
    'short_description_en',

    'description_ar',
    'description_ku',
    'description_en',

    'category',
    'best_season',
    'difficulty',

    'phone',
    'whatsapp',

    'entry_fee_text_ar',
    'entry_fee_text_ku',
    'entry_fee_text_en'
  ];

  fields.forEach(
    f => {

      $(f).value =
        p?.[f] ?? '';
    }
  );

  if (
    duplicate &&
    p
  ) {

    $('name_ar').value =
      `نسخة من ${p.name_ar}`;

    $('name_en').value =
      `Copy of ${p.name_en || p.name_ar}`;
  }

  $('visit_duration_minutes').value =
    p?.visit_duration_minutes ?? '';

  $('priority_score').value =
    p?.priority_score ?? 0;

  $('family_friendly').checked =
    p?.family_friendly ?? true;

  $('is_active_select').value =
    String(
      duplicate
        ? false
        : p?.is_active ?? true
    );

  $('coordinates_verified').checked =
    duplicate
      ? false
      : p?.coordinates_verified ?? false;

  $('latitude').value =
    p?.latitude ?? '';

  $('longitude').value =
    p?.longitude ?? '';

  $('coordinatesPaste').value =
    p?.latitude != null &&
    p?.longitude != null
      ? `${p.latitude}, ${p.longitude}`
      : '';

  const gov =
    p?.governorate_id ||
    data.governorates[0]?.id ||
    '';

  $('governorate_id').value =
    gov;

  fillDistricts(
    gov,
    p?.district_id || ''
  );

  fillSubdistricts(
    p?.district_id || '',
    p?.subdistrict_id || ''
  );

  $('meta_id').textContent =
    duplicate
      ? '—'
      : p?.id || '—';

  $('meta_created').textContent =
    duplicate
      ? '—'
      : fmtDate(
          p?.created_at
        );

  $('meta_updated').textContent =
    duplicate
      ? '—'
      : fmtDate(
          p?.updated_at
        );

  $('meta_submitter').textContent =
    duplicate
      ? '—'
      : p?.submitted_by_name ||
        '—';

  $('meta_submitted').textContent =
    duplicate
      ? '—'
      : fmtDate(
          p?.submitted_at
        );

  $('meta_approved').textContent =
    duplicate
      ? '—'
      : fmtDate(
          p?.approved_at
        );

  $('duplicateBtn').hidden =
    !p || duplicate;

  $('imagesNeedSave').hidden =
    !!p &&
    !duplicate;

  $('imagesPanel').hidden =
    !p ||
    duplicate;

  currentPlaceImages = [];

  renderImages();

  $('editorDialog').showModal();

  if (
    p &&
    !duplicate
  ) {

    await loadImages(
      p.id
    );
  }

  updateCounters();

  formDirty = false;

  $('dirtyNote').hidden =
    true;

  suppressDirty = false;
}


function formPayload() {

  const payload = {};

  [
    'name_ar',
    'name_ku',
    'name_en',

    'description_ar',
    'description_ku',
    'description_en',

    'category'
  ].forEach(
    f => {

      payload[f] =
        $(f)
          .value
          .trim();
    }
  );

  [
    'short_description_ar',
    'short_description_ku',
    'short_description_en',

    'best_season',
    'difficulty',

    'phone',
    'whatsapp',

    'entry_fee_text_ar',
    'entry_fee_text_ku',
    'entry_fee_text_en',

    'governorate_id',
    'district_id',
    'subdistrict_id'
  ].forEach(
    f => {

      payload[f] =
        nullable(
          $(f)
            .value
            .trim()
        );
    }
  );

  payload.visit_duration_minutes =
    numOrNull(
      $('visit_duration_minutes').value
    );

  payload.priority_score =
    Number(
      $('priority_score').value ||
      0
    );

  payload.family_friendly =
    $('family_friendly').checked;

  payload.is_active =
    $('is_active_select').value ===
    'true';

  payload.coordinates_verified =
    $('coordinates_verified').checked;

  payload.latitude =
    numOrNull(
      $('latitude').value
    );

  payload.longitude =
    numOrNull(
      $('longitude').value
    );

  return payload;
}


function validatePayload(p) {

  if (
    (p.latitude == null) !==
    (p.longitude == null)
  ) {

    return (
      'يجب إدخال Latitude و Longitude معًا.'
    );
  }

  if (
    p.latitude != null &&
    (
      p.latitude < -90 ||
      p.latitude > 90
    )
  ) {

    return (
      'قيمة Latitude يجب أن تكون بين -90 و 90.'
    );
  }

  if (
    p.longitude != null &&
    (
      p.longitude < -180 ||
      p.longitude > 180
    )
  ) {

    return (
      'قيمة Longitude يجب أن تكون بين -180 و 180.'
    );
  }

  if (
    p.coordinates_verified &&
    (
      p.latitude == null ||
      p.longitude == null
    )
  ) {

    return (
      'لا يمكن تأكيد الإحداثيات قبل إدخالها.'
    );
  }

  if (
    p.phone &&
    !/^[+0-9()\-\s]{5,40}$/.test(
      p.phone
    )
  ) {

    return (
      'صيغة رقم الهاتف غير معتادة.'
    );
  }

  if (
    p.whatsapp &&
    !/^[+0-9()\-\s]{5,40}$/.test(
      p.whatsapp
    )
  ) {

    return (
      'صيغة رقم واتساب غير معتادة.'
    );
  }

  return '';
}


async function savePlace(e) {

  e.preventDefault();

  const id =
    $('placeId').value;

  const btn =
    $('saveBtn');

  const payload =
    formPayload();

  const err =
    validatePayload(
      payload
    );

  if (err) {

    message(
      err,
      false
    );

    return;
  }

  btn.disabled =
    true;

  btn.textContent =
    'جارٍ الحفظ...';

  try {

    const r =
      await api(
        id
          ? 'update'
          : 'create',
        {
          method: 'POST',

          body: {
            id:
              id ||
              undefined,

            place:
              payload
          }
        }
      );

    message(
      id
        ? 'تم تحديث المكان بنجاح.'
        : 'تمت إضافة المكان بنجاح.'
    );

    formDirty = false;

    $('dirtyNote').hidden =
      true;

    await loadAll();

    const saved =
      data.places.find(
        x =>
          x.id === r.id
      );

    if (saved) {

      $('placeId').value =
        r.id;

      $('dialogTitle').textContent =
        'تعديل المكان';

      $('editorSubtitle').textContent =
        `ID: ${r.id}`;

      $('imagesNeedSave').hidden =
        true;

      $('imagesPanel').hidden =
        false;

      $('duplicateBtn').hidden =
        false;

      await loadImages(
        r.id
      );
    }

  } catch (ex) {

    message(
      `فشل الحفظ: ${ex.message}`,
      false,
      9000
    );

  } finally {

    btn.disabled =
      false;

    btn.textContent =
      'حفظ التغييرات';
  }
}


function confirmCloseEditor() {

  if (
    formDirty &&
    !confirm(
      'هناك تغييرات غير محفوظة. هل تريد إغلاق النافذة وفقدانها؟'
    )
  ) {

    return;
  }

  $('editorDialog').close();

  formDirty = false;
}


async function deletePlace(id) {

  const p =
    data.places.find(
      x =>
        x.id === id
    );

  if (
    !confirm(
      `سيُحذف المكان نهائيًا مع صوره وارتباطاته:

${p?.name_ar || ''}

هل أنت متأكد؟`
    )
  ) {

    return;
  }

  try {

    await api(
      'delete',
      {
        method: 'POST',
        body: {
          id
        }
      }
    );

    selected.delete(id);

    message(
      'تم حذف المكان.'
    );

    await loadAll();

  } catch (e) {

    message(
      `فشل الحذف: ${e.message}`,
      false,
      9000
    );
  }
}


async function loadImages(
  placeId
) {

  try {

    const r =
      await api(
        'images',
        {
          method: 'POST',

          body: {
            place_id:
              placeId
          }
        }
      );

    currentPlaceImages =
      r.images || [];

    renderImages();

  } catch (e) {

    message(
      `تعذر تحميل الصور: ${e.message}`,
      false
    );
  }
}


function renderImages() {

  const grid =
    $('imageGrid');

  if (
    !currentPlaceImages.length
  ) {

    grid.innerHTML =
      '<div class="empty">لا توجد صور مرفوعة لهذا المكان.</div>';

    return;
  }

  grid.innerHTML =
    currentPlaceImages
      .sort(
        (a, b) =>
          b.is_cover -
            a.is_cover ||
          (
            (a.sort_order ?? 0) -
            (b.sort_order ?? 0)
          )
      )
      .map(
        img => `

          <article class="image-card">

            <img
              src="${escapeAttr(storageUrl(img.image_path))}"
              alt=""
              loading="lazy"
            >

            <div class="image-info">

              ${
                img.is_cover
                  ? '<span class="cover-tag">صورة الغلاف</span>'
                  : ''
              }

              <small
                title="${escapeAttr(img.image_path)}"
              >
                ${escapeHtml(img.image_path)}
              </small>

              <div class="image-actions">

                ${
                  !img.is_cover
                    ? `
                      <button
                        type="button"
                        data-cover="${img.id}"
                      >
                        اجعلها غلافًا
                      </button>
                    `
                    : ''
                }

                <button
                  type="button"
                  data-up="${img.id}"
                >
                  ↑
                </button>

                <button
                  type="button"
                  data-down="${img.id}"
                >
                  ↓
                </button>

                <button
                  type="button"
                  class="danger"
                  data-img-delete="${img.id}"
                >
                  حذف
                </button>

              </div>

            </div>

          </article>
        `
      )
      .join('');
}


async function uploadFiles(
  files,
  isCover = false
) {

  const placeId =
    $('placeId').value;

  if (
    !placeId ||
    !files?.length
  ) {

    return;
  }

  const list =
    [...files];

  for (
    let i = 0;
    i < list.length;
    i++
  ) {

    const file =
      list[i];

    if (
      file.size >
      5 * 1024 * 1024
    ) {

      message(
        `الصورة ${file.name} أكبر من 5MB.`,
        false
      );

      continue;
    }

    const fd =
      new FormData();

    fd.append(
      'place_id',
      placeId
    );

    fd.append(
      'kind',
      isCover &&
      i === 0
        ? 'cover'
        : 'gallery'
    );

    fd.append(
      'file',
      file
    );

    try {

      message(
        `جارٍ رفع ${file.name}...`,
        true,
        20000
      );

      await api(
        'upload-image',
        {
          method: 'POST',
          body: fd
        }
      );

    } catch (e) {

      message(
        `فشل رفع ${file.name}: ${e.message}`,
        false,
        9000
      );
    }
  }

  $('coverFile').value =
    '';

  $('galleryFiles').value =
    '';

  await loadImages(
    placeId
  );

  await loadAll();

  message(
    'اكتمل رفع الصور.'
  );
}


async function imageAction(
  action,
  id
) {

  try {

    await api(
      action,
      {
        method: 'POST',

        body: {
          place_id:
            $('placeId').value,

          image_id:
            id
        }
      }
    );

    await loadImages(
      $('placeId').value
    );

    await loadAll();

    message(
      'تم تحديث الصور.'
    );

  } catch (e) {

    message(
      `فشلت العملية: ${e.message}`,
      false
    );
  }
}


async function moveImage(
  id,
  dir
) {

  const ids =
    currentPlaceImages
      .filter(
        x =>
          !x.is_cover
      )
      .sort(
        (a, b) =>
          (a.sort_order ?? 0) -
          (b.sort_order ?? 0)
      );

  const idx =
    ids.findIndex(
      x =>
        x.id === id
    );

  const j =
    idx + dir;

  if (
    idx < 0 ||
    j < 0 ||
    j >= ids.length
  ) {

    return;
  }

  try {

    await api(
      'reorder-images',
      {
        method: 'POST',

        body: {
          place_id:
            $('placeId').value,

          ordered_ids:
            ids
              .map(
                x =>
                  x.id
              )
              .map(
                (
                  x,
                  k,
                  a
                ) =>
                  k === idx
                    ? a[j]
                    : k === j
                      ? a[idx]
                      : x
              )
        }
      }
    );

    await loadImages(
      $('placeId').value
    );

  } catch (e) {

    message(
      `فشل الترتيب: ${e.message}`,
      false
    );
  }
}


async function bulkStatus(
  active
) {

  if (!selected.size) {
    return;
  }

  try {

    await api(
      'bulk-status',
      {
        method: 'POST',

        body: {
          ids:
            [...selected],

          is_active:
            active
        }
      }
    );

    message(
      active
        ? 'تم تفعيل العناصر المحددة.'
        : 'تم إخفاء العناصر المحددة.'
    );

    selected.clear();

    await loadAll();

  } catch (e) {

    message(
      `فشلت العملية: ${e.message}`,
      false
    );
  }
}


async function bulkDelete() {

  if (!selected.size) {
    return;
  }

  const names =
    data.places
      .filter(
        p =>
          selected.has(p.id)
      )
      .slice(
        0,
        8
      )
      .map(
        p =>
          p.name_ar
      )
      .join('، ');

  if (
    !confirm(
      `سيتم حذف ${selected.size} مكان نهائيًا مع الصور والارتباطات.

${names}${selected.size > 8 ? '...' : ''}

هل أنت متأكد؟`
    )
  ) {

    return;
  }

  try {

    const r =
      await api(
        'bulk-delete',
        {
          method: 'POST',

          body: {
            ids:
              [...selected]
          }
        }
      );

    message(
      `تم حذف ${
        r.deleted ||
        selected.size
      } مكان.`
    );

    selected.clear();

    await loadAll();

  } catch (e) {

    message(
      `فشل الحذف الجماعي: ${e.message}`,
      false,
      9000
    );
  }
}


function csvEscape(v) {

  const s =
    v == null
      ? ''
      : String(v);

  return /[",\n]/.test(s)
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}


function exportCsv(
  rows,
  filename = 'duhok_places.csv'
) {

  const cols = [
    'id',
    'name_ar',
    'name_ku',
    'name_en',

    'category',

    'governorate',
    'district',
    'subdistrict',

    'short_description_ar',
    'short_description_ku',
    'short_description_en',

    'description_ar',
    'description_ku',
    'description_en',

    'best_season',
    'difficulty',

    'visit_duration_minutes',
    'family_friendly',

    'entry_fee_text_ar',
    'entry_fee_text_ku',
    'entry_fee_text_en',

    'phone',
    'whatsapp',

    'priority_score',
    'is_active',

    'latitude',
    'longitude',

    'coordinates_verified',

    'image_path',

    'created_at',
    'updated_at'
  ];

  const lines = [
    cols.join(',')
  ];

  for (
    const p of rows
  ) {

    const obj = {
      ...p,

      governorate:
        governorateName(
          p.governorate_id
        ),

      district:
        districtName(
          p.district_id
        ),

      subdistrict:
        subdistrictName(
          p.subdistrict_id
        )
    };

    lines.push(
      cols
        .map(
          c =>
            csvEscape(
              obj[c]
            )
        )
        .join(',')
    );
  }

  downloadBlob(
    '\ufeff' +
    lines.join('\n'),

    filename,

    'text/csv;charset=utf-8'
  );
}


function downloadBlob(
  content,
  name,
  type
) {

  const blob =
    new Blob(
      [content],
      {
        type
      }
    );

  const a =
    document.createElement(
      'a'
    );

  a.href =
    URL.createObjectURL(
      blob
    );

  a.download =
    name;

  document.body.appendChild(
    a
  );

  a.click();

  setTimeout(
    () => {

      URL.revokeObjectURL(
        a.href
      );

      a.remove();
    },
    500
  );
}


function backupJson() {

  const safe = {

    exported_at:
      new Date()
        .toISOString(),

    places:
      data.places,

    governorates:
      data.governorates,

    districts:
      data.districts,

    subdistricts:
      data.subdistricts,

    place_images:
      data.images || []
  };

  downloadBlob(
    JSON.stringify(
      safe,
      null,
      2
    ),

    `duhok-guide-backup-${
      new Date()
        .toISOString()
        .slice(
          0,
          10
        )
    }.json`,

    'application/json'
  );
}


function fillGeoDistrictFilter() {

  const gid =
    $('geoGovFilter').value ||
    data.governorates[0]?.id ||
    '';

  const opts =
    data.districts.filter(
      d =>
        d.governorate_id === gid
    );

  $('geoDistFilter').innerHTML =
    '<option value="">— اختر القضاء —</option>' +
    opts
      .map(
        d =>
          `<option value="${d.id}">
            ${escapeHtml(d.name_ar)}
          </option>`
      )
      .join('');

  if (
    !$('geoDistFilter').value &&
    opts[0]
  ) {

    $('geoDistFilter').value =
      opts[0].id;
  }
}


function renderGeo() {

  if (!$('govList')) {
    return;
  }

  const gid =
    $('geoGovFilter').value ||
    data.governorates[0]?.id ||
    '';

  const did =
    $('geoDistFilter').value ||
    '';

  $('govList').innerHTML =
    data.governorates
      .map(
        x =>
          unitRow(
            'governorate',
            x
          )
      )
      .join('');

  $('distList').innerHTML =
    data.districts
      .filter(
        x =>
          x.governorate_id === gid
      )
      .map(
        x =>
          unitRow(
            'district',
            x
          )
      )
      .join('') ||
    '<div class="empty">لا توجد أقضية.</div>';

  $('subdistList').innerHTML =
    data.subdistricts
      .filter(
        x =>
          x.district_id === did
      )
      .map(
        x =>
          unitRow(
            'subdistrict',
            x
          )
      )
      .join('') ||
    '<div class="empty">لا توجد نواحٍ.</div>';
}


function unitRow(
  type,
  x
) {

  return `

    <div class="unit-row">

      <div>

        <b>
          ${escapeHtml(x.name_ar)}
        </b>

        <small>
          ${escapeHtml(x.name_en || '')}
        </small>

      </div>

      <div class="unit-actions">

        <button
          data-unit-edit="${type}:${x.id}"
        >
          تعديل
        </button>

        <button
          class="danger"
          data-unit-delete="${type}:${x.id}"
        >
          حذف
        </button>

      </div>

    </div>
  `;
}


function openUnit(
  type,
  item = null
) {

  $('unitForm').reset();

  $('unitType').value =
    type;

  $('unitId').value =
    item?.id || '';

  $('unitTitle').textContent =
    `${item ? 'تعديل' : 'إضافة'} ${
      type === 'governorate'
        ? 'محافظة'
        : type === 'district'
          ? 'قضاء'
          : 'ناحية'
    }`;

  $('unitNameAr').value =
    item?.name_ar || '';

  $('unitNameKu').value =
    item?.name_ku || '';

  $('unitNameEn').value =
    item?.name_en || '';

  const parent =
    $('unitParent');

  const pl =
    $('unitParentLabel');

  if (
    type === 'governorate'
  ) {

    pl.hidden =
      true;

  } else if (
    type === 'district'
  ) {

    pl.hidden =
      false;

    parent.innerHTML =
      data.governorates
        .map(
          g =>
            `<option value="${g.id}">
              ${escapeHtml(g.name_ar)}
            </option>`
        )
        .join('');

    parent.value =
      item?.governorate_id ||
      $('geoGovFilter').value ||
      data.governorates[0]?.id ||
      '';

  } else {

    pl.hidden =
      false;

    parent.innerHTML =
      data.districts
        .map(
          d =>
            `<option value="${d.id}">
              ${escapeHtml(d.name_ar)}
            </option>`
        )
        .join('');

    parent.value =
      item?.district_id ||
      $('geoDistFilter').value ||
      data.districts[0]?.id ||
      '';
  }

  $('unitDialog').showModal();
}


async function saveUnit(e) {

  e.preventDefault();

  const type =
    $('unitType').value;

  const id =
    $('unitId').value;

  const payload = {

    type,

    id:
      id || undefined,

    name_ar:
      $('unitNameAr')
        .value
        .trim(),

    name_ku:
      $('unitNameKu')
        .value
        .trim(),

    name_en:
      $('unitNameEn')
        .value
        .trim(),

    parent_id:
      type === 'governorate'
        ? null
        : $('unitParent').value
  };

  try {

    await api(
      id
        ? 'unit-update'
        : 'unit-create',
      {
        method: 'POST',
        body: payload
      }
    );

    $('unitDialog').close();

    await loadAll();

    message(
      'تم حفظ المنطقة الإدارية.'
    );

  } catch (e) {

    message(
      `فشل الحفظ: ${e.message}`,
      false,
      9000
    );
  }
}


async function deleteUnit(
  type,
  id
) {

  const item =
    (
      type === 'governorate'
        ? data.governorates
        : type === 'district'
          ? data.districts
          : data.subdistricts
    ).find(
      x =>
        x.id === id
    );

  if (
    !confirm(
      `حذف ${item?.name_ar || ''}؟

لن يسمح النظام بالحذف إذا كانت هناك أماكن أو مناطق مرتبطة به.`
    )
  ) {

    return;
  }

  try {

    await api(
      'unit-delete',
      {
        method: 'POST',

        body: {
          type,
          id
        }
      }
    );

    await loadAll();

    message(
      'تم حذف المنطقة الإدارية.'
    );

  } catch (e) {

    message(
      `تعذر الحذف: ${e.message}`,
      false,
      9000
    );
  }
}


/*
  ===========================
  الأحداث
  ===========================
*/


$('addBtn').onclick =
  () =>
    openEditor();


$('refreshBtn').onclick =
  () =>
    loadAll(true);


[
  'searchInput',
  'districtFilter',
  'categoryFilter',
  'activeFilter',
  'sortFilter'
].forEach(
  id => {

    $(id).addEventListener(
      id === 'searchInput'
        ? 'input'
        : 'change',
      render
    );
  }
);


$('clearFiltersBtn').onclick =
  clearFilters;


$('placesBody').onclick =
  e => {

    const t =
      e.target;

    if (
      t.dataset.select
    ) {

      if (t.checked) {

        selected.add(
          t.dataset.select
        );

      } else {

        selected.delete(
          t.dataset.select
        );
      }

      render();

      return;
    }

    const edit =
      t.dataset.edit;

    const dup =
      t.dataset.duplicate;

    const del =
      t.dataset.delete;

    if (edit) {

      openEditor(
        data.places.find(
          p =>
            p.id === edit
        )
      );
    }

    if (dup) {

      openEditor(
        data.places.find(
          p =>
            p.id === dup
        ),
        true
      );
    }

    if (del) {

      deletePlace(
        del
      );
    }
  };


$('selectAll').onchange =
  e => {

    currentFiltered.forEach(
      p => {

        if (
          e.target.checked
        ) {

          selected.add(
            p.id
          );

        } else {

          selected.delete(
            p.id
          );
        }
      }
    );

    render();
  };


$('clearSelectionBtn').onclick =
  () => {

    selected.clear();

    render();
  };


$('bulkActivateBtn').onclick =
  () =>
    bulkStatus(true);


$('bulkHideBtn').onclick =
  () =>
    bulkStatus(false);


$('bulkDeleteBtn').onclick =
  bulkDelete;


$('bulkExportBtn').onclick =
  () =>
    exportCsv(
      data.places.filter(
        p =>
          selected.has(p.id)
      ),
      `duhok-selected-${selected.size}.csv`
    );


$('closeBtn').onclick =
  confirmCloseEditor;


$('cancelBtn').onclick =
  confirmCloseEditor;


$('placeForm').addEventListener(
  'submit',
  savePlace
);


$('duplicateBtn').onclick =
  () => {

    const p =
      data.places.find(
        x =>
          x.id ===
          $('placeId').value
      );

    if (p) {

      $('editorDialog').close();

      openEditor(
        p,
        true
      );
    }
  };


$('placeForm').addEventListener(
  'input',
  e => {

    setDirty();

    if (
      e.target.matches(
        'textarea[maxlength]'
      )
    ) {

      updateCounters();
    }
  }
);


$('placeForm').addEventListener(
  'change',
  () =>
    setDirty()
);


$('governorate_id').onchange =
  e => {

    fillDistricts(
      e.target.value
    );

    fillSubdistricts('');
  };


$('district_id').onchange =
  e =>
    fillSubdistricts(
      e.target.value
    );


/*
  عند لصق الإحداثيات من Google Maps
  يتم تحليلها تلقائيًا
*/

$('coordinatesPaste').addEventListener(
  'paste',
  () => {

    setTimeout(
      () =>
        parsePastedCoordinates({
          silent: false
        }),
      0
    );
  }
);


$('coordinatesPaste').addEventListener(
  'change',
  () =>
    parsePastedCoordinates({
      silent: false
    })
);


$('coordinatesPaste').addEventListener(
  'keydown',
  e => {

    if (
      e.key === 'Enter'
    ) {

      e.preventDefault();

      parsePastedCoordinates({
        silent: false
      });
    }
  }
);


const syncManualCoordinates =
  () => {

    const a =
      numOrNull(
        $('latitude').value
      );

    const b =
      numOrNull(
        $('longitude').value
      );

    if (
      a != null &&
      b != null &&
      a >= -90 &&
      a <= 90 &&
      b >= -180 &&
      b <= 180
    ) {

      $('coordinatesPaste').value =
        `${a}, ${b}`;
    }

    setDirty();
  };


$('latitude').addEventListener(
  'change',
  syncManualCoordinates
);


$('longitude').addEventListener(
  'change',
  syncManualCoordinates
);


$('clearCoordsBtn').onclick =
  clearCoordinates;


$('copyCoordsBtn').onclick =
  copyCoordinates;


$('openMapsBtn').onclick =
  () => {

    const a =
      $('latitude').value;

    const b =
      $('longitude').value;

    if (
      !a ||
      !b
    ) {

      message(
        'أدخل الإحداثيات أولًا.',
        false
      );

      return;
    }

    window.open(
      `https://www.google.com/maps?q=${encodeURIComponent(a)},${encodeURIComponent(b)}`,
      '_blank',
      'noopener'
    );
  };


$('coverFile').onchange =
  e =>
    uploadFiles(
      e.target.files,
      true
    );


$('galleryFiles').onchange =
  e =>
    uploadFiles(
      e.target.files,
      false
    );


$('imageGrid').onclick =
  e => {

    const t =
      e.target;

    if (
      t.dataset.cover
    ) {

      imageAction(
        'set-cover',
        t.dataset.cover
      );
    }

    if (
      t.dataset.imgDelete &&
      confirm(
        'حذف هذه الصورة نهائيًا؟'
      )
    ) {

      imageAction(
        'delete-image',
        t.dataset.imgDelete
      );
    }

    if (
      t.dataset.up
    ) {

      moveImage(
        t.dataset.up,
        -1
      );
    }

    if (
      t.dataset.down
    ) {

      moveImage(
        t.dataset.down,
        1
      );
    }
  };


$('geoBtn').onclick =
  () => {

    $('geoDialog').showModal();

    fillGeoDistrictFilter();

    renderGeo();
  };


$('geoCloseBtn').onclick =
  () =>
    $('geoDialog').close();


$('geoGovFilter').onchange =
  () => {

    fillGeoDistrictFilter();

    renderGeo();
  };


$('geoDistFilter').onchange =
  renderGeo;


$('geoDialog').onclick =
  e => {

    if (
      e.target.dataset.unitAdd
    ) {

      openUnit(
        e.target.dataset.unitAdd
      );
    }

    if (
      e.target.dataset.unitEdit
    ) {

      const [
        type,
        id
      ] =
        e.target.dataset.unitEdit.split(
          ':'
        );

      const arr =
        type === 'governorate'
          ? data.governorates
          : type === 'district'
            ? data.districts
            : data.subdistricts;

      openUnit(
        type,
        arr.find(
          x =>
            x.id === id
        )
      );
    }

    if (
      e.target.dataset.unitDelete
    ) {

      const [
        type,
        id
      ] =
        e.target.dataset.unitDelete.split(
          ':'
        );

      deleteUnit(
        type,
        id
      );
    }
  };


$('unitForm').onsubmit =
  saveUnit;


$('unitCloseBtn').onclick =
  () =>
    $('unitDialog').close();


$('unitCancelBtn').onclick =
  () =>
    $('unitDialog').close();


$('backupBtn').onclick =
  backupJson;


$('settingsBtn').onclick =
  () =>
    $('settingsDialog').showModal();


$('settingsCloseBtn').onclick =
  () =>
    $('settingsDialog').close();


$('forgetSecretBtn').onclick =
  () => {

    if (
      confirm(
        'سيتم مسح مفتاح الإدارة من هذا المتصفح وستحتاج لإدخاله مرة أخرى.'
      )
    ) {

      localStorage.removeItem(
        'duhok_admin_secret'
      );

      secret = '';

      $('settingsDialog').close();

      $('secretDialog').showModal();
    }
  };


$('secretForm').onsubmit =
  e => {

    e.preventDefault();

    secret =
      $('secretInput')
        .value
        .trim();

    localStorage.setItem(
      'duhok_admin_secret',
      secret
    );

    $('secretDialog').close();

    loadAll();
  };


window.addEventListener(
  'beforeunload',
  e => {

    if (formDirty) {

      e.preventDefault();

      e.returnValue = '';
    }
  }
);


if (!secret) {

  $('secretDialog').showModal();

} else {

  loadAll();
}