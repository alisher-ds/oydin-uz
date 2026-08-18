/**
 * Loyihadagi barcha maxsus hodisa nomlari.
 *
 * Bitta joyda saqlanadi — shu sababli nomdagi xato lint bosqichida
 * (`no-undef` / import xatosi) ushlanadi, ish vaqtida emas.
 */
export const EVENTS = Object.freeze({
  /** localStorage dagi kuzatiladigan kalit o'zgardi. */
  dataChanged: 'oydin:data-changed',
  /** Yozib bo'lmadi (kvota yoki mavjud emas). */
  storageError: 'oydin:storage-error',
  /** Kalit IndexedDB dan tiklandi. */
  storageRestored: 'oydin:storage-restored',
  /** Makon holati o'zgardi (kartalar, aloqalar, sarlavha). */
  stateChanged: 'oydin:state-changed',
  /** Serverdan yangi ma'lumot keldi. */
  remoteSynced: 'oydin:remote-synced',
  /** Sinxronizatsiya urinishi tugadi (muvaffaqiyatli yoki yo'q). */
  sync: 'oydin:sync',
  /** Kamera (pan/zoom) o'zgardi. */
  cameraChanged: 'oydin:camera-changed',
  /** Aloqa chiziqlari qayta chizildi. */
  connectionsRendered: 'oydin:connections-rendered'
});
