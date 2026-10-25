"""Build the Algebra II Honors District DOL #2 review (Assignment V5 teacher import).

    python3 scripts/content/build_algebra2_honors_dol2_review.py

writes teacher-import-jsons/algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json
(or the path given as the first argument). Node must be on PATH: the three
audited Digital SAT items are converted by the platform's own
functions/lib/ccmrAssignmentBank.js, exactly as an Honors class would get them.

Blueprint (DeSoto ISD, SY26-27, 20 items):
  A2.2A 3 | A2.3A 2 | A2.3B 2 | A2.6C 3 | A2.6D 3 | A2.6E 3 | A2.6F 3
Out of scope (struck on the blueprint): sqrt, 1/x, x^3, cbrt, b^x, log_b x,
asymptotic behavior, linear-quadratic systems.

Static answers are computed from the mathematics below and asserted, so a typo in
a key fails the build instead of reaching a student. Generated items are checked
by tests/platform/algebra2HonorsDol2Review.test.mjs, which samples versions of
every family through the platform's own engine and recomputes each key.
"""
import json
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else (
    ROOT / 'teacher-import-jsons/algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json')


# ---------------------------------------------------------------- helpers
def fam():
    return {'scope': 'assignment'}


def gen(parameters, derived=None, constraints=None):
    out = {'parameters': parameters}
    if derived:
        out['derived'] = derived
    if constraints:
        out['constraints'] = constraints
    return out


def ints(lo, hi, exclude=None, step=None):
    spec = {'type': 'int', 'min': lo, 'max': hi}
    if exclude:
        spec['exclude'] = exclude
    if step:
        spec['step'] = step
    return spec


def choice(*values):
    return {'type': 'choice', 'values': list(values)}


def field(fid, label, profile, answer, accepted=None, options=None):
    out = {'id': fid, 'label': label, 'inputProfile': profile, 'answer': answer}
    if profile == 'orderedPair':
        out['answerFormat'] = 'orderedPair'
    if profile == 'choice':
        out['type'] = 'choice'
        out['options'] = options
        assert answer in options, (fid, answer, options)
        assert len(options) >= 3, f'{fid}: a binary choice is a weak check'
        assert len(set(options)) == len(options), f'{fid}: duplicate options'
    if accepted:
        out['acceptedAnswers'] = accepted
    return out


def notes(*steps):
    return {'steps': [{'title': t, 'instruction': i} for t, i in steps]}


_scaffolds_written = [0]


def scaffold(prompt, right, wrong):
    """A two-choice "Let's back up" step. The platform draws the choices in the
    order written, so the right one alternates between first and second."""
    _scaffolds_written[0] += 1
    options = [right, wrong] if _scaffolds_written[0] % 2 else [wrong, right]
    return {'prompt': f'Let’s back up. {prompt}', 'options': options, 'correct': right}


def review(headline, reasoning, summary, common_error):
    return {'headline': headline, 'reasoning': reasoning, 'answerSummary': summary, 'commonError': common_error}


def det3(m):
    (a, b, c), (d, e, f), (g, h, i) = m
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)


def solve3(m, rhs):
    d = det3(m)
    assert d != 0
    cols = []
    for k in range(3):
        mk = [row[:] for row in m]
        for r in range(3):
            mk[r][k] = rhs[r]
        cols.append(Fraction(det3(mk), d))
    return cols


def f_abs(a, h, k, x):
    return a * abs(x - h) + k


# ================================================================ WARM-UP
# Every Warm-Up question is a Question Family slot, so a Warm-Up Recovery can
# deal fresh versions. Shared: the class sees one version together.
warmup = [
    {
        'questionId': 'dol2r-wu-1',
        'standard': 'A2.2A',
        'dok': 2, 'difficultyBand': 2,
        'prompt': 'For $g(x)={{a}}|x {{mh|signed}}| {{k|signed}}$, identify the key attributes of its graph.',
        'studentActions': ['multipleResponses'],
        'answerFields': [
            field('vertex', 'Vertex', 'orderedPair', '({{h}}, {{k}})'),
            field('axis', 'Axis of symmetry (an equation)', 'equation', 'x={{h}}'),
            field('range', 'Range (interval notation)', 'interval', '(-∞, {{k}}]'),
            field('yint', 'y-intercept (ordered pair)', 'orderedPair', '(0, {{yint}})'),
        ],
        'hints': [
            'Compare g with vertex form a|x − h| + k. The vertex is (h, k), and h has the opposite sign of the number you see inside the bars.',
            'The axis of symmetry is the vertical line through the vertex.',
            'A negative a opens the V downward. For the y-intercept, substitute x = 0.',
        ],
        'scaffold': scaffold('In g(x) = a|x − h| + k, what does a negative value of a tell you?',
                             'The V opens downward', 'The V opens upward'),
        'solutionReview': review(
            'Read the vertex from vertex form, then use the sign of a.',
            [
                'g(x) = {{a}}|x {{mh|signed}}| {{k|signed}} has the form a|x - h| + k with h = {{h}} and k = {{k}}, so the vertex is ({{h}}, {{k}}).',
                'The axis of symmetry is the vertical line x = {{h}}.',
                'Because a = {{a}} is negative, the V opens downward: {{k}} is the maximum and the range is (-∞, {{k}}].',
                'g(0) = {{a}}|0 {{mh|signed}}| {{k|signed}} = {{yint}}, so the y-intercept is (0, {{yint}}).',
            ],
            'Vertex ({{h}}, {{k}}); axis x = {{h}}; range (-∞, {{k}}]; y-intercept (0, {{yint}}).',
            'Reading the vertex as ({{mh}}, {{k}}) — the number inside the bars has the opposite sign of h.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'a': choice(-4, -3, -2), 'h': ints(-4, 4, [0]), 'k': ints(-5, 5, [0])},
            {'mh': '-h', 'yint': 'a*abs(h) + k'},
        ),
    },
    {
        'questionId': 'dol2r-wu-2',
        'standard': 'A2.6C',
        'dok': 2, 'difficultyBand': 2,
        'prompt': 'The point $({{px}}, {{py}})$ is on the graph of $f(x)=|x|$. The graph of $f$ is transformed to $g(x)={{a}}|x {{mh|signed}}| {{k|signed}}$. Find the image of that point on the graph of $g$.',
        'studentActions': ['analyzeTransformations'],
        'transformation': {'mode': 'pointMap'},
        'function': {'family': 'absolute', 'a': '{{a}}', 'h': '{{h}}', 'k': '{{k}}'},
        'parentPoint': ['{{px}}', '{{py}}'],
        'graphBounds': {'xMin': -8, 'xMax': 8, 'yMin': -12, 'yMax': 12},
        'hints': [
            'x’s lie: the change inside the bars moves x. Add h to the x-coordinate.',
            'y’s tell the truth: multiply the y-coordinate by a, then add k.',
        ],
        'scaffold': scaffold('Which part of g changes the x-coordinate of a point?',
                             'Only the number inside the bars', 'The numbers outside the bars'),
        'solutionReview': review(
            'A point (x, y) on f moves to (x + h, a·y + k) on g.',
            [
                'Here h = {{h}}, a = {{a}}, and k = {{k}}.',
                'New x: {{px}} + ({{h}}) = {{ix}}.',
                'New y: {{a}} · {{py}} + ({{k}}) = {{iy}}.',
            ],
            'The image is ({{ix}}, {{iy}}).',
            'Moving x the wrong way: inside the bars, x {{mh|signed}} is a shift of {{h}}, not {{mh}}.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'a': choice(-3, -2, 2, 3), 'h': ints(-4, 4, [0]), 'k': ints(-4, 4, [0]), 'px': choice(-2, -1, 1, 2)},
            {'mh': '-h', 'py': 'abs(px)', 'ix': 'px + h', 'iy': 'a*abs(px) + k'},
        ),
    },
    {
        'questionId': 'dol2r-wu-3',
        'standard': 'A2.6E',
        'dok': 1, 'difficultyBand': 2,
        'prompt': 'Solve the equation. Isolate the absolute value first, then split it into two equations.',
        'studentActions': ['solveStepByStep'],
        'equation': '|x {{mh|signed}}| {{k|signed}} = {{r}}',
        'solveFor': 'x',
        'hints': [
            'Undo the constant outside the bars first, so the absolute value is alone.',
            'If |A| = d with d > 0, then A = d or A = −d. Solve both equations.',
        ],
        'scaffold': scaffold('What should be alone on one side before you split the equation?',
                             'The absolute value expression', 'The variable x'),
        'solutionReview': review(
            'Isolate, split, solve, check.',
            [
                'Isolate: |x {{mh|signed}}| = {{d}}.',
                'Split: x {{mh|signed}} = {{d}} or x {{mh|signed}} = -{{d}}.',
                'Solve: x = {{x2}} or x = {{x1}}. Both are {{d}} units from {{h}}, so both check.',
            ],
            'x = {{x1}} or x = {{x2}}',
            'Splitting before the constant {{k}} is moved, which splits the wrong expression.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'h': ints(-8, 8, [0]), 'd': ints(2, 9), 'k': ints(-6, 6, [0])},
            {'mh': '-h', 'r': 'd + k', 'x1': 'h - d', 'x2': 'h + d'},
        ),
    },
    {
        'questionId': 'dol2r-wu-4',
        'standard': 'A2.3A',
        'dok': 2, 'difficultyBand': 2,
        'prompt': 'A theater sells adult, student, and child tickets. Let a, s, and c be the numbers of adult, student, and child tickets sold. Write an equation for each statement.',
        'studentActions': ['multipleResponses'],
        'answerFields': [
            field('total', 'The theater sold {{N}} tickets in all.', 'equation', 'a+s+c={{N}}'),
            field('money', 'Adult tickets cost ${{pa}}, student tickets cost ${{ps}}, and child tickets cost ${{pc}}. Ticket sales totaled ${{R}}.',
                  'equation', '{{pa}}a+{{ps}}s+{{pc}}c={{R}}'),
            field('compare', 'The theater sold {{m}} times as many student tickets as child tickets.', 'equation', 's={{m}}c',
                  accepted=['s-{{m}}c=0', 'c=s/{{m}}']),
        ],
        'hints': [
            'One equation counts tickets, one counts dollars, and one compares two kinds of tickets.',
            '“{{m}} times as many student tickets as child tickets”: which group is larger? Multiply the smaller group by {{m}} to make the two sides equal.',
        ],
        'scaffold': scaffold('If twice as many student tickets as child tickets were sold, which number is larger?',
                             'The number of student tickets', 'The number of child tickets'),
        'solutionReview': review(
            'One equation per fact: a count, a total value, and a comparison.',
            [
                'Count: a + s + c = {{N}}.',
                'Money: price times count for each kind, added: {{pa}}a + {{ps}}s + {{pc}}c = {{R}}.',
                'Comparison: student tickets are {{m}} times child tickets, so s = {{m}}c.',
            ],
            'a + s + c = {{N}}, {{pa}}a + {{ps}}s + {{pc}}c = {{R}}, s = {{m}}c',
            'Writing {{m}}s = c, which says there are more child tickets than student tickets.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'A': ints(40, 120, step=5), 'C': ints(20, 60, step=2), 'm': choice(2, 3),
             'pa': choice(10, 12, 15), 'ps': choice(6, 8), 'pc': choice(4, 5)},
            {'S': 'm*C', 'N': 'A + m*C + C', 'R': 'pa*A + ps*m*C + pc*C'},
        ),
    },
]

# ============================================================== CLASSWORK
# Teacher-led, shared, static, with Guided Notes. One rich teaching problem per
# skill (two for the inequality structures, which students most often confuse).

# CW1 — the staged graph analysis of f(x) = -2|x + 1| + 4.
cw1 = dict(a=-2, h=-1, k=4)
assert f_abs(cw1['a'], cw1['h'], cw1['k'], -3) == 0 and f_abs(cw1['a'], cw1['h'], cw1['k'], 1) == 0
assert f_abs(cw1['a'], cw1['h'], cw1['k'], 0) == 2

# CW2 — f(x) = |x + 2| - 3 on [-5, 3].
cw2_vals = {x: f_abs(1, -2, -3, x) for x in (-5, 3, -2)}
assert cw2_vals == {-5: 0, 3: 2, -2: -3}
assert all(f_abs(1, -2, -3, Fraction(x, 10)) <= 2 and f_abs(1, -2, -3, Fraction(x, 10)) >= -3 for x in range(-50, 31))

# CW3 — images of the five defining points of |x| under g(x) = -1/2|x + 2| + 3.
cw3_src = [(-4, 4), (-2, 2), (0, 0), (2, 2), (4, 4)]
cw3_img = [(x - 2, Fraction(-1, 2) * y + 3) for x, y in cw3_src]
assert cw3_img == [(-6, 1), (-4, 2), (-2, 3), (0, 2), (2, 1)]
assert all(Fraction(-1, 2) * abs(x + 2) + 3 == y for x, y in cw3_img)

# CW5 — two formulations.
assert {69 - 1, 69 + 1} == {68, 70}
assert ((-7 + 3) / 2, 3 - (-2)) == (-2, 5)

# CW6 — -3|2x - 5| + 4 = -11.
assert [x for x in range(-20, 21) if -3 * abs(2 * x - 5) + 4 == -11] == [0, 5]

# CW7 — -2|x - 4| + 7 > -3  <=>  -1 < x < 9.
assert all((-2 * abs(Fraction(x, 4) - 4) + 7 > -3) == (-1 < Fraction(x, 4) < 9) for x in range(-80, 81))

# CW8 — |3x + 6| - 4 >= 5  <=>  x <= -5 or x >= 1.
assert all((abs(3 * Fraction(x, 4) + 6) - 4 >= 5) == (Fraction(x, 4) <= -5 or Fraction(x, 4) >= 1) for x in range(-80, 81))

# CW9 — basketball: x + y + z = 34, x + 2y + 3z = 70, y = x + z + 6.
cw9 = solve3([[1, 1, 1], [1, 2, 3], [-1, 1, -1]], [34, 70, 6])
assert cw9 == [6, 20, 8]

# CW10 — x + y + z = 4, 2x - y + 3z = 13, x + 2y - z = -1.
cw10 = solve3([[1, 1, 1], [2, -1, 3], [1, 2, -1]], [4, 13, -1])
assert cw10 == [3, -1, 2]

# CW11 — error analysis: 3x - 2y = 4z - 4, x + 4z = 2y + 16, 2x + y + z = 6.
# Marcus copied rows 1 and 2 before moving 4z and 2y across the equal sign.
CW11_A = [[3, -2, -4], [1, -2, 4], [2, 1, 1]]
CW11_B = [-4, 16, 6]
CW11_MARCUS_A = [[3, -2, 4], [1, 2, 4], [2, 1, 1]]
assert solve3(CW11_A, CW11_B) == [2, -1, 3]
assert solve3(CW11_MARCUS_A, CW11_B) == [Fraction(-1, 4), Fraction(39, 8), Fraction(13, 8)]
# His calculator's answer fails the first equation as printed: 3x - 2y = 4z - 4.
marcus = solve3(CW11_MARCUS_A, CW11_B)
assert 3 * marcus[0] - 2 * marcus[1] != 4 * marcus[2] - 4
assert [float(v) for v in marcus] == [-0.25, 4.875, 1.625]

classwork = [
    {
        'questionId': 'dol2r-cw-1',
        'standard': 'A2.2A',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'The graph of an absolute value function f is shown. Work through its key attributes: the intercepts, the maximum or minimum, the axis of symmetry, where f increases and decreases, and its domain and range.',
        'studentActions': ['readGraph', 'findXIntercepts', 'findYIntercept', 'findMaximum', 'findAxisOfSymmetry',
                           'analyzeIncreasing', 'analyzeDecreasing', 'analyzeDomain', 'analyzeRange'],
        'function': {'family': 'absolute', 'a': -2, 'h': -1, 'k': 4},
        'graph': {'xMin': -7, 'xMax': 5, 'yMin': -6, 'yMax': 6},
        'xIntercepts': [{'x': -3, 'y': 0}, {'x': 1, 'y': 0}],
        'yIntercept': [0, 2],
        'extreme': {'kind': 'maximum', 'point': [-1, 4]},
        'axisOfSymmetry': 'x = -1',
        'behaviorChoices': [
            'Increasing on (−∞, −1) and decreasing on (−1, ∞)',
            'Decreasing on (−∞, −1) and increasing on (−1, ∞)',
            'Increasing on (−∞, 4) and decreasing on (4, ∞)',
            'Increasing on (−∞, ∞)',
        ],
        'behavior': 'Increasing on (−∞, −1) and decreasing on (−1, ∞)',
        'correctDomain': '(-∞, ∞)',
        'correctRange': '(-∞, 4]',
        'notation': 'interval',
        'guidedNotes': notes(
            ('Vertex and symmetry', 'Every absolute value graph is a V. Its corner is the vertex (h, k). The vertical line x = h through the vertex is the axis of symmetry: the left and right halves are mirror images.'),
            ('Maximum or minimum', 'A V that opens down has its maximum at the vertex; a V that opens up has its minimum there. The maximum or minimum VALUE is the vertex’s y-coordinate.'),
            ('Intercepts', 'x-intercepts are where y = 0 (an absolute value graph can have 0, 1, or 2). The y-intercept is where x = 0.'),
            ('Increasing and decreasing', 'Read the graph left to right and describe x-values only. The behavior changes at the vertex’s x-coordinate, and the intervals are open there.'),
            ('Domain and range', 'Every absolute value function has domain (−∞, ∞). The range starts at the vertex’s y-value: (−∞, k] when the V opens down, [k, ∞) when it opens up.'),
        ),
        'hints': [
            'Start with the vertex. It gives you the axis of symmetry and the highest or lowest point of the graph at once.',
            'Intervals of increase and decrease use x-values; the range uses y-values.',
            'The vertex’s y-value is reached, so the range uses a square bracket there.',
        ],
        'solutionReview': review(
            'Find the vertex first; every other attribute follows from it.',
            [
                'The vertex is (−1, 4) and the V opens downward, so f has a maximum value of 4 at x = −1, and the axis of symmetry is x = −1.',
                'f crosses the x-axis at (−3, 0) and (1, 0), each 2 units from the axis, and crosses the y-axis at (0, 2).',
                'Reading left to right, f rises until x = −1 and falls after it: increasing on (−∞, −1), decreasing on (−1, ∞).',
                'Domain (−∞, ∞); range (−∞, 4].',
            ],
            'Maximum (−1, 4); axis x = −1; x-intercepts (−3, 0) and (1, 0); y-intercept (0, 2); domain (−∞, ∞); range (−∞, 4].',
            'Writing increasing and decreasing intervals with y-values, such as (−∞, 4).',
        ),
    },
    {
        'questionId': 'dol2r-cw-2',
        'standard': 'A2.2A',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'The graph shows $f(x)=|x+2|-3$ on the closed interval $-5\\le x\\le 3$. Find the maximum and minimum values of $f$ on this interval, where each occurs, and the range of $f$ on the interval.',
        'studentActions': ['readGraph'],
        'graph': {'xMin': -7, 'xMax': 5, 'yMin': -5, 'yMax': 5,
                  'functions': [{'type': 'absolute', 'a': 1, 'h': -2, 'k': -3,
                                 'domain': {'min': -5, 'max': 3, 'minClosed': True, 'maxClosed': True}}]},
        'answerFields': [
            field('maxValue', 'Maximum value of f on the interval', 'number', '2'),
            field('maxX', 'x-value where the maximum occurs', 'number', '3'),
            field('minValue', 'Minimum value of f on the interval', 'number', '-3'),
            field('minX', 'x-value where the minimum occurs', 'number', '-2'),
            field('range', 'Range of f on the interval (interval notation)', 'interval', '[-3, 2]'),
        ],
        'guidedNotes': notes(
            ('Candidates', 'On a closed interval, the maximum and minimum can only occur at an endpoint or at the vertex — and the vertex counts only when it is inside the interval.'),
            ('Evaluate', 'Find f at every candidate: both endpoints and the vertex.'),
            ('Compare', 'The largest output is the maximum value and the smallest is the minimum value. The range on the interval runs from the minimum to the maximum.'),
        ),
        'hints': [
            'Evaluate f at both endpoints of the interval.',
            'Is the vertex inside the interval? If so, it is a candidate too.',
        ],
        'scaffold': scaffold('Which points could give the maximum or minimum on a closed interval?',
                             'The endpoints and the vertex', 'Only the vertex'),
        'solutionReview': review(
            'Check the endpoints and the vertex.',
            [
                'f(−5) = |−3| − 3 = 0.',
                'f(3) = |5| − 3 = 2.',
                'The vertex x = −2 is inside the interval: f(−2) = −3.',
                'The largest output is 2 (at x = 3) and the smallest is −3 (at x = −2).',
            ],
            'Maximum 2 at x = 3; minimum −3 at x = −2; range [−3, 2].',
            'Checking only the endpoints, which misses the vertex and gives a wrong minimum of 0.',
        ),
    },
    {
        'questionId': 'dol2r-cw-3',
        'standard': 'A2.6C',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'The graph of $f(x)=|x|$ is shown with five defining points. Graph $g(x)=-\\frac{1}{2}|x+2|+3$ by moving each defining point to its image.',
        'studentActions': ['analyzeTransformations'],
        'transformation': {'mode': 'plotTransform'},
        'function': {'family': 'absolute', 'a': -0.5, 'b': 1, 'h': -2, 'k': 3},
        'sourceLabel': 'f(x) = |x|',
        'sourcePoints': [{'x': x, 'y': y} for x, y in cw3_src],
        'graphBounds': {'xMin': -8, 'xMax': 8, 'yMin': -6, 'yMax': 8},
        'snapStep': 1,
        'guidedNotes': notes(
            ('The mapping rule', 'For g(x) = a|x − h| + k, each point (x, y) on f moves to (x + h, a·y + k).'),
            ('x’s lie', 'Inside the bars, x + 2 is x − (−2): the graph shifts LEFT 2, so h = −2.'),
            ('y’s tell the truth', 'Outside the bars, −½ multiplies every y-value: a reflection across the x-axis and a vertical compression by a factor of ½. Then + 3 shifts the graph up 3.'),
        ),
        'hints': [
            'Map one point at a time: new x = x − 2, new y = −½·y + 3.',
            'Start with the vertex of f. Where must the vertex of g be?',
        ],
        'scaffold': scaffold('Which way does x + 2 inside the bars move the graph?', 'Left 2', 'Right 2'),
        'solutionReview': review(
            'Move every defining point with (x, y) → (x − 2, −½·y + 3).',
            [
                '(−4, 4) → (−6, 1); (−2, 2) → (−4, 2); (0, 0) → (−2, 3); (2, 2) → (0, 2); (4, 4) → (2, 1).',
                'g is f reflected across the x-axis, compressed vertically by a factor of ½, shifted left 2 and up 3.',
            ],
            'Vertex (−2, 3); g opens downward and is half as steep as f.',
            'Shifting right 2 because of the + sign inside the bars.',
        ),
    },
    {
        'questionId': 'dol2r-cw-4',
        'standard': 'A2.6C',
        'dok': 3, 'difficultyBand': 3,
        'prompt': 'Describe every transformation that takes $f(x)=|x|$ to $g(x)=\\left|\\frac{1}{2}(x-4)\\right|-1$.',
        'studentActions': ['analyzeTransformations'],
        'transformation': {'mode': 'describe'},
        'function': {'family': 'absolute', 'a': 1, 'b': 0.5, 'h': 4, 'k': -1},
        'includeHorizontalScale': True,
        'graphBounds': {'xMin': -4, 'xMax': 12, 'yMin': -4, 'yMax': 6},
        'guidedNotes': notes(
            ('Inside versus outside', 'Changes inside the bars act on x, opposite and reciprocal: f(bx) is a horizontal stretch or compression by a factor of 1/|b|. Changes outside act on y, exactly as written.'),
            ('An absolute value shortcut', 'Because |bx| = |b|·|x|, the graph of |½(x − 4)| is the same as ½|x − 4|. A horizontal stretch by 2 and a vertical compression by ½ draw the same V, so either description is correct.'),
            ('Reflections', 'A negative a reflects the graph across the x-axis. A negative b reflects it across the y-axis — which leaves |x| unchanged, because |−x| = |x|.'),
        ),
        'hints': [
            'Find the shifts first: what value of x makes the inside of the bars zero, and what is added outside?',
            'The factor ½ is inside the bars, so it acts on x: the horizontal scale factor is 1/|b|.',
        ],
        'scaffold': scaffold('The factor ½ is inside the bars. What does it change?',
                             'The horizontal size of the graph', 'The vertical shift of the graph'),
        'solutionReview': review(
            'Inside the bars acts on x; outside acts on y.',
            [
                'Inside: ½(x − 4) gives a horizontal stretch by a factor of 2 and a shift right 4.',
                'Outside: − 1 shifts the graph down 1. There are no reflections.',
                'Equivalently, |½(x − 4)| = ½|x − 4|: a vertical compression by a factor of ½, right 4, down 1.',
            ],
            'Horizontal stretch by 2 (equivalently, vertical compression by ½), right 4, down 1.',
            'Calling the factor ½ a horizontal compression by ½ — factors inside the bars act reciprocally.',
        ),
    },
    {
        'questionId': 'dol2r-cw-5',
        'standard': 'A2.6D',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'Formulate absolute value equations from two different representations.\n(A) A regulation size-5 soccer ball must have a circumference within 1 centimeter of 69 centimeters. Let c be a ball’s circumference, in centimeters.\n(B) On a number line, the two solutions of an absolute value equation are −7 and 3.',
        'studentActions': ['multipleResponses'],
        'answerFields': [
            field('eqA', '(A) An absolute value equation whose solutions are the least and greatest allowed circumferences',
                  'equation', '|c-69|=1', accepted=['|69-c|=1', '|-c+69|=1']),
            field('least', '(A) Least allowed circumference (cm)', 'number', '68'),
            field('greatest', '(A) Greatest allowed circumference (cm)', 'number', '70'),
            field('center', '(B) The center: the number halfway between −7 and 3', 'number', '-2'),
            field('distance', '(B) The distance from the center to each solution', 'number', '5'),
            field('eqB', '(B) An absolute value equation whose solutions are −7 and 3', 'equation', '|x+2|=5',
                  accepted=['|-2-x|=5', '|-x-2|=5']),
        ],
        'guidedNotes': notes(
            ('Absolute value is distance', '|x − c| is the distance between x and c. “Within d of c” has boundary values that solve |x − c| = d: the numbers c − d and c + d.'),
            ('From two solutions', 'The center c is the midpoint (average) of the two solutions, and d is the distance from the center to either one. Then write |x − c| = d.'),
            ('Watch the sign', 'A center of −2 is written |x − (−2)| = |x + 2|.'),
        ),
        'hints': [
            'In (A), the target value is the center and the allowed difference is the distance.',
            'In (B), average the two solutions to find the center; each solution is the same distance from it.',
        ],
        'scaffold': scaffold('In |x − c| = d, what does c represent?',
                             'The center, halfway between the two solutions', 'The distance from the center to each solution'),
        'solutionReview': review(
            'Absolute value equations model distance from a center.',
            [
                '(A) The center is 69 and the distance is 1: |c − 69| = 1, so c = 68 or c = 70.',
                '(B) The center is (−7 + 3) ÷ 2 = −2, and 3 − (−2) = 5.',
                '|x − (−2)| = 5, which is written |x + 2| = 5.',
            ],
            '|c − 69| = 1 (68 cm and 70 cm); |x + 2| = 5.',
            'Writing |x − 2| = 5 for a center of −2: subtracting a negative center becomes + 2.',
        ),
    },
    {
        'questionId': 'dol2r-cw-6',
        'standard': 'A2.6E',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'Solve $-3|2x-5|+4=-11$. Isolate the absolute value, decide whether a solution is possible, split the equation into two equations, and check each answer.',
        'studentActions': ['solveStepByStep'],
        'equation': '-3|2x - 5| + 4 = -11',
        'solveFor': 'x',
        'guidedNotes': notes(
            ('Isolate first', 'Undo the outside operations in reverse order: subtract 4, then divide by −3. Dividing both sides of an EQUATION by a negative number does not change the equal sign.'),
            ('Check the other side', '|A| = d needs d ≥ 0. A negative d means no solution; d = 0 means exactly one solution.'),
            ('Split and solve', '|A| = d becomes A = d or A = −d. Solve both linear equations.'),
            ('Check', 'Substitute each answer into the original equation; an answer that fails is extraneous.'),
        ),
        'hints': [
            'Subtract 4 from both sides, then divide both sides by −3.',
            'Once |2x − 5| is alone, the other side tells you how many solutions to expect.',
        ],
        'scaffold': scaffold('What is the first move in −3|2x − 5| + 4 = −11?',
                             'Subtract 4 from both sides', 'Split it into two equations'),
        'solutionReview': review(
            'Isolate, split, solve, check.',
            [
                'Subtract 4: −3|2x − 5| = −15.',
                'Divide by −3: |2x − 5| = 5.',
                'Split: 2x − 5 = 5 or 2x − 5 = −5.',
                'Solve: x = 5 or x = 0. Both check in the original equation.',
            ],
            'x = 0 or x = 5',
            'Treating the bars like parentheses and distributing −3 into them.',
        ),
    },
    {
        'questionId': 'dol2r-cw-7',
        'standard': 'A2.6F',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'Solve $-2|x-4|+7>-3$. Then graph the solution set and write it in interval notation.',
        'studentActions': ['solveInequality'],
        'inequality': '-2|x - 4| + 7 > -3',
        'guidedNotes': notes(
            ('Isolate — and flip', 'Subtract 7, then divide by −2. Dividing both sides of an INEQUALITY by a negative number reverses the symbol.'),
            ('Less than means between (AND)', '|A| < d means −d < A < d: the values within d of the center form one interval.'),
            ('Greater than means outside (OR)', '|A| > d means A < −d or A > d: the values more than d from the center form two rays.'),
            ('Graph and interval notation', 'Use open circles and parentheses for < and >; closed circles and brackets for ≤ and ≥.'),
        ),
        'hints': [
            'After subtracting 7, divide both sides by −2 — and reverse the inequality symbol.',
            'Once |x − 4| is alone, decide: is it less than a number (between) or greater than a number (outside)?',
        ],
        'scaffold': scaffold('What happens to > when you divide both sides by −2?', 'It reverses to <', 'It stays >'),
        'solutionReview': review(
            'Isolate (reversing the symbol), then write a between statement.',
            [
                'Subtract 7: −2|x − 4| > −10.',
                'Divide by −2 and reverse: |x − 4| < 5.',
                'Between: −5 < x − 4 < 5, so −1 < x < 9.',
                'Open circles at −1 and 9 with shading between them: (−1, 9).',
            ],
            '−1 < x < 9, written (−1, 9)',
            'Forgetting to reverse the symbol, which gives the OR answer x < −1 or x > 9.',
        ),
    },
    {
        'questionId': 'dol2r-cw-8',
        'standard': 'A2.6F',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'Solve $|3x+6|-4\\ge 5$. Then graph the solution set and write it in interval notation.',
        'studentActions': ['solveInequality'],
        'inequality': '|3x + 6| - 4 >= 5',
        'guidedNotes': notes(
            ('Isolate', 'Add 4 to both sides so the absolute value is alone.'),
            ('Greater than or equal means OR', '|A| ≥ d means A ≤ −d or A ≥ d. Solve each piece, then join them with OR — a union (∪) in interval notation.'),
        ),
        'hints': [
            'Add 4 to both sides so |3x + 6| is alone.',
            '≥ means outside: write two inequalities joined by OR.',
        ],
        'scaffold': scaffold('Should |3x + 6| ≥ 9 become a between (AND) statement or an outside (OR) statement?',
                             'Outside: OR', 'Between: AND'),
        'solutionReview': review(
            'Isolate, then write an outside (OR) statement.',
            [
                'Add 4: |3x + 6| ≥ 9.',
                'Outside: 3x + 6 ≤ −9 or 3x + 6 ≥ 9.',
                'Solve: x ≤ −5 or x ≥ 1.',
                'Closed circles at −5 and 1, shading outward: (−∞, −5] ∪ [1, ∞).',
            ],
            'x ≤ −5 or x ≥ 1, written (−∞, −5] ∪ [1, ∞)',
            'Writing the between answer −5 ≤ x ≤ 1 for a ≥ inequality.',
        ),
    },
    {
        'questionId': 'dol2r-cw-9',
        'standard': 'A2.3A',
        'alignments': [
            {'framework': 'teks', 'code': 'A2.3A', 'role': 'primary'},
            {'framework': 'teks', 'code': 'A2.3B', 'role': 'secondary'},
        ],
        'dok': 3, 'difficultyBand': 3,
        'prompt': 'In a playoff game, the DeSoto Eagles made 34 shots for a total of 70 points: free throws (1 point each), two-point field goals (2 points each), and three-point field goals (3 points each). They made 6 more two-point field goals than free throws and three-pointers combined. Let x, y, and z be the numbers of free throws, two-point field goals, and three-point field goals. Write a matrix equation A · X = B for the situation, solve it with technology, and report how many of each shot they made.',
        'studentActions': ['solveMatrixEquation'],
        'equations': ['x + y + z = 34', 'x + 2y + 3z = 70', 'y = x + z + 6'],
        'showEquations': False,
        'variableMeanings': {'x': 'free throws', 'y': 'two-point field goals', 'z': 'three-point field goals'},
        'guidedNotes': notes(
            ('Define, then translate', 'Name what each variable counts. Then write one equation for each fact: how many in all, how many points in all, and how two quantities compare.'),
            ('Standard form', 'Move every variable term to the left side: Ax + By + Cz = D. A missing variable has coefficient 0.'),
            ('Matrix equation', 'A holds the coefficients (one row per equation), X is the column of variables, and B holds the constants. Technology finds X = A⁻¹B.'),
        ),
        'hints': [
            'One equation counts shots, one counts points, and one compares two-point field goals with the other two kinds of shots.',
            'Which is larger: the number of two-point field goals, or free throws and three-pointers combined? Add 6 to the smaller amount to make the two sides equal.',
        ],
        'solutionReview': review(
            'Translate each fact into one equation, then let technology solve A · X = B.',
            [
                'Shots: x + y + z = 34. Points: x + 2y + 3z = 70. Comparison: y = x + z + 6, which is −x + y − z = 6 in standard form.',
                'A = [[1, 1, 1], [1, 2, 3], [−1, 1, −1]] and B = [34, 70, 6].',
                'X = A⁻¹B = (6, 20, 8). Check: 6 + 20 + 8 = 34 and 6 + 40 + 24 = 70.',
            ],
            '6 free throws, 20 two-point field goals, and 8 three-point field goals.',
            'Writing the comparison as y + 6 = x + z, which makes free throws and three-pointers the larger amount.',
        ),
    },
    {
        'questionId': 'dol2r-cw-10',
        'standard': 'A2.3B',
        'dok': 3, 'difficultyBand': 3,
        'prompt': 'Solve the system by elimination — Gaussian elimination by hand. Eliminate the same variable from two different pairs of equations, solve the resulting 2×2 system, back-substitute, and verify the ordered triple in all three original equations.',
        'studentActions': ['solveSystem'],
        'method': 'elimination',
        'equations': ['x + y + z = 4', '2x - y + 3z = 13', 'x + 2y - z = -1'],
        'variables': ['x', 'y', 'z'],
        'requireVerification': True,
        'guidedNotes': notes(
            ('Plan', 'Choose one variable to eliminate. Here y is convenient: equations 1 and 2 have opposite y-coefficients.'),
            ('Two pairs, same variable', 'Eliminate the SAME variable twice, using two different pairs of equations, to get a 2×2 system in the other two variables.'),
            ('Back-substitute and verify', 'Solve the 2×2 system, substitute into an original equation for the third variable, then check the ordered triple in all three equations.'),
        ),
        'hints': [
            'Adding equations 1 and 2 eliminates y.',
            'To eliminate y using equations 1 and 3, multiply equation 1 by 2 first.',
        ],
        'solutionReview': review(
            'Eliminate y twice, solve the 2×2 system, back-substitute.',
            [
                'Equation 1 + equation 2: 3x + 4z = 17.',
                '2 × equation 1 − equation 3: x + 3z = 9.',
                'From x = 9 − 3z: 3(9 − 3z) + 4z = 17, so z = 2 and x = 3.',
                'Equation 1: 3 + y + 2 = 4, so y = −1. (3, −1, 2) checks in all three equations.',
            ],
            '(3, −1, 2)',
            'Eliminating y from one pair but a different variable from the other pair, which does not produce a 2×2 system.',
        ),
    },
    {
        'questionId': 'dol2r-cw-11',
        'standard': 'A2.3B',
        'dok': 3, 'difficultyBand': 3,
        'prompt': 'Error analysis: Marcus used technology to solve the system 3x − 2y = 4z − 4, x + 4z = 2y + 16, 2x + y + z = 6. His calculator returned x = −0.25, y = 4.875, z = 1.625, which does not check in the first equation. His matrix equation is already filled in, and two of its rows are wrong. Find his errors, fix A and B, and then solve the system with the matrix calculator.',
        'studentActions': ['solveMatrixEquation'],
        'equations': ['3x - 2y = 4z - 4', 'x + 4z = 2y + 16', '2x + y + z = 6'],
        'startFrom': {'A': CW11_MARCUS_A, 'B': CW11_B},
        'guidedNotes': notes(
            ('Check the answer first', 'A solution must make every original equation true. One that fails tells you the matrix equation is wrong somewhere.'),
            ('Standard form, then copy', 'Write each equation as Ax + By + Cz = D before you copy it into a row. A term that crosses the equal sign changes its sign.'),
            ('Fix, solve, check', 'Correct the rows that do not match, compute X = A⁻¹B, and check the ordered triple in all three equations.'),
        ),
        'hints': [
            'Before you copy coefficients, every equation must be in standard form: variable terms on the left, the constant on the right.',
            'In the first equation, 4z starts on the right side. When it moves to the left side, what happens to its sign? Compare that with Marcus’s row 1.',
            'In the second equation, 2y starts on the right side. Check the y-coefficient in Marcus’s row 2 the same way.',
        ],
        'solutionReview': review(
            'Marcus copied two equations into A before putting them in standard form.',
            [
                'First equation: 3x − 2y = 4z − 4 becomes 3x − 2y − 4z = −4, so row 1 is [3, −2, −4 | −4]. Marcus kept +4 for z.',
                'Second equation: x + 4z = 2y + 16 becomes x − 2y + 4z = 16, so row 2 is [1, −2, 4 | 16]. Marcus kept +2 for y.',
                'Row 3, [2, 1, 1 | 6], was already right. With technology, X = A⁻¹B gives (2, −1, 3).',
                'Check: 3(2) − 2(−1) = 8 and 4(3) − 4 = 8; 2 + 4(3) = 14 and 2(−1) + 16 = 14; 2(2) + (−1) + 3 = 6.',
            ],
            '(2, −1, 3)',
            'Copying a coefficient from the right side of the equal sign without changing its sign.',
        ),
    },
]

# =============================================================== PRACTICE
# Independent, personalized: every item is a Question Family slot, so each
# student gets their own numbers and "Request New Question" deals a fresh one.
practice = [
    {
        'questionId': 'dol2r-pr-1',
        'standard': 'A2.2A',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'The graph of an absolute value function f is shown. Analyze its key attributes.',
        'studentActions': ['readGraph', 'findXIntercepts', 'findYIntercept', 'findMinimum', 'findAxisOfSymmetry',
                           'analyzeIncreasing', 'analyzeDecreasing', 'analyzeDomain', 'analyzeRange'],
        'function': {'family': 'absolute', 'a': '{{a}}', 'h': '{{h}}', 'k': '{{k}}'},
        'graph': {'xMin': '{{xmin}}', 'xMax': '{{xmax}}', 'yMin': '{{ymin}}', 'yMax': '{{ymax}}'},
        'xIntercepts': [{'x': '{{x1}}', 'y': 0}, {'x': '{{x2}}', 'y': 0}],
        'yIntercept': [0, '{{yint}}'],
        'extreme': {'kind': 'minimum', 'point': ['{{h}}', '{{k}}']},
        'axisOfSymmetry': 'x = {{h}}',
        'behaviorChoices': [
            'Decreasing on (−∞, {{h}}) and increasing on ({{h}}, ∞)',
            'Increasing on (−∞, {{h}}) and decreasing on ({{h}}, ∞)',
            'Decreasing on (−∞, {{k}}) and increasing on ({{k}}, ∞)',
            'Increasing on (−∞, ∞)',
        ],
        'behavior': 'Decreasing on (−∞, {{h}}) and increasing on ({{h}}, ∞)',
        'correctDomain': '(-∞, ∞)',
        'correctRange': '[{{k}}, ∞)',
        'notation': 'interval',
        'hints': [
            'Find the vertex first, then read each attribute from it.',
            'Increasing and decreasing intervals use x-values; the range uses y-values.',
        ],
        'attemptFeedback': [
            'Locate the vertex: its x-coordinate splits the decreasing and increasing intervals, and its y-coordinate starts the range.',
        ],
        'solutionReview': review(
            'Find the vertex first; every other attribute follows from it.',
            [
                'The vertex is ({{h}}, {{k}}) and the V opens upward, so f has a minimum value of {{k}} at x = {{h}}; the axis of symmetry is x = {{h}}.',
                'The x-intercepts ({{x1}}, 0) and ({{x2}}, 0) are each {{d}} units from the axis; the y-intercept is (0, {{yint}}).',
                'f decreases on (−∞, {{h}}) and increases on ({{h}}, ∞).',
                'Domain (−∞, ∞); range [{{k}}, ∞).',
            ],
            'Minimum ({{h}}, {{k}}); axis x = {{h}}; range [{{k}}, ∞).',
            'Starting the range at the vertex’s x-value instead of its y-value.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'a': choice(1, 2, 3), 'h': ints(-5, 5, [0]), 'd': ints(1, 4)},
            {'k': '-a*d', 'x1': 'h - d', 'x2': 'h + d', 'yint': 'a*abs(h) - a*d',
             'xmin': 'min(h - 6, -2)', 'xmax': 'max(h + 6, 2)', 'ymin': '-a*d - 2', 'ymax': 'max(a*abs(h) - a*d, 4) + 2'},
            ['abs(h) != d', 'h != -a*d'],
        ),
    },
    {
        'questionId': 'dol2r-pr-2',
        'standard': 'A2.2A',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'Let $f(x)={{a|coef}}|x {{mh|signed}}| {{k|signed}}$. Find the maximum and minimum values of $f$ on the interval ${{p}}\\le x\\le {{q}}$, where each occurs, and the range of $f$ on that interval.',
        'studentActions': ['multipleResponses'],
        'answerFields': [
            field('maxValue', 'Maximum value of f on the interval', 'number', '{{k}}'),
            field('maxX', 'x-value where the maximum occurs', 'number', '{{h}}'),
            field('minValue', 'Minimum value of f on the interval', 'number', '{{mn}}'),
            field('minX', 'x-value where the minimum occurs', 'number', '{{xmn}}'),
            field('range', 'Range of f on the interval (interval notation)', 'interval', '[{{mn}}, {{k}}]'),
        ],
        'hints': [
            'On a closed interval, compare the outputs at both endpoints and at the vertex.',
            'Because a is negative, the vertex is the highest point of the V.',
        ],
        'attemptFeedback': [
            'Evaluate f at x = {{p}}, at x = {{q}}, and at the vertex x = {{h}}. The largest and smallest of those outputs are the maximum and minimum.',
        ],
        'scaffold': scaffold('This V opens downward. Where can its minimum on a closed interval occur?',
                             'At an endpoint of the interval', 'At the vertex'),
        'solutionReview': review(
            'Check the endpoints and the vertex.',
            [
                'The vertex ({{h}}, {{k}}) is inside the interval and the V opens down, so the maximum is {{k}} at x = {{h}}.',
                'f({{p}}) = {{fp}} and f({{q}}) = {{fq}}.',
                'The smaller endpoint value, {{mn}}, is the minimum, at x = {{xmn}}.',
                'Range on the interval: [{{mn}}, {{k}}].',
            ],
            'Maximum {{k}} at x = {{h}}; minimum {{mn}} at x = {{xmn}}; range [{{mn}}, {{k}}].',
            'Assuming the minimum is at the left endpoint — compare both endpoints.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'a': choice(-3, -2, -1), 'h': ints(-3, 3, [0]), 'k': ints(2, 9), 'L': ints(1, 5), 'R': ints(1, 5)},
            {'mh': '-h', 'p': 'h - L', 'q': 'h + R', 'fp': 'k + a*L', 'fq': 'k + a*R',
             'mn': 'k + a*max(L, R)', 'xmn': 'h + R*(R > L) - L*(L > R)'},
            ['L != R'],
        ),
    },
    {
        'questionId': 'dol2r-pr-3',
        'standard': 'A2.6C',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'The graph shows a transformation of $f(x)=|x|$. Find the values of a, h, and k so that the graph is $y=a|x-h|+k$.',
        'studentActions': ['analyzeTransformations'],
        'transformation': {'mode': 'identify'},
        'function': {'family': 'absolute', 'a': '{{a}}', 'h': '{{h}}', 'k': '{{k}}'},
        'graphBounds': {'xMin': -8, 'xMax': 8, 'yMin': -8, 'yMax': 8},
        'hints': [
            'The vertex of the V is (h, k).',
            'From the vertex, move 1 unit right and count how far the graph rises or falls: that change is a.',
        ],
        'attemptFeedback': ['Check the sign of a: a V that opens downward has a negative a.'],
        'scaffold': scaffold('Which point on the graph gives you h and k?', 'The vertex — the corner of the V', 'The y-intercept'),
        'solutionReview': review(
            'Read h and k at the vertex, then a from the steepness.',
            [
                'The vertex is ({{h}}, {{k}}), so h = {{h}} and k = {{k}}.',
                'One unit right of the vertex, the graph changes by {{a}}, so a = {{a}}.',
                'The graph is y = {{a}}|x {{mh|signed}}| {{k|signed}}.',
            ],
            'a = {{a}}, h = {{h}}, k = {{k}}',
            'Using the sign you would see inside the bars as h: for |x {{mh|signed}}|, h = {{h}}.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'a': choice(-3, -2, -0.5, 0.5, 2, 3), 'h': ints(-4, 4, [0]), 'k': ints(-4, 4, [0])},
            {'mh': '-h'},
        ),
    },
    {
        'questionId': 'dol2r-pr-4',
        'standard': 'A2.6C',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'Adjust a, b, h, and k until your graph lies exactly on the dashed graph of $g(x)={{s|coef}}|{{b}}(x {{mh|signed}})| {{k|signed}}$.',
        'studentActions': ['analyzeTransformations'],
        'transformation': {'mode': 'match'},
        'family': 'absolute',
        'target': {'a': '{{s}}', 'b': '{{b}}', 'h': '{{h}}', 'k': '{{k}}'},
        'initial': {'a': 1, 'b': 1, 'h': 0, 'k': 0},
        'includeHorizontalScale': True,
        'graphBounds': {'xMin': -8, 'xMax': 8, 'yMin': -8, 'yMax': 8},
        'hints': [
            'Set h and k first so your vertex sits on the dashed vertex.',
            'Inside the bars, b scales x: |{{b}}(x − h)| makes the V {{b}} times as steep. A negative a flips the V.',
        ],
        'attemptFeedback': ['Line up the vertex first; then compare how steep each side of your V is with the dashed V.'],
        'scaffold': scaffold('Which values put the vertex in the right place?', 'h and k', 'a and b'),
        'solutionReview': review(
            'Position with h and k; shape with a and b.',
            [
                'The vertex of g is ({{h}}, {{k}}), so h = {{h}} and k = {{k}}.',
                'b = {{b}} compresses the graph horizontally by a factor of 1/{{b}}, and a = {{s}} decides the direction: a negative a reflects the V across the x-axis.',
                'Because |{{b}}(x − h)| = {{b}}|x − h|, the same graph is y = {{sb}}|x {{mh|signed}}| {{k|signed}}.',
            ],
            'a = {{s}}, b = {{b}}, h = {{h}}, k = {{k}} — or any parameters that draw the same V.',
            'Using h = {{mh}}: the sign inside the parentheses is the opposite of the shift.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'s': choice(-1, 1), 'b': choice(2, 3), 'h': ints(-4, 4, [0]), 'k': ints(-4, 4, [0])},
            {'mh': '-h', 'sb': 's*b'},
        ),
    },
    {
        'questionId': 'dol2r-pr-5',
        'standard': 'A2.6D',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'A bakery’s sourdough loaves should weigh {{W}} grams. A loaf is acceptable if its weight differs from {{W}} grams by at most {{t}} grams. Let w be a loaf’s weight, in grams.',
        'studentActions': ['multipleResponses'],
        'answerFields': [
            field('equation', 'An absolute value equation whose solutions are the lightest and heaviest acceptable weights',
                  'equation', '|w-{{W}}|={{t}}', accepted=['|{{W}}-w|={{t}}', '|-w+{{W}}|={{t}}']),
            field('lightest', 'Lightest acceptable weight (grams)', 'number', '{{lo}}'),
            field('heaviest', 'Heaviest acceptable weight (grams)', 'number', '{{hi}}'),
        ],
        'hints': [
            'The target weight is the center; the greatest allowed difference is the distance.',
            'A distance from the center is written |w − center|.',
        ],
        'attemptFeedback': ['Write the distance between w and {{W}} with absolute value bars, and set it equal to the greatest allowed difference.'],
        'scaffold': scaffold('In this situation, which number is the center?', 'The target weight, {{W}} grams', 'The allowed difference, {{t}} grams'),
        'solutionReview': review(
            'An absolute value equation models distance from a center.',
            [
                'The center is {{W}} and the distance is {{t}}: |w - {{W}}| = {{t}}.',
                'Split: w - {{W}} = {{t}} or w - {{W}} = -{{t}}.',
                'So w = {{hi}} or w = {{lo}}.',
            ],
            '|w - {{W}}| = {{t}}; lightest {{lo}} g, heaviest {{hi}} g.',
            'Writing |w + {{W}}| = {{t}} — the center is subtracted from w.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'W': choice(450, 500, 550, 600, 650, 700, 750, 800, 900, 1000), 't': choice(5, 8, 10, 12, 15, 20, 25)},
            {'lo': 'W - t', 'hi': 'W + t'},
        ),
    },
    {
        'questionId': 'dol2r-pr-6',
        'standard': 'A2.6D',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'The solutions of an absolute value equation are $x={{p}}$ and $x={{q}}$. Find the center and the distance, then write the equation in the form $|x-c|=d$.',
        'studentActions': ['multipleResponses'],
        'answerFields': [
            field('center', 'Center c (the number halfway between the solutions)', 'number', '{{c}}'),
            field('distance', 'Distance d from the center to each solution', 'number', '{{d}}'),
            field('equation', 'The absolute value equation', 'equation', '|x-{{c}}|={{d}}',
                  accepted=['|{{c}}-x|={{d}}', '|-x+{{c}}|={{d}}']),
        ],
        'hints': [
            'The center is the average of the two solutions.',
            'The distance is how far either solution is from the center.',
        ],
        'attemptFeedback': ['Check: substituting x = {{p}} and x = {{q}} into your equation must make both sides equal.'],
        'scaffold': scaffold('How do you find the number halfway between {{p}} and {{q}}?',
                             'Add them and divide by 2', 'Subtract them and divide by 2'),
        'solutionReview': review(
            'Center = average of the solutions; distance = how far each is from the center.',
            [
                'Center: ({{p}} + {{q|paren}}) ÷ 2 = {{c}}.',
                'Distance: {{q}} - ({{c}}) = {{d}}.',
                'Equation: |x - ({{c}})| = {{d}}, which is |x {{mc|signed}}| = {{d}}.',
            ],
            '|x {{mc|signed}}| = {{d}}',
            'Getting the sign of the center wrong inside the bars: |x - c| with c = {{c}} is |x {{mc|signed}}|.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'c': ints(-9, 9, [0]), 'd': ints(2, 9)},
            {'p': 'c - d', 'q': 'c + d', 'mc': '-c'},
        ),
    },
    {
        'questionId': 'dol2r-pr-7',
        'standard': 'A2.6E',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'Solve the equation. Isolate the absolute value before you split it, then check each solution.',
        'studentActions': ['solveStepByStep'],
        'equation': '{{a}}|{{m}}x {{n|signed}}| {{k|signed}} = {{r}}',
        'solveFor': 'x',
        'hints': [
            'Undo the outside operations first: the constant, then the coefficient in front of the bars.',
            'Once |{{m}}x {{n|signed}}| is alone, split it into two linear equations.',
        ],
        'attemptFeedback': ['Check your isolation: subtract {{k}} first, then divide by {{a}}. Dividing an equation by a negative number does not change the equal sign.'],
        'scaffold': scaffold('Which operation do you undo first?', 'The constant outside the bars', 'The coefficient of x inside the bars'),
        'solutionReview': review(
            'Isolate, split, solve, check.',
            [
                'Isolate: {{a}}|{{m}}x {{n|signed}}| = {{ak}}, so |{{m}}x {{n|signed}}| = {{B}}.',
                'Split: {{m}}x {{n|signed}} = {{B}} or {{m}}x {{n|signed}} = -{{B}}.',
                'Solve: x = {{x2}} or x = {{x1}}.',
            ],
            'x = {{x1}} or x = {{x2}}',
            'Distributing {{a}} into the bars — absolute value bars are not parentheses.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'a': choice(-3, -2, 2, 3), 'm': choice(2, 3), 'ctr': ints(-5, 5, [0]), 'd': ints(1, 4), 'k': ints(-9, 9, [0])},
            {'n': '-m*ctr', 'B': 'm*d', 'ak': 'a*m*d', 'r': 'a*m*d + k', 'x1': 'ctr - d', 'x2': 'ctr + d'},
            ['abs(a*m*d + k) <= 60'],
        ),
    },
    {
        'questionId': 'dol2r-pr-8',
        'standard': 'A2.6E',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'Solve the equation. Decide whether it has two solutions, one solution, or no solution.',
        'studentActions': ['solveStepByStep'],
        'equation': '{{a}}|x {{mh|signed}}| {{k|signed}} = {{r}}',
        'solveFor': 'x',
        'hints': [
            'Isolate the absolute value first.',
            'An absolute value is a distance, so it can never equal a negative number.',
        ],
        'attemptFeedback': ['After isolating, look at the sign of the other side before you split.'],
        'scaffold': scaffold('Can an absolute value ever equal a negative number?', 'No — an absolute value is never negative', 'Yes, when x is negative'),
        'solutionReview': review(
            'Isolate, then let the sign of the other side decide.',
            [
                'Subtract {{k}} and divide by {{a}}: |x {{mh|signed}}| = {{d}}.',
                'An absolute value is a distance, so it is never negative: a negative right side means no solution.',
                'A positive right side means two solutions, one on each side of {{h}} at that distance.',
            ],
            'After isolating, |x {{mh|signed}}| = {{d}}; the sign of {{d}} decides the number of solutions.',
            'Splitting |x {{mh|signed}}| equal to a negative number and reporting two “solutions” that do not check.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'a': choice(2, 3, 4), 'h': ints(-8, 8, [0]), 'k': ints(-6, 6, [0]), 'd': ints(-5, 5, [0])},
            {'mh': '-h', 'r': 'k + a*d'},
        ),
    },
    {
        'questionId': 'dol2r-pr-9',
        'standard': 'A2.6F',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'Solve the inequality. Then graph the solution set and write it in interval notation.',
        'studentActions': ['solveInequality'],
        'inequality': '-{{a}}|x {{mh|signed}}| {{k|signed}} >= {{r}}',
        'hints': [
            'Isolate the absolute value. Dividing by a negative number reverses the inequality symbol.',
            'Once the absolute value is alone, ≤ means between: the solution is one interval.',
        ],
        'attemptFeedback': ['Check the symbol after dividing by −{{a}}: it must reverse.'],
        'scaffold': scaffold('After you divide both sides by −{{a}}, what happens to ≥?', 'It reverses to ≤', 'It stays ≥'),
        'solutionReview': review(
            'Isolate (reversing the symbol), then write a between statement.',
            [
                'Subtract {{k}}: -{{a}}|x {{mh|signed}}| ≥ {{nad}}.',
                'Divide by −{{a}} and reverse: |x {{mh|signed}}| ≤ {{d}}.',
                'Between: -{{d}} ≤ x {{mh|signed}} ≤ {{d}}, so {{lo}} ≤ x ≤ {{hi}}.',
                'Closed circles at {{lo}} and {{hi}}: [{{lo}}, {{hi}}].',
            ],
            '{{lo}} ≤ x ≤ {{hi}}, written [{{lo}}, {{hi}}]',
            'Not reversing the symbol, which turns the answer into an OR statement.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'a': choice(2, 3, 4), 'h': ints(-6, 6, [0]), 'd': ints(1, 6), 'k': ints(-8, 8, [0])},
            {'mh': '-h', 'r': 'k - a*d', 'nad': '-a*d', 'lo': 'h - d', 'hi': 'h + d'},
        ),
    },
    {
        'questionId': 'dol2r-pr-10',
        'standard': 'A2.6F',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'Solve the inequality. Then graph the solution set and write it in interval notation.',
        'studentActions': ['solveInequality'],
        'inequality': '|{{m}}x {{n|signed}}| {{k|signed}} > {{r}}',
        'hints': [
            'Isolate the absolute value first.',
            '> means outside: write two inequalities joined by OR.',
        ],
        'attemptFeedback': ['An OR solution graphs as two rays pointing away from each other, with open circles for >.'],
        'scaffold': scaffold('Is |A| > {{B}} a between statement or an outside statement?', 'Outside: OR', 'Between: AND'),
        'solutionReview': review(
            'Isolate, then write an outside (OR) statement.',
            [
                'Subtract {{k}}: |{{m}}x {{n|signed}}| > {{B}}.',
                'Outside: {{m}}x {{n|signed}} < -{{B}} or {{m}}x {{n|signed}} > {{B}}.',
                'Solve: x < {{lo}} or x > {{hi}}.',
                'Open circles and arrows pointing outward: (-∞, {{lo}}) ∪ ({{hi}}, ∞).',
            ],
            'x < {{lo}} or x > {{hi}}',
            'Writing the between answer {{lo}} < x < {{hi}} for a > inequality.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'m': choice(2, 3), 'ctr': ints(-5, 5, [0]), 'd': ints(1, 5), 'k': ints(-9, 9, [0])},
            {'n': '-m*ctr', 'B': 'm*d', 'r': 'k + m*d', 'lo': 'ctr - d', 'hi': 'ctr + d'},
        ),
    },
    # PR-11 to PR-13 are audited digitalSAT items (A2.2A, A2.6E, A2.6F), added by bank id below.
    {
        'questionId': 'dol2r-pr-14',
        'standard': 'A2.3A',
        'alignments': [
            {'framework': 'teks', 'code': 'A2.3A', 'role': 'primary'},
            {'framework': 'teks', 'code': 'A2.3B', 'role': 'secondary'},
        ],
        'dok': 3, 'difficultyBand': 3,
        'prompt': 'A café sold {{N}} drinks on Saturday: small, medium, and large. Small drinks cost ${{ps}} each, medium drinks cost ${{pm}} each, and large drinks cost ${{pl}} each, and drink sales totaled ${{R}} for the day. The café sold {{diff}} more medium drinks than large drinks. Let x, y, and z be the numbers of small, medium, and large drinks sold. Write a matrix equation A · X = B, solve it with technology, and report how many drinks of each size were sold.',
        'studentActions': ['solveMatrixEquation'],
        'equations': ['x + y + z = {{N}}', '{{ps}}x + {{pm}}y + {{pl}}z = {{R}}', 'y = z + {{diff}}'],
        'showEquations': False,
        'variableMeanings': {'x': 'small drinks', 'y': 'medium drinks', 'z': 'large drinks'},
        'hints': [
            'One equation counts drinks, one counts dollars, and one compares medium and large drinks.',
            'Which is larger, the number of medium drinks or the number of large drinks? Add {{diff}} to the smaller amount to make the two sides equal.',
        ],
        'attemptFeedback': ['Check each row of A against one fact — total drinks, total dollars, and the comparison — with every variable on the left side.'],
        'solutionReview': review(
            'Translate each fact into one equation, then solve A · X = B with technology.',
            [
                'Drinks: x + y + z = {{N}}. Dollars: {{ps}}x + {{pm}}y + {{pl}}z = {{R}}. Comparison: y = z + {{diff}}, which is y − z = {{diff}} in standard form.',
                'A = [[1, 1, 1], [{{ps}}, {{pm}}, {{pl}}], [0, 1, −1]] and B = [{{N}}, {{R}}, {{diff}}].',
                'X = A⁻¹B = ({{s}}, {{md}}, {{l}}).',
            ],
            '{{s}} small, {{md}} medium, and {{l}} large drinks.',
            'Writing the comparison as z = y + {{diff}}, which makes large drinks the larger amount.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'s': ints(12, 40), 'l': ints(10, 30), 'diff': ints(4, 15),
             'ps': choice(2, 3), 'pm': choice(4, 5), 'pl': choice(6, 7)},
            {'md': 'l + diff', 'N': 's + l + diff + l', 'R': 'ps*s + pm*(l + diff) + pl*l'},
        ),
    },
    {
        'questionId': 'dol2r-pr-15',
        'standard': 'A2.3A',
        'alignments': [
            {'framework': 'teks', 'code': 'A2.3A', 'role': 'primary'},
            {'framework': 'teks', 'code': 'A2.3B', 'role': 'secondary'},
        ],
        'dok': 3, 'difficultyBand': 3,
        'prompt': 'In triangle ABC, the measure of angle B is {{m}} times the measure of angle A, and the measure of angle C is {{c}} degrees more than the measure of angle A. Let x, y, and z be the measures of angles A, B, and C, in degrees. Write a system of three equations, then solve it.',
        'studentActions': ['multipleResponses'],
        'answerFields': [
            field('sum', 'Equation from the triangle angle sum', 'equation', 'x+y+z=180'),
            field('angleB', 'Equation relating angle B to angle A', 'equation', 'y={{m}}x', accepted=['y-{{m}}x=0']),
            field('angleC', 'Equation relating angle C to angle A', 'equation', 'z=x+{{c}}', accepted=['z-x={{c}}', 'x=z-{{c}}']),
            field('xA', 'Measure of angle A (degrees)', 'number', '{{x}}'),
            field('yB', 'Measure of angle B (degrees)', 'number', '{{y}}'),
            field('zC', 'Measure of angle C (degrees)', 'number', '{{z}}'),
        ],
        'hints': [
            'The three angles of any triangle add to 180°.',
            '“{{m}} times angle A” multiplies x by {{m}}; “{{c}} degrees more than angle A” adds {{c}} to x.',
        ],
        'attemptFeedback': ['Substitute your expressions for y and z into x + y + z = 180 and solve for x first.'],
        'scaffold': scaffold('What do the three angle measures of any triangle add up to?', '180°', '360°'),
        'solutionReview': review(
            'Write one equation per fact, then substitute.',
            [
                'Angle sum: x + y + z = 180. Comparisons: y = {{m}}x and z = x + {{c}}.',
                'Substitute: x + {{m}}x + x + {{c}} = 180, so {{m2}}x = {{rest}} and x = {{x}}.',
                'y = {{m}}({{x}}) = {{y}} and z = {{x}} + {{c}} = {{z}}. Check: {{x}} + {{y}} + {{z}} = 180.',
            ],
            'Angle A = {{x}}°, angle B = {{y}}°, angle C = {{z}}°.',
            'Writing x = {{m}}y — angle B is the larger angle, so y = {{m}}x.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'x': ints(10, 40), 'm': choice(2, 3, 4, 5)},
            {'y': 'm*x', 'z': '180 - x - m*x', 'c': '180 - 2*x - m*x', 'm2': 'm + 2', 'rest': '2*x + m*x'},
            ['180 - 2*x - m*x >= 5', '180 - 2*x - m*x <= 120'],
        ),
    },
    {
        'questionId': 'dol2r-pr-16',
        'standard': 'A2.3B',
        'dok': 3, 'difficultyBand': 3,
        'prompt': 'Solve the system. Choose substitution or elimination, reduce it to a 2×2 system, back-substitute, and verify the ordered triple.',
        'studentActions': ['solveSystem'],
        'method': 'studentChoice',
        'equations': ['x {{b1|signed}}y - z = {{d1}}', '{{a2}}x - y {{c2|signed}}z = {{d2}}', '{{a3}}x {{b3|signed}}y + z = {{d3}}'],
        'variables': ['x', 'y', 'z'],
        'requireVerification': True,
        'hints': [
            'Look for a variable whose coefficient is 1 or −1 — it is the easiest to eliminate or to solve for.',
            'Eliminate the same variable from two different pairs of equations.',
        ],
        'attemptFeedback': ['Substitute your triple into all three original equations; an equation that fails points to the arithmetic slip.'],
        'solutionReview': review(
            'Eliminate one variable twice, solve the 2×2 system, back-substitute.',
            [
                'z has coefficient ±1 in every equation, so eliminating z is efficient: add equations 1 and 3, and add equation 1 to equation 2 after scaling.',
                'Solve the resulting 2×2 system for x and y, then back-substitute for z.',
                'The solution is ({{x0}}, {{y0}}, {{z0}}); it satisfies all three original equations.',
            ],
            '({{x0}}, {{y0}}, {{z0}})',
            'A sign error when subtracting equations — the minus sign must reach every term.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'b1': choice(-3, -2, 2, 3), 'a2': choice(-3, -2, 2, 3), 'c2': choice(-2, 2, 3), 'a3': choice(-2, 2, 3),
             'b3': choice(-3, -2, 2), 'x0': ints(-3, 4), 'y0': ints(-3, 4), 'z0': ints(-3, 4)},
            {'d1': 'x0 + b1*y0 - z0', 'd2': 'a2*x0 - y0 + c2*z0', 'd3': 'a3*x0 + b3*y0 + z0',
             'det': '(-1 - c2*b3) - b1*(a2 - c2*a3) - (a2*b3 + a3)'},
            ['det != 0'],
        ),
    },
    {
        'questionId': 'dol2r-pr-17',
        'standard': 'A2.3B',
        'dok': 2, 'difficultyBand': 3,
        'prompt': 'Write the system as a matrix equation A · X = B — put each equation in standard form first — then solve it with technology: X = A⁻¹ · B.',
        'studentActions': ['solveMatrixEquation'],
        'hints': [
            'Move every variable term to the left side of each equation before you write its row of A.',
            'Enter A and B in the calculator, then compute A⁻¹ · B.',
        ],
        'attemptFeedback': ['Check A row by row: each row holds the x-, y-, and z-coefficients of one equation in standard form, with 0 for a missing variable.'],
        'solutionReview': review(
            'Standard form first, then A · X = B, then X = A⁻¹ · B.',
            [
                'Rewrite every equation as ax + by + cz = d: move each variable term to the left side and each constant to the right, changing the sign of anything that crosses the equal sign.',
                'Row i of A holds the x-, y-, and z-coefficients of equation i (0 for a missing variable); X is the column (x, y, z); B holds the constants in the same order.',
                'With technology, X = A⁻¹ · B. Read x, y, and z from the column, top to bottom, and check them in the original equations.',
            ],
            'The ordered triple (x, y, z) read from A⁻¹ · B.',
            'Copying coefficients from an equation that is not yet in standard form, so a term moved across the equal sign keeps the wrong sign.',
        ),
        'questionFamily': {'id': 'matrices.solveSystem3x3', 'version': 2},
    },
    {
        'questionId': 'dol2r-pr-18',
        'standard': 'A2.6E',
        'dok': 3, 'difficultyBand': 4,
        'prompt': 'Honors challenge: solve the equation. The variable appears outside the absolute value too, so check every candidate in the ORIGINAL equation and mark any extraneous solution.',
        'studentActions': ['solveStepByStep'],
        'equation': '|x {{p|signed}}| = {{m}}x {{q|signed}}',
        'solveFor': 'x',
        'hints': [
            'Split |A| = B into A = B or A = −B, even though B contains x.',
            'An absolute value is never negative, so a candidate that makes {{m}}x {{q|signed}} negative cannot be a solution.',
        ],
        'attemptFeedback': ['Substitute each candidate into both sides of the original equation. If the right side is negative, the candidate is extraneous.'],
        'scaffold': scaffold('Why must every candidate be checked in the original equation?',
                             'The right side contains x and could be negative', 'Absolute value equations always have two solutions'),
        'solutionReview': review(
            'Split, solve, and check — the right side must be nonnegative.',
            [
                'Case 1: x {{p|signed}} = {{m}}x {{q|signed}} gives x = {{good}}.',
                'Case 2: x {{p|signed}} = -({{m}}x {{q|signed}}) gives x = {{bad}}.',
                'Check: at x = {{good}} both sides equal {{gv}}. At x = {{bad}} the right side is {{bv}}, which is negative, so x = {{bad}} is extraneous.',
            ],
            'x = {{good}} (and x = {{bad}} is extraneous)',
            'Keeping both candidates without checking them in the original equation.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'m': choice(2, 3), 'good': ints(2, 10), 'p': ints(-8, 8, [0])},
            {'q': 'good + p - m*good', 'bad': '-(p + q)/(m + 1)', 'gv': 'good + p', 'bv': 'm*bad + q'},
            # Case 1 is x + p = m x + q, so x = (p - q)/(m - 1) = good when q = good + p - m good.
            # Case 2 is x + p = -(m x + q), so x = -(p + q)/(m + 1) = bad, kept only when it is
            # a whole number, extraneous (right side negative there) and distinct from `good`.
            # Deriving `bad` keeps every drawn (m, good, p) in play: Pre-Flight counts the
            # versions exactly instead of estimating them from a sparse space.
            ['good + p > 0', 'q != 0', '(p + q) % (m + 1) == 0', 'bad != good', 'bv < 0', 'abs(bad) <= 10'],
        ),
    },
]

# ===================================================================== DOL
# The readiness check: one item per blueprint standard, DOL-format (choices
# with misconception distractors, griddable numbers, and the solving workspace),
# no hints or scaffolds. Every item is a Question Family slot, so classmates get
# different versions and a Practice-based Recovery can deal fresh ones.
dol = [
    {
        'questionId': 'dol2r-dol-1',
        'standard': 'A2.2A',
        'dok': 2, 'difficultyBand': 3,
        'questionWeight': 1,
        'prompt': 'Let $f(x)={{a|coef}}|x {{mh|signed}}| {{k|signed}}$.',
        'studentActions': ['multipleResponses'],
        'answerFields': [
            field('statement', 'Which statement about the graph of f is true?', 'choice',
                  'The graph is symmetric about the line x = {{h}}.',
                  options=['The graph is symmetric about the line x = {{h}}.',
                           'The graph is symmetric about the line x = {{mh}}.',
                           'The graph is symmetric about the line y = {{k}}.',
                           'The graph has a maximum at ({{h}}, {{k}}).']),
            field('range', 'Range of f (interval notation)', 'interval', '[{{k}}, ∞)'),
            field('maxOnInterval', 'Maximum value of f on the interval {{p}} ≤ x ≤ {{q}}', 'number', '{{mx}}'),
        ],
        'solutionReview': review(
            'Vertex, direction of opening, then the interval.',
            [
                'The vertex is ({{h}}, {{k}}) and a > 0, so the V opens up: the axis of symmetry is x = {{h}} and the range is [{{k}}, ∞).',
                'On {{p}} ≤ x ≤ {{q}}, the vertex is the minimum, so the maximum is at the endpoint farther from {{h}}: f = {{mx}}.',
            ],
            'Symmetric about x = {{h}}; range [{{k}}, ∞); maximum {{mx}} on the interval.',
            'Taking the vertex as the maximum — this V opens up, so its vertex is the minimum.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'a': choice(1, 2, 3), 'h': ints(-4, 4, [0]), 'k': ints(-6, 6, [0]), 'L': ints(1, 5), 'R': ints(1, 5)},
            {'mh': '-h', 'p': 'h - L', 'q': 'h + R', 'mx': 'k + a*max(L, R)'},
            ['L != R', 'k != h', 'k != -h'],
        ),
    },
    {
        'questionId': 'dol2r-dol-2',
        'standard': 'A2.6C',
        'dok': 2, 'difficultyBand': 3,
        'questionWeight': 1,
        'prompt': 'The function $f(x)=|x|$ is transformed to create $g(x)=-{{A}}|x-{{h}}|-{{K}}$.',
        'studentActions': ['multipleResponses'],
        'answerFields': [
            field('describe', 'Which describes the transformation from f to g?', 'choice',
                  'Reflected across the x-axis, stretched vertically by a factor of {{A}}, shifted {{h}} units right and {{K}} units down',
                  options=[
                      'Reflected across the x-axis, stretched vertically by a factor of {{A}}, shifted {{h}} units right and {{K}} units down',
                      'Reflected across the x-axis, stretched vertically by a factor of {{A}}, shifted {{h}} units left and {{K}} units down',
                      'Reflected across the y-axis, stretched vertically by a factor of {{A}}, shifted {{h}} units right and {{K}} units down',
                      'Reflected across the x-axis, stretched vertically by a factor of {{A}}, shifted {{K}} units right and {{h}} units down',
                  ]),
            field('vertex', 'Vertex of the graph of g', 'orderedPair', '({{h}}, {{k}})'),
        ],
        'solutionReview': review(
            'Outside the bars acts on y as written; inside acts on x, opposite.',
            [
                'Outside: −{{A}} reflects across the x-axis and stretches vertically by {{A}}; − {{K}} shifts down {{K}}.',
                'Inside: x − {{h}} shifts right {{h}} (x’s lie).',
                'The vertex moves from (0, 0) to ({{h}}, {{k}}).',
            ],
            'Reflection across the x-axis, vertical stretch by {{A}}, right {{h}}, down {{K}}; vertex ({{h}}, {{k}}).',
            'Reading x − {{h}} as a shift left.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'A': choice(2, 3, 4), 'h': ints(1, 6), 'K': ints(1, 6)},
            {'k': '-K'},
            ['h != K'],
        ),
    },
    {
        'questionId': 'dol2r-dol-3',
        'standard': 'A2.6D',
        'dok': 2, 'difficultyBand': 3,
        'questionWeight': 1,
        'prompt': 'A juice company fills bottles with {{V}} milliliters of juice. A bottle passes inspection when its volume differs from {{V}} milliliters by at most {{t}} milliliters. Let v be the volume of juice in a bottle, in milliliters.',
        'studentActions': ['multipleResponses'],
        'answerFields': [
            field('equation', 'Which equation can be used to find the least and greatest volumes that pass inspection?', 'choice',
                  '|v - {{V}}| = {{t}}',
                  options=['|v - {{V}}| = {{t}}', '|v + {{V}}| = {{t}}', '|v - {{t}}| = {{V}}', '|v| - {{V}} = {{t}}']),
            field('greatest', 'Greatest volume that passes inspection (mL)', 'number', '{{hi}}'),
        ],
        'solutionReview': review(
            'Absolute value measures distance from the target.',
            [
                '“Differs from {{V}} by at most {{t}}” means the distance |v - {{V}}| is at most {{t}}.',
                'The boundary values solve |v - {{V}}| = {{t}}: v = {{lo}} or v = {{hi}}.',
            ],
            '|v - {{V}}| = {{t}}; the greatest volume is {{hi}} mL.',
            'Choosing |v + {{V}}| = {{t}}, whose solutions are centered at −{{V}}.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'V': choice(250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 1000), 't': choice(2, 3, 4, 5, 6, 8, 10)},
            {'lo': 'V - t', 'hi': 'V + t'},
        ),
    },
    {
        'questionId': 'dol2r-dol-4',
        'standard': 'A2.6E',
        'dok': 2, 'difficultyBand': 3,
        'questionWeight': 1,
        'prompt': 'Solve the equation.',
        'studentActions': ['solveStepByStep'],
        'equation': '{{a}}|{{m}}x {{n|signed}}| {{k|signed}} = {{r}}',
        'solveFor': 'x',
        'solutionReview': review(
            'Isolate, split, solve, check.',
            [
                'Isolate: |{{m}}x {{n|signed}}| = {{B}}.',
                'Split: {{m}}x {{n|signed}} = {{B}} or {{m}}x {{n|signed}} = -{{B}}.',
                'Solve: x = {{x2}} or x = {{x1}}.',
            ],
            'x = {{x1}} or x = {{x2}}',
            'Keeping only the positive case.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'a': choice(2, 3, 4, 5), 'm': choice(2, 3, 4), 'ctr': ints(-4, 4, [0]), 'd': ints(1, 3), 'k': ints(-8, 8, [0])},
            {'n': '-m*ctr', 'B': 'm*d', 'r': 'a*m*d + k', 'x1': 'ctr - d', 'x2': 'ctr + d'},
            ['abs(a*m*d + k) <= 70'],
        ),
    },
    {
        'questionId': 'dol2r-dol-5',
        'standard': 'A2.6F',
        'dok': 2, 'difficultyBand': 3,
        'questionWeight': 1,
        'prompt': 'Solve the inequality, graph the solution set, and write it in interval notation.',
        'studentActions': ['solveInequality'],
        'inequality': '{{a}}|x {{mh|signed}}| {{k|signed}} >= {{r}}',
        'solutionReview': review(
            'Isolate, then write an outside (OR) statement.',
            [
                'Isolate: |x {{mh|signed}}| ≥ {{d}}.',
                'Outside: x {{mh|signed}} ≤ -{{d}} or x {{mh|signed}} ≥ {{d}}.',
                'x ≤ {{lo}} or x ≥ {{hi}}: (-∞, {{lo}}] ∪ [{{hi}}, ∞).',
            ],
            '(-∞, {{lo}}] ∪ [{{hi}}, ∞)',
            'Writing the between interval [{{lo}}, {{hi}}] for a ≥ inequality.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'a': choice(2, 3, 4), 'h': ints(-6, 6, [0]), 'd': ints(1, 6), 'k': ints(-8, 8, [0])},
            {'mh': '-h', 'r': 'k + a*d', 'lo': 'h - d', 'hi': 'h + d'},
        ),
    },
    {
        'questionId': 'dol2r-dol-6',
        'standard': 'A2.3A',
        'alignments': [
            {'framework': 'teks', 'code': 'A2.3A', 'role': 'primary'},
            {'framework': 'teks', 'code': 'A2.3B', 'role': 'secondary'},
        ],
        'dok': 2, 'difficultyBand': 3,
        'questionWeight': 1,
        'prompt': 'The school store sold {{N}} items on Monday: pencils for $1 each, folders for $2 each, and notebooks for $3 each. Sales totaled ${{R}} for the day. The store sold {{m}} times as many pencils as notebooks. Let p, f, and n be the numbers of pencils, folders, and notebooks sold.',
        'studentActions': ['multipleResponses'],
        'answerFields': [
            field('system', 'Which system of equations models the situation?', 'choice',
                  'p + f + n = {{N}}, p + 2f + 3n = {{R}}, and p = {{m}}n',
                  options=['p + f + n = {{N}}, p + 2f + 3n = {{R}}, and p = {{m}}n',
                           'p + f + n = {{N}}, 3p + 2f + n = {{R}}, and p = {{m}}n',
                           'p + f + n = {{N}}, p + 2f + 3n = {{R}}, and n = {{m}}p',
                           'p + f + n = {{R}}, p + 2f + 3n = {{N}}, and p = {{m}}n']),
            field('notebooks', 'How many notebooks were sold?', 'number', '{{nn}}'),
        ],
        'solutionReview': review(
            'One equation per fact, then solve.',
            [
                'Count: p + f + n = {{N}}. Money: p + 2f + 3n = {{R}}. Comparison: p = {{m}}n.',
                'Solving (by substitution or with a matrix): p = {{pp}}, f = {{ff}}, n = {{nn}}.',
                'Check: {{pp}} + {{ff}} + {{nn}} = {{N}} items and {{pp}} + {{f2}} + {{n3}} = {{R}} dollars.',
            ],
            'p + f + n = {{N}}, p + 2f + 3n = {{R}}, p = {{m}}n; {{nn}} notebooks.',
            'Writing n = {{m}}p, which says there were more notebooks than pencils.',
        ),
        'questionFamily': fam(),
        'generator': gen(
            {'nn': ints(8, 30), 'm': choice(2, 3, 4), 'ff': ints(5, 40)},
            {'pp': 'm*nn', 'N': 'm*nn + ff + nn', 'R': 'm*nn + 2*ff + 3*nn', 'f2': '2*ff', 'n3': '3*nn'},
        ),
    },
    {
        'questionId': 'dol2r-dol-7',
        'standard': 'A2.3B',
        'dok': 2, 'difficultyBand': 3,
        'questionWeight': 1,
        'prompt': 'Write the system as a matrix equation and solve it using technology with matrices.',
        'studentActions': ['solveMatrixEquation'],
        'solutionReview': review(
            'Standard form first, then A · X = B, then X = A⁻¹ · B.',
            [
                'Rewrite every equation as ax + by + cz = d: move each variable term to the left side and each constant to the right, changing the sign of anything that crosses the equal sign.',
                'Row i of A holds the x-, y-, and z-coefficients of equation i (0 for a missing variable); X is the column (x, y, z); B holds the constants in the same order.',
                'With technology, X = A⁻¹ · B. Read x, y, and z from the column, top to bottom, and check them in the original equations.',
            ],
            'The ordered triple (x, y, z) read from A⁻¹ · B.',
            'Copying coefficients from an equation that is not yet in standard form, so a term moved across the equal sign keeps the wrong sign.',
        ),
        'questionFamily': {'id': 'matrices.solveSystem3x3', 'version': 2},
    },
]

# -------------------------------------------- the audited digitalSAT items
# Added verbatim from MathMaster's audited CCMR bank (Honors exam-style
# transfer), placed after PR-10 so they read as PR-11 to PR-13. Three of 18
# Practice items is the Honors 15% CCMR share (round(18 × 0.15) = 3), so an
# Honors class keeps every authored rich-tool item instead of having the
# platform swap one for an off-blueprint bank item.
SAT_ITEMS = [
    ('mm_sat_A2_2A_absolute-value-interval-maximum_v21', 'dol2r-pr-11'),
    ('mm_sat_A2_6E_challenge_sum_of_solutions_scaled_v21', 'dol2r-pr-12'),
    ('mm_sat_A2_6F_tolerance_context_v21', 'dol2r-pr-13'),
]
EXPORT_BANK_ITEMS = r"""
const bank = require('./functions/lib/ccmrAssignmentBank.js');
const { documents } = require('./functions/seeds/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json');
const items = JSON.parse(process.argv[1]).map(([id, questionId]) => {
  const document = documents.find((entry) => entry.id === id);
  if (!document) throw new Error(`no audited bank item ${id}`);
  return { ...bank.bankDocumentToV5Intent(document, { activityRole: 'practice' }), questionId };
});
process.stdout.write(JSON.stringify(items));
"""
CCMR_ITEMS = json.loads(subprocess.run(['node', '-e', EXPORT_BANK_ITEMS, json.dumps(SAT_ITEMS)],
                                       cwd=ROOT, check=True, capture_output=True, text=True).stdout)


def plain_text(text):
    """The bank writes its worked solutions in $...$ LaTeX; outside a prompt that is raw markup."""
    import re
    assert not re.search(r'\\(left|right|leq|geq)', text), text  # the \\le rule below would mangle these
    # Every $ in a bank solution opens or closes a math span (none is money), so
    # unwrap spans in pairs: "$2(h)=s$" is math even though a digit follows its $.
    assert text.count('$') % 2 == 0, text
    for latex, unicode in (('\\le', '≤'), ('\\ge', '≥'), ('\\infty', '∞'), ('\\cdot', '·'), ('\\pm', '±')):
        text = text.replace(latex, unicode)
    text = re.sub(r'\$([^$]*)\$', r'\1', text).replace('centre', 'center')
    assert '$' not in text and '\\' not in text, text
    return re.sub(r'\s*(≤|≥)\s*', r' \1 ', text)


# Every multi-answer item here has a "Let's back up" step written for it.
CCMR_SCAFFOLDS = {
    'mm_sat_A2_2A_absolute-value-interval-maximum_v21':
        scaffold('On a closed interval, where does |x| reach its maximum?', 'At the endpoint farthest from 0', 'At the vertex, where x = 0'),
    'mm_sat_A2_6E_challenge_sum_of_solutions_scaled_v21':
        scaffold('The two solutions of |ax + b| = c are the same distance from which value of x?', 'The value that makes ax + b = 0', 'The value x = c'),
    'mm_sat_A2_6F_tolerance_context_v21':
        scaffold('What does “differs from the target by at most the tolerance” describe?', 'A distance from the target that is no more than the tolerance', 'A length that is no more than the tolerance'),
}

# Every worked solution in this assignment names the usual mistake; the bank's
# sum-of-solutions item does not, so it gets one here.
CCMR_COMMON_ERRORS = {
    'mm_sat_A2_6E_challenge_sum_of_solutions_scaled_v21':
        'Giving one solution, or the center {{h}}, instead of the sum: the solutions are {{h}} + {{r}} and {{h}} − {{r}}, so they add to 2({{h}}) = {{sum}}.',
}

# A choice-only item has one try, so it gets a reason for each option, shown
# after that try (FB05, the owner, 2026-10-16). Keyed by the bank's own option
# text; a wrong option's reason names the mistake without stating the answer.
CCMR_OPTION_RATIONALES = {
    'mm_sat_A2_6E_challenge_sum_of_solutions_scaled_v21': {
        'answer': {
            '{{sum}}': 'The solutions are {{h}} + {{r}} and {{h}} − {{r}}; the ±{{r}} cancels, so they add to 2({{h}}) = {{sum}}.',
            '{{dGreaterSolution}}': '{{dGreaterSolution}} is only one of the two solutions; the question asks for the sum of both.',
            '{{dLesserSolution}}': '{{dLesserSolution}} is only one of the two solutions; the question asks for the sum of both.',
            '{{dCentre}}': '{{dCentre}} is the center the two solutions sit around, not the sum of the solutions.',
        },
    },
}


def with_option_rationales(field, reasons):
    """The field with a reason for each of its options, right after its answer."""
    options = [str(option) for option in field.get('options', [])]
    assert sorted(options) == sorted(reasons), (field.get('id'), options, list(reasons))
    out = {}
    for key, value in field.items():
        out[key] = value
        if key == 'answer':
            out['optionRationales'] = {option: reasons[option] for option in options}
    return out


for item in CCMR_ITEMS:
    item['questionFamily'] = fam()
    review_text = item.get('solutionReview', {})
    for key, value in list(review_text.items()):
        review_text[key] = [plain_text(line) for line in value] if isinstance(value, list) else plain_text(value)
    if not review_text.get('commonError'):
        review_text['commonError'] = CCMR_COMMON_ERRORS[item['ccmrSource']['documentId']]
    item.setdefault('scaffold', CCMR_SCAFFOLDS[item['ccmrSource']['documentId']])
    rationales = CCMR_OPTION_RATIONALES.get(item['ccmrSource']['documentId'])
    if rationales:
        item['answerFields'] = [with_option_rationales(field, rationales[field['id']]) if field.get('id') in rationales else field
                                for field in item['answerFields']]
practice[10:10] = CCMR_ITEMS

STUDY_GUIDE = {
    'enabled': True,
    'targetPages': 2,
    'title': 'Algebra II Honors — District DOL #2 Study Guide',
    'subtitle': 'Absolute value functions, equations, and inequalities · Systems of three equations',
    'learningGoal': 'I can graph and analyze absolute value functions and their transformations, write and solve absolute value equations and inequalities, and write and solve systems of three linear equations.',
    'sections': [
        {
            'heading': 'A2.2A · Key attributes of f(x) = a|x − h| + k',
            'bullets': [
                'Vertex (h, k); axis of symmetry x = h (the V is symmetric about it).',
                'a > 0: opens up, minimum k, range [k, ∞). a < 0: opens down, maximum k, range (−∞, k].',
                'Domain is always (−∞, ∞). y-intercept: f(0). x-intercepts: solve f(x) = 0 (0, 1, or 2 of them).',
                'Max/min on a closed interval: evaluate the endpoints and the vertex (if it is inside the interval), then compare.',
            ],
        },
        {
            'heading': 'A2.6C · Transformations of f(x) = |x|',
            'bullets': [
                'a·f(x): vertical stretch (|a| > 1) or compression (|a| < 1); a < 0 reflects across the x-axis.',
                'f(bx): horizontal compression by 1/|b|. For |x|, |bx| = |b|·|x|, so it equals a vertical stretch by |b|; f(−x) = f(x).',
                'f(x − c): shifts right c when c > 0, left when c < 0 (x’s lie). f(x) + d: shifts up d, or down when d < 0 (y’s tell the truth).',
                'A point (x, y) on |x| maps to (x + h, a·y + k) on a|x − h| + k.',
            ],
        },
        {
            'heading': 'A2.6D · Formulating absolute value equations',
            'content': ['Absolute value is distance: |x − c| = d means “x is d units from c.” The center c is the midpoint of the two solutions and d is half the distance between them.'],
            'workedExample': {
                'title': 'Worked example',
                'problem': 'A bolt must be 5.5 cm long, give or take 0.05 cm. Write an equation for the shortest and longest bolts.',
                'steps': ['Center 5.5, distance 0.05.', '|L − 5.5| = 0.05, so L = 5.45 cm or L = 5.55 cm.'],
                'answer': '|L − 5.5| = 0.05',
            },
        },
        {
            'heading': 'A2.6E and A2.6F · Solving absolute value equations and inequalities',
            'bullets': [
                'Isolate the absolute value first. Dividing an INEQUALITY by a negative reverses the symbol.',
                '|A| = d: d > 0 → A = d or A = −d; d = 0 → one solution; d < 0 → no solution. Check every answer.',
                '|A| < d (or ≤): between — −d < A < d, one interval. |A| > d (or ≥): outside — A < −d or A > d, a union.',
                '|A| < negative → no solution; |A| > negative → all real numbers.',
                'Graph: open circles for < and >, closed for ≤ and ≥; write interval notation with ( ) or [ ] and ∪.',
            ],
        },
        {
            'heading': 'A2.3A and A2.3B · Systems of three linear equations',
            'bullets': [
                'Formulate: define x, y, z; write one equation per fact (a total count, a total value, a comparison); put each in standard form Ax + By + Cz = D.',
                'Gaussian elimination: eliminate the same variable from two pairs → solve the 2×2 system → back-substitute → check all three equations.',
                'Substitution: solve one equation for a variable with coefficient ±1 and substitute into the other two.',
                'Technology: write A · X = B and compute X = A⁻¹B (or rref of the augmented matrix). If A has no inverse, the system has no solution or infinitely many.',
            ],
            'callout': 'Translate comparisons carefully: “y is 6 more than x” is y = x + 6, and “twice as many s as c” is s = 2c.',
        },
    ],
    'footer': 'MathMaster • Algebra II Honors • District DOL #2 Review',
}

assignment = {
    'schemaVersion': 5,
    'assignment': {
        'title': 'Algebra II Honors — District DOL #2 Review: Absolute Value & 3×3 Systems',
        'courseId': 'algebra2',
        'folder': 'Algebra II Honors/District DOL Reviews/DOL #2',
        'instructionalPurpose': 'review',
        'gradingPurpose': 'classwork',
        'essentialQuestion': 'How do I show that I can analyze and transform absolute value functions, write and solve absolute value equations and inequalities, and write and solve systems of three linear equations?',
        'teacherNotes': (
            'Built from the DeSoto ISD Algebra II Honors DOL #2 blueprint (SY26-27, 20 items): A2.2A (3), A2.3A (2), A2.3B (2), '
            'A2.6C (3), A2.6D (3), A2.6E (3), A2.6F (3). Every standard appears in Classwork, Practice and the DOL. '
            'Struck from this DOL and therefore left out: √x, 1/x, x³, ∛x, bˣ and log_b(x) parent functions, asymptotic behavior, '
            'and linear-quadratic systems. Warm-Up and Classwork are shared for whole-class discussion; Practice and the DOL '
            'readiness check give each student their own version, and every Practice item offers a fresh version on '
            '“Request New Question.” Practice 11–13 are Digital SAT-style items from MathMaster’s audited CCMR bank '
            '(A2.2A, A2.6E, A2.6F), so an Honors class meets its 15% CCMR share with on-blueprint items. The DOL readiness check mixes DOL-format items (choices built from common misconceptions, '
            'griddable numbers) with the solving workspace, so a low score can be recovered after practice before the district DOL.'
        ),
    },
    'variantPolicy': {
        'mode': 'personalized',
        'sectionModes': {'warmup': 'shared', 'classwork': 'shared', 'practice': 'personalized', 'dol': 'personalized'},
        'avoidRecentTemplates': True,
        'avoidDuplicateParameters': True,
    },
    'differentiationPolicy': {
        'mode': 'bounded',
        'allowStandardChange': False,
        'preserveAssessmentFidelity': True,
        'honors': {'mode': 'inheritDestinationClass', 'ccmrPracticeTargetShare': 0.15, 'shortSectionExemptionMaxQuestions': 3},
    },
    'supportPolicy': {'mode': 'inheritStudentProfile', 'modificationsAllowed': False},
    'toolPolicy': {'calculator': 'inherit', 'keyboard': 'auto'},
    'deliveryPolicy': {'sectionGating': 'rolePolicy'},
    'gradingPolicy': {'attemptPolicy': 'rolePolicy', 'scoring': 'platformDefault'},
    'evidencePolicy': {'gradeEligible': True, 'masteryEligible': True, 'recommendationEligible': True, 'analyticsEligible': True},
    'outputProfiles': {
        'digital': {'enabled': True},
        'studentWorksheetPdf': {'enabled': False, 'includeAnswers': False, 'includeWorkspace': True},
        'teacherWorksheetPdf': {'enabled': False, 'includeAnswers': True, 'includeSolutions': True, 'includeWorkspace': True},
        'answerKeyPdf': {'enabled': False, 'includeAnswers': True, 'includeSolutions': False, 'includeWorkspace': False},
        'lessonNotesPdf': STUDY_GUIDE,
    },
    'classroomIntegration': {},
    'provenance': {
        'contentRelease': 'algebra2-honors-district-dol2-review-2026-10-22',
        'templateVersion': 'assignment-v5',
        'generatorVersion': 'assignment-local-question-families',
        'graderVersion': 'platform',
        'sourceMaterials': [
            {
                'name': 'Algebra_II_Honors_DOL_2_Blueprint_SY26-27.docx.pdf',
                'role': 'district assessment blueprint',
                'notes': 'DeSoto ISD Algebra II Honors DOL #2 (Grade 9/10), DRAFT: 20 questions, types TBD. A2.2A 3 (15%), A2.3A 2 (10%), A2.3B 2 (10%), A2.6C 3 (15%), A2.6D 3 (15%), A2.6E 3 (15%), A2.6F 3 (15%).',
            },
        ],
    },
    'preflight': {'required': True},
    'sections': [
        {'id': 'warmup', 'role': 'warmup', 'title': 'Warm-Up — Retrieval Check', 'questions': warmup},
        {'id': 'classwork', 'role': 'classwork', 'title': 'Classwork — Guided Review of Every DOL #2 Standard', 'questions': classwork},
        {'id': 'practice', 'role': 'practice', 'title': 'Practice — Independent Mastery (your own version of every problem)', 'questions': practice},
        {'id': 'dol', 'role': 'dol', 'title': 'DOL — Readiness Check (one item per DOL #2 standard)', 'questions': dol},
    ],
}

ids = [q['questionId'] for s in assignment['sections'] for q in s['questions']]
assert len(ids) == len(set(ids)), 'duplicate question ids'


def markup_outside_prompt(value, path='', found=None):
    """Prompts render $...$ math; every other string is plain UI text."""
    import re
    found = [] if found is None else found
    if isinstance(value, dict):
        for key, item in value.items():
            if key in ('prompt', 'generator', 'ccmrSource'):
                continue
            markup_outside_prompt(item, f'{path}.{key}', found)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            markup_outside_prompt(item, f'{path}[{index}]', found)
    elif isinstance(value, str):
        if '\\' in value or re.search(r'\$(?!\d|\{\{)', value):
            found.append(f'{path}: {value}')
    return found


bank_ids = {item['questionId'] for item in CCMR_ITEMS}
problems = [problem for section in assignment['sections'] for q in section['questions']
            for problem in markup_outside_prompt(q, q['questionId'])]
assert not problems, 'LaTeX markup outside a prompt:\n' + '\n'.join(problems)
OUT.write_text(json.dumps(assignment, indent=2, ensure_ascii=False) + '\n')
print(f'wrote {OUT} with {len(ids)} questions')
