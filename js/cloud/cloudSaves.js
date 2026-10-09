import { RevisionConflict } from "./sync.js";

/** The signed-in player's save rows in Supabase. Row-level security limits every call to their own rows. */
export class CloudSaves {
  constructor(client) {
    this.client = client;
  }

  /** [{ slot, revision, data }] for every slot that has a cloud save. */
  async list() {
    const { data, error } = await this.client.from("saves").select("slot, revision, data");
    if (error) throw new Error(error.message);
    return data;
  }

  /** Writes a slot if its cloud revision is still `baseRevision` (0 = first save). Returns the new revision. */
  async push(slot, data, baseRevision) {
    const { data: revision, error } = await this.client.rpc("save_slot", {
      p_slot: slot,
      p_version: data.version,
      p_data: data,
      p_base_revision: baseRevision,
    });
    if (error?.message === "revision_conflict") throw new RevisionConflict(slot);
    if (error) throw new Error(error.message);
    return revision;
  }

  async delete(slot) {
    const { error } = await this.client.from("saves").delete().eq("slot", slot);
    if (error) throw new Error(error.message);
  }
}
