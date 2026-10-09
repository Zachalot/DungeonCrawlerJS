import { SLOT_COUNT, summarize } from "../save.js";

/** A cloud write was rejected because another device saved the slot first. */
export class RevisionConflict extends Error {
  constructor(slot) {
    super(`Slot ${slot} was changed on another device`);
    this.slot = slot;
  }
}

export const SyncStatus = Object.freeze({
  synced: "synced",
  pending: "pending", // local changes not pushed yet
  offline: "offline", // the last cloud call failed; changes are kept locally
  conflict: "conflict", // a slot needs the player to choose which copy to keep
});

const SLOTS = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);

/**
 * Save slots for a signed-in player: a local SaveStore cache that the game reads and writes
 * synchronously, kept in step with the cloud in the background. Same interface as SaveStore,
 * plus pullAll(), flush(), and conflict resolution. `cloud` is a CloudSaves (or a test fake).
 */
export class SyncedSaveStore {
  constructor(local, cloud, { debounceMs = 5000, onStatus = () => {} } = {}) {
    this.local = local;
    this.cloud = cloud;
    this.debounceMs = debounceMs;
    this.onStatus = onStatus;
    this.status = SyncStatus.synced;
    this.lastError = null;
    this.conflicts = new Map(); // slot → { local, remote, remoteRevision }, found by pullAll
    this.generations = new Map(); // slot → saves made, to spot a save landing mid-push
    this.queue = Promise.resolve(); // cloud calls run one at a time, in order
    this.timer = null;
  }

  get owner() {
    return this.local.owner;
  }

  list() {
    return SLOTS.map((slot) => ({ slot, summary: this.summary(slot) }));
  }

  /** Like SaveStore.summary, or { conflict: { local, remote } } while a slot awaits a choice. */
  summary(slot) {
    const conflict = this.conflicts.get(slot);
    if (conflict) return { conflict: { local: safeSummary(conflict.local), remote: safeSummary(conflict.remote) } };
    return this.local.summary(slot);
  }

  load(slot) {
    return this.local.load(slot);
  }

  /** Writes locally right away, then pushes after the debounce (or now, if `immediate`). */
  save(slot, gameOrData, { immediate = false } = {}) {
    const bytes = this.local.save(slot, gameOrData);
    this.local.setMeta(slot, { ...this.local.getMeta(slot), dirty: true, deleted: false });
    this.generations.set(slot, (this.generations.get(slot) ?? 0) + 1);
    if (immediate) this.flush();
    else this.schedule();
    return bytes;
  }

  delete(slot) {
    const meta = this.local.getMeta(slot);
    this.local.delete(slot);
    this.conflicts.delete(slot);
    if (meta.revision > 0) {
      this.local.setMeta(slot, { revision: meta.revision, dirty: false, deleted: true, conflict: false });
      this.flush();
    } else {
      this.local.clearMeta(slot);
    }
  }

  /** Pushes every slot with unsent changes. Never rejects; failures show up in `status`. */
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    return this.enqueue(async () => {
      for (const slot of SLOTS) await this.pushSlot(slot);
    });
  }

  /** Brings the local cache in line with the cloud and finds conflicts. Never rejects. */
  pullAll() {
    return this.enqueue(async () => {
      const rows = await this.cloud.list();
      const remote = new Map(rows.map((row) => [row.slot, row]));
      this.conflicts.clear();
      for (const slot of SLOTS) await this.reconcile(slot, remote.get(slot) ?? null);
    });
  }

  /** Settles a conflict found by pullAll, keeping this device's copy ("local") or the cloud's ("cloud"). */
  resolveConflict(slot, keep) {
    return this.enqueue(async () => {
      const conflict = this.conflicts.get(slot);
      if (!conflict) return;
      this.conflicts.delete(slot);
      if (keep === "cloud") {
        this.adopt(slot, conflict.remote, conflict.remoteRevision);
      } else {
        this.local.setMeta(slot, { revision: conflict.remoteRevision, dirty: true, deleted: false, conflict: false });
        await this.pushSlot(slot);
      }
    });
  }

  /** The two copies of a conflicted slot ({ local, remote } save data), or null. */
  conflictCopies(slot) {
    const conflict = this.conflicts.get(slot);
    return conflict ? { local: conflict.local, remote: conflict.remote } : null;
  }

  // ---- Internals ----------------------------------------------------------

  schedule() {
    this.updateStatus();
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.debounceMs);
    this.timer.unref?.(); // don't hold a Node test process open
  }

  enqueue(task) {
    const run = this.queue.then(async () => {
      try {
        await task();
        this.lastError = null;
        this.updateStatus();
      } catch (error) {
        console.warn("Cloud sync failed", error);
        this.lastError = error.message;
        this.setStatus(SyncStatus.offline);
      }
    });
    this.queue = run;
    return run;
  }

  async pushSlot(slot) {
    const meta = this.local.getMeta(slot);
    if (meta.conflict) return; // waits for pullAll and the player's choice
    if (meta.deleted) {
      await this.cloud.delete(slot);
      this.local.clearMeta(slot);
      return;
    }
    if (!meta.dirty) return;
    const raw = this.local.raw(slot);
    if (!raw) {
      this.local.clearMeta(slot);
      return;
    }
    const generation = this.generations.get(slot) ?? 0;
    try {
      const revision = await this.cloud.push(slot, JSON.parse(raw), meta.revision);
      const savedMeanwhile = (this.generations.get(slot) ?? 0) !== generation;
      this.local.setMeta(slot, { ...this.local.getMeta(slot), revision, dirty: savedMeanwhile });
    } catch (error) {
      if (!(error instanceof RevisionConflict)) throw error;
      this.local.setMeta(slot, { ...this.local.getMeta(slot), conflict: true });
    }
  }

  async reconcile(slot, remote) {
    const meta = this.local.getMeta(slot);
    const raw = this.local.raw(slot);

    if (meta.deleted) {
      if (remote && remote.revision !== meta.revision) {
        this.adopt(slot, remote.data, remote.revision); // saved elsewhere after we deleted: keep it
        return;
      }
      if (remote) await this.cloud.delete(slot);
      this.local.clearMeta(slot);
      return;
    }

    if (!raw) {
      if (remote) this.adopt(slot, remote.data, remote.revision);
      else this.local.clearMeta(slot);
      return;
    }

    if (!meta.dirty && !meta.conflict) {
      if (!remote && meta.revision > 0) {
        this.local.delete(slot); // deleted on another device
        this.local.clearMeta(slot);
      } else if (!remote) {
        this.local.setMeta(slot, { ...meta, dirty: true }); // never uploaded
        await this.pushSlot(slot);
      } else if (remote.revision !== meta.revision) {
        this.adopt(slot, remote.data, remote.revision);
      }
      return;
    }

    // Local changes not yet in the cloud.
    if (!remote) {
      this.local.setMeta(slot, { revision: 0, dirty: true, deleted: false, conflict: false });
      await this.pushSlot(slot);
    } else if (remote.revision === meta.revision) {
      this.local.setMeta(slot, { ...meta, conflict: false });
      await this.pushSlot(slot);
    } else {
      this.local.setMeta(slot, { ...meta, conflict: true });
      this.conflicts.set(slot, { local: JSON.parse(raw), remote: remote.data, remoteRevision: remote.revision });
    }
  }

  /** Replaces the local copy with a cloud copy. */
  adopt(slot, data, revision) {
    this.local.save(slot, data);
    this.local.setMeta(slot, { revision, dirty: false, deleted: false, conflict: false });
  }

  updateStatus() {
    const metas = SLOTS.map((slot) => this.local.getMeta(slot));
    if (this.conflicts.size || metas.some((m) => m.conflict)) this.setStatus(SyncStatus.conflict);
    else if (metas.some((m) => m.dirty || m.deleted)) this.setStatus(SyncStatus.pending);
    else this.setStatus(SyncStatus.synced);
  }

  setStatus(status) {
    if (status === this.status) return;
    const previous = this.status;
    this.status = status;
    this.onStatus(status, previous);
  }
}

function safeSummary(data) {
  try {
    return summarize(data);
  } catch {
    return { error: "Unreadable save" };
  }
}
