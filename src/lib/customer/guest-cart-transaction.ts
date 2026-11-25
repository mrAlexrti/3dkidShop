"use client";

// All tabs in the same storage partition use the same short IDB transaction.
// The network request runs outside it. PostgreSQL owns import replay protection.
export function guestCartTransaction<T>(run: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("3dkid-guest-cart", 1);
    const unavailable = () => new Error("GUEST_CART_STORAGE_UNAVAILABLE");
    let timedOut = false;
    let db: IDBDatabase | undefined;
    let tx: IDBTransaction | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      try { tx?.abort(); } catch { /* The transaction may have just completed. */ }
      db?.close();
      reject(unavailable());
    }, 2000);
    const fail = (error: unknown) => {
      clearTimeout(timeout);
      db?.close();
      reject(error);
    };
    open.onupgradeneeded = () => {
      if (timedOut) open.transaction?.abort();
      else open.result.createObjectStore("coordination");
    };
    open.onerror = () => fail(open.error ?? unavailable());
    open.onsuccess = () => {
      db = open.result;
      if (timedOut) { db.close(); return; }
      try {
        tx = db.transaction("coordination", "readwrite");
        let result: T;
        tx.oncomplete = () => {
          clearTimeout(timeout);
          db?.close();
          resolve(result);
        };
        tx.onabort = () => fail(tx?.error ?? unavailable());
        tx.objectStore("coordination").get("guest-cart").onsuccess = () => {
          try { result = run(); }
          catch (error) { tx?.abort(); fail(error); }
        };
      } catch (error) { fail(error); }
    };
  });
}
