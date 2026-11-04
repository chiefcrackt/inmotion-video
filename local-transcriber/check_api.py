"""Integration checks against the running local server; no extra dependencies."""
import json
import re
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE = 'http://127.0.0.1:8765'
page = urlopen(BASE).read().decode()
token = re.search(r'name="local-token" content="([^"]+)"', page)[1]


def post(path, body, extra=None):
    headers = {'X-Local-Token': token, **(extra or {})}
    try:
        with urlopen(Request(BASE + path, data=body, headers=headers)) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.load(error)


assert post('/api/transcribe', b'x', {'Origin': 'https://example.com'})[0] == 403
assert post('/api/transcribe', b'x', {'X-Options': '{}'})[0] == 400
options = json.dumps({'quality': 'fast', 'device': 'cpu', 'language': 'en', 'filename': 'invalid media'})
status, job = post('/api/transcribe', b'not a media file', {'X-Options': options})
assert status == 200
for _ in range(120):
    state = json.load(urlopen(BASE + '/api/job/' + job['id']))
    if state['status'] == 'error': break
    time.sleep(.25)
assert state['status'] == 'error', state
assert post('/api/save/' + job['id'], b'{"segments":[]}')[0] == 409
print('PASS: cross-origin rejection, option validation, invalid-media recovery, incomplete transcript edit rejection.')
