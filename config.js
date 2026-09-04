window.DUHOK_ADMIN_CONFIG = {
  projectRef: "dqmkfguuffqxlbvnjmob",
  functionName: "admin-api",
  storageBucket: "place-images"
};

/*
  Shared completion tracking for the admin table.
  The checkbox state is stored in a separate admin-only Supabase table through
  the protected admin Edge Function. It is NOT a field in public.places.

  localStorage is kept only as a temporary resilience/migration cache. Once the
  backend endpoint is available, the server state is authoritative and works
  across different computers and browsers.
*/
(() => {
  const STORAGE_KEY = 'duhok_admin_completed_places_v1';

  function loadLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return new Set(Array.isArray(saved) ? saved : []);
    } catch {
      return new Set();
    }
  }

  const completed = loadLocal();
  let remoteReady = false;
  let migrationDone = false;

  function saveLocal() {
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
      .completion-check[data-saving="true"] {
        opacity: .55;
      }
    `;
    document.head.appendChild(style);
  }

  function installHeader() {
    const headerRow = document.querySelector('.table-wrap table thead tr');
    if (!headerRow) return;

    const currentHeaders = [...headerRow.children];
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

  function refreshVisibleChecks() {
    document.querySelectorAll('input[data-completion-id]').forEach(checkbox => {
      checkbox.checked = completed.has(checkbox.dataset.completionId);
      checkbox.title = checkbox.checked
        ? 'بيانات هذا المعلم مكتملة'
        : 'حدد عند اكتمال بيانات هذا المعلم';
    });
  }

  function decorateRows() {
    const body = document.getElementById('placesBody');
    if (!body) return;
    [...body.rows].forEach(installRow);
    refreshVisibleChecks();
  }

  async function fetchRemoteState() {
    if (typeof api !== 'function') return;

    try {
      const localBeforeSync = [...completed];
      const result = await api('completion-list');
      const serverCompleted = new Set(
        (result.items || [])
          .filter(x => x && x.is_complete)
          .map(x => String(x.place_id))
      );

      completed.clear();
      serverCompleted.forEach(id => completed.add(id));
      remoteReady = true;

      // One-time migration of any checks made with the previous local-only
      // version. Server data remains authoritative, but missing local checks
      // are promoted so existing work is not lost.
      if (!migrationDone && localBeforeSync.length) {
        migrationDone = true;
        for (const placeId of localBeforeSync) {
          if (completed.has(placeId)) continue;
          try {
            await api('set-completion', {
              method: 'POST',
              body: { place_id: placeId, is_complete: true }
            });
            completed.add(placeId);
          } catch {
            // Keep going; the user can retry naturally by toggling the box.
          }
        }
      }

      saveLocal();
      refreshVisibleChecks();
    } catch {
      remoteReady = false;
      // Keep the locally cached state visible until the backend is ready.
    }
  }

  async function persistCompletion(checkbox) {
    const placeId = checkbox.dataset.completionId;
    const desired = checkbox.checked;

    if (desired) completed.add(placeId);
    else completed.delete(placeId);

    saveLocal();
    checkbox.title = desired
      ? 'بيانات هذا المعلم مكتملة'
      : 'حدد عند اكتمال بيانات هذا المعلم';

    if (typeof api !== 'function') return;

    checkbox.dataset.saving = 'true';
    checkbox.disabled = true;

    try {
      await api('set-completion', {
        method: 'POST',
        body: {
          place_id: placeId,
          is_complete: desired
        }
      });
      remoteReady = true;
    } catch (e) {
      remoteReady = false;
      if (typeof message === 'function') {
        message(
          `تم حفظ العلامة مؤقتًا على هذا الجهاز، لكن تعذر مزامنتها بين الأجهزة: ${e.message}`,
          false,
          8000
        );
      }
    } finally {
      checkbox.disabled = false;
      delete checkbox.dataset.saving;
    }
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
      persistCompletion(checkbox);
    });

    new MutationObserver(() => {
      installHeader();
      decorateRows();
    }).observe(body, { childList: true });

    fetchRemoteState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompletionStatus);
  } else {
    initCompletionStatus();
  }
})();
