window.DUHOK_ADMIN_CONFIG = {
  projectRef: "dqmkfguuffqxlbvnjmob",
  functionName: "admin-api",
  storageBucket: "place-images"
};

/*
  Local-only completion tracking for the admin table.
  This is intentionally NOT connected to Supabase/place data.
  It only helps the editor mark places whose data entry is complete.
*/
(() => {
  const STORAGE_KEY = 'duhok_admin_completed_places_v1';

  function loadCompleted() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return new Set(Array.isArray(saved) ? saved : []);
    } catch {
      return new Set();
    }
  }

  const completed = loadCompleted();

  function saveCompleted() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]));
  }

  function installStyles() {
    if (document.getElementById('completion-status-styles')) return;

    const style = document.createElement('style');
    style.id = 'completion-status-styles';
    style.textContent = `
      .completion-col {
        width: 74px;
        min-width: 74px;
        text-align: center !important;
      }
      .completion-check {
        width: 21px;
        height: 21px;
        margin: 0;
        padding: 0;
        cursor: pointer;
        accent-color: #14734f;
        vertical-align: middle;
      }
    `;
    document.head.appendChild(style);
  }

  function installHeader() {
    const headerRow = document.querySelector('.table-wrap table thead tr');
    if (!headerRow) return;

    const currentHeaders = [...headerRow.children];

    // The existing status column means active/hidden; clarify its meaning.
    const oldStatusHeader = currentHeaders.find(
      th => th.textContent.trim() === 'الحالة'
    );
    if (oldStatusHeader && !oldStatusHeader.classList.contains('completion-col')) {
      oldStatusHeader.textContent = 'الظهور';
    }

    if (headerRow.querySelector('th.completion-col')) return;

    const landmarkHeader = [...headerRow.children].find(
      th => th.textContent.trim() === 'المعلم'
    );
    if (!landmarkHeader) return;

    const th = document.createElement('th');
    th.className = 'completion-col';
    th.textContent = 'الحالة';
    th.title = 'ضع علامة صح عند اكتمال إدخال بيانات المعلم';

    landmarkHeader.insertAdjacentElement('afterend', th);
  }

  function installRow(row) {
    if (!row || row.querySelector('td.completion-col')) return;

    const placeSelector = row.querySelector('input[data-select]');
    const placeId = placeSelector?.dataset.select;
    if (!placeId) return;

    const landmarkCell = row.children[2];
    if (!landmarkCell) return;

    const td = document.createElement('td');
    td.className = 'completion-col';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'completion-check';
    checkbox.dataset.completionId = placeId;
    checkbox.checked = completed.has(placeId);
    checkbox.setAttribute('aria-label', 'تم إنجاز بيانات هذا المعلم');
    checkbox.title = checkbox.checked
      ? 'بيانات هذا المعلم مكتملة'
      : 'حدد عند اكتمال بيانات هذا المعلم';

    td.appendChild(checkbox);
    landmarkCell.insertAdjacentElement('afterend', td);
  }

  function decorateRows() {
    const body = document.getElementById('placesBody');
    if (!body) return;
    [...body.rows].forEach(installRow);
  }

  function initCompletionStatus() {
    installStyles();
    installHeader();
    decorateRows();

    const body = document.getElementById('placesBody');
    if (!body) return;

    body.addEventListener('change', event => {
      const checkbox = event.target.closest('input[data-completion-id]');
      if (!checkbox) return;

      const placeId = checkbox.dataset.completionId;
      if (checkbox.checked) {
        completed.add(placeId);
        checkbox.title = 'بيانات هذا المعلم مكتملة';
      } else {
        completed.delete(placeId);
        checkbox.title = 'حدد عند اكتمال بيانات هذا المعلم';
      }

      saveCompleted();
    });

    new MutationObserver(() => {
      installHeader();
      decorateRows();
    }).observe(body, { childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompletionStatus);
  } else {
    initCompletionStatus();
  }
})();
