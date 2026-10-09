import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Auth } from "../js/cloud/auth.js";

globalThis.location ??= { origin: "http://localhost:8080", pathname: "/" }; // for emailed-link redirects

/** Fake Supabase client: `signUpResult` is what auth.signUp returns; `taken` lists used usernames. */
function fakeClient({ signUpResult, taken = [] }) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, { p_username }) => ({ data: !taken.includes(p_username.toLowerCase()), error: null }),
    auth: {
      signUp: async (args) => {
        calls.push(args);
        return signUpResult;
      },
    },
  };
}

const realUser = { id: "u1", identities: [{ id: "i1", provider: "email" }] };

describe("Auth.signUp", () => {
  it("reports a confirmation email for a new account", async () => {
    const client = fakeClient({ signUpResult: { data: { user: realUser, session: null }, error: null } });
    const result = await new Auth(client).signUp("new@example.com", "password1", "NewPlayer");
    assert.deepEqual(result, { needsConfirmation: true });
    assert.equal(client.calls[0].options.data.username, "NewPlayer");
  });

  it("signs straight in when Confirm email is off", async () => {
    const client = fakeClient({ signUpResult: { data: { user: realUser, session: { access_token: "t" } }, error: null } });
    assert.deepEqual(await new Auth(client).signUp("new@example.com", "password1", "NewPlayer"), { needsConfirmation: false });
  });

  it("refuses an email that already has an account (Confirm email on: fake user, no identities)", async () => {
    const fake = { id: "fake", identities: [] };
    const client = fakeClient({ signUpResult: { data: { user: fake, session: null }, error: null } });
    await assert.rejects(new Auth(client).signUp("taken@example.com", "password1", "Second"), /email already exists/);
  });

  it("refuses an email that already has an account (Confirm email off: error)", async () => {
    const client = fakeClient({ signUpResult: { data: { user: null, session: null }, error: { message: "User already registered" } } });
    await assert.rejects(new Auth(client).signUp("taken@example.com", "password1", "Second"), /email already exists/);
  });

  it("refuses a taken username, ignoring case, before contacting sign-up", async () => {
    const client = fakeClient({ signUpResult: null, taken: ["zach"] });
    await assert.rejects(new Auth(client).signUp("a@example.com", "password1", "ZACH"), /is taken/);
    assert.equal(client.calls.length, 0);
  });

  it("checks username format and password length locally", async () => {
    const auth = new Auth(fakeClient({ signUpResult: null }));
    await assert.rejects(auth.signUp("a@example.com", "password1", "no spaces!"), /3–20 characters/);
    await assert.rejects(auth.signUp("a@example.com", "short", "Valid_Name"), /at least 8/);
  });
});
