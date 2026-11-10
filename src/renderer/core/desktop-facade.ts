// Façade desktop — cửa DUY NHẤT để renderer nói chuyện với lớp desktop
// (giai đoạn 2 của kế hoạch Tauri).
//
// Trước đây mọi tệp renderer gọi thẳng `window.eduGame.*`; hợp đồng đó do
// Electron (`src/preload.ts`) hoặc cầu Tauri sinh tự động cung cấp. Từ giai đoạn
// 2, renderer gọi `desktop.call(...)` và nhận lại KHÔNG phải đối tượng thô của vỏ
// mà một bản đã chuẩn hoá: mọi lần từ chối thành `DesktopError` có `code` và
// `call`, mọi sự kiện đi qua `listen()` có hàm huỷ đăng ký chắc chắn hoạt động kể
// cả khi đăng ký còn đang chờ.
//
// Cắm vỏ: `adapter` chỉ cần hai hàm —
//   invoke(call, args)  → Promise<giá trị>          (ném lỗi cũng được)
//   listen(call, fn)    → () => void                (hàm huỷ; phải vô hại khi gọi hai lần)
// Việc dựng adapter cụ thể nằm ở hai file riêng: `desktop-adapter-electron.ts`
// (bọc `window.eduGame`) và `desktop-adapter-tauri.ts` (bọc `__TAURI__`, khai báo
// nhóm `host-channels` trong tauri.conf.json rồi tự gọi `invoke` theo tên lệnh).
//
// Vì sao renderer giữ hai adapter thay vì chỉ cầu Tauri: giai đoạn này Electron
// vẫn là kênh phát hành, và cả hai vỏ phải chạy CÙNG một renderer. Adapter Electron
// chỉ gọi những hàm mà `preload.ts` đã expose — đúng hợp đồng đã có, nên hành vi
// Electron không đổi.
//
// Tệp này là script cổng thường (không `import`/`export`): nó được biên dịch sang
// `dist/src/renderer/core/desktop-facade.js` và nạp bằng `<script defer>` TRƯỚC
// mọi tệp khác gọi `desktop.*`. Không tệp nào chạy code lúc nạp (xem
// tests/unit/renderer-load-order.test.ts).

// `DESKTOP_FACADE_SCHEMA` do `desktop-facade-schema.ts` khai báo; cả hai tệp chia
// nhau một phạm vi script (nạp theo thứ tự trong index.html), nên không được
// khai báo lại ở đây — `tsc` báo TS2451.

type DesktopCall = string;

interface DesktopAdapter {
  invoke(call: DesktopCall, args: unknown[]): Promise<unknown>;
  listen(call: DesktopCall, handler: (payload: any) => void): () => void;
  /** Tên vỏ, chỉ để chẩn đoán và cho cổng kiểm tra. */
  name?: string;
  /**
   * Nhóm chức năng vỏ CHƯA làm được (giai đoạn 1 của vỏ Tauri: trình chiếu). Vắng
   * mặt nghĩa là đủ cả tám nhóm.
   */
  missingGroups?: string[];
  /**
   * Kênh Electron của hợp đồng này có được nối trong vỏ chưa. Vắng hàm = có đủ.
   * Tauri vỏ giai đoạn 2 dựng cả `invoke_channel` lẫn `send_channel`, nhưng ba
   * kênh `send` chưa có thân thật, nên adapter Tauri trả `false` cho đúng những
   * lời gọi đó — còn sự kiện `onPresentationExit` (dùng chung chuỗi kênh) vẫn đi
   * qua được.
   */
  hasChannel?(channel: string, call: string): boolean;
  /** Lệnh vỏ dùng cho từng lớp lời gọi; chỉ để chẩn đoán (`desktopHost.channels`). */
  commands?: { invoke: string; send: string };
}

interface DesktopErrorShape extends Error {
  code: string;
  call: string;
}

/**
 * Một đăng ký đã mở. `listen` của façade trả về một hàm idempotent; việc nối
 * adapter có thể vẫn đang chờ (Tauri `listen` là async), nên hàm huỷ phải chờ
 * đúng lần nối đó rồi mới niêm phong.
 */
interface DesktopSubscription {
  closed: boolean;
  close(): void;
  stop: () => void;
  adapterStop: (() => void) | null;
}

const desktop = (function createDesktopFacade() {
  // Đọc schema BÊN TRONG hàm: `renderer-load-order.test.ts` cấm đọc binding do tệp
  // này khai báo ở tệp khác lúc nạp. Không tệp nào khác cần tới tên này.
  const SCHEMA = DESKTOP_FACADE_SCHEMA;
  const DESKTOP_CALLS = SCHEMA.calls;
  const DESKTOP_ERROR = SCHEMA.error;
  const DESKTOP_TO_ERROR = SCHEMA.toError;
  let adapter: DesktopAdapter | null = null;
  /** Adapter khai báo nhóm chức năng nó không có — façade từ chối TRƯỚC khi gọi. */
  let missingGroups: string[] | null = null;
  /** Mỗi lần đổi adapter tăng lên; vòng nối kiểm tra lại để không nối nhầm vỏ. */
  let generation = 0;
  let calls = 0;
  /**
   * Lời gọi thay thế, chỉ để kiểm tra giao diện trên một máy chạy thật: cổng UI
   * cần một phản hồi hình dạng thật mà không gọi model (tài liệu ở chạy bằng
   * vòng lặp trong nước). Khoá là tên lời gọi; không có khoá nghĩa là không đổi
   * gì. Không tệp renderer nào ghi vào đây.
   */
  const overrides: Record<string, (...args: unknown[]) => unknown> = Object.create(null);
  /** Đăng ký chưa được adapter nhận (chưa có adapter, hoặc đang chờ nối lại). */
  const pending: Pending[] = [];
  /** Đăng ký đã được adapter hiện tại nhận. */
  const active: Pending[] = [];

  interface Pending {
    callName: DesktopCall;
    handler: (payload: any) => void;
    subscription: DesktopSubscription;
  }

  function requireAdapter(): DesktopAdapter {
    if (!adapter) {
      throw DESKTOP_ERROR('not-supported', 'attach', 'Renderer chưa được nối vào lớp desktop (thiếu adapter)');
    }
    return adapter;
  }

  function specOf(call: DesktopCall) {
    const spec = DESKTOP_CALLS[call];
    if (!spec) throw DESKTOP_ERROR('unknown-call', String(call), `Renderer gọi một lời gọi không có trong hợp đồng desktop: ${String(call)}`);
    return spec;
  }

  /**
   * Vỏ này có nhận được kênh của lời gọi không?
   *
   * Hai câu hỏi tách rời, vì một kênh của Electron có thể phục vụ HAI việc:
   * `presentation:exit` vừa là kênh gửi (`sendPresentationExit`, nhóm trình chiếu)
   * vừa là sự kiện (`onPresentationExit`, cũng nhóm trình chiếu nhưng vỏ nào cũng
   * đăng ký được). Vì vậy:
   *   1. `missingGroups` do adapter khai báo — nhóm vỏ chưa làm được;
   *   2. `hasChannel(channel)` do adapter trả lời — kênh đó có được nối chưa
   *      (adapter Tauri trả `false` cho kênh `send` khi vỏ chưa có `send_channel`).
   * Adapter không khai hàm thì coi như có mọi kênh của hợp đồng.
   */
  function unavailableReason(callName: DesktopCall, spec: any, host: DesktopAdapter): string | null {
    if (missingGroups && missingGroups.indexOf(spec.group) >= 0) {
      return `Vỏ desktop này chưa hỗ trợ nhóm ${spec.group} (${callName})`;
    }
    if (typeof host.hasChannel === 'function' && !host.hasChannel(spec.channel, callName)) {
      return `Vỏ desktop này chưa nối kênh ${spec.channel} (${callName})`;
    }
    return null;
  }

  /**
   * Gọi một lời gọi `value`. Mọi lần từ chối — sai tên, sai loại, nhóm vỏ chưa có,
   * lỗi của chính vỏ — đi ra dưới dạng `DesktopError` có `code` và `call`.
   */
  function call<T = unknown>(callName: DesktopCall, ...args: unknown[]): Promise<T> {
    let spec;
    try {
      spec = specOf(callName);
      if (spec.kind === 'stream') {
        throw DESKTOP_ERROR('invalid-argument', callName, `${callName} là sự kiện; dùng desktop.listen('${callName}', fn)`);
      }
      const host = requireAdapter();
      const unavailable = unavailableReason(callName, spec, host);
      if (unavailable) throw DESKTOP_ERROR('not-supported', callName, unavailable);
      calls += 1;
      const replaced = overrides[callName];
      const answer = replaced ? replaced(...(args as unknown[])) : host.invoke(callName, args);
      return Promise.resolve(answer).then(
        (value: unknown) => value as T,
        (thrown: unknown) => {
          throw DESKTOP_TO_ERROR(callName, thrown);
        },
      );
    } catch (thrown) {
      // Lỗi đồng bộ (không có adapter, sai loại lời gọi, sai tên) cũng đi ra dạng Promise.
      return Promise.reject(thrown instanceof Error && (thrown as DesktopErrorShape).name === 'DesktopError'
        ? thrown
        : DESKTOP_TO_ERROR(String(callName), thrown));
    }
  }

  /**
   * Đăng ký một sự kiện; trả về hàm huỷ đăng ký (gọi nhiều lần vô hại).
   *
   * Gọi trước khi adapter được nối: đăng ký nằm chờ và tự nối khi `attach` chạy —
   * renderer có thể đăng ký ngay ở đầu tệp, trước khi bootstrap bắt xong dữ liệu.
   */
  function listen(callName: DesktopCall, handler: (payload: any) => void): () => void {
    const spec = specOf(callName);
    if (spec.kind !== 'stream') {
      throw DESKTOP_ERROR('invalid-argument', callName, `${callName} là lời gọi trả dữ liệu; dùng desktop.call('${callName}', …)`);
    }
    // Sự kiện của nhóm vỏ chưa có (trình chiếu trên Tauri giai đoạn 1) bị từ chối
    // ngay, không nằm chờ: nối sau cũng không có gì để nhận.
    if (adapter) {
      const unavailable = unavailableReason(callName, spec, adapter);
      if (unavailable) throw DESKTOP_ERROR('not-supported', callName, unavailable);
    }
    const subscription: DesktopSubscription = {
      closed: false,
      adapterStop: null,
      stop() {
        if (subscription.closed) return;
        subscription.closed = true;
        const stop = subscription.adapterStop;
        subscription.adapterStop = null;
        if (stop) stop();
      },
      close() {
        subscription.stop();
      },
    };
    pending.push({ callName, handler, subscription });
    if (adapter) connectPending();
    return subscription.stop;
  }

  function connectPending(): void {
    if (!adapter) return;
    const host = adapter;
    const current = generation;
    while (pending.length) {
      const item = pending.shift() as Pending;
      if (item.subscription.closed) continue;
      if (unavailableReason(item.callName, DESKTOP_CALLS[item.callName], host)) continue;
      let stop: () => void;
      try {
        const deliver = function (payload?: any) {
          // Handler của renderer không được làm gãy chuỗi sự kiện của vỏ.
          if (item.subscription.closed) return;
          try {
            item.handler(payload);
          } catch (error) {
            if (typeof console !== 'undefined') console.error(`desktop.listen('${item.callName}') handler lỗi`, error);
          }
        };
        // `onPresentationExit(cb)`: preload đăng ký `() => callback()` — không đối số,
        // nên handler cũng phải nhận 0 đối số (schema liệt `argv: 0`).
        const zeroArg = SCHEMA.argv[item.callName] === 0;
        const checked = zeroArg
          ? function () {
              if (item.subscription.closed) return;
              try {
                (item.handler as any)();
              } catch (error) {
                if (typeof console !== 'undefined') console.error(`desktop.listen('${item.callName}') handler lỗi`, error);
              }
            }
          : deliver;
        stop = host.listen(item.callName, checked);
      } catch (error) {
        if (typeof console !== 'undefined') console.error(`desktop.listen('${item.callName}') không đăng ký được`, error);
        continue;
      }
      if (current !== generation) {
        // Adapter đã bị thay trong lúc nối — huỷ ngay để không nhân đôi sự kiện.
        try { stop(); } catch { /* vô hại */ }
        continue;
      }
      item.subscription.adapterStop = stop;
      active.push(item);
    }
  }

  /**
   * Nối một adapter. `desktop-host` gọi một lần khi tệp của nó chạy; test gọi lại
   * để đổi vỏ. Đăng ký sự kiện của adapter cũ được huỷ rồi nối lại sang vỏ mới, nên
   * một sự kiện không bao giờ đến handler hai lần.
   */
  function attach(next: DesktopAdapter): void {
    if (!next || typeof next.invoke !== 'function' || typeof next.listen !== 'function') {
      throw DESKTOP_ERROR('invalid-argument', 'attach', 'Adapter desktop thiếu invoke() hoặc listen()');
    }
    // Ngắt adapter cũ: những đăng ký còn sống trở về hàng chờ để nối lại.
    generation += 1;
    rebindPending();
    if (adapter === next) return;
    adapter = next;
    missingGroups = Array.isArray(next.missingGroups) ? next.missingGroups : null;
    connectPending();
  }

  /**
   * Trả mọi đăng ký đang sống về hàng chờ: huỷ đăng ký ở adapter cũ TRƯỚC, rồi
   * mới để `connectPending` nối sang adapter mới — thứ tự này là điều giữ cho một
   * sự kiện không bao giờ đến handler hai lần sau khi đổi vỏ.
   */
  function rebindPending(): void {
    while (active.length) {
      const item = active.shift() as Pending;
      if (item.subscription.closed) continue;
      const stop = item.subscription.adapterStop;
      item.subscription.adapterStop = null;
      if (stop) { try { stop(); } catch { /* vô hại */ } }
      pending.push(item);
    }
  }

  /** Chỉ để chẩn đoán và cho cổng kiểm tra. */
  function info() {
    return {
      adapter: adapter && adapter.name ? adapter.name : 'none',
      missingGroups: missingGroups ? missingGroups.slice() : [],
      pendingListeners: pending.length,
      callCount: calls,
    };
  }

  /** Ngắt adapter (trả đăng ký về hàng chờ); test dùng để đo đường "chưa nối". */
  function detach(): void {
    if (!adapter) return;
    generation += 1;
    rebindPending();
    adapter = null;
    missingGroups = null;
  }

  /**
   * Thay một lời gọi bằng phản hồi cố định (hoặc trả `null` để gỡ). Chỉ cổng UI
   * dùng: một lần chạy thật cần hình dạng dữ liệu thật mà không cần model.
   */
  function stub(callName: DesktopCall, answer: ((...args: unknown[]) => unknown) | null): void {
    specOf(callName);
    if (answer) overrides[callName] = answer;
    else delete overrides[callName];
  }

  /**
   * Gọi một lời gọi ĐIỀU KHIỂN của cổng kiểm tra (`SCHEMA.gateCalls`): không có
   * trong preload Electron, nên không thể đi qua `call()`. Vỏ Tauri từ chối khi
   * biến `EDUGAME_TAURI_PACKAGE` chưa bật; adapter Electron không có kênh này nên
   * lời gọi thất bại, và đó là điều cổng cần biết khi chạy trên Electron.
   */
  function gate(callName: string, ...args: unknown[]): Promise<unknown> {
    const channel = SCHEMA.gateCalls[callName];
    if (!channel) {
      return Promise.reject(DESKTOP_ERROR('unknown-call', String(callName), `Không có lời gọi điều khiển ${String(callName)}`));
    }
    try {
      return Promise.resolve(requireAdapter().invoke(callName, args)).then(
        (value: unknown) => value,
        (thrown: unknown) => {
          throw DESKTOP_TO_ERROR(callName, thrown);
        },
      );
    } catch (thrown) {
      return Promise.reject(DESKTOP_TO_ERROR(callName, thrown));
    }
  }

  /**
   * Gọi một lời gọi CHỈ vỏ Tauri (`SCHEMA.hostCalls`), ví dụ nhập profile Electron.
   * Không đi qua `call()` vì hợp đồng Electron không có ba tên này; adapter Tauri
   * mới dịch được chúng sang kênh `migration:*`. Trên Electron trả
   * `not-supported` trước khi chạm IPC.
   */
  function host(callName: string, ...args: unknown[]): Promise<unknown> {
    const channel = SCHEMA.hostCalls[callName];
    if (!channel) {
      return Promise.reject(DESKTOP_ERROR('unknown-call', String(callName), `Không có lời gọi Tauri ${String(callName)}`));
    }
    try {
      const current = requireAdapter();
      if (current.name !== 'tauri') {
        return Promise.reject(DESKTOP_ERROR('not-supported', callName, 'Lời gọi này chỉ có trên vỏ Tauri.'));
      }
      return Promise.resolve(current.invoke(callName, args)).then(
        (value: unknown) => value,
        (thrown: unknown) => {
          throw DESKTOP_TO_ERROR(callName, thrown);
        },
      );
    } catch (thrown) {
      return Promise.reject(DESKTOP_TO_ERROR(callName, thrown));
    }
  }

  return Object.freeze({ call, listen, attach, detach, info, stub, gate, host });
})();
