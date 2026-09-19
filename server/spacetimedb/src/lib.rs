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

fn check_len(field: &str, value: &str, max: usize) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{field} cannot be empty"));
    }
    if trimmed.chars().count() > max {
        return Err(format!("{field} must be {max} characters or fewer"));
    }
    Ok(())
}

// A NaN or out-of-range coordinate renders as a broken marker for every
// subscriber, not just the poster. Reject it at the door.
fn check_coords(lat: f64, lng: f64) -> Result<(), String> {
    if !lat.is_finite() || !lng.is_finite() {
        return Err("latitude and longitude must be finite numbers".to_string());
    }
    if !(-90.0..=90.0).contains(&lat) {
        return Err("latitude must be between -90 and 90".to_string());
    }
    if !(-180.0..=180.0).contains(&lng) {
        return Err("longitude must be between -180 and 180".to_string());
    }
    Ok(())
}

#[spacetimedb::reducer]
pub fn set_name(ctx: &ReducerContext, name: String) -> Result<(), String> {
    check_len("name", &name, MAX_NAME)?;
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
    check_len("donor", &donor, MAX_DONOR)?;
    check_len("description", &description, MAX_DESCRIPTION)?;
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
        .ok_or_else(|| format!("listing {id} no longer exists"))?;

    if listing.completed {
        return Err("that pickup is already complete".to_string());
    }
    if listing.claimed_by.is_some() {
        return Err("someone else claimed this first".to_string());
    }

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
        .ok_or_else(|| format!("listing {id} no longer exists"))?;

    if listing.completed {
        return Err("that pickup is already complete".to_string());
    }
    // Only the volunteer holding the claim may release it.
    if listing.claimed_by != Some(ctx.sender()) {
        return Err("you do not hold this claim".to_string());
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
        .ok_or_else(|| format!("listing {id} no longer exists"))?;

    if listing.completed {
        return Err("that pickup is already complete".to_string());
    }
    // Only the volunteer holding the claim may complete it.
    if listing.claimed_by != Some(ctx.sender()) {
        return Err("you do not hold this claim".to_string());
    }

    ctx.db.listing().id().update(Listing {
        completed: true,
        ..listing
    });
    Ok(())
}
