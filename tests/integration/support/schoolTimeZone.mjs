/*
 * THE SCHOOL'S WALL CLOCK, FOR A SUITE THAT RUNS BROWSER AND SERVER CODE IN
 * ONE PROCESS.
 *
 * The deadline finalizer resolves a Warm-Up's bell times in the school's zone
 * (functions/shared/sectionDeadline.mjs SCHOOL_TIME_ZONE); a student's
 * Chromebook resolves the same schedule in its own zone, which at school is
 * the same one. A suite that plays both parts must give them one clock, or a
 * CI runner on UTC would put the "student" in a different class period from
 * the server. Imported FIRST, before any module that reads a date.
 */
import { SCHOOL_TIME_ZONE } from '../../../functions/shared/sectionDeadline.mjs';

process.env.TZ = SCHOOL_TIME_ZONE;

export { SCHOOL_TIME_ZONE };
