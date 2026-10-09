import { SUPABASE_JS_URL, SUPABASE_KEY, SUPABASE_URL } from "./config.js";

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
export const MIN_PASSWORD_LENGTH = 8;

/**
 * The player's account: session, username, and the sign-up / sign-in / reset actions.
 * Supabase Auth does the real work (hashing, tokens, emails); this wraps it for the UI.
 * Create with Auth.create(). Action methods throw Errors with player-readable messages.
 */
export class Auth {
  /** Returns null if accounts aren't configured. Throws if the Supabase library can't load. */
  static async create() {
    if (!SUPABASE_KEY) return null;
    const link = readAuthLink(); // before supabase-js consumes the URL
    const { createClient } = await import(SUPABASE_JS_URL);
    const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { flowType: "implicit", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const auth = new Auth(client, link);
    await auth.init();
    return auth;
  }

  constructor(client, { recovering = false, error = null } = {}) {
    this.client = client;
    this.session = null;
    this.profile = undefined; // undefined: not loaded; null username: needs one
    this.recovering = recovering; // arrived from a password-reset link
    this.linkError = error; // an emailed link that failed, e.g. expired
    this.listeners = [];
  }

  async init() {
    this.client.auth.onAuthStateChange((event, session) => {
      this.session = session;
      if (event === "PASSWORD_RECOVERY") this.recovering = true;
      // supabase-js deadlocks if its own calls are awaited inside this callback, so defer.
      setTimeout(() => this.listeners.forEach((listener) => listener(event)), 0);
    });
    const { data } = await this.client.auth.getSession();
    this.session = data.session;
  }

  /** Calls `listener(event)` after each auth change (SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY, …). */
  onChange(listener) {
    this.listeners.push(listener);
  }

  get user() {
    return this.session?.user ?? null;
  }

  get userId() {
    return this.user?.id ?? null;
  }

  get email() {
    return this.user?.email ?? null;
  }

  /** The profile's username, falling back to the one given at sign-up. */
  get username() {
    return this.profile?.username ?? this.user?.user_metadata?.username ?? null;
  }

  /** True once the profile loaded and has no username (e.g. a user added from the dashboard). */
  get needsUsername() {
    return this.user !== null && this.profile !== undefined && !this.profile?.username;
  }

  /** Loads the signed-in player's profile. Offline is tolerated: the profile stays unknown. */
  async loadProfile() {
    this.profile = undefined;
    if (!this.user) return;
    const { data, error } = await this.client.from("profiles").select("username").eq("id", this.user.id).maybeSingle();
    if (error) {
      console.warn("Couldn't load profile", error);
      return;
    }
    this.profile = data ?? { username: null };
  }

  /** Creates an account. Returns { needsConfirmation } (true when a confirmation email was sent). */
  async signUp(email, password, username) {
    checkUsername(username);
    checkPassword(password);
    if (!(await this.usernameAvailable(username))) throw new Error(`The username "${username}" is taken.`);
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { username }, emailRedirectTo: siteUrl() },
    });
    if (error) throw friendlyError(error);
    return { needsConfirmation: !data.session };
  }

  async signIn(email, password) {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw friendlyError(error);
  }

  async signOut() {
    const { error } = await this.client.auth.signOut();
    if (error) throw friendlyError(error);
  }

  /** Emails a reset link. Succeeds whether or not the account exists, so it never reveals which emails are registered. */
  async requestPasswordReset(email) {
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
    if (error) throw friendlyError(error);
  }

  /** Sets a new password (after arriving from a reset link, or while signed in). */
  async setNewPassword(password) {
    checkPassword(password);
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw friendlyError(error);
    this.recovering = false;
  }

  async setUsername(username) {
    checkUsername(username);
    const { error } = await this.client.from("profiles").update({ username }).eq("id", this.userId);
    if (error?.code === "23505") throw new Error(`The username "${username}" is taken.`);
    if (error) throw friendlyError(error);
    this.profile = { username };
  }

  async usernameAvailable(username) {
    const { data, error } = await this.client.rpc("username_available", { p_username: username });
    if (error) throw friendlyError(error);
    return data;
  }
}

function checkUsername(username) {
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error("Usernames are 3–20 characters: letters, numbers, and underscores.");
  }
}

function checkPassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`);
}

/** Where emailed links return to: this page, without its query or hash. */
function siteUrl() {
  return `${location.origin}${location.pathname}`;
}

/** Reads a reset link or a failed-link error from the URL hash, clearing errors from the address bar. */
function readAuthLink() {
  const params = new URLSearchParams(location.hash.slice(1));
  const error = params.get("error_description");
  if (error) {
    history.replaceState(null, "", location.pathname + location.search);
    const expired = params.get("error_code") === "otp_expired";
    return { error: expired ? "That email link has expired or was already used. Request a new one." : error };
  }
  return { recovering: params.get("type") === "recovery" };
}

const FRIENDLY_MESSAGES = [
  [/invalid login credentials/i, "Wrong email or password."],
  [/email not confirmed/i, "Confirm your email first: check your inbox for the link."],
  [/database error saving new user/i, "That username was just taken. Try another."],
  [/rate limit/i, "Too many attempts. Wait a few minutes and try again."],
  [/user already registered/i, "An account with that email already exists. Sign in instead."],
  [/should be different from the old password/i, "Choose a password you haven't used for this account."],
  [/failed to fetch|network/i, "Can't reach the server. Check your connection and try again."],
];

function friendlyError(error) {
  const match = FRIENDLY_MESSAGES.find(([pattern]) => pattern.test(error.message));
  return new Error(match ? match[1] : error.message);
}
