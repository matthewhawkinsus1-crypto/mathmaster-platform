# Paste-Safe Assignment Import

The assignment importer now accepts strict JSON and automatically repairs several common copy/paste problems before validation:

- Python booleans: `True` and `False`
- Python null value: `None`
- Markdown code fences such as ```json
- Wrapper text such as `questions = [...]`
- UTF-8 byte-order marks

Repairs occur only outside quoted JSON strings. The normalized JSON is placed back into the blueprint text box before the assignment is saved.

The importer still rejects malformed structures, single-quoted Python dictionaries, missing brackets, and invalid question blueprints.
