# Weather generation

`server/weather` contains weather-generation and Auto-TSTM support code. It
normalizes upstream or model inputs into server contracts before they reach
the API response.

Keep generation deterministic where possible, validate input at the boundary,
and test malformed, stale, empty, and upstream-failure cases with fixtures.

CI runs the generator's Python tests separately from the Node API tests. To run
them locally, install `server/requirements.txt` in a Python 3.13 virtual
environment, then run this command from the repository root:

```sh
python -m unittest discover -s server/weather -p 'test_*.py' -v
```

These tests use local arrays and fixtures and do not download forecast data.
