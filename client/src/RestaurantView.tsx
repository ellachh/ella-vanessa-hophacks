import type { Identity } from 'spacetimedb'

import { sameIdentity } from './identity'
import type { Listing, User } from './module_bindings/types'
import { pickupClock, timeLeft, urgencyOf } from './pickupWindow'

/**
 * What a donor sees: the pickups they posted, and what has happened to each.
 *
 * Same subscription as the volunteer board — `posted_by` is already on every
 * listing, so this needs no new table, no new query and no new reducer. It is
 * a different reading of rows the client already holds.
 *
 * Worth watching during the demo: when a volunteer claims one of these, the
 * row changes under the donor with no refresh. It is the same contested-claim
 * moment seen from the other side of the transaction.
 */
export default function RestaurantView({
  listings,
  users,
  me,
  onPost,
}: {
  listings: readonly Listing[]
  users: readonly User[]
  me: Identity | undefined
  onPost: () => void
}) {
  const posted = listings.filter((l) => sameIdentity(l.postedBy, me))

  return (
    <aside className="panel">
      <span className="badge badge--open">Donor</span>
      <h2 className="panel__donor">What you posted</h2>

      {posted.length === 0 ? (
        <>
          <p className="panel__desc">
            Nothing posted yet. When you put surplus food up, it appears on every
            volunteer's map instantly — and you will see here the moment someone
            claims it.
          </p>
          <div className="panel__actions">
            <button className="btn btn--primary" onClick={onPost}>
              Post your first pickup
            </button>
          </div>
        </>
      ) : (
        <>
          <ul className="donor__list">
            {posted.map((l) => {
              const holder = l.claimedBy
                ? (users.find((u) => sameIdentity(u.identity, l.claimedBy))?.name ??
                  'a volunteer')
                : null
              return (
                <li key={String(l.id)} className="donor__row">
                  <p className={`panel__when panel__when--${urgencyOf(l.pickupBy)}`}>
                    {timeLeft(l.pickupBy)}
                  </p>
                  <p className="donor__what">{l.donor}</p>
                  <p className="donor__desc">{l.description}</p>
                  <p className={`donor__status donor__status--${holder ? 'taken' : 'open'}`}>
                    {holder ? `${holder} is collecting this` : 'Waiting for a volunteer'}
                  </p>
                  <p className="panel__meta">Pick up by {pickupClock(l.pickupBy)}</p>
                </li>
              )
            })}
          </ul>
          <div className="panel__actions">
            <button className="btn btn--primary" onClick={onPost}>
              Post another
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
