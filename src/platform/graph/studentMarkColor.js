/*
 * THE COLOUR OF A POINT THE STUDENT MARKED ON A GRAPH, BEFORE ANYTHING IS GRADED
 * (TL38, finding A2-118; issue #386 R18).
 *
 * Every point a student selected on a graph to answer an analysis part (an
 * intercept, a vertex) or to mark a feature was drawn red, whether or not it was
 * right — so a correct y-intercept looked like a mistake. Red says "wrong"
 * everywhere else on the platform (a failed part's border and tint, the
 * wrong-answer chip), and a mark is the student's own work, not a verdict.
 *
 * Teal: apart from the red it replaces, from the blue of the figure they are
 * reading (the curve, its authored points) and the purple of a reflected point,
 * and not the green of "correct" either, which a mark must not claim before it
 * has been checked. 4.5:1 against the graph paper, as the red had.
 *
 * Not for a series colour. A comparison that draws two models on one plane
 * (Sequence Explorer's "Compare the Sequences", the second line on a shared
 * plane) tells them apart by colour, and its red names WHICH model a point is
 * on, with a matching button; it is not a mark the student made to answer.
 *
 * Pure: the sign-in page loads nothing from here.
 */
export const STUDENT_MARK_COLOR = '#00838f';
