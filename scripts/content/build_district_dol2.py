"""Build native V5 Review + server-only secure retest families. No network."""
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True
from district_dol2_reference import make_test, make_review, EXPLANATIONS

ROOT = Path(__file__).resolve().parents[2]
STANDARDS = ['A.4B', 'A.12D', 'A.3C', 'A.3C', 'A.12C', 'A.2A', 'A.2A', 'A.3C', 'A.2A', 'A.7A', 'A.7A', 'A.12A', 'A.4C']
CHOICES = {
    'yes_no': ['Yes', 'No'], 'comparison': ['<', '≤', '>', '≥'],
    'variable': ['x', 'y'], 'function_classification': ['Function', 'Not a function'],
}

def key(field):
    value = field['key']
    if isinstance(value, bool): return 'Yes' if value else 'No'
    if value == 'function': return 'Function'
    if value == 'not_function': return 'Not a function'
    if isinstance(value, list):
        if field['response'] == 'coordinate_or_graph_point': return '(' + ','.join(map(str, value)) + ')'
        return '{' + ','.join(map(str, value)) + '}'
    return value

def field_native(field, secure=True, prefix='', scale=1):
    kind = field['response']
    profile = 'choice' if kind in CHOICES else 'set' if kind in ['numeric_set', 'two_numbers_or_graph_x_set'] else 'orderedPair' if kind == 'coordinate_or_graph_point' else 'number'
    result = {'id': prefix + field['id'], 'label': (prefix.replace('_', ' ') + ' · ' if prefix else '') + field['label'], 'inputProfile': profile,
              'expected' if secure else 'answer': key(field), 'weight' if secure else 'scoreWeight': field['weight'] * scale,
              'numericTolerance': field.get('absoluteTolerance', 0) or 1e-6}
    if profile == 'choice':
        if secure: result['choices'] = [{'id': choice, 'label': choice} for choice in CHOICES[kind]]
        else: result.update(type='choice', options=CHOICES[kind])
    if profile == 'set':
        result.update(equivalence='numericSet', partialCredit='matchedElements')
        if not secure: result['type'] = 'set'
        result['placeholder'] = '{value, value, …}'
    if profile == 'orderedPair': result['placeholder'] = '(x, y)'
    return result

def stimulus_native(source):
    kind = source.get('type')
    if kind == 'table': return {'kind': 'table', 'table': {'headers': source['headers'], 'rows': [{'cells': list(row)} for row in source['rows']]}}
    if kind == 'sequence': return {'kind': 'expressions', 'expressions': [', '.join(map(str, source['terms']))]}
    if kind == 'recursive_rule': return {}
    if kind == 'relations':
        return {'kind': 'panels', 'panels': [{**stimulus_native(relation), 'title': 'Relation ' + relation['id']} for relation in source['relations']]}
    if kind in ['graph', 'point_graph']:
        viewport = source['viewport']; labels = source.get('axisLabels', {'x': 'x', 'y': 'y'})
        graph = {'xMin': viewport['x'][0], 'xMax': viewport['x'][1], 'yMin': viewport['y'][0], 'yMax': viewport['y'][1],
                 'xAxisLabel': labels['x'], 'yAxisLabel': labels['y'], 'xTickStep': source.get('tickStep', {}).get('x', 1),
                 'yTickStep': source.get('tickStep', {}).get('y', 1), 'readCoordinates': True, 'ariaLabel': f"Graph with horizontal axis {labels['x']} and vertical axis {labels['y']}"}
        point = lambda pair: {'x': pair[0], 'y': pair[1]}
        if kind == 'point_graph': graph['points'] = list(map(point, source['points']))
        else:
            # Resample all 241 source points across the whole curve; never take
            # just the beginning. 33 points retain the source endpoints/vertex
            # and all integer zeros of the quadratic item.
            samples = source['samples']; points = [point(samples[round(i * 240 / 32)]) for i in range(33)]
            if source.get('curve') == 'closed_segment': graph['points'] = [points[0], points[-1]]
            if all(abs(samples[i][1] - (samples[0][1] + i / 240 * (samples[-1][1] - samples[0][1]))) < 1e-6 for i in range(241)) and source.get('curve') != 'closed_segment':
                graph['lines'] = [{'points': [point(samples[0]), point(samples[-1])]}]
            else: graph['curves'] = [{'points': points}]
        return {'kind': 'graph', 'graph': graph}
    return {}

def secure_native(item):
    prompt = item['prompt'].replace('Place one point for each label, or enter its coordinate.', 'Enter each coordinate as (x, y).')
    prompt = prompt.replace('Enter its x-value, or select its point on the x-axis.', 'Enter its x-value.')
    prompt = prompt.replace('Select two points on the x-axis, or enter the two x-values. Order does not matter.', 'Enter the two x-values as a set, such as {a, b}. Order does not matter.')
    result = {'prompt': prompt, 'responseFields': [field_native(f) for f in item['fields']], 'stimulus': stimulus_native(item['stimulus'])}
    if item['originalQuestion'] == 13: result['permittedTools'] = ['linearRegression']
    return result

def review_native(task):
    fields = []; panels = []
    for i, part in enumerate(task['parts']):
        prefix = f"Part_{i+1}_" if len(task['parts']) > 1 else ''
        fields += [field_native(f, False, prefix, 1 / len(task['parts'])) for f in part['fields']]
        panels.append({**stimulus_native(part['stimulus']), 'title': f"Part {i+1}" if prefix else task['title'], 'note': secure_native(part)['prompt']})
    # A single native multipart task per review station, with equal station
    # weights. Hints/solutions remain instructional and never join the retest.
    result = {'type': 'multiAnswer', 'heading': task['title'], 'prompt': 'Complete every response for this review task.', 'answerFields': fields,
              'stimulus': {'kind': 'panels', 'panels': panels}, 'questionWeight': 1,
              'alignments': [{'framework': 'TEKS', 'code': standard} for standard in dict.fromkeys(STANDARDS[n-1] for n in task['coversOriginalQuestions'])],
              'hints': [EXPLANATIONS[part['skill']] for part in task['parts']],
              'explanation': ' '.join(EXPLANATIONS[part['skill']] for part in task['parts']), 'dok': 2, 'difficultyBand': 3}
    if 13 in task['coversOriginalQuestions']: result['permittedTools'] = ['linearRegression']
    return result

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')

def build():
    tests = [make_test(104 + i) for i in range(64)]
    reviews = [make_review(10104 + i) for i in range(48)]
    documents = []; targets = []
    for i, prototype in enumerate(tests[0]):
        ident = f'mm_district_dol2_q{i+1:02}'
        representation = 'graph' if prototype['stimulus'].get('type') == 'graph' else 'table' if prototype['stimulus'].get('type') == 'table' else 'multiple'
        docs = [secure_native(form[i]) for form in tests]
        document = {'id': ident, 'familyId': ident, 'familyVersion': 1, 'courseId': 'algebra1', 'active': True, 'validated': True,
                    'questionType': 'response', 'activityRole': 'test', 'dok': 2, 'difficultyBand': 3, 'representation': representation,
                    'assessedConstruct': STANDARDS[i], 'alignmentKeys': ['texas:' + STANDARDS[i]], 'calculatorPolicy': 'scientific',
                    **docs[0], 'variants': docs}
        documents.append(document)
        targets.append({'targetId': f'dol2-q{i+1:02}', 'label': prototype['skill'].replace('_', ' ').title(), 'alignmentKey': 'texas:' + STANDARDS[i],
                        'dok': 2, 'difficultyBand': 3, 'representation': representation, 'questionCount': 1, 'weight': 1, 'anchor': True, 'familyIds': [ident]})
    questions = []
    for i, task in enumerate(reviews[0]):
        variants = [review_native(form[i]) for form in reviews]
        questions.append({**variants[0], 'questionId': 'dol2-' + task['id'].lower(), 'questionFamily': {'scope': 'assignment', 'recoveryEligible': True}, 'variants': variants})
    assignment = {'schemaVersion': 5, 'assignment': {'title': 'Algebra I · District DOL #2 Review & Retest', 'courseId': 'algebra1',
                  'instructionalPurpose': 'review', 'gradingPurpose': 'test', 'instructions': 'Attempt all seven review tasks and earn at least 80% review mastery. Then complete the 13-question secure retest. The recorded replacement cannot exceed 70 and cannot lower your original district grade.'},
                  'variantPolicy': {'mode': 'personalized'}, 'assessmentPolicy': {'mode': 'testCycle', 'passingScore': 70,
                  'externalAssessment': {'source': 'Eduphoria'}, 'review': {'required': True, 'minimumMastery': 80}, 'corrections': {'requiredForRetest': False}, 'retest': {'maxRecordedGrade': 70}},
                  'testBlueprint': {'blueprintId': 'algebra1-district-dol2-v1', 'version': 1, 'title': 'Algebra I District DOL #2 Retest',
                  'courseId': 'algebra1', 'calculatorMode': 'scientific', 'targets': targets}, 'sections': [{'id': 'dol2-review', 'role': 'review', 'title': 'Seven-task review', 'questions': questions}]}
    write(ROOT / 'drafts/district-dol2/assignment.json', assignment)
    bank = {'schemaVersion': 1, 'targetCollection': 'pathQuestionBank', 'courseId': 'algebra1', 'generatedBy': 'scripts/content/build_district_dol2.py', 'documents': documents}
    write(ROOT / 'functions/seeds/secureAssessments/algebra1_district_dol2.json', bank)
    print('Built 7 native review tasks (48 variants) and 13 secure families (64 variants).')

if __name__ == '__main__': build()
