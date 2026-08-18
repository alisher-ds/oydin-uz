/**
 * Makon sahifasining kirish nuqtasi — barcha qatlamlarni bir-biriga ulaydi.
 *
 * MUHIM: element havolalari faqat SHU YERDA, `querySelector` orqali olinadi va
 * qatlamlarga argument sifatida uzatiladi. Ilgari ular blok ichida `const`
 * bilan e'lon qilinib, boshqa bloklardan ishlatilardi — natijada
 * `layer is not defined` xatosi modul bajarilishini to'xtatib, uchta
 * funksiyani birdan o'ldirgan edi.
 */

import { $, $$, EVENTS, hasOpenDialog, isTypingTarget, on } from '../core/index.js';
import { initTheme } from '../core/theme.js';
import { createCamera } from './camera.js';
import { createCardLayer } from './cards.js';
import { createConnectionLayer } from './connections.js';
import { createDialogs } from './dialogs.js';
import { createThinkingLayer } from './thinking.js';
import { createTools } from './tools.js';
import { autoLayout, fitToView } from './geometry.js';
import {
  SPACES,
  activeMap,
  activeMapId,
  addCard,
  allMaps,
  applyPositions,
  cards,
  connect,
  connections,
  createMap,
  deleteMap,
  disconnect,
  findCard,
  loadState,
  mergeRemote,
  moveCardTo,
  persist,
  relationFor,
  removeCard,
  renameMap,
  setSpace,
  setTitle,
  switchMap,
  undo,
  updateCard
} from './state.js';

export function initMapPage() {
  const workspace = $('#workspace');
  const canvas = $('#canvas');
  const layer = $('#connections');
  if (!workspace || !canvas || !layer) return null;

  initTheme();
  loadState();

  let connectingFrom = null;
  let selectedConnection = null;
  let statusTimer = 0;

  /* --------------------------------- holat --------------------------------- */

  function setStatus(text, tone = 'ok') {
    const node = $('#saveStatus');
    if (!node) return;
    node.textContent = text;
    node.dataset.tone = tone;
    clearTimeout(statusTimer);
    if (tone === 'ok') {
      statusTimer = setTimeout(() => {
        node.textContent = 'saqlandi';
        node.dataset.tone = 'ok';
      }, 2200);
    }
  }

  /**
   * Holatni saqlaydi va NATIJANI KO'RSATADI.
   * Ilgari `persist()` himoyasiz edi: kvota tugasa istisno otilib, foydalanuvchi
   * hech narsa ko'rmasdan o'zgarishini yo'qotardi.
   */
  function save() {
    const result = persist();
    if (result.ok) {
      setStatus('saqlandi');
      return true;
    }
    setStatus(
      result.reason === 'quota'
        ? 'saqlanmadi — xotira to‘lgan, eski makonlarni eksport qilib o‘chiring'
        : 'saqlanmadi — brauzer xotirasi ishlamayapti',
      'error'
    );
    return false;
  }

  /* ------------------------------- qatlamlar ------------------------------- */

  const camera = createCamera({ workspace, canvas, layer });

  const cardLayer = createCardLayer({
    canvas,
    camera,
    handlers: {
      isConnecting: () => connectingFrom != null,
      onConnectTarget: id => finishConnection(id),
      onSelectCard: () => selectConnection(null),
      onMove: (id, x, y) => {
        moveCardTo(id, x, y);
        connectionLayer.updatePaths();
      },
      onMoveCommit: () => save(),
      onAction: (action, id) => runCardAction(action, id),
      onDetail: id => dialogs.openDetail(findCard(id)),
      onEdit: id => dialogs.openCard({ card: findCard(id) }),
      onDelete: id => removeCardById(id),
      onLink: id => toggleConnecting(id),
      onFocusCard: id => {
        thinking.focusCard(id);
        render();
      }
    }
  });

  const connectionLayer = createConnectionLayer({
    layer,
    getCardRect: id => cardLayer.rectOf(id, findCard(id)),
    getCardText: id => findCard(id)?.text ?? '',
    getRelationLabel: id => relationFor(id)?.label ?? '',
    onSelect: id => selectConnection(selectedConnection === String(id) ? null : String(id)),
    onDelete: id => removeConnection(id)
  });

  const thinking = createThinkingLayer({
    workspace,
    handlers: {
      onViewChanged: () => render(),
      onDeselect: () => selectConnection(null),
      onRelationChanged: () => {
        save();
        connectionLayer.updatePaths();
      },
      onDeleteConnection: id => removeConnection(id)
    }
  });

  const dialogs = createDialogs({
    handlers: {
      onSubmitCard: ({ id, parentId, text, type }) => {
        if (id) updateCard(id, { text, type });
        else addCard({ text, type, parentId, viewportWidth: workspace.clientWidth });
        save();
        render();
      },
      onSaveDetail: (id, detail) => {
        updateCard(id, { detail });
        save();
        render();
      },
      onOpenMap: id => {
        if (switchMap(id)) {
          save();
          loadMap();
        }
      },
      onCreateMap: () => {
        createMap();
        save();
        loadMap();
      },
      onRenameMap: async (id, title) => {
        const next = await dialogs.promptText({
          title: 'Makon nomi',
          label: 'Yangi nom',
          value: title
        });
        if (next) {
          renameMap(id, next);
          save();
          if (id === activeMapId()) $('#mapTitle').value = next;
          dialogs.renderMaps(allMaps(), activeMapId());
        }
      },
      onDeleteMap: async (id, title) => {
        if (allMaps().length === 1) {
          await dialogs.confirmAction({
            title: 'Oxirgi makon',
            message: 'Bu yagona makon — uni o‘chirib bo‘lmaydi. Avval yangi makon yarating.',
            confirmLabel: 'Tushundim'
          });
          return;
        }
        const confirmed = await dialogs.confirmAction({
          title: 'Makonni o‘chirish',
          message: `“${title}” ichidagi barcha fikrlar va aloqalar o‘chadi. Bu amalni Ctrl+Z bilan qaytarish mumkin.`,
          confirmLabel: 'Ha, o‘chirilsin',
          tone: 'danger'
        });
        if (!confirmed) return;
        if (deleteMap(id)) {
          save();
          loadMap();
          dialogs.renderMaps(allMaps(), activeMapId());
        }
      },
      onOpenNote: id => dialogs.openDetail(findCard(id))
    }
  });

  const tools = createTools({
    handlers: {
      onUndo: () => {
        if (undo()) {
          setStatus('bekor qilindi');
          loadMap();
        }
      },
      onReveal: id => {
        cardLayer.flash(id);
        cardLayer.focus(id);
      },
      onImport: async maps => {
        const confirmed = await dialogs.confirmAction({
          title: 'Fayldan yuklash',
          message: `${maps.length} ta makon qo‘shiladi. Bir xil nomdagi makonlar yangisi bilan almashtiriladi.`,
          confirmLabel: 'Yuklash'
        });
        if (!confirmed) return;
        mergeRemote(maps);
        loadMap();
        setStatus('yuklandi');
      },
      onImportError: message => {
        dialogs.confirmAction({ title: 'Fayl o‘qilmadi', message, confirmLabel: 'Yopish' });
      }
    }
  });

  /* -------------------------------- amallar -------------------------------- */

  function runCardAction(action, id) {
    switch (action) {
      case 'add-child':
        dialogs.openCard({ parent: id });
        break;
      case 'detail':
        dialogs.openDetail(findCard(id));
        break;
      case 'edit':
        dialogs.openCard({ card: findCard(id) });
        break;
      case 'focus':
        thinking.focusCard(id);
        render();
        break;
      case 'link':
        toggleConnecting(id);
        break;
      case 'delete':
        removeCardById(id);
        break;
      default:
        break;
    }
  }

  async function removeCardById(id) {
    const card = findCard(id);
    if (!card) return;
    const confirmed = await dialogs.confirmAction({
      title: 'Fikrni o‘chirish',
      message: card.text ? `“${card.text.slice(0, 90)}” o‘chiriladi.` : 'Bu fikr o‘chiriladi.',
      confirmLabel: 'O‘chirish',
      tone: 'danger'
    });
    if (!confirmed) return;
    removeCard(id);
    if (connectingFrom === String(id)) connectingFrom = null;
    save();
    render();
  }

  function toggleConnecting(id) {
    connectingFrom = connectingFrom === String(id) ? null : String(id);
    selectConnection(null);
    render();
  }

  function finishConnection(targetId) {
    if (!connectingFrom) return;
    const edge = connect(connectingFrom, targetId);
    connectingFrom = null;
    if (edge) save();
    render();
  }

  function selectConnection(id) {
    selectedConnection = id == null ? null : String(id);
    connectionLayer.setSelected(selectedConnection);
    if (selectedConnection) thinking.openRelationPanel(selectedConnection);
    else thinking.closePanel();
    paintFlowPanel();
  }

  function removeConnection(id) {
    disconnect(id);
    if (selectedConnection === String(id)) selectConnection(null);
    save();
    render();
  }

  /* --------------------------------- chizish -------------------------------- */

  function paintFlowPanel() {
    const text = $('#flowText');
    const action = $('#flowAction');
    if (!text || !action) return;

    if (connectingFrom) {
      text.textContent = 'Aloqa rejimi: endi boshqa fikrni bosing. Esc bilan chiqasiz.';
      action.textContent = 'Bekor qilish';
    } else if (selectedConnection) {
      text.textContent = 'Aloqa tanlangan. Turini belgilang yoki uzing.';
      action.textContent = 'Aloqani uzish';
    } else {
      text.textContent = cards().length
        ? 'Har bir fikrning ichidan davom eting — tartib sizniki.'
        : 'Fikr kelgan joyidan boshlang.';
      action.textContent = '+ Fikr';
    }
  }

  function render() {
    const list = cards();
    const view = thinking.focusView();

    cardLayer.render(list, { connectingFrom, ...view });
    connectionLayer.resize(canvas.clientWidth, canvas.clientHeight);
    connectionLayer.render(connections());

    $('#count').textContent = String(list.length);
    $('#connectionCount').textContent = String(connections().length);
    const empty = $('#emptyState');
    if (empty) empty.style.display = list.length ? 'none' : 'grid';

    dialogs.renderNotes(list);
    paintFlowPanel();
  }

  function paintSpace(name) {
    const key = Object.hasOwn(SPACES, name) ? name : 'paper';
    workspace.className = `workspace ${SPACES[key].class}`;
    workspace.dataset.space = key;
    $('#spaceName').textContent = SPACES[key].name;
    for (const swatch of $$('.swatch')) {
      const active = swatch.dataset.space === key;
      swatch.classList.toggle('active', active);
      swatch.setAttribute('aria-pressed', String(active));
    }
  }

  function loadMap() {
    const map = activeMap();
    if (!map) return;
    $('#mapTitle').value = map.title;
    paintSpace(map.space);
    connectingFrom = null;
    selectConnection(null);
    thinking.clearFocus();
    render();
    requestAnimationFrame(() => connectionLayer.updatePaths());
  }

  /* -------------------------- ekranga sig'dirish ---------------------------- */

  /**
   * Faqat KAMERANI sozlaydi — kartalar joyida qoladi.
   * Ilgari "Joylash" tugmasi barcha kartalarni qayta joylashtirib, foydalanuvchi
   * qo'lda tuzgan manzarasini yo'q qilardi.
   */
  function fitView() {
    const rects = cards()
      .map(card => cardLayer.rectOf(card.id, card))
      .filter(Boolean);
    if (!rects.length) {
      camera.setView({ zoom: 1, panX: 0, panY: 0 });
      return;
    }
    camera.setView(
      fitToView(rects, { width: workspace.clientWidth, height: workspace.clientHeight })
    );
  }

  /** Kartalarni daraxt shaklida qayta joylashtiradi — TASDIQ so'rab. */
  async function runAutoLayout() {
    if (!cards().length) return;
    const confirmed = await dialogs.confirmAction({
      title: 'Avtomatik joylash',
      message:
        'Barcha kartalar aloqalar bo‘yicha qaytadan joylashtiriladi. Hozirgi joylashuvingiz o‘zgaradi (Ctrl+Z bilan qaytarish mumkin).',
      confirmLabel: 'Joylashtirilsin'
    });
    if (!confirmed) return;

    applyPositions(autoLayout(cards(), connections(), workspace.clientWidth));
    save();
    render();
    requestAnimationFrame(fitView);
  }

  /* ------------------------------- hodisalar -------------------------------- */

  $('#addFirst')?.addEventListener('click', () => dialogs.openCard());
  $('#emptyAdd')?.addEventListener('click', () => dialogs.openCard());
  $('#flowAction')?.addEventListener('click', () => {
    if (connectingFrom) {
      connectingFrom = null;
      render();
    } else if (selectedConnection) {
      removeConnection(selectedConnection);
    } else {
      dialogs.openCard();
    }
  });

  $('#openMaps')?.addEventListener('click', () => {
    dialogs.renderMaps(allMaps(), activeMapId());
    dialogs.openMaps();
  });
  $('#openMapsTop')?.addEventListener('click', () => {
    dialogs.renderMaps(allMaps(), activeMapId());
    dialogs.openMaps();
  });
  $('#railNotes')?.addEventListener('click', () => {
    dialogs.renderNotes(cards());
    dialogs.openNotes();
  });
  $('#railMap')?.addEventListener('click', () => fitView());
  $('#help')?.addEventListener('click', () => dialogs.openHelp());

  $('#zoomIn')?.addEventListener('click', () => camera.zoomBy(0.1));
  $('#zoomOut')?.addEventListener('click', () => camera.zoomBy(-0.1));
  $('#fitMap')?.addEventListener('click', fitView);
  $('#autoLayout')?.addEventListener('click', runAutoLayout);
  $('#newMap')?.addEventListener('click', () => {
    createMap();
    save();
    loadMap();
  });
  $('#saveMap')?.addEventListener('click', () => save());

  let titleTimer = 0;
  $('#mapTitle')?.addEventListener('input', event => {
    setTitle(event.target.value);
    // Har harf uchun butun holatni diskka yozmaymiz.
    clearTimeout(titleTimer);
    setStatus('saqlanmoqda…', 'pending');
    titleTimer = setTimeout(save, 400);
  });

  for (const swatch of $$('.swatch')) {
    swatch.addEventListener('click', () => {
      setSpace(swatch.dataset.space);
      paintSpace(swatch.dataset.space);
      save();
    });
  }

  camera.setDoubleTapHandler(() => dialogs.openCard());

  on(globalThis, 'resize', () => {
    connectionLayer.resize(canvas.clientWidth, canvas.clientHeight);
    connectionLayer.updatePaths();
  });
  on(globalThis, EVENTS.cameraChanged, () => {
    const zoom = $('#zoom');
    if (zoom) zoom.textContent = `${Math.round(camera.zoom * 100)}%`;
  });
  on(globalThis, EVENTS.remoteSynced, event => {
    if (mergeRemote(event.detail?.spaces ?? [], event.detail?.deleted ?? {})) loadMap();
  });
  on(globalThis, EVENTS.storageError, () => {
    setStatus('saqlanmadi — xotira to‘lgan', 'error');
  });

  document.addEventListener('keydown', event => {
    if (isTypingTarget(event.target)) return;

    if (event.key === 'Escape') {
      if (connectingFrom) {
        connectingFrom = null;
        render();
      } else if (selectedConnection) {
        selectConnection(null);
      } else {
        thinking.clearFocus();
      }
      return;
    }
    if (hasOpenDialog()) return;

    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedConnection) {
      event.preventDefault();
      removeConnection(selectedConnection);
      return;
    }
    if (
      event.key.toLowerCase() === 'n' ||
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')
    ) {
      event.preventDefault();
      dialogs.openCard();
    }
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      fitView();
    }
  });

  tools.mountToolbar();
  loadMap();
  requestAnimationFrame(fitView);

  return { camera, render, loadMap, fitView, save };
}
