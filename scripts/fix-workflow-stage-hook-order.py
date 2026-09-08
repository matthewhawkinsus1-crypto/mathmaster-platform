from pathlib import Path

path = Path('src/platform/workflow/WorkflowRunner.jsx')
source = path.read_text(encoding='utf-8')

block = r'''  const model = typeof spec.model === 'string' ? spec.model.trim() : '';
  const functions = useMemo(() => {
    if (!model) return [];
    const evaluate = (x) => {
      const y = evaluateModelAt(model, x);
      return Number.isFinite(y) ? y : Number.NaN;
    };
    return Number.isFinite(evaluate(0)) || Number.isFinite(evaluate(1)) ? [evaluate] : [];
  }, [model]);
  const points = Array.isArray(spec.points) ? spec.points : [];
'''
anchor = "  const structuredFunction = staticGraphSpec(spec.functionSpec);\n"

if source.count(block) != 1:
    raise RuntimeError(f'Expected one StageFigure hook block; found {source.count(block)}')
if source.count(anchor) != 1:
    raise RuntimeError(f'Expected one structured-function anchor; found {source.count(anchor)}')

source = source.replace(block, '', 1)
source = source.replace(anchor, anchor + '\n' + block, 1)
path.write_text(source, encoding='utf-8')
print('Moved StageFigure hooks before the structured-function branch.')
