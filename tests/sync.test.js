import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RevisionConflict, SyncStatus, SyncedSaveStore } from "../js/cloud/sync.js";
import { Game } from "../js/game.js";
import { SaveStore, serializeGame } from "../js/save.js";

/** In-memory stand-in for localStorage. */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
}

/** In-memory stand-in for CloudSaves, with the same compare-and-set rule as save_slot(). */
function fakeCloud() {
  const rows = new Map(); // slot → { revision, data }
  const cloud = {
    rows,
    offline: false,
    calls: [],
    async list() {
      cloud.check("list");
      return [...rows].map(([slot, row]) => ({ slot, revision: row.revision, data: structuredClone(row.data) }));
    },
    async push(slot, data, baseRevision) {
      cloud.check("push");
      const current = rows.get(slot);
      if ((current?.revision ?? 0) !== baseRevision) throw new RevisionConflict(slot);
      const revision = baseRevision + 1;
      rows.set(slot, { revision, data: structuredClone(data) });
      return revision;
    },
    async delete(slot) {
      cloud.check("delete");
      rows.delete(slot);
    },
    check(call) {
      cloud.calls.push(call);
      if (cloud.offline) throw new Error("Failed to fetch");
    },
  };
  return cloud;
}

function saveData(level, playTime = 60) {
  const game = new Game(7);
  game.player.level = level;
  game.playTime = playTime;
  return serializeGame(game);
}

/** Another device: its own local cache over the same cloud. */
function device(cloud, owner = "user-1") {
  const local = new SaveStore(memoryStorage(), { owner });
  return { local, store: new SyncedSaveStore(local, cloud, { debounceMs: 60_000 }) };
}

describe("SaveStore namespacing", () => {
  it("keeps each account's slots apart from the guest's and from each other", () => {
    const storage = memoryStorage();
    const guest = new SaveStore(storage);
    const alice = new SaveStore(storage, { owner: "alice" });
    const bob = new SaveStore(storage, { owner: "bob" });
    guest.save(1, saveData(1));
    alice.save(1, saveData(5));
    assert.equal(guest.load(1).player.level, 1);
    assert.equal(alice.load(1).player.level, 5);
    assert.equal(bob.load(1), null);
    assert.ok(storage.map.has("dungeonCrawler.slot1"), "guest keeps the original key");
    assert.ok(storage.map.has("dungeonCrawler.alice.slot1"));
  });

  it("stores sync metadata outside the save", () => {
    const store = new SaveStore(memoryStorage(), { owner: "alice" });
    assert.deepEqual(store.getMeta(1), { revision: 0, dirty: false, deleted: false, conflict: false });
    store.setMeta(1, { revision: 3, dirty: true, deleted: false, conflict: false });
    assert.equal(store.getMeta(1).revision, 3);
    store.clearMeta(1);
    assert.equal(store.getMeta(1).revision, 0);
  });
});

describe("SyncedSaveStore", () => {
  it("writes locally at once and pushes on flush", async () => {
    const cloud = fakeCloud();
    const { local, store } = device(cloud);
    store.save(1, saveData(2));
    assert.equal(local.load(1).player.level, 2, "local copy is immediate");
    assert.equal(cloud.rows.size, 0, "push waits for the debounce");
    assert.equal(store.status, SyncStatus.pending);
    await store.flush();
    assert.equal(cloud.rows.get(1).data.player.level, 2);
    assert.deepEqual(local.getMeta(1), { revision: 1, dirty: false, deleted: false, conflict: false });
    assert.equal(store.status, SyncStatus.synced);
  });

  it("pushes right away when asked", async () => {
    const cloud = fakeCloud();
    const { store } = device(cloud);
    store.save(1, saveData(2), { immediate: true });
    await store.queue;
    assert.equal(cloud.rows.get(1).revision, 1);
  });

  it("downloads cloud saves this device doesn't have", async () => {
    const cloud = fakeCloud();
    cloud.rows.set(2, { revision: 4, data: saveData(9) });
    const { local, store } = device(cloud);
    await store.pullAll();
    assert.equal(store.load(2).player.level, 9);
    assert.equal(local.getMeta(2).revision, 4);
  });

  it("moves progress between two devices", async () => {
    const cloud = fakeCloud();
    const a = device(cloud);
    const b = device(cloud);
    a.store.save(1, saveData(3));
    await a.store.flush();
    await b.store.pullAll();
    assert.equal(b.store.load(1).player.level, 3);

    b.store.save(1, saveData(4));
    await b.store.flush();
    await a.store.pullAll();
    assert.equal(a.store.load(1).player.level, 4, "a clean cache takes the newer cloud copy");
  });

  it("pushes local changes made while offline once the cloud is back", async () => {
    const cloud = fakeCloud();
    const { local, store } = device(cloud);
    cloud.offline = true;
    store.save(1, saveData(2));
    await store.flush();
    assert.equal(store.status, SyncStatus.offline);
    assert.ok(local.getMeta(1).dirty, "still waiting to sync");
    assert.equal(local.load(1).player.level, 2, "progress kept on this device");

    cloud.offline = false;
    await store.pullAll();
    assert.equal(cloud.rows.get(1).data.player.level, 2);
    assert.equal(store.status, SyncStatus.synced);
  });

  it("reports a conflict instead of overwriting another device's save", async () => {
    const cloud = fakeCloud();
    const a = device(cloud);
    const b = device(cloud);
    a.store.save(1, saveData(3));
    await a.store.flush();
    await b.store.pullAll();

    a.store.save(1, saveData(5)); // both play the slot without syncing in between
    b.store.save(1, saveData(6));
    await a.store.flush();
    await b.store.flush();
    assert.equal(cloud.rows.get(1).data.player.level, 5, "b's push was refused");
    assert.equal(b.store.status, SyncStatus.conflict);

    await b.store.pullAll();
    const { conflict } = b.store.summary(1);
    assert.deepEqual([conflict.local.level, conflict.remote.level], [6, 5]);
    assert.equal(b.store.conflictCopies(1).local.player.level, 6);
  });

  it("keeps the chosen copy when a conflict is settled", async () => {
    const setup = async () => {
      const cloud = fakeCloud();
      const a = device(cloud);
      const b = device(cloud);
      a.store.save(1, saveData(3));
      await a.store.flush();
      await b.store.pullAll();
      a.store.save(1, saveData(5));
      b.store.save(1, saveData(6));
      await a.store.flush();
      await b.store.pullAll();
      return { cloud, b };
    };

    const keepLocal = await setup();
    await keepLocal.b.store.resolveConflict(1, "local");
    assert.equal(keepLocal.cloud.rows.get(1).data.player.level, 6);
    assert.equal(keepLocal.b.store.status, SyncStatus.synced);

    const keepCloud = await setup();
    await keepCloud.b.store.resolveConflict(1, "cloud");
    assert.equal(keepCloud.b.store.load(1).player.level, 5);
    assert.equal(keepCloud.cloud.rows.get(1).revision, 2, "nothing was pushed");
    assert.equal(keepCloud.b.store.summary(1).level, 5);
  });

  it("deletes in the cloud too, and follows deletes made on another device", async () => {
    const cloud = fakeCloud();
    const a = device(cloud);
    const b = device(cloud);
    a.store.save(1, saveData(3));
    await a.store.flush();
    await b.store.pullAll();

    a.store.delete(1);
    await a.store.queue;
    assert.equal(cloud.rows.has(1), false);

    await b.store.pullAll();
    assert.equal(b.store.load(1), null);
  });

  it("finishes a delete that couldn't reach the cloud", async () => {
    const cloud = fakeCloud();
    const { local, store } = device(cloud);
    store.save(1, saveData(3));
    await store.flush();
    cloud.offline = true;
    store.delete(1);
    await store.queue;
    assert.ok(local.getMeta(1).deleted);

    cloud.offline = false;
    await store.pullAll();
    assert.equal(cloud.rows.has(1), false);
    assert.equal(store.load(1), null, "the deleted slot didn't come back");
  });

  it("uploads a never-synced local save", async () => {
    const cloud = fakeCloud();
    const { local, store } = device(cloud);
    local.save(3, saveData(8)); // e.g. written before cloud sync existed
    await store.pullAll();
    assert.equal(cloud.rows.get(3).data.player.level, 8);
  });

  it("stays dirty if the game saves again while a push is in flight", async () => {
    const cloud = fakeCloud();
    const { local, store } = device(cloud);
    const push = cloud.push;
    cloud.push = async (...args) => {
      store.save(1, saveData(7)); // lands mid-push
      cloud.push = push;
      return push(...args);
    };
    store.save(1, saveData(6));
    await store.flush();
    assert.equal(cloud.rows.get(1).data.player.level, 6);
    assert.ok(local.getMeta(1).dirty, "the level 7 save still needs pushing");
    await store.flush();
    assert.equal(cloud.rows.get(1).data.player.level, 7);
  });

  it("runs cloud calls one at a time, in order", async () => {
    const cloud = fakeCloud();
    const { store } = device(cloud);
    store.save(1, saveData(2), { immediate: true });
    const pull = store.pullAll();
    await pull;
    assert.deepEqual(cloud.calls, ["push", "list"]);
  });
});
