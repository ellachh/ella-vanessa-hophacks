use spacetimedb::{Identity, ReducerContext, Table, Timestamp};

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

#[spacetimedb::reducer]
pub fn set_name(ctx: &ReducerContext, name: String) {
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
}

#[spacetimedb::reducer]
pub fn post_listing(
    ctx: &ReducerContext,
    donor: String,
    description: String,
    pickup_by: Timestamp,
    lat: f64,
    lng: f64,
) {
    ctx.db.listing().insert(Listing {
        id: 0, // auto_inc placeholder
        donor,
        description,
        pickup_by,
        lat,
        lng,
        posted_by: ctx.sender(),
        claimed_by: None,
        completed: false,
    });
}

// The centerpiece of the whole project.
//
// Reducers run as serialized transactions, so this check-then-set is atomic.
// When two volunteers claim the same listing at the same instant, one
// transaction observes `claimed_by == None` and writes; the other observes the
// first one's write and returns without touching the row. No locking, no
// compare-and-swap, no retry loop on our side.
//
// Do NOT "simplify" this into an unconditional write.
#[spacetimedb::reducer]
pub fn claim_listing(ctx: &ReducerContext, id: u64) {
    let Some(listing) = ctx.db.listing().id().find(id) else {
        return;
    };
    if listing.completed || listing.claimed_by.is_some() {
        return; // already taken — the losing claimant no-ops
    }
    ctx.db.listing().id().update(Listing {
        claimed_by: Some(ctx.sender()),
        ..listing
    });
}

#[spacetimedb::reducer]
pub fn unclaim_listing(ctx: &ReducerContext, id: u64) {
    let Some(listing) = ctx.db.listing().id().find(id) else {
        return;
    };
    // Only the volunteer holding the claim may release it.
    if listing.completed || listing.claimed_by != Some(ctx.sender()) {
        return;
    }
    ctx.db.listing().id().update(Listing {
        claimed_by: None,
        ..listing
    });
}

#[spacetimedb::reducer]
pub fn complete_listing(ctx: &ReducerContext, id: u64) {
    let Some(listing) = ctx.db.listing().id().find(id) else {
        return;
    };
    // Only the volunteer holding the claim may complete it.
    if listing.claimed_by != Some(ctx.sender()) {
        return;
    }
    ctx.db.listing().id().update(Listing {
        completed: true,
        ..listing
    });
}
