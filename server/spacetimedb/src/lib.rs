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
            format!(
                "id={} | {} | {} | {:.1} mi away | {} min left",
                n.id, n.donor, n.description, n.miles, n.minutes_left
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let system = "You help a food-rescue volunteer in Baltimore choose a pickup. \
You are given every pickup currently open, with its distance from the volunteer and how long is left. \
Answer their question in at most two short sentences, like a person would. \
Only ever mention pickups from the list — never invent one. \
If one pickup clearly answers them, recommend it and give its id. If none fits, say so plainly. \
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
