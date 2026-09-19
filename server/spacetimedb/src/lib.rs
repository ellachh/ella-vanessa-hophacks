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
/// NOTE, and verify this before relying on it: a reducer that returns `Err`
/// aborts its transaction, and this insert is part of that transaction. The
/// losing write may therefore roll back, leaving the ticker showing only
/// winners. See PLAN.md for the 30-second check. If it does roll back, the fix
/// is a design change, not a patch: the loser's outcome would have to travel in
/// an `Ok` result rather than an `Err`, which costs us the rejection toast.
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
