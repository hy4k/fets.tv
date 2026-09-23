/**
 * The loads worth telling apart from an empty answer.
 *
 * Deliberately not every table in the snapshot. A missing lab, workstation or
 * notice template shows up as a screen with nothing on it, which is obvious
 * and not a claim about the room; these are the ones where silence means
 * "all clear".
 */
export type SnapshotTable =
  | "candidates"
  | "incidents"
  | "candidate_materials"
  | "candidate_breaks"
  | "staff_days"
  | "duty_posts"
  | "profiles";

/** What the console has, and what it only appears to have. */
export type Gaps = {
  /** Never read. What these hold is unknown, not empty. */
  unread: SnapshotTable[];
  /** Read once; the last re-read failed. There are rows, from before. */
  stale: SnapshotTable[];
};

/**
 * Where each table stands after a refresh, given which loads just failed.
 *
 * Three rules, and the middle one is the point. A table that has never been
 * read stays unread until a fetch of it actually succeeds — failing again
 * tells us nothing new. A table that *had* been read and now fails becomes
 * stale rather than unread, because the rows from before are still the best
 * available and are worth leaving on the screen. And anything that succeeds
 * is neither: it is simply current.
 *
 * The distinction matters because the two call for opposite handling. Unread
 * means refuse to answer; stale means answer, and say when you last looked.
 */
export function gapsAfterRefresh(prev: Gaps, failed: SnapshotTable[]): Gaps {
  return {
    unread: prev.unread.filter((t) => failed.includes(t)),
    stale: failed.filter((t) => !prev.unread.includes(t)),
  };
}
