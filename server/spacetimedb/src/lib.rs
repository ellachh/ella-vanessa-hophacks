use spacetimedb::{
    Identity, ReducerContext, ScheduleAt, Table, TimeDuration, Timestamp, ViewContext,
};
use std::time::Duration;

// Input caps. These exist to keep one bad row from breaking every client:
// every client subscribes to every row, so a malformed listing is not a local
// problem, it is everyone's problem.
const MAX_NAME: usize = 40;
const MAX_DONOR: usize = 80;
const MAX_DESCRIPTION: usize = 280;

/// A volunteer may hold this many open claims at once. Hoarding pickups you
/// cannot drive to is the failure mode a real dispatch board has to prevent.
const MAX_OPEN_CLAIMS: usize = 3;

/// How often the database checks for listings whose pickup window has passed.
const EXPIRY_INTERVAL: Duration = Duration::from_secs(30);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

// A volunteer. Exists only so the UI can show a name instead of a hex identity.
#[spacetimedb::table(accessor = user, public)]
pub struct User {
    #[primary_key]
    pub identity: Identity,
    pub name: String,
}

// Surplus food a donor has posted for pickup.
// `claimed_by == None` means the listing is still open.
#[spacetimedb::table(accessor = listing, public)]
pub struct Listing {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub donor: String,
    pub description: String,
    pub pickup_by: Timestamp,
    pub lat: f64,
    pub lng: f64,
    pub posted_by: Identity,
    pub claimed_by: Option<Identity>,
    // Indexed because a *view* may only start from an index — it cannot call
    // `iter()`. `claimed_by` would be the natural key, but an `Option` column
    // cannot be an index-filter argument in 2.10.1, so `my_pickups` starts from
    // the open listings and narrows to the sender in Rust.
    #[index(btree)]
    pub completed: bool,
}

// NOTE — no private-contact table, deliberately.
//
// The plan called for address/phone in a separate table guarded by a
// `#[client_visibility_filter]`. That is not possible on 2.10.1. The attribute
// exists only behind the crate's `unstable` feature, and the crate marks it:
//
//     // TODO: RLS filters are currently unimplemented, and are not enforced.
//
// It would compile, it would publish, and it would enforce nothing — every
// client would still receive every contact row. Shipping it would mean claiming
// row-level security in the pitch while having none, which is worse than not
// having the feature. Revisit when RLS lands.

/// Every claim attempt, won or lost.
///
/// An `event` table: rows are broadcast to subscribers and never stored in the
/// client cache — `count()` is 0 and `iter()` yields nothing, only `onInsert`
/// fires. Exactly right for something transient like an attempt.
#[spacetimedb::table(accessor = claim_attempt, public, event)]
pub struct ClaimAttempt {
    pub listing_id: u64,
    pub who: Identity,
    pub won: bool,
    pub at: Timestamp,
}

/// A scheduled table: inserting a row schedules `expire_listings`. Not `public`
/// — no client needs to see the timer, only its effects.
#[spacetimedb::table(accessor = expiry_tick, scheduled(expire_listings))]
pub struct ExpiryTick {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

/// A donor's standing details, so a restaurant types them once instead of once
/// per listing.
///
/// A separate table rather than columns on `user`: adding a column to a table
/// that already holds rows needs a default-value annotation, and on a live
/// database there is no way around that short of `--delete-data`. New tables
/// migrate cleanly. See CLAUDE.md trap #9 — this table exists in this shape
/// *because* of that trap.
///
/// `public`, so a volunteer can read the bio of whoever posted a pickup. That
/// is the point: it is the restaurant's shopfront. Nothing private belongs
/// here — every client receives every row.
#[spacetimedb::table(accessor = donor_profile, public)]
pub struct DonorProfile {
    #[primary_key]
    pub identity: Identity,
    pub name: String,
    pub bio: String,
    /// Free text, exactly as the donor typed it. Shown to volunteers and used
    /// for directions. `lat`/`lng` remain the authoritative location — this is
    /// the human-readable form of it, not a second source of truth.
    pub address: String,
    pub lat: f64,
    pub lng: f64,
}

/// A photo of the food, in its own table on purpose.
///
/// A photo is two orders of magnitude larger than a listing row, and every
/// client subscribes to every open listing. Keeping the image out of `listing`
/// means the board stays cheap to subscribe to, and a client pays for a photo
/// only when it asks for one — the client scopes its photo subscription to the
/// listings actually on screen.
#[spacetimedb::table(accessor = listing_photo, public)]
pub struct ListingPhoto {
    #[primary_key]
    pub listing_id: u64,
    /// A `data:image/...;base64,` URI. The client downscales before upload;
    /// `check_photo` is what actually holds the line.
    pub data_uri: String,
    /// Who attached it. Redundant with `listing.posted_by` today, but the check
    /// that guards a write should not depend on another table still being there.
    pub posted_by: Identity,
}

// ---------------------------------------------------------------------------
// Validation — user-facing copy. These strings are read aloud during the demo.
// ---------------------------------------------------------------------------

fn check_len(label: &str, value: &str, max: usize) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} can't be empty."));
    }
    if trimmed.chars().count() > max {
        return Err(format!("{label} has to be {max} characters or fewer."));
    }
    Ok(())
}

// A NaN or out-of-range coordinate renders as a broken marker for every
// subscriber, not just the poster. Reject it at the door.
fn check_coords(lat: f64, lng: f64) -> Result<(), String> {
    if !lat.is_finite() || !lng.is_finite() {
        return Err("That location isn't valid — pick a point on the map.".to_string());
    }
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lng) {
        return Err("That location is off the map.".to_string());
    }
    Ok(())
}

fn display_name(ctx: &ReducerContext, who: Identity) -> String {
    ctx.db
        .user()
        .identity()
        .find(who)
        .map(|u| u.name)
        .unwrap_or_else(|| "Someone else".to_string())
}

// ---------------------------------------------------------------------------
// Reducers
// ---------------------------------------------------------------------------

#[spacetimedb::reducer]
pub fn set_name(ctx: &ReducerContext, name: String) -> Result<(), String> {
    check_len("Your name", &name, MAX_NAME)?;
    let name = name.trim().to_string();

    match ctx.db.user().identity().find(ctx.sender()) {
        Some(existing) => {
            ctx.db.user().identity().update(User { name, ..existing });
        }
        None => {
            ctx.db.user().insert(User {
                identity: ctx.sender(),
                name,
            });
        }
    }
    Ok(())
}

#[spacetimedb::reducer]
pub fn post_listing(
    ctx: &ReducerContext,
    donor: String,
    description: String,
    pickup_by: Timestamp,
    lat: f64,
    lng: f64,
) -> Result<(), String> {
    check_len("Donor name", &donor, MAX_DONOR)?;
    check_len("Description", &description, MAX_DESCRIPTION)?;
    check_coords(lat, lng)?;

    ctx.db.listing().try_insert(Listing {
        id: 0, // auto_inc placeholder
        donor: donor.trim().to_string(),
        description: description.trim().to_string(),
        pickup_by,
        lat,
        lng,
        posted_by: ctx.sender(),
        claimed_by: None,
        completed: false,
    })?;
    Ok(())
}

// The centerpiece of the whole project.
//
// Reducers run as serialized transactions, so this check-then-set is atomic.
// When two volunteers claim the same listing at the same instant, one
// transaction observes `claimed_by == None` and writes; the other observes the
// first one's write and returns Err. No locking, no compare-and-swap, no retry
// loop on our side.
//
// Do NOT "simplify" this into an unconditional write.
#[spacetimedb::reducer]
pub fn claim_listing(ctx: &ReducerContext, id: u64) -> Result<(), String> {
    let listing = ctx
        .db
        .listing()
        .id()
        .find(id)
        .ok_or("That listing is no longer available.")?;

    if listing.completed {
        record_attempt(ctx, id, false);
        return Err("That pickup has already been delivered.".to_string());
    }

    if let Some(holder) = listing.claimed_by {
        let who = display_name(ctx, holder);
        record_attempt(ctx, id, false);
        log::info!("claim REJECTED  listing={id}  already held by {who}");
        return Err(format!("{who} claimed this first."));
    }

    // An invariant the database enforces, not the UI. Counted inside this
    // transaction, so it cannot be raced any more than the claim itself can.
    let held = open_claims(ctx, ctx.sender());
    if held >= MAX_OPEN_CLAIMS {
        record_attempt(ctx, id, false);
        return Err(format!(
            "You're already holding {held} pickups. Deliver or release one first."
        ));
    }

    log::info!("claim ACCEPTED  listing={id}  holder={:?}", ctx.sender());
    ctx.db.listing().id().update(Listing {
        claimed_by: Some(ctx.sender()),
        ..listing
    });
    record_attempt(ctx, id, true);
    Ok(())
}

#[spacetimedb::reducer]
pub fn unclaim_listing(ctx: &ReducerContext, id: u64) -> Result<(), String> {
    let listing = ctx
        .db
        .listing()
        .id()
        .find(id)
        .ok_or("That listing is no longer available.")?;

    if listing.completed {
        return Err("That pickup has already been delivered.".to_string());
    }
    // Only the volunteer holding the claim may release it.
    if listing.claimed_by != Some(ctx.sender()) {
        return Err("You don't hold this claim.".to_string());
    }

    ctx.db.listing().id().update(Listing {
        claimed_by: None,
        ..listing
    });
    Ok(())
}

#[spacetimedb::reducer]
pub fn complete_listing(ctx: &ReducerContext, id: u64) -> Result<(), String> {
    let listing = ctx
        .db
        .listing()
        .id()
        .find(id)
        .ok_or("That listing is no longer available.")?;

    if listing.completed {
        return Err("That pickup has already been delivered.".to_string());
    }
    // Only the volunteer holding the claim may complete it.
    if listing.claimed_by != Some(ctx.sender()) {
        return Err("You don't hold this claim.".to_string());
    }

    ctx.db.listing().id().update(Listing {
        completed: true,
        ..listing
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers — all of these run inside a caller's transaction.
// ---------------------------------------------------------------------------

/// How many open (claimed, not yet delivered) pickups this volunteer holds.
/// An index lookup, not a scan, because `claimed_by` is indexed.
fn open_claims(ctx: &ReducerContext, who: Identity) -> usize {
    ctx.db
        .listing()
        .completed()
        .filter(false)
        .filter(|l| l.claimed_by == Some(who))
        .count()
}

/// Broadcast a claim attempt to every subscriber.
///
/// VERIFIED against Maincloud: the losing write does NOT survive.
///
/// A reducer returning `Err` aborts its transaction, and this insert is inside
/// it, so every `won: false` row is discarded. Subscribers see winners only.
/// That is not a bug to route around — it is the same all-or-nothing property
/// that makes the contested claim safe.
///
/// The losing calls are left in deliberately. They cost nothing, they document
/// intent, and they would start working unchanged if the outcome ever moved
/// into an `Ok` result. See PLAN.md for why we are not making that trade.
fn record_attempt(ctx: &ReducerContext, listing_id: u64, won: bool) {
    ctx.db.claim_attempt().insert(ClaimAttempt {
        listing_id,
        who: ctx.sender(),
        won,
        at: ctx.timestamp,
    });
}

// ---------------------------------------------------------------------------
// Views — computed by the database, not by React.
// ---------------------------------------------------------------------------

/// Per-user view: each client gets only its own claimed pickups. The filtering
/// happens server-side, so "My Pickups" stops being a React `.filter()` over
/// rows the client should arguably never have received.
#[spacetimedb::view(accessor = my_pickups, public)]
fn my_pickups(ctx: &ViewContext) -> Vec<Listing> {
    let me = ctx.sender();
    ctx.db
        .listing()
        .completed()
        .filter(false)
        .filter(|l| l.claimed_by == Some(me))
        .collect()
}

// ---------------------------------------------------------------------------
// Expiry — the database calling our code on a timer, with no client involved.
// ---------------------------------------------------------------------------

/// Runs once, when the module is first published to an empty database.
#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) {
    arm(ctx);
    seed(ctx);
}

/// `init` only fires on a *fresh* database, so republishing over an existing
/// one leaves the timer unarmed. Call this once from the CLI in that case:
///
///     spacetime call food-pickup arm_expiry
///
/// Idempotent, so calling it twice will not schedule two tickers.
#[spacetimedb::reducer]
pub fn arm_expiry(ctx: &ReducerContext) {
    arm(ctx);
}

fn arm(ctx: &ReducerContext) {
    if ctx.db.expiry_tick().count() > 0 {
        return;
    }
    ctx.db.expiry_tick().insert(ExpiryTick {
        scheduled_id: 0,
        scheduled_at: ScheduleAt::Interval(EXPIRY_INTERVAL.into()),
    });
    log::info!("expiry ticker armed, every {}s", EXPIRY_INTERVAL.as_secs());
}

/// Called by the database itself on the schedule above. No client triggers this
/// and no client is awake for it — the row simply disappears from every open
/// board at once.
///
/// Only *unclaimed* listings expire. A volunteer who has claimed a pickup may
/// well be en route past the posted window; deleting it out from under them
/// would be wrong. An unclaimed listing past its window is food nobody came for.
#[spacetimedb::reducer]
pub fn expire_listings(ctx: &ReducerContext, _tick: ExpiryTick) {
    let now = ctx.timestamp;

    // Collect first: deleting while iterating the same table is asking for it.
    let stale: Vec<u64> = ctx
        .db
        .listing()
        .iter()
        .filter(|l| !l.completed && l.claimed_by.is_none() && l.pickup_by < now)
        .map(|l| l.id)
        .collect();

    for id in stale {
        ctx.db.listing().id().delete(id);
        log::info!("expired listing={id} — pickup window passed with no claim");
    }

    // Photos live in their own table, so deleting a listing does not take its
    // photo with it. Sweeping here rather than in each deleting path means no
    // future path can leak one: anything whose listing is gone or delivered
    // goes, wherever it was deleted from.
    let orphans: Vec<u64> = ctx
        .db
        .listing_photo()
        .iter()
        .filter(|p| {
            ctx.db
                .listing()
                .id()
                .find(p.listing_id)
                .is_none_or(|l| l.completed)
        })
        .map(|p| p.listing_id)
        .collect();

    for id in orphans {
        ctx.db.listing_photo().listing_id().delete(id);
    }
}

// ---------------------------------------------------------------------------
// Seed — replaces server/seed.sh.
// ---------------------------------------------------------------------------

/// donor, description, hours until pickup, lat, lng.
/// Donors are invented on purpose — never real business names in a public demo.
const SEED: &[(&str, &str, i64, f64, f64)] = &[
    ("Pratt Street Bakehouse", "About 20 day-old bagels and 6 loaves of sourdough", 3, 39.2857, -76.6100),
    ("Fells Point Grocer", "Produce boxes — greens, carrots, apples. Roughly 40 lbs", 5, 39.2820, -76.5930),
    ("Hampden Coffee Collective", "Pastries and 2 gallons of oat milk", 2, 39.3299, -76.6294),
    ("Federal Hill Deli", "14 wrapped sandwiches, made this morning", 2, 39.2757, -76.6105),
    ("Mount Vernon Catering Co", "Event surplus — trays of rice, roasted vegetables, salad", 4, 39.2976, -76.6157),
    ("Canton Fish Market", "Fresh fish on ice, must move today. About 25 lbs", 2, 39.2817, -76.5747),
    ("Charles Village Co-op", "Bulk dry goods — rice, lentils, pasta. 6 crates", 8, 39.3260, -76.6157),
    ("Station North Pizzeria", "18 par-baked pies", 3, 39.3110, -76.6155),
    ("Remington Farm Stand", "End-of-market vegetables, mixed. 5 crates", 4, 39.3200, -76.6280),
    ("Locust Point Cafe", "Soup in sealed containers, about 6 quarts", 3, 39.2686, -76.5880),
    ("Highlandtown Panaderia", "Sweet bread and rolls, roughly 60 pieces", 5, 39.2887, -76.5658),
    ("Pigtown Corner Market", "Dairy nearing date — milk, yogurt, cheese", 6, 39.2838, -76.6355),
    ("Bolton Hill Kitchen", "Prepared meals in trays, serves about 30", 4, 39.3050, -76.6220),
    ("Patterson Park Concessions", "Hot dogs, buns, condiments from a cancelled event", 2, 39.2894, -76.5790),
    ("Roland Park Bistro", "Family meal surplus — chicken, potatoes, greens", 5, 39.3520, -76.6320),
];

fn seed(ctx: &ReducerContext) {
    if ctx.db.listing().count() > 0 {
        return;
    }
    for (donor, description, hours, lat, lng) in SEED {
        ctx.db.listing().insert(Listing {
            id: 0,
            donor: (*donor).to_string(),
            description: (*description).to_string(),
            pickup_by: ctx.timestamp + TimeDuration::from_micros(hours * 3_600_000_000),
            lat: *lat,
            lng: *lng,
            posted_by: ctx.sender(),
            claimed_by: None,
            completed: false,
        });
    }
    log::info!("seeded {} listings", SEED.len());
}

/// Seed an already-published database without wiping it, the same way
/// `arm_expiry` arms an already-published one. No-ops if any listing exists.
#[spacetimedb::reducer]
pub fn seed_board(ctx: &ReducerContext) {
    seed(ctx);
}

/// Wipe every listing and lay down a fresh board with pickup windows measured
/// from *now*.
///
/// `seed_board` deliberately no-ops when the board is non-empty, which makes it
/// useless for the case that actually comes up: rehearsing. Between runs the
/// board is a mess of claimed, delivered and expired rows, and `expire_listings`
/// will have deleted every unclaimed listing whose window has passed — leaving
/// a board that is entirely claimed and cannot be re-seeded.
///
/// One command, same clean state every time. Run it before each rehearsal and
/// once more before judging.
#[spacetimedb::reducer]
pub fn reset_board(ctx: &ReducerContext) {
    let all: Vec<u64> = ctx.db.listing().iter().map(|l| l.id).collect();
    let n = all.len();
    for id in all {
        ctx.db.listing().id().delete(id);
        // Immediately, not on the next expiry tick — a rehearsal should not
        // start with the previous run's photos still on the board.
        ctx.db.listing_photo().listing_id().delete(id);
    }
    seed(ctx);
    log::info!("reset_board: cleared {n} listings, re-seeded {}", SEED.len());
}

// ---------------------------------------------------------------------------
// Ask Scraps — the database calls a language model.
//
// Verified end to end against Maincloud: a procedure can hold a transaction
// open briefly, close it, and then make an outbound HTTPS request. Reducers
// cannot — they must stay deterministic, which is the same property that makes
// two simultaneous claims resolve to exactly one winner. Procedures exist for
// precisely the work reducers must refuse.
// ---------------------------------------------------------------------------

/// Private: no `public`, so codegen skips it and no client can read a row.
/// Writing is a different matter — see `set_secret`.
#[spacetimedb::table(accessor = secret)]
pub struct Secret {
    #[primary_key]
    pub name: String,
    pub value: String,
}

/// Store a secret for procedures to read.
///
///     spacetime call food-pickup set_secret '"xai_api_key"' '"xai-..."'
///     spacetime call food-pickup set_secret '"xai_model"' '"grok-3"'
///
/// **The value never reaches a client.** `secret` is private, so it is skipped
/// by codegen and unreachable over subscriptions.
///
/// Writing it is possible for anyone who knows the database name, because any
/// connected client may call any reducer. An owner check would fix that, but
/// adding a `set_by` column to a table that already exists needs a default
/// value and there is no meaningful default `Identity` — the migration is
/// refused, and the alternative was wiping the board. Reading is what matters
/// and reading is not possible.
#[spacetimedb::reducer]
pub fn set_secret(ctx: &ReducerContext, name: String, value: String) -> Result<(), String> {
    check_len("Secret name", &name, 64)?;
    if value.trim().is_empty() {
        return Err("Secret value can't be empty.".to_string());
    }
    match ctx.db.secret().name().find(name.clone()) {
        Some(existing) => {
            ctx.db.secret().name().update(Secret { value, ..existing });
            log::info!("secret updated: {name}");
        }
        None => {
            ctx.db.secret().insert(Secret { name: name.clone(), value });
            log::info!("secret set: {name}");
        }
    }
    Ok(())
}

/// What the volunteer gets back.
#[derive(spacetimedb::SpacetimeType)]
pub struct Suggestion {
    /// Prose, already written for a person. Render it as-is.
    pub answer: String,
    /// The pickup being recommended, if the model picked one. The client
    /// selects this pin on the map.
    pub listing_id: Option<u64>,
    /// True when the model could not be reached. The client shows `answer`
    /// either way; this only lets it style a failure differently.
    pub failed: bool,
}

const MAX_QUESTION: usize = 200;
const MAX_CONTEXT_LISTINGS: usize = 25;
const DEFAULT_MODEL: &str = "grok-3";

fn fail(message: &str) -> Suggestion {
    Suggestion {
        answer: message.to_string(),
        listing_id: None,
        failed: true,
    }
}

/// A row of context for the model: what it is, how far, how long left.
struct Nearby {
    id: u64,
    donor: String,
    description: String,
    miles: f64,
    minutes_left: i64,
}

fn haversine_miles(lat1: f64, lng1: f64, lat2: f64, lng2: f64) -> f64 {
    let r = 3958.8_f64;
    let to_rad = |d: f64| d * std::f64::consts::PI / 180.0;
    let dlat = to_rad(lat2 - lat1);
    let dlng = to_rad(lng2 - lng1);
    let a = (dlat / 2.0).sin().powi(2)
        + to_rad(lat1).cos() * to_rad(lat2).cos() * (dlng / 2.0).sin().powi(2);
    2.0 * r * a.sqrt().asin()
}

/// Ask a question about what is on the board right now.
///
/// Open-ended on purpose: cravings ("something sweet"), distance ("what is
/// closest"), timing ("what expires soonest"), or anything else a volunteer
/// might actually type. The model is given the real listings with real
/// distances from wherever the volunteer's pin is, so its answer is grounded in
/// rows that exist rather than invented.
#[spacetimedb::procedure]
pub fn ask_scraps(
    ctx: &mut spacetimedb::ProcedureContext,
    question: String,
    lat: f64,
    lng: f64,
) -> Suggestion {
    use spacetimedb::http::{Body, Request};

    let question = question.trim().to_string();
    if question.is_empty() {
        return fail("Ask me what you're in the mood for.");
    }
    if question.chars().count() > MAX_QUESTION {
        return fail("That question is a bit long — try a shorter one.");
    }
    if !lat.is_finite() || !lng.is_finite() {
        return fail("I don't know where you are — drag your pin onto the map.");
    }

    // --- Everything that touches the database happens here, then stops. ---
    let (key, model, mut nearby) = ctx.with_tx(|tx| {
        let key = tx
            .db
            .secret()
            .name()
            .find("xai_api_key".to_string())
            .map(|s| s.value);
        let model = tx
            .db
            .secret()
            .name()
            .find("xai_model".to_string())
            .map(|s| s.value)
            .unwrap_or_else(|| DEFAULT_MODEL.to_string());
        let now = tx.timestamp;
        let rows: Vec<Nearby> = tx
            .db
            .listing()
            .completed()
            .filter(false)
            .filter(|l| l.claimed_by.is_none())
            .map(|l| Nearby {
                id: l.id,
                donor: l.donor.clone(),
                description: l.description.clone(),
                miles: haversine_miles(lat, lng, l.lat, l.lng),
                minutes_left: l
                    .pickup_by
                    .to_micros_since_unix_epoch()
                    .saturating_sub(now.to_micros_since_unix_epoch())
                    / 60_000_000,
            })
            .collect();
        (key, model, rows)
    });
    // --- Transaction closed. Network from here on. ---

    let Some(key) = key else {
        return fail("The assistant isn't configured yet.");
    };
    if nearby.is_empty() {
        return fail("There's nothing open on the board right now.");
    }

    // Nearest first, then cap: the model does not need the whole city, and a
    // shorter prompt is a cheaper and faster one.
    nearby.sort_by(|a, b| a.miles.partial_cmp(&b.miles).unwrap_or(std::cmp::Ordering::Equal));
    nearby.truncate(MAX_CONTEXT_LISTINGS);

    let board = nearby
        .iter()
        .map(|n| {
            let distance = if n.miles < 0.1 {
                "right where you are".to_string()
            } else {
                format!("{:.1} mi away", n.miles)
            };
            format!(
                "id={} | {} | {} | {} | {} min left",
                n.id, n.donor, n.description, distance, n.minutes_left
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let system = "You help a food-rescue volunteer in Baltimore choose a pickup. \
You are given every pickup currently open, with its distance from the volunteer and how long is left. \
Answer their question in at most two short sentences, like a person would. \
Only ever mention pickups from the list — never invent one. \
If one pickup clearly answers them, put its id in listing_id. If none fits, say so plainly. \
NEVER write an id, or the word id, in the answer text — name the donor instead. \
The answer is read aloud by a person; ids are for the app, not the reader. \
Reply with JSON only: {\"answer\": string, \"listing_id\": number or null}";

    let user = format!("Open pickups:\n{board}\n\nQuestion: {question}");

    // serde_json builds the body so quoting and escaping are handled. Donor and
    // description are free-form input from anonymous clients; hand-rolling this
    // string would be an injection waiting to happen.
    let payload = serde_json::json!({
        "model": model,
        "temperature": 0.3,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user },
        ],
    });

    let request = Request::builder()
        .method("POST")
        .uri("https://api.x.ai/v1/chat/completions")
        .header("authorization", format!("Bearer {key}"))
        .header("content-type", "application/json")
        .body(Body::from_bytes(payload.to_string().into_bytes()))
        .unwrap();

    let response = match ctx.http.send(request) {
        Ok(r) => r,
        Err(e) => {
            log::error!("ask_scraps: request failed: {e}");
            return fail("Couldn't reach the assistant just now.");
        }
    };

    let status = response.status();
    let body = response.into_body().into_string_lossy();
    if !status.is_success() {
        log::error!("ask_scraps: {} {}", status.as_u16(), body);
        return fail("The assistant turned that one down. Try asking differently.");
    }

    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&body) else {
        log::error!("ask_scraps: unparseable response: {body}");
        return fail("Couldn't make sense of the answer.");
    };
    let content = parsed["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    if content.is_empty() {
        return fail("The assistant didn't have an answer for that.");
    }

    // The model was asked for JSON. If it obliged, use the structured answer;
    // if it wrapped it in prose or a code fence, fall back to showing what it
    // said rather than an error — a slightly untidy answer beats none.
    let inner = content
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    match serde_json::from_str::<serde_json::Value>(inner) {
        Ok(v) => {
            let answer = v["answer"].as_str().unwrap_or(&content).trim().to_string();
            let id = v["listing_id"].as_u64();
            // Never point at a pickup that was not in the context we supplied.
            let listing_id = id.filter(|i| nearby.iter().any(|n| n.id == *i));
            Suggestion {
                answer: if answer.is_empty() { content } else { answer },
                listing_id,
                failed: false,
            }
        }
        Err(_) => Suggestion {
            answer: content,
            listing_id: None,
            failed: false,
        },
    }
}

// ---------------------------------------------------------------------------
// Donor profiles, photos, and the two procedures that call out to the network.
// ---------------------------------------------------------------------------

const MAX_BIO: usize = 240;
const MAX_ADDRESS: usize = 120;

/// Cap on the encoded photo string. A 720px JPEG at moderate quality lands
/// around 50 KB, which is roughly 68 KB of base64. This leaves real headroom
/// without letting one client push a megabyte into a table every other client
/// reads.
const MAX_PHOTO_CHARS: usize = 140_000;

/// Nominatim's usage policy asks for a descriptive User-Agent that identifies
/// the application. A browser will not let a page set that header; a procedure
/// can. That is the reason `geocode` runs here and not in React.
const USER_AGENT: &str = "Scraps/1.0 (HopHacks food-rescue demo; +https://github.com/ellachh/scraps-hophacks)";

fn check_photo(data_uri: &str) -> Result<(), String> {
    if !(data_uri.starts_with("data:image/jpeg;base64,")
        || data_uri.starts_with("data:image/png;base64,")
        || data_uri.starts_with("data:image/webp;base64,"))
    {
        return Err("That photo isn't in a format we can store.".to_string());
    }
    if data_uri.len() > MAX_PHOTO_CHARS {
        return Err("That photo is too large — try taking it again.".to_string());
    }
    Ok(())
}

/// Percent-encode everything outside the unreserved set. Small enough to write
/// out, and one fewer dependency in a crate that has to compile to wasm.
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Save the details a donor would otherwise retype on every listing.
///
/// Upserts against `ctx.sender()` and nothing else. The identity is never a
/// parameter — a client can pass any value it likes, so accepting one here
/// would let anyone rewrite anyone's shopfront.
#[spacetimedb::reducer]
pub fn save_donor_profile(
    ctx: &ReducerContext,
    name: String,
    bio: String,
    address: String,
    lat: f64,
    lng: f64,
) -> Result<(), String> {
    check_len("Restaurant name", &name, MAX_DONOR)?;
    check_coords(lat, lng)?;

    // Bio and address are optional. A donor who wants only a name and a pin
    // should not be stopped; only the caps are enforced.
    if bio.trim().chars().count() > MAX_BIO {
        return Err(format!("Bio has to be {MAX_BIO} characters or fewer."));
    }
    if address.trim().chars().count() > MAX_ADDRESS {
        return Err(format!("Address has to be {MAX_ADDRESS} characters or fewer."));
    }

    let row = DonorProfile {
        identity: ctx.sender(),
        name: name.trim().to_string(),
        bio: bio.trim().to_string(),
        address: address.trim().to_string(),
        lat,
        lng,
    };

    match ctx.db.donor_profile().identity().find(ctx.sender()) {
        Some(_) => ctx.db.donor_profile().identity().update(row),
        None => ctx.db.donor_profile().insert(row),
    };
    Ok(())
}

/// Post a listing and attach its photo in the same transaction.
///
/// `post_listing` cannot do this. A reducer returns `Result<(), String>` and
/// cannot hand the new `id` back, so "post, then attach" would mean the client
/// guessing which row it had just made. Inserting both here means the photo
/// lands with the listing or not at all — there is no window in which the board
/// shows a photoless row that is about to grow one.
///
/// An empty `photo` means no photo. `post_listing` is untouched and still works.
#[spacetimedb::reducer]
pub fn post_listing_with_photo(
    ctx: &ReducerContext,
    donor: String,
    description: String,
    pickup_by: Timestamp,
    lat: f64,
    lng: f64,
    photo: String,
) -> Result<(), String> {
    check_len("Donor name", &donor, MAX_DONOR)?;
    check_len("Description", &description, MAX_DESCRIPTION)?;
    check_coords(lat, lng)?;
    if !photo.is_empty() {
        check_photo(&photo)?;
    }

    let listing = ctx.db.listing().try_insert(Listing {
        id: 0, // auto_inc placeholder
        donor: donor.trim().to_string(),
        description: description.trim().to_string(),
        pickup_by,
        lat,
        lng,
        posted_by: ctx.sender(),
        claimed_by: None,
        completed: false,
    })?;

    if !photo.is_empty() {
        ctx.db.listing_photo().insert(ListingPhoto {
            listing_id: listing.id,
            data_uri: photo,
            posted_by: ctx.sender(),
        });
    }
    Ok(())
}

/// Attach or replace the photo on a listing you posted.
#[spacetimedb::reducer]
pub fn attach_photo(ctx: &ReducerContext, listing_id: u64, data_uri: String) -> Result<(), String> {
    check_photo(&data_uri)?;

    let listing = ctx
        .db
        .listing()
        .id()
        .find(listing_id)
        .ok_or("That listing is no longer available.")?;

    // Access control is this line. Any connected client may call any reducer,
    // so without it anyone could replace the photo on anyone's pickup.
    if listing.posted_by != ctx.sender() {
        return Err("You didn't post this pickup.".to_string());
    }

    let row = ListingPhoto {
        listing_id,
        data_uri,
        posted_by: ctx.sender(),
    };
    match ctx.db.listing_photo().listing_id().find(listing_id) {
        Some(_) => ctx.db.listing_photo().listing_id().update(row),
        None => ctx.db.listing_photo().insert(row),
    };
    Ok(())
}

/// Take the photo back off a listing you posted.
#[spacetimedb::reducer]
pub fn remove_photo(ctx: &ReducerContext, listing_id: u64) -> Result<(), String> {
    let photo = ctx
        .db
        .listing_photo()
        .listing_id()
        .find(listing_id)
        .ok_or("There is no photo on that pickup.")?;

    if photo.posted_by != ctx.sender() {
        return Err("You didn't post this pickup.".to_string());
    }

    ctx.db.listing_photo().listing_id().delete(listing_id);
    Ok(())
}

// ---------------------------------------------------------------------------
// Procedures — the database making outbound calls.
//
// Both follow the same shape the spike established: read what is needed inside
// a short transaction, let it close, and only then touch the network. Neither
// ever panics; both return a struct carrying either a result or a sentence the
// UI can show, because a procedure that fails mid-demo must degrade to a
// message and not to a broken screen.
// ---------------------------------------------------------------------------

#[derive(spacetimedb::SpacetimeType)]
pub struct GeoResult {
    pub ok: bool,
    pub lat: f64,
    pub lng: f64,
    pub label: String,
    pub error: String,
}

impl GeoResult {
    fn failed(message: impl Into<String>) -> Self {
        GeoResult {
            ok: false,
            lat: 0.0,
            lng: 0.0,
            label: String::new(),
            error: message.into(),
        }
    }
}

/// Turn a typed address into a point on the map, via OpenStreetMap's geocoder.
///
/// This runs in the database for a concrete reason rather than an architectural
/// one: Nominatim's usage policy requires a descriptive `User-Agent`, and the
/// browser fetch API silently refuses to set that header. A procedure can, so
/// the request we actually make is the request their policy asks for.
///
/// It also keeps the client's standing rule intact — there is no `fetch`
/// anywhere in `client/`.
#[spacetimedb::procedure]
pub fn geocode(ctx: &mut spacetimedb::ProcedureContext, address: String) -> GeoResult {
    use spacetimedb::http::{Body, Request};

    let query = address.trim();
    if query.is_empty() {
        return GeoResult::failed("Type an address first.");
    }
    if query.chars().count() > MAX_ADDRESS {
        return GeoResult::failed("That address is too long to look up.");
    }

    let uri = format!(
        "https://nominatim.openstreetmap.org/search?format=json&limit=1&q={}",
        urlencode(query)
    );

    let request = match Request::builder()
        .method("GET")
        .uri(&uri)
        .header("user-agent", USER_AGENT)
        .header("accept", "application/json")
        .body(Body::from_bytes(Vec::new()))
    {
        Ok(r) => r,
        Err(e) => return GeoResult::failed(format!("Couldn't build that lookup: {e}")),
    };

    let body = match ctx.http.send(request) {
        Ok(response) => {
            let status = response.status();
            if !status.is_success() {
                return GeoResult::failed(format!(
                    "The address lookup answered {}.",
                    status.as_u16()
                ));
            }
            response.into_body().into_string_lossy()
        }
        Err(e) => return GeoResult::failed(format!("Couldn't reach the address lookup: {e}")),
    };

    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&body) else {
        return GeoResult::failed("The address lookup sent something we couldn't read.");
    };

    let Some(first) = parsed.get(0) else {
        return GeoResult::failed("No match for that address — drop the pin instead.");
    };

    // Nominatim returns coordinates as strings, not numbers.
    let lat = first
        .get("lat")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<f64>().ok());
    let lng = first
        .get("lon")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<f64>().ok());
    let label = first
        .get("display_name")
        .and_then(|v| v.as_str())
        .unwrap_or(query)
        .to_string();

    match (lat, lng) {
        // Same validation the reducers apply. A geocoder is just another
        // untrusted source of coordinates.
        (Some(lat), Some(lng)) if check_coords(lat, lng).is_ok() => GeoResult {
            ok: true,
            lat,
            lng,
            label,
            error: String::new(),
        },
        _ => GeoResult::failed("That lookup came back without a usable location."),
    }
}

#[derive(spacetimedb::SpacetimeType)]
pub struct DescriptionDraft {
    pub ok: bool,
    pub text: String,
    pub error: String,
}

impl DescriptionDraft {
    fn failed(message: impl Into<String>) -> Self {
        DescriptionDraft {
            ok: false,
            text: String::new(),
            error: message.into(),
        }
    }
}

const SUGGEST_SYSTEM: &str = "You write listings for a food-rescue board where restaurants post \
surplus food and volunteer drivers claim it. Given the business and a short note, write one plain \
description a driver can act on: what the food is, roughly how much, and any handling note that \
matters. Under 180 characters. No emoji, no exclamation marks, no marketing language, and never \
invent a detail the note does not support. Reply with the description and nothing else.";

/// Draft a listing description from a few words, using Grok.
///
/// The API key is read from the private `secret` table, which has no `public`
/// and is therefore skipped by codegen and unreachable over a subscription. No
/// key is in the client bundle and none is in the repository.
///
/// This is a *suggestion*. The donor can take it, edit it, or ignore it and
/// type their own — the reducer that actually posts the listing neither knows
/// nor cares where the text came from. If this procedure fails, posting still
/// works; that is the whole reason it is shaped as a suggestion.
#[spacetimedb::procedure]
pub fn suggest_description(
    ctx: &mut spacetimedb::ProcedureContext,
    donor: String,
    note: String,
    photo: String,
) -> DescriptionDraft {
    use spacetimedb::http::{Body, Request};

    // A photo alone is enough — the whole point is suggesting a caption BEFORE
    // the donor types anything. Only refuse when there is nothing at all to go on.
    let has_photo = photo.starts_with("data:image/");
    if note.trim().is_empty() && !has_photo {
        return DescriptionDraft::failed("Add a photo, or jot down what the food is.");
    }

    // 1. Read the key and the model inside one short transaction.
    //
    // Same two secrets `ask_scraps` reads, deliberately. Two AI features
    // disagreeing about which model to call is the kind of failure that only
    // surfaces on whichever one gets demoed second.
    let (key, model) = ctx.with_tx(|tx| {
        let key = tx
            .db
            .secret()
            .name()
            .find("xai_api_key".to_string())
            .map(|s| s.value);
        // A photo needs a vision-capable model. `xai_vision_model` overrides
        // `xai_model` when one is set, so the right id can be swapped in with a
        // `set_secret` call rather than a republish.
        let model = tx
            .db
            .secret()
            .name()
            .find(if has_photo { "xai_vision_model" } else { "xai_model" }.to_string())
            .or_else(|| tx.db.secret().name().find("xai_model".to_string()))
            .map(|s| s.value)
            .unwrap_or_else(|| DEFAULT_MODEL.to_string());
        (key, model)
    });
    let Some(key) = key else {
        return DescriptionDraft::failed("No model key is set on this database.");
    };

    // 2. Transaction closed. Network I/O never happens with one open.
    //
    // With a photo the content becomes an array of parts — the OpenAI-compatible
    // shape xAI accepts — so the model can read the image. Without one it stays
    // a plain string, because a text-only request should not pay for the
    // multi-part encoding.
    let prompt = if note.trim().is_empty() {
        format!("Business: {}\nDescribe the food in this photo.", donor.trim())
    } else {
        format!("Business: {}\nNote: {}", donor.trim(), note.trim())
    };

    let content = if has_photo {
        serde_json::json!([
            { "type": "text", "text": prompt },
            { "type": "image_url", "image_url": { "url": photo } },
        ])
    } else {
        serde_json::json!(prompt)
    };

    let payload = serde_json::json!({
        "model": model,
        "temperature": 0.4,
        "max_tokens": 120,
        "messages": [
            { "role": "system", "content": SUGGEST_SYSTEM },
            { "role": "user", "content": content },
        ],
    });

    let request = match Request::builder()
        .method("POST")
        .uri("https://api.x.ai/v1/chat/completions")
        .header("authorization", format!("Bearer {key}"))
        .header("content-type", "application/json")
        .body(Body::from_bytes(payload.to_string().into_bytes()))
    {
        Ok(r) => r,
        Err(e) => return DescriptionDraft::failed(format!("Couldn't build that request: {e}")),
    };

    let body = match ctx.http.send(request) {
        Ok(response) => {
            let status = response.status();
            let text = response.into_body().into_string_lossy();
            if !status.is_success() {
                // Deliberately not echoing the body: an upstream error message
                // is not something to render into a donor's form.
                log::warn!("suggest_description: xAI returned {} — {text}", status.as_u16());
                return DescriptionDraft::failed(format!("The model answered {}.", status.as_u16()));
            }
            text
        }
        Err(e) => return DescriptionDraft::failed(format!("Couldn't reach the model: {e}")),
    };

    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&body) else {
        return DescriptionDraft::failed("The model sent something we couldn't read.");
    };

    let content = parsed
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .trim();

    if content.is_empty() {
        return DescriptionDraft::failed("The model didn't have a suggestion for that.");
    }

    // The same cap `post_listing` enforces. A suggestion the form cannot submit
    // is worse than no suggestion.
    let text: String = content.chars().take(MAX_DESCRIPTION).collect();
    DescriptionDraft {
        ok: true,
        text,
        error: String::new(),
    }
}
