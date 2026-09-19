/**
 * Where the module lives. Both laptops must point at the same instance or the
 * simultaneous-claim demo proves nothing.
 *
 * Maincloud rather than a local `spacetime start`: the demo needs two machines
 * reaching one instance, and hackathon wifi frequently blocks peer connections
 * between clients. See PLAN.md, "Where we deploy".
 *
 * Values confirmed from server/spacetime.json (`"server": "maincloud"`,
 * database `food-pickup`) and server/CLAUDE.md, which maps the `maincloud`
 * alias to this URI.
 */
export const SPACETIME_URI = 'https://maincloud.spacetimedb.com'
export const DATABASE_NAME = 'food-pickup'

/**
 * Reading needs no credentials: both tables are `public`, which in SpacetimeDB
 * means any connected client may subscribe and read. Writes still go through
 * reducers, which authorize against `ctx.sender`.
 */
