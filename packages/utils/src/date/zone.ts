/**
 * The app's time zone as a fixed UTC offset, in minutes. Every date helper in this package judges
 * calendar days/weeks/months and formats times in this zone, never in the runtime's local time zone,
 * which differs between the browser and the server (Cloudflare Workers always runs in UTC). Set it
 * to the time zone in `docs/spec.md` "総論 > 提供形態". Default: JST (UTC+9).
 *
 * A fixed offset can't follow daylight saving time. For a zone with DST, rewrite `toWallClock` /
 * `fromWallClock` on `Intl.DateTimeFormat` with a `timeZone` instead.
 */
export const TIME_ZONE_OFFSET_MINUTES = 9 * 60

const offsetMs = TIME_ZONE_OFFSET_MINUTES * 60 * 1000

/** The app time zone's wall clock at `date`, as a `Date` whose UTC getters read that wall clock. */
export const toWallClock = (date: Date): Date => new Date(date.getTime() + offsetMs)

/** Inverse of `toWallClock`: the instant at which the app time zone's wall clock shows `wallClock`. */
export const fromWallClock = (wallClock: Date): Date => new Date(wallClock.getTime() - offsetMs)
