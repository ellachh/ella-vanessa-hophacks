use spacetimedb::{Identity, ReducerContext, Table, Timestamp};

// Input caps. These exist to keep one bad row from breaking every client:
// every client subscribes to every row, so a malformed listing is not a local
// problem, it is everyone's problem.
const MAX_NAME: usize = 40;
const MAX_DONOR: usize = 80;
const MAX_DESCRIPTION: usize = 280;

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
    pub completed: bool,
}

// User-facing copy. These strings are read aloud during the demo and shown to
// judges, so they are written for a person, not a developer.
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
// The Err matters for the demo: it is what lets the losing client say "someone
// beat you to it" instead of silently watching the row change. Returning Err
// also aborts the transaction, so the loser writes nothing.
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
        return Err("That pickup has already been delivered.".to_string());
    }
    // Name the winner. "Vanessa claimed this first" makes the contention
    // concrete for a judge in a way "already claimed" does not.
    if let Some(holder) = listing.claimed_by {
        let who = ctx
            .db
            .user()
            .identity()
            .find(holder)
            .map(|u| u.name)
            .unwrap_or_else(|| "Someone else".to_string());
        log::info!("claim REJECTED  listing={id}  already held by {who}");
        return Err(format!("{who} claimed this first."));
    }

    log::info!("claim ACCEPTED  listing={id}  holder={:?}", ctx.sender());
    ctx.db.listing().id().update(Listing {
        claimed_by: Some(ctx.sender()),
        ..listing
    });
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
